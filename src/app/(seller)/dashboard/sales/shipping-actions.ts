"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSeller } from "@/lib/authz";
import { bookShipment, cancelShipmentForOrder } from "@/lib/shipping-service";

export type ShippingActionState = { error?: string; success?: string };

/** Verifies the caller owns the product behind this order. */
async function loadOwnedOrder(orderId: string, sellerId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return null;

  const reservation = await prisma.reservation.findUnique({
    where: { id: order.reservationId },
  });
  if (!reservation) return null;

  const product = await prisma.product.findUnique({
    where: { id: reservation.productId },
  });
  if (!product || product.sellerId !== sellerId) return null;

  return order;
}

/**
 * Books the parcel with Eshopbox and pulls back an AWB + printable label.
 * Ownership is re-checked here — the seller UI only hides buttons.
 */
export async function createShipmentAction(
  _prev: ShippingActionState,
  formData: FormData,
): Promise<ShippingActionState> {
  const seller = await requireSeller();
  const orderId = String(formData.get("orderId") ?? "");

  const order = await loadOwnedOrder(orderId, seller.id);
  if (!order) return { error: "Order not found." };

  const result = await bookShipment({
    order,
    seller,
    actorEmail: seller.email,
  });

  revalidatePath("/dashboard/sales");
  revalidatePath("/orders");

  if (!result.ok) return { error: result.error };
  return {
    success: `Label ready — ${result.shipment.courierName ?? "courier"} · AWB ${result.shipment.trackingId}`,
  };
}

/** Cancels a booked parcel before the courier collects it. */
export async function cancelShipmentAction(
  _prev: ShippingActionState,
  formData: FormData,
): Promise<ShippingActionState> {
  const seller = await requireSeller();
  const orderId = String(formData.get("orderId") ?? "");

  const order = await loadOwnedOrder(orderId, seller.id);
  if (!order) return { error: "Order not found." };

  const result = await cancelShipmentForOrder({
    orderId,
    actorEmail: seller.email,
  });

  revalidatePath("/dashboard/sales");
  revalidatePath("/orders");

  if (!result.ok) return { error: result.error };
  return { success: "Shipment cancelled." };
}
