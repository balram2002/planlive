"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import {
  bookShipment,
  cancelShipmentForOrder,
  reconcileShipments,
} from "@/lib/shipping-service";

export type AdminShippingState = { error?: string; success?: string };

/**
 * Admin re-book of a failed shipment on a seller's behalf — support does
 * this when a seller is stuck on a serviceability error they can't fix.
 */
export async function adminBookShipment(
  _prev: AdminShippingState,
  formData: FormData,
): Promise<AdminShippingState> {
  const admin = await requireAdmin();
  const orderId = String(formData.get("orderId") ?? "");

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { error: "Order not found." };

  const reservation = await prisma.reservation.findUnique({
    where: { id: order.reservationId },
  });
  if (!reservation) return { error: "Reservation not found." };

  const product = await prisma.product.findUnique({
    where: { id: reservation.productId },
  });
  if (!product) return { error: "Product no longer exists." };

  const seller = await prisma.user.findUnique({
    where: { id: product.sellerId },
  });
  if (!seller) return { error: "Seller not found." };

  const result = await bookShipment({
    order,
    seller,
    actorEmail: `${admin.email} (admin)`,
  });

  revalidatePath("/admin/shipments");
  revalidatePath("/dashboard/sales");

  if (!result.ok) return { error: result.error };
  return { success: `Booked — AWB ${result.shipment.trackingId}` };
}

/** Admin cancel of any booked parcel. */
export async function adminCancelShipment(
  _prev: AdminShippingState,
  formData: FormData,
): Promise<AdminShippingState> {
  const admin = await requireAdmin();
  const orderId = String(formData.get("orderId") ?? "");

  const result = await cancelShipmentForOrder({
    orderId,
    actorEmail: `${admin.email} (admin)`,
  });

  revalidatePath("/admin/shipments");
  revalidatePath("/dashboard/sales");

  if (!result.ok) return { error: result.error };
  return { success: "Shipment cancelled." };
}

/**
 * Force a reconciliation pass against Eshopbox. The cron job does this on a
 * schedule; this button exists for when support needs an answer right now.
 */
export async function adminSyncShipments(): Promise<void> {
  await requireAdmin();
  try {
    const { checked, updated } = await reconcileShipments();
    console.info(`[shipping] admin sync: ${updated}/${checked} updated`);
  } catch (err) {
    console.error("[shipping] admin sync failed:", err);
  }
  revalidatePath("/admin/shipments");
}
