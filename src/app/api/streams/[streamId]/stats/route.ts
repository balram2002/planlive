import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";

/**
 * GET /api/streams/:id/stats — owner-only live stats for the seller console:
 * reservations this stream, confirmed units, and paid revenue so far.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ streamId: string }> },
) {
  const { streamId } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stream = await prisma.stream.findUnique({ where: { id: streamId } });
  if (!stream || stream.sellerId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const reservations = await prisma.reservation.findMany({
    where: { streamId: stream.id },
    select: { id: true, status: true, quantity: true },
  });

  const confirmed = reservations.filter((r) => r.status === "CONFIRMED");
  const paidOrders =
    confirmed.length === 0
      ? []
      : await prisma.order.findMany({
          where: {
            reservationId: { in: confirmed.map((r) => r.id) },
            status: "PAID",
          },
          select: { amountInPaise: true },
        });

  return NextResponse.json({
    reservations: reservations.length,
    confirmedUnits: confirmed.reduce((s, r) => s + r.quantity, 0),
    revenuePaise: paidOrders.reduce((s, o) => s + o.amountInPaise, 0),
  });
}
