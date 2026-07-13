import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";

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
