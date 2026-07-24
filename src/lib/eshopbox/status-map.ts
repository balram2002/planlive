import type { OrderStatus, ShipmentStatus } from "@prisma/client";

/**
 * Translation layer between Eshopbox's courier vocabulary and our own.
 *
 * Eshopbox reports 27 distinct states, many of which are operational detail
 * a buyer shouldn't have to parse ("DELIVERED_WAREHOUSE", "NDR"). We collapse
 * them into a small ShipmentStatus set for our UI, while always keeping the
 * raw string on the Shipment row so support can see exactly what the courier
 * said.
 */

/** Every status string the tracking API is documented to return. */
export const COURIER_STATUSES = [
  "PACKED",
  "APPROVED",
  "PICKUP_PENDING",
  "PICKUP_FAILED",
  "CANCELLED_ORDER",
  "OUT_FOR_PICKUP",
  "PICKED_UP",
  "INTRANSIT",
  "OUT_FOR_DELIVERY",
  "SHIPMENT_DELAYED",
  "CONTACT_CUSTOMER_CARE",
  "SHIPMENT_HELD",
  "LOST",
  "DAMAGED",
  "FAILED_DELIVERY",
  "RTO_REQUESTED",
  "RTO",
  "RTO_OUT_FOR_DELIVERY",
  "RTO_INTRANSIT",
  "RTO_CONTACT_CUSTOMER_CARE",
  "RTO_SHIPMENT_DELAY",
  "RTO_DELIVERED",
  "RTO_FAILED",
  "DELIVERED",
  "RECEIVED",
  "DELIVERED_WAREHOUSE",
] as const;

/**
 * Webhook `status` values, which are NOT the same vocabulary as the tracking
 * API's `currentStatus`.
 *
 * The tracking API returns SCREAMING_SNAKE ("INTRANSIT"); the webhook sends
 * the lowercase eventSubType ("intransit"), and includes several states the
 * tracking API never emits — "created", "ready_to_ship", "rto_created",
 * "dispatched", "unhold", "damage". Uppercasing alone is not enough: without
 * these entries, the very first webhook every shipment receives ("created")
 * would fall through to EXCEPTION and flag a healthy parcel as broken.
 */
const WEBHOOK_ONLY: Record<string, ShipmentStatus> = {
  CREATED: "BOOKED",
  READY_TO_SHIP: "BOOKED",
  DISPATCHED: "IN_TRANSIT",
  RTO_CREATED: "RTO",
  RETURN_EXPECTED: "RTO",
  // Singular form; the tracking API spells it DAMAGED.
  DAMAGE: "EXCEPTION",
  // A hold was lifted — the parcel is moving again.
  UNHOLD: "IN_TRANSIT",
  // Seller/ops responded to a non-delivery report; still undelivered.
  NDR_RESOLUTION_SUBMITTED: "FAILED_DELIVERY",
};

const COURIER_TO_SHIPMENT: Record<string, ShipmentStatus> = {
  ...WEBHOOK_ONLY,

  // Booked, not yet collected from the seller.
  PACKED: "BOOKED",
  APPROVED: "BOOKED",
  PICKUP_PENDING: "PICKUP_PENDING",
  OUT_FOR_PICKUP: "PICKUP_PENDING",
  PICKUP_FAILED: "EXCEPTION",

  // On the road.
  PICKED_UP: "PICKED_UP",
  INTRANSIT: "IN_TRANSIT",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",

  // Problems that need attention but aren't terminal.
  SHIPMENT_DELAYED: "EXCEPTION",
  CONTACT_CUSTOMER_CARE: "EXCEPTION",
  SHIPMENT_HELD: "EXCEPTION",
  LOST: "EXCEPTION",
  DAMAGED: "EXCEPTION",
  FAILED_DELIVERY: "FAILED_DELIVERY",

  // Return to origin — the parcel is heading back to the seller.
  RTO_REQUESTED: "RTO",
  RTO: "RTO",
  RTO_INTRANSIT: "RTO",
  RTO_OUT_FOR_DELIVERY: "RTO",
  RTO_CONTACT_CUSTOMER_CARE: "RTO",
  RTO_SHIPMENT_DELAY: "RTO",
  RTO_FAILED: "RTO",
  RTO_DELIVERED: "RTO_DELIVERED",

  // Terminal success. RECEIVED/DELIVERED_WAREHOUSE are the return-leg
  // equivalents of "arrived", so they close out an RTO rather than an order.
  DELIVERED: "DELIVERED",
  RECEIVED: "RTO_DELIVERED",
  DELIVERED_WAREHOUSE: "RTO_DELIVERED",

  CANCELLED_ORDER: "CANCELLED",
};

/**
 * Maps a raw courier status (from either the tracking API or a webhook) to
 * ours. An unrecognised string is surfaced as EXCEPTION rather than silently
 * ignored — and logged, because it means Eshopbox added a state we should map.
 */
export function toShipmentStatus(courierStatus: string): ShipmentStatus {
  const key = courierStatus.trim().toUpperCase();
  const mapped = COURIER_TO_SHIPMENT[key];
  if (!mapped) {
    console.warn(`[eshopbox] unmapped courier status: "${courierStatus}"`);
    return "EXCEPTION";
  }
  return mapped;
}

/**
 * The order status a shipment state implies, or null when the order status
 * shouldn't move. Exceptions deliberately return null: a delayed parcel is
 * still "shipped" from the buyer's point of view, and flapping the order
 * between states on every courier scan would be noise.
 */
export function toOrderStatus(status: ShipmentStatus): OrderStatus | null {
  switch (status) {
    case "PICKED_UP":
    case "IN_TRANSIT":
    case "OUT_FOR_DELIVERY":
    case "FAILED_DELIVERY":
      return "SHIPPED";
    case "DELIVERED":
      return "DELIVERED";
    case "RTO":
    case "RTO_DELIVERED":
      return "RTO";
    case "CANCELLED":
      return "CANCELLED";
    default:
      // BOOKED / PICKUP_PENDING / EXCEPTION — no order-level change.
      return null;
  }
}

/** Buyer-facing label for a shipment state. */
export const SHIPMENT_LABELS: Record<ShipmentStatus, string> = {
  BOOKED: "Label created",
  PICKUP_PENDING: "Awaiting pickup",
  PICKED_UP: "Picked up",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  FAILED_DELIVERY: "Delivery attempt failed",
  RTO: "Returning to seller",
  RTO_DELIVERED: "Returned to seller",
  CANCELLED: "Cancelled",
  EXCEPTION: "Needs attention",
};

/** Badge tone per shipment state, matching our Badge component's tones. */
export const SHIPMENT_TONES: Record<
  ShipmentStatus,
  "neutral" | "primary" | "live" | "success" | "warning"
> = {
  BOOKED: "neutral",
  PICKUP_PENDING: "warning",
  PICKED_UP: "primary",
  IN_TRANSIT: "primary",
  OUT_FOR_DELIVERY: "primary",
  DELIVERED: "success",
  FAILED_DELIVERY: "live",
  RTO: "warning",
  RTO_DELIVERED: "neutral",
  CANCELLED: "neutral",
  EXCEPTION: "live",
};

/** True once the parcel can no longer change hands. */
export function isTerminal(status: ShipmentStatus): boolean {
  return (
    status === "DELIVERED" ||
    status === "RTO_DELIVERED" ||
    status === "CANCELLED"
  );
}

/** Eshopbox only allows cancellation before the courier has collected it. */
export function isCancellable(status: ShipmentStatus): boolean {
  return status === "BOOKED" || status === "PICKUP_PENDING";
}
