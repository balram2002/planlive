"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { audit, requireAdmin } from "@/lib/authz";
import { announceOrderStatus } from "@/lib/order-events";
import { TRACK_STAGES, type TrackStage } from "@/lib/order-status";

/**
 * Admin override of an order's fulfilment stage.
 *
 * Unlike the seller control (which only steps forward one stage), an admin
 * may set any stage — support sometimes has to walk an order back after a
 * mis-click. The buyer is only notified when the order moves *forward*, so
 * correcting a mistake doesn't spam them with a second "delivered!" message.
 */
export async function adminSetOrderStage(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const orderId = String(formData.get("orderId") ?? "");
  const stage = String(formData.get("stage") ?? "") as TrackStage;

  if (!TRACK_STAGES.includes(stage)) return;

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return;

  const previousIndex = TRACK_STAGES.indexOf(order.status as TrackStage);
  const nextIndex = TRACK_STAGES.indexOf(stage);
  if (previousIndex === nextIndex) return;

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      status: stage,
      shippedAt:
        stage === "SHIPPED" ? (order.shippedAt ?? new Date()) : order.shippedAt,
      deliveredAt:
        stage === "DELIVERED"
          ? (order.deliveredAt ?? new Date())
          : order.deliveredAt,
    },
  });

  audit("admin.order-stage", {
    by: admin.email,
    orderId: order.id,
    from: order.status,
    to: stage,
  });

  // Forward movement only, and never for the initial "placed" stage (the
  // buyer already got their receipt at checkout).
  if (nextIndex > previousIndex && stage !== "PLACED") {
    const reservation = await prisma.reservation.findUnique({
      where: { id: order.reservationId },
    });
    if (reservation) {
      const [product, buyer] = await Promise.all([
        prisma.product.findUnique({ where: { id: reservation.productId } }),
        prisma.user.findUnique({ where: { id: reservation.userId } }),
      ]);
      if (product && buyer) {
        await announceOrderStatus({ order: updated, product, buyer, status: stage });
      }
    }
  }

  revalidatePath("/admin/orders");
  revalidatePath("/orders");
  revalidatePath("/dashboard/sales");
}
