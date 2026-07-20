import type { Order, OrderStatus, Reservation } from "@prisma/client";

/**
 * Fulfilment is a three-stop journey the buyer sees as a progress track.
 * Payment states (CREATED/FAILED) live outside it — an unpaid order hasn't
 * entered fulfilment at all, so it shows a payment badge instead.
 */
export const TRACK_STAGES = ["PLACED", "SHIPPED", "DELIVERED"] as const;
export type TrackStage = (typeof TRACK_STAGES)[number];

export const STAGE_LABELS: Record<TrackStage, string> = {
  PLACED: "Placed",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
};

export const STAGE_HINTS: Record<TrackStage, string> = {
  PLACED: "Order confirmed with the seller",
  SHIPPED: "On its way to you",
  DELIVERED: "Handed over",
};

/**
 * How far along the track an order is, or null when it hasn't entered
 * fulfilment yet. Both PAID (online) and PLACED (COD) mean "confirmed" —
 * from the buyer's point of view the parcel journey starts at the same point.
 */
export function trackStage(status: OrderStatus): TrackStage | null {
  switch (status) {
    case "PAID":
    case "PLACED":
      return "PLACED";
    case "SHIPPED":
      return "SHIPPED";
    case "DELIVERED":
      return "DELIVERED";
    default:
      return null; // CREATED / FAILED
  }
}

/** Index of the current stage, for rendering the filled portion of the bar. */
export function stageIndex(status: OrderStatus): number {
  const stage = trackStage(status);
  return stage ? TRACK_STAGES.indexOf(stage) : -1;
}

/** The next stage a seller can advance an order to, if any. */
export function nextStage(status: OrderStatus): TrackStage | null {
  const index = stageIndex(status);
  if (index < 0 || index >= TRACK_STAGES.length - 1) return null;
  return TRACK_STAGES[index + 1];
}

/** When each reached stage happened — drives the timestamps under the track. */
export function stageTimestamps(
  order: Order,
  reservation: Reservation,
): Record<TrackStage, Date | null> {
  return {
    PLACED: order.createdAt ?? reservation.createdAt,
    SHIPPED: order.shippedAt,
    DELIVERED: order.deliveredAt,
  };
}
