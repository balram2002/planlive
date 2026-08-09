// NOTE: no "server-only" guard — the expiry sweeper runs this outside
// Next.js. Never import it from a client component: it reads and writes
// orders directly.
import type { LocalFulfilment, Order, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

/**
 * Local fulfilment — the two options that only exist when the buyer is in the
 * seller's own PIN code.
 *
 *   SELLER_DELIVERY  the seller drops it off. Nothing changes for the buyer;
 *                    a parcel still arrives at their door.
 *   BUYER_PICKUP     the buyer collects from the shop — but only if they
 *                    agree to, which is why it's a negotiation rather than a
 *                    switch.
 *
 * The pickup state machine, and why each edge exists:
 *
 *   (none) --request--> REQUESTED
 *   REQUESTED --buyer accepts--> ACCEPTED   (starts a 2-day window)
 *   REQUESTED --buyer declines--> REJECTED  (seller must choose again)
 *   ACCEPTED  --seller confirms handover--> COLLECTED  (terminal)
 *   ACCEPTED  --window elapses--> EXPIRED   (seller told; must choose again)
 *
 * REJECTED and EXPIRED both hand the decision back to the seller, who can
 * then switch to SELLER_DELIVERY or fall back to booking a courier. Neither
 * is terminal for the order — only COLLECTED is.
 *
 * Every transition is guarded on the state it expects, so a double-tap or a
 * racing sweeper can't move an order twice.
 */

/** How long a buyer has to collect once they've accepted. */
export const PICKUP_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;
export const PICKUP_WINDOW_DAYS = 2;

type AddressLike = { pincode?: string; city?: string } | null;

function parseJson<T>(json: string | null): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

const normalisePin = (value: unknown) => String(value ?? "").trim();

/**
 * True when the buyer's delivery PIN exactly matches the seller's shop PIN.
 *
 * Exact PIN, not city: "same city" spans an hour's drive in most Indian
 * metros, which is not a journey you can reasonably ask a buyer to make for
 * one order, nor one a seller can absorb as a free drop-off.
 */
export function isLocalEligible(input: {
  orderAddressJson: string | null;
  sellerShopAddressJson: string | null;
}): boolean {
  const buyer = parseJson<AddressLike>(input.orderAddressJson);
  const shop = parseJson<AddressLike>(input.sellerShopAddressJson);
  const buyerPin = normalisePin(buyer?.pincode);
  const shopPin = normalisePin(shop?.pincode);
  if (!/^\d{6}$/.test(buyerPin) || !/^\d{6}$/.test(shopPin)) return false;
  return buyerPin === shopPin;
}

/** The shop's city/pincode, for display in the buyer's pickup request. */
export function shopLocation(sellerShopAddressJson: string | null): {
  shopName: string;
  line1: string;
  city: string;
  pincode: string;
  phone: string;
} | null {
  const shop = parseJson<Record<string, string>>(sellerShopAddressJson);
  if (!shop) return null;
  return {
    shopName: shop.shopName ?? "the shop",
    line1: shop.line1 ?? "",
    city: shop.city ?? "",
    pincode: shop.pincode ?? "",
    phone: shop.phone ?? "",
  };
}

export type FulfilmentResult =
  | { ok: true; fulfilment: LocalFulfilment }
  | { ok: false; error: string };

/** Orders past this point are with a courier — local options no longer apply. */
const CHOOSABLE_ORDER_STATES = ["PAID", "PLACED"];

/**
 * Loads the order + seller and checks every precondition shared by both
 * local options: ownership, order state, no live courier booking, and PIN
 * eligibility.
 */
async function loadLocalContext(orderId: string, sellerId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, error: "Order not found." } as const;

  const reservation = await prisma.reservation.findUnique({
    where: { id: order.reservationId },
  });
  if (!reservation) return { ok: false, error: "Reservation not found." } as const;

  const product = await prisma.product.findUnique({
    where: { id: reservation.productId },
  });
  if (!product || product.sellerId !== sellerId) {
    return { ok: false, error: "This order isn't yours." } as const;
  }

  const seller = await prisma.user.findUnique({ where: { id: sellerId } });
  if (!seller) return { ok: false, error: "Seller not found." } as const;

  if (!CHOOSABLE_ORDER_STATES.includes(order.status)) {
    return {
      ok: false,
      error: "This order has already moved on — local options no longer apply.",
    } as const;
  }

  // A booked AWB means the courier owns this parcel; switching behind their
  // back would leave a live label pointing at an order we delivered by hand.
  const shipment = await prisma.shipment.findUnique({ where: { orderId } });
  if (shipment?.trackingId) {
    return {
      ok: false,
      error: "A courier is already booked — cancel that first.",
    } as const;
  }

  if (
    !isLocalEligible({
      orderAddressJson: order.addressJson,
      sellerShopAddressJson: seller.shopAddressJson,
    })
  ) {
    return {
      ok: false,
      error: "This buyer isn't in your PIN code, so local options don't apply.",
    } as const;
  }

  return { ok: true, order, seller, reservation, product } as const;
}

