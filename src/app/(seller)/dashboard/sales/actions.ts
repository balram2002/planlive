"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { audit, requireSeller } from "@/lib/authz";
import { announceOrderStatus } from "@/lib/order-events";
import { nextStage, TRACK_STAGES } from "@/lib/order-status";

/**
 * Advance one of the seller's own orders to the next fulfilment stage
 * (Placed → Shipped → Delivered) and email the buyer about it.
 *
 * The target stage comes from the *current* stored status, never from the
 * form — a stale page can't skip a step or move an order backwards.
 */
export async function advanceOrderStatus(formData: FormData): Promise<void> {
  const seller = await requireSeller();
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return;

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return;

  const reservation = await prisma.reservation.findUnique({
    where: { id: order.reservationId },
  });
  if (!reservation) return;

  const product = await prisma.product.findUnique({
    where: { id: reservation.productId },
  });
  // Only the seller who owns the product may move it.
  if (!product || product.sellerId !== seller.id) return;

  const target = nextStage(order.status);
  if (!target || target === "PLACED") return;

  // Conditional update: if another tab already advanced it, this no-ops.
  const updated = await prisma.order.updateMany({
    where: { id: order.id, status: order.status },
    data: {
      status: target,
      ...(target === "SHIPPED"
        ? { shippedAt: new Date() }
        : { deliveredAt: new Date() }),
    },
  });
  if (updated.count === 0) return;

  audit("order.status-advance", {
    sellerId: seller.id,
    orderId: order.id,
    from: order.status,
    to: target,
  });

  const buyer = await prisma.user.findUnique({
    where: { id: reservation.userId },
  });
  if (buyer && TRACK_STAGES.includes(target)) {
    await announceOrderStatus({
      order: { ...order, status: target },
      product,
      buyer,
      status: target,
    });
  }

  revalidatePath("/dashboard/sales");
  revalidatePath("/orders");
}
