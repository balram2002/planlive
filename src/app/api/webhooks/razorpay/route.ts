import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcastToRoom } from "@/lib/livekit";
import { verifyRazorpayWebhookSignature } from "@/lib/razorpay";

/**
 * Razorpay webhook (configure `payment.captured` + `payment.failed` events).
 *
 * This is the ONLY code path that moves a reservation to CONFIRMED and an
 * order to PAID — the client-side redirect is never trusted (spec rule).
 *
 * Race with the expiry sweeper: if payment lands after the sweeper expired
 * the reservation and restocked, we try to atomically reclaim the stock. If
 * someone else already bought it, the payment is flagged for manual refund.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
    return new NextResponse("Invalid signature", { status: 400 });
  }

  let event: {
    event?: string;
    payload?: { payment?: { entity?: { id?: string; order_id?: string } } };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const payment = event.payload?.payment?.entity;
  if (!payment?.order_id) {
    // Event type we don't care about — acknowledge so Razorpay stops retrying.
    return NextResponse.json({ received: true });
  }

  const order = await prisma.order.findFirst({
    where: { razorpayOrderId: payment.order_id },
  });
  if (!order) {
    console.error(`Razorpay webhook: no local order for ${payment.order_id}`);
    return NextResponse.json({ received: true });
  }

  switch (event.event) {
    case "payment.captured": {
      // Idempotency: replayed webhooks find the order already PAID.
      if (order.status === "PAID") break;

      const reservation = await prisma.reservation.findUnique({
        where: { id: order.reservationId },
      });
      if (!reservation) break;

      const confirmed = await prisma.$transaction(async (tx) => {
        // Happy path: reservation still pending.
        const flipped = await tx.reservation.updateMany({
          where: { id: reservation.id, status: "PENDING" },
          data: { status: "CONFIRMED" },
        });
        if (flipped.count === 1) return { ok: true as const, reclaimed: false };

        // Sweeper expired it first — try to take the stock back.
        const reclaim = await tx.product.updateMany({
          where: {
            id: reservation.productId,
            availableStock: { gte: reservation.quantity },
          },
          data: { availableStock: { decrement: reservation.quantity } },
        });
        if (reclaim.count === 0) return { ok: false as const, reclaimed: false };

        const reflipped = await tx.reservation.updateMany({
          where: { id: reservation.id, status: "EXPIRED" },
          data: { status: "CONFIRMED" },
        });
        if (reflipped.count === 0) {
          // Unexpected state (e.g. CANCELLED) — roll everything back.
          throw new Error(
            `Reservation ${reservation.id} in unexpected state during capture`,
          );
        }
        return { ok: true as const, reclaimed: true };
      });

      await prisma.order.update({
        where: { id: order.id },
        data: { status: "PAID", razorpayPaymentId: payment.id },
      });

      if (!confirmed.ok) {
        // Money captured but goods resold — needs a manual refund.
        console.error(
          `[REFUND NEEDED] payment ${payment.id} captured for reservation ` +
            `${reservation.id}, but stock was resold after expiry.`,
        );
        break;
      }

      if (confirmed.reclaimed) {
        // Stock changed again — tell viewers.
        const [product, stream] = await Promise.all([
          prisma.product.findUnique({ where: { id: reservation.productId } }),
          prisma.stream.findUnique({ where: { id: reservation.streamId } }),
        ]);
        if (product && stream?.status === "LIVE") {
          await broadcastToRoom(stream.livekitRoomName, {
            type: "stock",
            productId: product.id,
            availableStock: product.availableStock,
          });
        }
      }
      break;
    }

    case "payment.failed": {
      // Reservation stays PENDING so the buyer can retry until it expires.
      await prisma.order.updateMany({
        where: { id: order.id, status: "CREATED" },
        data: { status: "FAILED" },
      });
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
