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
 * Which leg of the journey a status describes.
 *
 * This matters more than it looks: Eshopbox's `shipment` and `returnShipment`
 * resources reuse the SAME subtype names for opposite meanings. On a forward
 * shipment "delivered" means the buyer received their order; on a return it
 * means the parcel got back to the warehouse. Mapping both through one table
 * marked buyers' orders DELIVERED (and emailed them so) when a return landed.
 */
export type ShipmentJourney = "forward" | "return";

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
  // Seen in statusLogs rather than as an event, but worth mapping so the
  // reconciliation job never treats it as unknown.
  ACCEPTED: "BOOKED",
  NDR_RESOLUTION: "FAILED_DELIVERY",
};

/**
 * The `returnShipment` resource, whose full subtype list is:
 * created, pickup_pending, out_for_pickup, pickup_cancelled, pickup_failed,
 * picked_up, intransit, out_for_delivery, delivered, delivered_warehouse,
 * failed_delivery, complete, return_cancelled, approved, lost.
 *
 * Every movement here means "heading back to the seller", so the whole live
 * portion collapses onto RTO and the arrival onto RTO_DELIVERED.
 */
const RETURN_TO_SHIPMENT: Record<string, ShipmentStatus> = {
  // Return raised and being collected from the buyer.
  CREATED: "RTO",
  APPROVED: "RTO",
  PICKUP_PENDING: "RTO",
  OUT_FOR_PICKUP: "RTO",
  // On its way back.
  PICKED_UP: "RTO",
  INTRANSIT: "RTO",
  OUT_FOR_DELIVERY: "RTO",
  RETURN_EXPECTED: "RTO",
  // Arrived back with the seller/warehouse — the return is complete.
  DELIVERED: "RTO_DELIVERED",
  DELIVERED_WAREHOUSE: "RTO_DELIVERED",
  RECEIVED: "RTO_DELIVERED",
  COMPLETE: "RTO_DELIVERED",
  // Called off: the buyer keeps the item, so the order must not move.
  PICKUP_CANCELLED: "RETURN_CANCELLED",
  RETURN_CANCELLED: "RETURN_CANCELLED",
  CANCELLED_ORDER: "RETURN_CANCELLED",
  // Went wrong on the way back — needs a human.
  PICKUP_FAILED: "EXCEPTION",
  FAILED_DELIVERY: "EXCEPTION",
  LOST: "EXCEPTION",
  DAMAGED: "EXCEPTION",
  DAMAGE: "EXCEPTION",
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
  // Forward leg has no notion of "complete" beyond delivery, but the reverse
  // resource can fire it against a forward-registered hook during an RTO.
  COMPLETE: "RTO_DELIVERED",

  CANCELLED_ORDER: "CANCELLED",
  // Reverse-pickup subtypes that can arrive on the forward hook mid-RTO.
  PICKUP_CANCELLED: "RETURN_CANCELLED",
  RETURN_CANCELLED: "RETURN_CANCELLED",
};

/**
 * Maps a raw courier status (from either the tracking API or a webhook) to
 * ours. An unrecognised string is surfaced as EXCEPTION rather than silently
 * ignored — and logged, because it means Eshopbox added a state we should map.
 *
 * `journey` selects the table: the same subtype means opposite things on the
 * forward and reverse legs (see ShipmentJourney).
 */
export function toShipmentStatus(
  courierStatus: string,
  journey: ShipmentJourney = "forward",
): ShipmentStatus {
  const key = courierStatus.trim().toUpperCase();
  const table = journey === "return" ? RETURN_TO_SHIPMENT : COURIER_TO_SHIPMENT;
  const mapped = table[key];
  if (!mapped) {
    console.warn(`[eshopbox] unmapped ${journey} status: "${courierStatus}"`);
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
      // BOOKED / PICKUP_PENDING / EXCEPTION / RETURN_CANCELLED — no
      // order-level change. A called-off return in particular must leave the
      // order exactly where it was (usually DELIVERED).
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
  RETURN_CANCELLED: "Return cancelled",
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
  RETURN_CANCELLED: "neutral",
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