/** Seller chooses to deliver the order personally. */
export async function chooseSellerDelivery(input: {
  orderId: string;
  sellerId: string;
  note?: string;
}): Promise<FulfilmentResult> {
  const ctx = await loadLocalContext(input.orderId, input.sellerId);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const data = {
    orderId: input.orderId,
    sellerId: input.sellerId,
    buyerId: ctx.reservation.userId,
    method: "SELLER_DELIVERY" as const,
    // Switching away from a pickup clears its negotiation state so a stale
    // deadline can't be picked up by the sweeper later.
    pickupStatus: null,
    requestedAt: null,
    respondedAt: null,
    pickupDeadline: null,
    expiredNotifiedAt: null,
    note: input.note?.trim().slice(0, 300) ?? null,
  };

  const fulfilment = await prisma.localFulfilment.upsert({
    where: { orderId: input.orderId },
    create: data,
    update: data,
  });

  audit("fulfilment.seller-delivery", {
    orderId: input.orderId,
    sellerId: input.sellerId,
  });
  return { ok: true, fulfilment };
}

/** Seller asks the buyer to collect from the shop. */
export async function requestBuyerPickup(input: {
  orderId: string;
  sellerId: string;
  note?: string;
}): Promise<FulfilmentResult> {
  const ctx = await loadLocalContext(input.orderId, input.sellerId);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const existing = await prisma.localFulfilment.findUnique({
    where: { orderId: input.orderId },
  });
  // Don't re-ask while the buyer is still deciding, or after they agreed —
  // a second request would reset their window.
  if (
    existing?.method === "BUYER_PICKUP" &&
    (existing.pickupStatus === "REQUESTED" ||
      existing.pickupStatus === "ACCEPTED")
  ) {
    return {
      ok: false,
      error:
        existing.pickupStatus === "REQUESTED"
          ? "You've already asked — waiting on the buyer."
          : "The buyer already accepted; the collection window is running.",
    };
  }
  if (existing?.pickupStatus === "COLLECTED") {
    return { ok: false, error: "This order was already collected." };
  }

  const data = {
    orderId: input.orderId,
    sellerId: input.sellerId,
    buyerId: ctx.reservation.userId,
    method: "BUYER_PICKUP" as const,
    pickupStatus: "REQUESTED" as const,
    requestedAt: new Date(),
    respondedAt: null,
    // Deadline is only set once the buyer accepts — asking doesn't start it.
    pickupDeadline: null,
    expiredNotifiedAt: null,
    note: input.note?.trim().slice(0, 300) ?? null,
  };

  const fulfilment = await prisma.localFulfilment.upsert({
    where: { orderId: input.orderId },
    create: data,
    update: data,
  });

  audit("fulfilment.pickup-requested", {
    orderId: input.orderId,
    sellerId: input.sellerId,
  });
  return { ok: true, fulfilment };
}

/** Buyer's answer to a pickup request. */
export async function respondToPickup(input: {
  orderId: string;
  buyerId: string;
  accept: boolean;
  note?: string;
}): Promise<FulfilmentResult> {
  const fulfilment = await prisma.localFulfilment.findUnique({
    where: { orderId: input.orderId },
  });
  if (!fulfilment || fulfilment.buyerId !== input.buyerId) {
    return { ok: false, error: "Pickup request not found." };
  }
  if (fulfilment.pickupStatus !== "REQUESTED") {
    return {
      ok: false,
      error: "This request isn't waiting for a response any more.",
    };
  }

  const now = new Date();
  // Conditional update so two taps (or two tabs) can't both transition it.
  const updated = await prisma.localFulfilment.updateMany({
    where: { id: fulfilment.id, pickupStatus: "REQUESTED" },
    data: {
      pickupStatus: input.accept ? "ACCEPTED" : "REJECTED",
      respondedAt: now,
      // The window starts on acceptance, not on the request — the buyer
      // shouldn't lose hours they spent deciding.
      pickupDeadline: input.accept
        ? new Date(now.getTime() + PICKUP_WINDOW_MS)
        : null,
      note: input.note?.trim().slice(0, 300) || fulfilment.note || null,
    },
  });
  if (updated.count === 0) {
    return { ok: false, error: "That request was already answered." };
  }

  const fresh = await prisma.localFulfilment.findUnique({
    where: { id: fulfilment.id },
  });
  audit("fulfilment.pickup-response", {
    orderId: input.orderId,
    buyerId: input.buyerId,
    accepted: input.accept,
  });
  return { ok: true, fulfilment: fresh! };
}

