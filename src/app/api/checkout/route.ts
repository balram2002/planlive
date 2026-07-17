import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { getRazorpay, razorpayConfigured, RAZORPAY_KEY_ID } from "@/lib/razorpay";

/**
 * POST /api/checkout  { reservationId: string }
 *
 * Creates a Razorpay order for a PENDING (unexpired) reservation owned by the
 * caller, plus a local Order doc (status CREATED). Idempotent: calling again
 * for the same reservation returns the existing order so the buyer can retry
 * a dismissed/failed payment. Confirmation to PAID happens only in the
 * Razorpay webhook.
 */
export async function POST(req: NextRequest) {
  if (!razorpayConfigured()) {
    return NextResponse.json(
      { error: "Payments are not configured on the server." },
      { status: 503 },
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to pay." }, { status: 401 });
  }
  if (!user.isActive) {
    return NextResponse.json(
      { error: "Your account is suspended." },
      { status: 403 },
    );
  }

  let body: { reservationId?: unknown; addressId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body.reservationId !== "string" || body.reservationId.length === 0) {
    return NextResponse.json(
      { error: "reservationId is required." },
      { status: 400 },
    );
  }

  // Delivery address snapshot (chosen in the buy drawer before payment).
  let addressJson: string | null = null;
  if (typeof body.addressId === "string" && body.addressId) {
    const address = await prisma.address.findUnique({
      where: { id: body.addressId },
    });
    if (!address || address.userId !== user.id) {
      return NextResponse.json({ error: "Address not found." }, { status: 404 });
    }
    addressJson = JSON.stringify({
      label: address.label,
      fullName: address.fullName,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
    });
  }

  const reservation = await prisma.reservation.findUnique({
    where: { id: body.reservationId },
  });
  if (!reservation || reservation.userId !== user.id) {
    return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
  }
  if (reservation.status === "CONFIRMED") {
    return NextResponse.json({ error: "Already paid." }, { status: 409 });
  }
  if (reservation.status !== "PENDING" || reservation.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "Reservation expired — reserve again." },
      { status: 410 },
    );
  }

  const product = await prisma.product.findUnique({
    where: { id: reservation.productId },
  });
  if (!product) {
    return NextResponse.json({ error: "Product no longer exists." }, { status: 404 });
  }

  const amountInPaise = product.priceInPaise * reservation.quantity;

  // Reuse the existing order if the buyer retries (reservationId is unique).
  let order = await prisma.order.findUnique({
    where: { reservationId: reservation.id },
  });

  // A retry may supply the address the first attempt didn't have.
  if (order && addressJson && !order.addressJson) {
    order = await prisma.order.update({
      where: { id: order.id },
      data: { addressJson },
    });
  }

  if (!order) {
    const rzpOrder = await getRazorpay().orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: reservation.id,
      notes: { reservationId: reservation.id },
    });

    try {
      order = await prisma.order.create({
        data: {
          reservationId: reservation.id,
          razorpayOrderId: rzpOrder.id,
          amountInPaise,
          status: "CREATED",
          paymentMethod: "ONLINE",
          addressJson,
        },
      });
    } catch (err) {
      // Two "Pay now" taps raced: the unique reservationId constraint fired.
      // Use the order the other request created (its Razorpay order wins).
      const isUniqueViolation =
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: string }).code === "P2002";
      if (!isUniqueViolation) throw err;
      order = await prisma.order.findUnique({
        where: { reservationId: reservation.id },
      });
      if (!order) throw err;
    }
  }

  return NextResponse.json({
    keyId: RAZORPAY_KEY_ID,
    razorpayOrderId: order.razorpayOrderId,
    amountInPaise: order.amountInPaise,
    currency: "INR",
    productTitle: product.title,
    email: user.email,
  });
}
