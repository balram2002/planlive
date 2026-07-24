import type { Order, Product, Shipment, ShipmentStatus, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/authz";
import { EshopboxError, eshopboxConfigured } from "@/lib/eshopbox/client";
import {
  cancelShipment as cancelWithCourier,
  createShipment as bookWithCourier,
  getTrackingDetails,
  MAX_TRACKING_IDS,
  type TrackingDetail,
} from "@/lib/eshopbox/shipping";
import {
  isCancellable,
  toOrderStatus,
  toShipmentStatus,
} from "@/lib/eshopbox/status-map";
import { announceOrderReturning, announceOrderStatus } from "@/lib/order-events";
import { notifySellerShipmentIssue } from "@/lib/notify";

/**
 * Shipping domain service — the only place that books, cancels or reconciles
 * a parcel against our own database.
 *
 * Everything the courier tells us funnels through `applyTrackingUpdate`,
 * whether it arrived by webhook (real time) or by polling (the safety net),
 * so both paths advance orders and notify buyers identically.
 */

type AddressSnapshot = {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  pincode: string;
};

function parseAddress(json: string | null): AddressSnapshot | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed?.fullName !== "string") return null;
    return {
      fullName: parsed.fullName,
      phone: String(parsed.phone ?? ""),
      line1: String(parsed.line1 ?? ""),
      line2: parsed.line2 ?? null,
      city: String(parsed.city ?? ""),
      state: String(parsed.state ?? ""),
      pincode: String(parsed.pincode ?? ""),
    };
  } catch {
    return null;
  }
}

export type BookResult =
  | { ok: true; shipment: Shipment }
  | { ok: false; error: string };

/**
 * Books a parcel for an order.
 *
 * Idempotent by construction: the Shipment row is keyed 1:1 on the order, so
 * a double-submit returns the existing booking instead of buying a second
 * AWB. A previously failed attempt is retried in place.
 */
export async function bookShipment(input: {
  order: Order;
  seller: User;
  actorEmail: string;
}): Promise<BookResult> {
  const { order, seller } = input;

  if (!eshopboxConfigured()) {
    return { ok: false, error: "Shipping is not configured on the server." };
  }

  // Only a paid or COD-placed order should ever reach a courier.
  if (!["PAID", "PLACED"].includes(order.status)) {
    return {
      ok: false,
      error: "This order isn't ready to ship yet.",
    };
  }

  const existing = await prisma.shipment.findUnique({
    where: { orderId: order.id },
  });
  // A live booking is returned as-is; only a failed one is retried.
  if (existing?.trackingId) return { ok: true, shipment: existing };

  const address = parseAddress(order.addressJson);
  if (!address) {
    return {
      ok: false,
      error: "This order has no delivery address — it can't be shipped.",
    };
  }

  const reservation = await prisma.reservation.findUnique({
    where: { id: order.reservationId },
  });
  if (!reservation) return { ok: false, error: "Reservation not found." };

  const product = await prisma.product.findUnique({
    where: { id: reservation.productId },
  });
  if (!product) return { ok: false, error: "Product no longer exists." };
  if (product.sellerId !== seller.id) {
    return { ok: false, error: "This order isn't yours to ship." };
  }

  // Stable across retries so a re-attempt can't create a duplicate parcel
  // on Eshopbox's side either.
  const externalShipmentId = existing?.externalShipmentId ?? `LW-${order.id}`;
  const quantity = reservation.quantity;
  const rupees = order.amountInPaise / 100;

  // Passed to the courier so their own delivery notifications reach the buyer.
  const buyer = await prisma.user.findUnique({
    where: { id: reservation.userId },
    select: { email: true },
  });
  const buyerEmail = buyer?.email ?? null;

  try {
    const result = await bookWithCourier({
      shipmentId: externalShipmentId,
      customerOrderId: order.id,
      isCOD: order.paymentMethod === "COD",
      invoiceTotal: rupees,
      shippingAddress: {
        customerName: address.fullName,
        addressLine1: address.line1,
        addressLine2: address.line2 ?? undefined,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
        country: "India",
        // Their field is `contactPhone` — this is the number the delivery
        // agent actually calls, so getting it wrong strands parcels.
        contactPhone: address.phone,
        email: buyerEmail ?? undefined,
      },
      customerEmail: buyerEmail ?? undefined,
      items: [
        {
          itemID: product.id,
          productTitle: product.title,
          quantity,
          itemTotal: (product.priceInPaise * quantity) / 100,
          productImageUrl: product.imageUrl ?? undefined,
          itemLength: product.lengthCm,
          itemBreadth: product.breadthCm,
          itemHeight: product.heightCm,
          itemWeight: product.weightGrams.toFixed(2),
        },
      ],
      // Parcel grows with quantity; dimensions stay the carton's.
      shipmentWeight: product.weightGrams * quantity,
      shipmentLength: product.lengthCm,
      shipmentBreadth: product.breadthCm,
      shipmentHeight: product.heightCm,
      pickupLocationCode: seller.pickupLocationCode ?? undefined,
      orderDate: order.createdAt,
    });

    const data = {
      orderId: order.id,
      sellerId: seller.id,
      externalShipmentId,
      trackingId: result.trackingId,
      courierName: result.courierName,
      shippingMode: result.shippingMode ?? null,
      labelUrl: result.label_url,
      routingCode: result.routingCode ?? null,
      status: "BOOKED" as ShipmentStatus,
      courierStatus: null,
      lastError: null,
      syncedAt: new Date(),
    };

    const shipment = await prisma.shipment.upsert({
      where: { orderId: order.id },
      create: data,
      update: data,
    });

    audit("shipment.booked", {
      by: input.actorEmail,
      orderId: order.id,
      trackingId: result.trackingId,
      courier: result.courierName,
    });
    return { ok: true, shipment };
  } catch (err) {
    const message =
      err instanceof EshopboxError
        ? err.message
        : "Couldn't reach the courier. Try again in a moment.";

    // Record the failure so the seller sees the reason on the order row
    // rather than a toast they've already dismissed.
    await prisma.shipment.upsert({
      where: { orderId: order.id },
      create: {
        orderId: order.id,
        sellerId: seller.id,
        externalShipmentId,
        status: "EXCEPTION",
        lastError: message,
      },
      update: { lastError: message, status: "EXCEPTION" },
    });

    // A booking that fails from the reconciliation job or an admin retry may
    // never be seen in the UI, so tell the seller it needs their attention.
    notifySellerShipmentIssue({
      seller,
      productTitle: product.title,
      orderId: order.id,
      reason: message,
      kind: "booking-failed",
    });

    console.error(`Shipment booking failed for order ${order.id}:`, err);
    return { ok: false, error: message };
  }
}

