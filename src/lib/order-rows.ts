import type { Order, Product, Reservation, Shipment } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type OrderRow = {
  reservation: Reservation;
  product: Product | null;
  order: Order | null;
  /** Courier booking, once the seller has created one. */
  shipment: Shipment | null;
};

/**
 * Loads reservations matching `where` with their product + order joined
 * manually (the spec schema has no Prisma relations).
 */
export async function loadOrderRows(where: {
  userId?: string;
  productId?: { in: string[] };
}): Promise<OrderRow[]> {
  const reservations = await prisma.reservation.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  if (reservations.length === 0) return [];

  const [products, orders] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: [...new Set(reservations.map((r) => r.productId))] } },
    }),
    prisma.order.findMany({
      where: { reservationId: { in: reservations.map((r) => r.id) } },
    }),
  ]);
  const shipments =
    orders.length === 0
      ? []
      : await prisma.shipment.findMany({
          where: { orderId: { in: orders.map((o) => o.id) } },
        });

  const productById = new Map(products.map((p) => [p.id, p]));
  const orderByReservation = new Map(orders.map((o) => [o.reservationId, o]));
  const shipmentByOrder = new Map(shipments.map((s) => [s.orderId, s]));

  return reservations.map((reservation) => {
    const order = orderByReservation.get(reservation.id) ?? null;
    return {
      reservation,
      product: productById.get(reservation.productId) ?? null,
      order,
      shipment: order ? (shipmentByOrder.get(order.id) ?? null) : null,
    };
  });
}
