"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSeller, requireUser } from "@/lib/authz";
import {
  cancelLocalFulfilment,
  chooseSellerDelivery,
  completeLocalFulfilment,
  requestBuyerPickup,
  respondToPickup,
  shopLocation,
  PICKUP_WINDOW_DAYS,
} from "@/lib/local-fulfilment";
import {
  notifyHandoverComplete,
  notifyPickupAccepted,
  notifyPickupRejected,
  notifyPickupRequested,
  notifySellerDelivery,
} from "@/lib/notify";

export type FulfilmentActionState = { error?: string; success?: string };

/** Everything the notifications need, fetched once. */
async function loadParties(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  const reservation = order
    ? await prisma.reservation.findUnique({
        where: { id: order.reservationId },
      })
    : null;
  if (!reservation) return null;
  const [product, buyer] = await Promise.all([
    prisma.product.findUnique({ where: { id: reservation.productId } }),
    prisma.user.findUnique({ where: { id: reservation.userId } }),
  ]);
  return { order, reservation, product, buyer };
}

function revalidateAll(orderId: string) {
  revalidatePath("/dashboard/sales");
  revalidatePath("/dashboard/shipments");
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/admin/shipments");
}

/** Seller: "I'll deliver this myself." */
export async function sellerDeliverAction(
  _prev: FulfilmentActionState,
  formData: FormData,
): Promise<FulfilmentActionState> {
  const seller = await requireSeller();
  const orderId = String(formData.get("orderId") ?? "");
  const note = String(formData.get("note") ?? "");

  const result = await chooseSellerDelivery({
    orderId,
    sellerId: seller.id,
    note,
  });
  if (!result.ok) return { error: result.error };

  const parties = await loadParties(orderId);
  const shop = shopLocation(seller.shopAddressJson);
  if (parties?.buyer && parties.product) {
    notifySellerDelivery({
      buyer: parties.buyer,
      productTitle: parties.product.title,
      shopName: shop?.shopName ?? "The seller",
      note: result.fulfilment.note,
    });
  }

  revalidateAll(orderId);
  return { success: "You're delivering this one — the buyer has been told." };
}

/** Seller: "Can you collect it?" */
export async function requestPickupAction(
  _prev: FulfilmentActionState,
  formData: FormData,
): Promise<FulfilmentActionState> {
  const seller = await requireSeller();
  const orderId = String(formData.get("orderId") ?? "");
  const note = String(formData.get("note") ?? "");

  const result = await requestBuyerPickup({
    orderId,
    sellerId: seller.id,
    note,
  });
  if (!result.ok) return { error: result.error };

  const parties = await loadParties(orderId);
  const shop = shopLocation(seller.shopAddressJson);
  if (parties?.buyer && parties.product) {
    notifyPickupRequested({
      buyer: parties.buyer,
      productTitle: parties.product.title,
      shopName: shop?.shopName ?? "the shop",
      shopAddress: shop
        ? [shop.line1, shop.city, shop.pincode].filter(Boolean).join(", ")
        : "the shop",
      windowDays: PICKUP_WINDOW_DAYS,
      note: result.fulfilment.note,
    });
  }

  revalidateAll(orderId);
  return { success: "Asked the buyer — we'll let you know what they say." };
}

/** Buyer: accept or decline a pickup request. */
export async function respondPickupAction(
  _prev: FulfilmentActionState,
  formData: FormData,
): Promise<FulfilmentActionState> {
  const user = await requireUser();
  const orderId = String(formData.get("orderId") ?? "");
  const accept = String(formData.get("decision") ?? "") === "ACCEPT";
  const note = String(formData.get("note") ?? "");

  const result = await respondToPickup({
    orderId,
    buyerId: user.id,
    accept,
    note,
  });
  if (!result.ok) return { error: result.error };

  const parties = await loadParties(orderId);
  const seller = await prisma.user.findUnique({
    where: { id: result.fulfilment.sellerId },
  });

  if (seller && parties?.product) {
    if (accept && result.fulfilment.pickupDeadline) {
      notifyPickupAccepted({
        seller,
        buyer: user,
        productTitle: parties.product.title,
        deadline: result.fulfilment.pickupDeadline,
      });
    } else if (!accept) {
      notifyPickupRejected({
        seller,
        buyer: user,
        productTitle: parties.product.title,
        note: result.fulfilment.note,
      });
    }
  }

  revalidateAll(orderId);
  return {
    success: accept
      ? `Great — collect it within ${PICKUP_WINDOW_DAYS} days.`
      : "No problem — the seller will arrange delivery instead.",
  };
}

/** Seller confirms the handover actually happened. */
export async function completeFulfilmentAction(
  _prev: FulfilmentActionState,
  formData: FormData,
): Promise<FulfilmentActionState> {
  const seller = await requireSeller();
  const orderId = String(formData.get("orderId") ?? "");

  const result = await completeLocalFulfilment({
    orderId,
    sellerId: seller.id,
  });
  if (!result.ok) return { error: result.error };

  const parties = await loadParties(orderId);
  if (parties?.product) {
    notifyHandoverComplete({
      seller,
      buyer: parties.buyer,
      productTitle: parties.product.title,
      collected: result.fulfilment.method === "BUYER_PICKUP",
    });
  }

  revalidateAll(orderId);
  return { success: "Marked as handed over — the order is complete." };
}

/** Seller backs out of the local route and returns to courier booking. */
export async function cancelFulfilmentAction(
  _prev: FulfilmentActionState,
  formData: FormData,
): Promise<FulfilmentActionState> {
  const seller = await requireSeller();
  const orderId = String(formData.get("orderId") ?? "");

  const result = await cancelLocalFulfilment({ orderId, sellerId: seller.id });
  if (!result.ok) return { error: result.error };

  revalidateAll(orderId);
  return { success: "Back to courier booking for this order." };
}
