"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, audit } from "@/lib/authz";
import { cancelShipmentForOrder } from "@/lib/shipping-service";
import { isCancellable } from "@/lib/eshopbox/status-map";

export type CancelOrderState = { error?: string; success?: string };

/**
 * Buyer-initiated cancellation.
 *
 * Only possible while the parcel is still with the seller — once a courier
 * has collected it the buyer has to refuse delivery instead, which is a
 * return rather than a cancellation. Stock goes back on the shelf, and any
 * booked AWB is cancelled with Eshopbox first so we never leave a live label
 * pointing at a dead order.
 */
export async function cancelOrder(
  _prev: CancelOrderState,
  formData: FormData,
): Promise<CancelOrderState> {
  const user = await requireUser();
  const orderId = String(formData.get("orderId") ?? "");

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { error: "Order not found." };

  const reservation = await prisma.reservation.findUnique({
    where: { id: order.reservationId },
  });
  // Ownership: an order id must never let someone cancel a stranger's parcel.
  if (!reservation || reservation.userId !== user.id) {
    return { error: "Order not found." };
  }

  if (order.status === "CANCELLED") {
    return { success: "This order is already cancelled." };
  }
  if (!["PAID", "PLACED"].includes(order.status)) {
    return {
      error:
        order.status === "SHIPPED" || order.status === "DELIVERED"
          ? "This parcel is already on its way — refuse delivery to return it."
          : "This order can no longer be cancelled.",
    };
  }

  const shipment = await prisma.shipment.findUnique({ where: { orderId } });
  if (shipment?.trackingId && !isCancellable(shipment.status)) {
    return {
      error: "The courier already has this parcel — it can't be cancelled now.",
    };
  }

  // Cancel with the courier BEFORE touching our own records: if Eshopbox
  // refuses, the order must stay exactly as it was rather than ending up
  // cancelled here but live with the carrier.
  if (shipment?.trackingId) {
    const result = await cancelShipmentForOrder({
      orderId,
      actorEmail: user.email,
    });
    if (!result.ok) return { error: result.error };
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: { status: "CANCELLED" },
    });
    // Conditional flip so a concurrent sweep/webhook can't double-restock.
    const flipped = await tx.reservation.updateMany({
      where: { id: reservation.id, status: { not: "CANCELLED" } },
      data: { status: "CANCELLED" },
    });
    if (flipped.count > 0) {
      await tx.product.updateMany({
        where: { id: reservation.productId },
        data: { availableStock: { increment: reservation.quantity } },
      });
    }
  });

  audit("order.cancelled-by-buyer", { orderId, by: user.email });
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/dashboard/sales");

  return {
    success:
      order.paymentMethod === "COD"
        ? "Order cancelled."
        : "Order cancelled — any payment is refunded to your original method.",
  };
}