/** Seller confirms the buyer collected it, or that they delivered it. */
export async function completeLocalFulfilment(input: {
  orderId: string;
  sellerId: string;
}): Promise<FulfilmentResult> {
  const fulfilment = await prisma.localFulfilment.findUnique({
    where: { orderId: input.orderId },
  });
  if (!fulfilment || fulfilment.sellerId !== input.sellerId) {
    return { ok: false, error: "Not found." };
  }
  if (fulfilment.completedAt) {
    return { ok: false, error: "Already marked as handed over." };
  }
  if (
    fulfilment.method === "BUYER_PICKUP" &&
    fulfilment.pickupStatus !== "ACCEPTED" &&
    fulfilment.pickupStatus !== "EXPIRED"
  ) {
    return {
      ok: false,
      error: "The buyer hasn't accepted the pickup request yet.",
    };
  }

  const now = new Date();
  await prisma.localFulfilment.update({
    where: { id: fulfilment.id },
    data: {
      completedAt: now,
      ...(fulfilment.method === "BUYER_PICKUP"
        ? { pickupStatus: "COLLECTED" as const }
        : {}),
    },
  });

  // The order reaches its terminal state exactly as a courier delivery would,
  // so buyer-facing history reads the same for all three routes.
  await prisma.order.updateMany({
    where: { id: input.orderId, status: { in: ["PAID", "PLACED", "SHIPPED"] } },
    data: { status: "DELIVERED", deliveredAt: now, shippedAt: now },
  });

  audit("fulfilment.completed", {
    orderId: input.orderId,
    sellerId: input.sellerId,
    method: fulfilment.method,
  });

  const fresh = await prisma.localFulfilment.findUnique({
    where: { id: fulfilment.id },
  });
  return { ok: true, fulfilment: fresh! };
}

/** Seller abandons the local route and goes back to courier booking. */
export async function cancelLocalFulfilment(input: {
  orderId: string;
  sellerId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const fulfilment = await prisma.localFulfilment.findUnique({
    where: { orderId: input.orderId },
  });
  if (!fulfilment || fulfilment.sellerId !== input.sellerId) {
    return { ok: false, error: "Not found." };
  }
  if (fulfilment.completedAt) {
    return { ok: false, error: "Already handed over." };
  }

  await prisma.localFulfilment.delete({ where: { id: fulfilment.id } });
  audit("fulfilment.cancelled", {
    orderId: input.orderId,
    sellerId: input.sellerId,
  });
  return { ok: true };
}

export type ExpiredPickup = {
  fulfilment: LocalFulfilment;
  order: Order | null;
  seller: User | null;
  buyer: User | null;
  productTitle: string | null;
};

/**
 * Flips accepted-but-uncollected pickups to EXPIRED and returns them so the
 * caller can notify the seller.
 *
 * `expiredNotifiedAt` is set in the same conditional update as the status, so
 * a seller is told exactly once even if the sweep runs concurrently.
 */
export async function expireOverduePickups(): Promise<ExpiredPickup[]> {
  const overdue = await prisma.localFulfilment.findMany({
    where: {
      method: "BUYER_PICKUP",
      pickupStatus: "ACCEPTED",
      completedAt: null,
      pickupDeadline: { lt: new Date() },
    },
    take: 100,
  });
  if (overdue.length === 0) return [];

  const results: ExpiredPickup[] = [];

  for (const fulfilment of overdue) {
    const flipped = await prisma.localFulfilment.updateMany({
      where: {
        id: fulfilment.id,
        pickupStatus: "ACCEPTED",
        expiredNotifiedAt: null,
      },
      data: { pickupStatus: "EXPIRED", expiredNotifiedAt: new Date() },
    });
    if (flipped.count === 0) continue; // Someone else got there first.

    const order = await prisma.order.findUnique({
      where: { id: fulfilment.orderId },
    });
    const reservation = order
      ? await prisma.reservation.findUnique({
          where: { id: order.reservationId },
        })
      : null;
    const [seller, buyer, product] = await Promise.all([
      prisma.user.findUnique({ where: { id: fulfilment.sellerId } }),
      prisma.user.findUnique({ where: { id: fulfilment.buyerId } }),
      reservation
        ? prisma.product.findUnique({ where: { id: reservation.productId } })
        : Promise.resolve(null),
    ]);

    results.push({
      fulfilment: { ...fulfilment, pickupStatus: "EXPIRED" },
      order,
      seller,
      buyer,
      productTitle: product?.title ?? null,
    });
  }

  return results;
}