export type CancelResult = { ok: true } | { ok: false; error: string };

/** Cancels a booked parcel, if the courier hasn't collected it yet. */
export async function cancelShipmentForOrder(input: {
  orderId: string;
  actorEmail: string;
}): Promise<CancelResult> {
  const shipment = await prisma.shipment.findUnique({
    where: { orderId: input.orderId },
  });
  if (!shipment?.trackingId) {
    return { ok: false, error: "No booked shipment for this order." };
  }
  if (!isCancellable(shipment.status)) {
    return {
      ok: false,
      error: "The courier already has this parcel — it can't be cancelled.",
    };
  }

  try {
    await cancelWithCourier(shipment.trackingId);
    await prisma.shipment.update({
      where: { id: shipment.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), lastError: null },
    });
    audit("shipment.cancelled", {
      by: input.actorEmail,
      orderId: input.orderId,
      trackingId: shipment.trackingId,
    });
    return { ok: true };
  } catch (err) {
    const message =
      err instanceof EshopboxError
        ? err.message
        : "Couldn't cancel with the courier.";
    console.error(`Shipment cancel failed for order ${input.orderId}:`, err);
    return { ok: false, error: message };
  }
}

/**
 * Applies a courier status to our records — the single funnel for both the
 * webhook and the polling job.
 *
 * Ordering safety: courier scans can arrive out of order (a webhook retry can
 * land after a later poll). We never move a shipment backwards out of a
 * terminal state, and the order status only ever advances.
 */
export async function applyTrackingUpdate(input: {
  trackingId: string;
  courierStatus: string;
  courierName?: string | null;
  expectedDeliveryDate?: string | null;
  statusLogs?: unknown;
  source: "webhook" | "poll";
}): Promise<void> {
  const shipment = await prisma.shipment.findFirst({
    where: { trackingId: input.trackingId },
  });
  if (!shipment) {
    console.warn(
      `[shipping] tracking update for unknown AWB ${input.trackingId}`,
    );
    return;
  }

  const next = toShipmentStatus(input.courierStatus);

  // A delivered/returned parcel is done; late scans can't undo that.
  const settled =
    shipment.status === "DELIVERED" || shipment.status === "RTO_DELIVERED";
  const status = settled ? shipment.status : next;

  const expected = input.expectedDeliveryDate
    ? new Date(input.expectedDeliveryDate)
    : null;

  await prisma.shipment.update({
    where: { id: shipment.id },
    data: {
      status,
      courierStatus: input.courierStatus,
      courierName: input.courierName ?? shipment.courierName,
      expectedDeliveryDate:
        expected && !Number.isNaN(expected.getTime())
          ? expected
          : shipment.expectedDeliveryDate,
      statusLogsJson: input.statusLogs
        ? JSON.stringify(input.statusLogs).slice(0, 20_000)
        : shipment.statusLogsJson,
      pickedUpAt:
        shipment.pickedUpAt ?? (status === "PICKED_UP" ? new Date() : null),
      deliveredAt:
        shipment.deliveredAt ?? (status === "DELIVERED" ? new Date() : null),
      syncedAt: new Date(),
    },
  });

  if (settled) return;
  await syncOrderStatus(shipment, status);
}

