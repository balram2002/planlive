import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { broadcastToRoom } from "@/lib/livekit";
import { releaseReservation } from "@/lib/reservations";

/**
 * GET /api/reservations/:id — owner-only status check. The viewer polls this
 * after the Razorpay modal closes, until the webhook confirms (or expiry).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reservation = await prisma.reservation.findUnique({ where: { id } });
  if (!reservation || reservation.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const order = await prisma.order.findUnique({
    where: { reservationId: reservation.id },
    select: { status: true },
  });

  return NextResponse.json({
    status: reservation.status,
    expiresAt: reservation.expiresAt.toISOString(),
    orderStatus: order?.status ?? null,
  });
}

/**
 * DELETE /api/reservations/:id — owner-only release of an unpaid hold.
 *
 * Called when a buyer abandons checkout, so the item goes back in stock for
 * everyone else immediately instead of sitting out the 10-minute TTL. Always
 * 200s: a hold that was already paid, expired or released is not an error
 * from the caller's point of view, there's simply nothing left to give back.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const released = await releaseReservation({
    reservationId: id,
    userId: user.id,
  });
  if (!released) return NextResponse.json({ released: false });

  // Put the stock back on everyone's screen, same as the sweeper does.
  if (released.roomName) {
    await broadcastToRoom(released.roomName, {
      type: "stock",
      productId: released.productId,
      availableStock: released.availableStock,
    });
  }

  return NextResponse.json({
    released: true,
    availableStock: released.availableStock,
  });
}
