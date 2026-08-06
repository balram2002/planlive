import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { audit } from "@/lib/authz";
import { priceBreakdown } from "@/lib/pricing";
import { announceOrder } from "@/lib/order-events";
import { releaseReservation } from "@/lib/reservations";
import { broadcastToRoom } from "@/lib/livekit";

/**
 * POST /api/checkout/cod  { reservationId, addressId }
 *
 * Places a cash-on-delivery order for a PENDING reservation: confirms the
 * reservation and creates the Order (status PLACED, method COD) atomically,
 * with the delivery address snapshotted onto the order. Stock was already
 * decremented at reservation time, so no inventory movement happens here.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to order." }, { status: 401 });
  }
  if (!user.isActive) {
    return NextResponse.json({ error: "Your account is suspended." }, { status: 403 });
  }

  let body: { reservationId?: unknown; addressId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const reservationId =
    typeof body.reservationId === "string" ? body.reservationId : "";
  const addressId = typeof body.addressId === "string" ? body.addressId : "";
  if (!reservationId || !addressId) {
    return NextResponse.json(
      { error: "reservationId and addressId are required." },
      { status: 400 },
    );
  }

  const [reservation, address] = await Promise.all([
    prisma.reservation.findUnique({ where: { id: reservationId } }),
    prisma.address.findUnique({ where: { id: addressId } }),
  ]);

  if (!reservation || reservation.userId !== user.id) {
    return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
  }
  if (reservation.status !== "PENDING" || reservation.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "Reservation expired — reserve again." },
      { status: 410 },
    );
  }
  if (!address || address.userId !== user.id) {
    return NextResponse.json({ error: "Address not found." }, { status: 404 });
  }

  const product = await prisma.product.findUnique({
    where: { id: reservation.productId },
  });
  if (!product) {
    return NextResponse.json({ error: "Product no longer exists." }, { status: 404 });
  }

  // COD adds the flat delivery charge on top of the goods. Computed here,
  // never taken from the client — the drawer's summary just mirrors it.
  const totals = priceBreakdown(
    product.priceInPaise * reservation.quantity,
    "COD",
  );

  const addressJson = JSON.stringify({
    label: address.label,
    fullName: address.fullName,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    state: address.state,
    pincode: address.pincode,
  });

  // The order is created in its own try. Announcements happen strictly after,
  // so a failed email or LiveKit broadcast can never be mistaken for a failed
  // order — which would otherwise release the stock out from under a buyer
  // whose order was placed successfully.
  let order;
  try {
    order = await prisma.$transaction(async (tx) => {
      // Conditional flip — loses cleanly against the sweeper or a double tap.
      const flipped = await tx.reservation.updateMany({
        where: { id: reservation.id, status: "PENDING" },
        data: { status: "CONFIRMED" },
      });
      if (flipped.count === 0) {
        throw new Error("RESERVATION_GONE");
      }
      return tx.order.create({
        data: {
          reservationId: reservation.id,
          razorpayOrderId: "", // COD — no gateway order
          amountInPaise: totals.totalInPaise,
          deliveryFeeInPaise: totals.deliveryFeeInPaise,
          status: "PLACED",
          paymentMethod: "COD",
          addressJson,
        },
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "RESERVATION_GONE") {
      // Someone else's sweep or a double-tap already resolved it; the stock
      // is either theirs or already back on the shelf. Nothing to release.
      return NextResponse.json(
        { error: "Reservation expired — reserve again." },
        { status: 410 },
      );
    }
    // Unique reservationId → an order already exists (e.g. paid online).
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      return NextResponse.json({ error: "Already ordered." }, { status: 409 });
    }

    // A genuine failure: the transaction rolled back, so the hold is still
    // PENDING and the item is invisible to everyone else. The buyer has to
    // start over regardless, so hand the stock back now instead of letting it
    // sit out the rest of the TTL.
    console.error("COD order failed:", err);
    const released = await releaseReservation({
      reservationId: reservation.id,
      userId: user.id,
    }).catch(() => null);
    if (released?.roomName) {
      await broadcastToRoom(released.roomName, {
        type: "stock",
        productId: released.productId,
        availableStock: released.availableStock,
      });
    }

    return NextResponse.json(
      { error: "Couldn't place the order — the item is back on sale." },
      { status: 500 },
    );
  }

  audit("order.cod-placed", {
    userId: user.id,
    orderId: order.id,
    reservationId: reservation.id,
  });

  // Celebration in the live room + the buyer's receipt. Both fail-soft, and
  // deliberately outside the block above.
  try {
    await announceOrder({ order, reservation, product, buyer: user, address });
  } catch (err) {
    console.error("COD order announce failed:", err);
  }

  return NextResponse.json({
    orderId: order.id,
    itemsInPaise: totals.itemsInPaise,
    deliveryFeeInPaise: totals.deliveryFeeInPaise,
    amountInPaise: order.amountInPaise,
  });
}