/** Advances the order (and notifies the buyer) when the parcel moves. */
async function syncOrderStatus(
  shipment: Shipment,
  status: ShipmentStatus,
): Promise<void> {
  const target = toOrderStatus(status);
  if (!target) return;

  const order = await prisma.order.findUnique({
    where: { id: shipment.orderId },
  });
  if (!order || order.status === target) return;

  // Never walk an order back to SHIPPED once it's DELIVERED.
  if (order.status === "DELIVERED" && target === "SHIPPED") return;

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      status: target,
      shippedAt: order.shippedAt ?? (target === "SHIPPED" ? new Date() : null),
      deliveredAt:
        order.deliveredAt ?? (target === "DELIVERED" ? new Date() : null),
    },
  });

  // CANCELLED needs no buyer email: they either cancelled it themselves or
  // the seller told them. Everything else is worth a message.
  if (target === "CANCELLED") return;

  const reservation = await prisma.reservation.findUnique({
    where: { id: order.reservationId },
  });
  if (!reservation) return;

  const [product, buyer] = await Promise.all([
    prisma.product.findUnique({ where: { id: reservation.productId } }),
    prisma.user.findUnique({ where: { id: reservation.userId } }),
  ]);
  if (!product || !buyer) return;

  if (target === "RTO") {
    // Tell the buyer why their parcel vanished, and the seller to expect it
    // back — an unexplained RTO generates support tickets on both sides.
    await announceOrderReturning({ order: updated, product, buyer });

    const seller = await prisma.user.findUnique({
      where: { id: shipment.sellerId },
    });
    if (seller) {
      notifySellerShipmentIssue({
        seller,
        productTitle: product.title,
        orderId: order.id,
        reason:
          shipment.courierStatus?.replaceAll("_", " ").toLowerCase() ??
          "The courier could not complete delivery.",
        kind: "returning",
      });
    }
    return;
  }

  // Only SHIPPED/DELIVERED remain here; the rest returned above.
  if (target !== "SHIPPED" && target !== "DELIVERED") return;

  await announceOrderStatus({
    order: updated,
    product,
    buyer,
    status: target,
  });
}

/**
 * Reconciles every in-flight parcel against Eshopbox.
 *
 * The webhook is the real-time path; this exists because a webhook that is
 * dropped, or fired while we were deploying, would otherwise strand an order
 * forever. Safe to run on a schedule.
 */
export async function reconcileShipments(): Promise<{
  checked: number;
  updated: number;
}> {
  if (!eshopboxConfigured()) return { checked: 0, updated: 0 };

  const open = await prisma.shipment.findMany({
    where: {
      trackingId: { not: null },
      status: {
        notIn: ["DELIVERED", "RTO_DELIVERED", "CANCELLED"],
      },
    },
    orderBy: { bookedAt: "asc" },
    take: 500,
  });
  if (open.length === 0) return { checked: 0, updated: 0 };

  let updated = 0;

  // Their tracking endpoint takes at most 50 AWBs per call.
  for (let i = 0; i < open.length; i += MAX_TRACKING_IDS) {
    const batch = open.slice(i, i + MAX_TRACKING_IDS);
    const ids = batch.map((s) => s.trackingId!).filter(Boolean);

    let details: TrackingDetail[];
    try {
      details = await getTrackingDetails(ids);
    } catch (err) {
      console.error("[shipping] tracking poll failed for a batch:", err);
      continue; // Other batches may still succeed.
    }

    for (const detail of details) {
      const current = batch.find((s) => s.trackingId === detail.trackingId);
      // Skip no-op scans so we don't rewrite rows (and re-notify) needlessly.
      if (!current || current.courierStatus === detail.currentStatus) continue;

      try {
        await applyTrackingUpdate({
          trackingId: detail.trackingId,
          courierStatus: detail.currentStatus,
          courierName: detail.courierPartnerName,
          expectedDeliveryDate: detail.expectedDeliveryDate,
          statusLogs: detail.statusLogs,
          source: "poll",
        });
        updated++;
      } catch (err) {
        console.error(
          `[shipping] failed applying poll update for ${detail.trackingId}:`,
          err,
        );
      }
    }
  }

  return { checked: open.length, updated };
}

/** Convenience view model for the dashboards. */
export type ShipmentView = {
  shipment: Shipment;
  order: Order;
  product: Product | null;
};
