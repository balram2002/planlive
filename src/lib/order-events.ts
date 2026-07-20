import type { Address, Order, Product, Reservation, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { broadcastToRoom } from "@/lib/livekit";
import {
  displayName,
  notifyOrderPlaced,
  notifyOrderStatus,
  notifyPaymentFailed,
} from "@/lib/notify";

export { displayName };

type AddressSnapshot = {
  fullName: string;
  phone: string;
  line1: string;
  city: string;
  pincode: string;
};

/** The address JSON snapshotted onto the order at purchase time. */
function parseAddressSnapshot(json: string | null): AddressSnapshot | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed?.fullName !== "string") return null;
    return {
      fullName: parsed.fullName,
      phone: String(parsed.phone ?? ""),
      line1: String(parsed.line1 ?? ""),
      city: String(parsed.city ?? ""),
      pincode: String(parsed.pincode ?? ""),
    };
  } catch {
    return null;
  }
}

/**
 * Everything that should happen once an order is successfully placed, in one
 * place so COD and the Razorpay webhook stay in lockstep:
 *
 *  1. broadcast a celebration packet to the live room (server-sent, so
 *     viewers can trust it — clients can't forge a purchase),
 *  2. notify the buyer by email + WhatsApp.
 *
 * Both are best-effort: the order is already committed, and a failed
 * notification must never turn a successful purchase into an error.
 */
export async function announceOrder(input: {
  order: Order;
  reservation: Reservation;
  product: Product;
  buyer: User;
  /** Omit to use the snapshot already stored on the order. */
  address?: Address | null;
}): Promise<void> {
  const { order, reservation, product, buyer } = input;
  const name = displayName(buyer);

  const snapshot = input.address
    ? {
        fullName: input.address.fullName,
        phone: input.address.phone,
        line1: input.address.line1,
        city: input.address.city,
        pincode: input.address.pincode,
      }
    : parseAddressSnapshot(order.addressJson);

  try {
    const stream = await prisma.stream.findUnique({
      where: { id: reservation.streamId },
    });
    if (stream?.status === "LIVE") {
      await broadcastToRoom(stream.livekitRoomName, {
        type: "order-celebration",
        buyerName: name,
        productTitle: product.title,
        productImageUrl: product.imageUrl,
        quantity: reservation.quantity,
      });
    }
  } catch (err) {
    console.error("Order celebration broadcast failed:", err);
  }

  notifyOrderPlaced({
    buyer,
    // The courier calls the delivery number, so parcel updates go there.
    deliveryPhone: snapshot?.phone || null,
    productTitle: product.title,
    quantity: reservation.quantity,
    itemsInPaise: order.amountInPaise - order.deliveryFeeInPaise,
    deliveryFeeInPaise: order.deliveryFeeInPaise,
    totalInPaise: order.amountInPaise,
    paymentMethod: order.paymentMethod,
    orderId: order.id,
    address: snapshot,
  });
}

/** Buyer notification when a seller advances an order to shipped/delivered. */
export async function announceOrderStatus(input: {
  order: Order;
  product: Product;
  buyer: User;
  status: "SHIPPED" | "DELIVERED";
}): Promise<void> {
  const snapshot = parseAddressSnapshot(input.order.addressJson);
  notifyOrderStatus({
    buyer: input.buyer,
    deliveryPhone: snapshot?.phone || null,
    productTitle: input.product.title,
    orderId: input.order.id,
    status: input.status,
  });
}

/** Buyer notification when a payment is declined — the item is still held. */
export async function announcePaymentFailed(input: {
  order: Order;
  product: Product;
  buyer: User;
}): Promise<void> {
  const snapshot = parseAddressSnapshot(input.order.addressJson);
  notifyPaymentFailed({
    buyer: input.buyer,
    deliveryPhone: snapshot?.phone || null,
    productTitle: input.product.title,
    totalInPaise: input.order.amountInPaise,
  });
}
