import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { broadcastToRoom } from "@/lib/livekit";
import { ReserveError, reserveProduct } from "@/lib/reservations";

const errorResponses: Record<string, { status: number; message: string }> = {
  NOT_FOUND: { status: 404, message: "Product not found." },
  NOT_LIVE: { status: 409, message: "This product isn't in a live stream." },
  SOLD_OUT: { status: 409, message: "Sold out — someone got the last one." },
  INVALID_QUANTITY: { status: 400, message: "Invalid quantity." },
  TOO_MANY_PENDING: {
    status: 429,
    message: "Too many unpaid reservations — pay or let them expire first.",
  },
};

/**
 * POST /api/reservations  { productId: string, quantity?: number }
 *
 * Reserves stock for the signed-in buyer for 10 minutes (Buy Now). Confirmation
 * into an Order happens only via the Razorpay webhook (Milestone 6); expiry is
 * handled by the sweeper job.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to buy.", code: "UNAUTHENTICATED" },
      { status: 401 },
    );
  }
  if (!user.isActive) {
    return NextResponse.json(
      { error: "Your account is suspended.", code: "SUSPENDED" },
      { status: 403 },
    );
  }

  let body: { productId?: unknown; quantity?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.productId !== "string" || body.productId.length === 0) {
    return NextResponse.json({ error: "productId is required." }, { status: 400 });
  }
  const quantity = body.quantity === undefined ? 1 : Number(body.quantity);

  try {
    const result = await reserveProduct({
      productId: body.productId,
      userId: user.id,
      quantity,
    });

    // Live "3 left" update for everyone watching. Best-effort by design.
    await broadcastToRoom(result.streamRoomName, {
      type: "stock",
      productId: body.productId,
      availableStock: result.availableStock,
    });

    return NextResponse.json({
      reservationId: result.reservation.id,
      expiresAt: result.reservation.expiresAt.toISOString(),
      availableStock: result.availableStock,
    });
  } catch (err) {
    if (err instanceof ReserveError) {
      const mapped = errorResponses[err.code];
      return NextResponse.json(
        { error: mapped.message, code: err.code },
        { status: mapped.status },
      );
    }
    console.error("Reservation failed:", err);
    return NextResponse.json(
      { error: "Something went wrong. Try again." },
      { status: 500 },
    );
  }
}
