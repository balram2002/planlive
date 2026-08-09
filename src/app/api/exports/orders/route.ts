import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAdmin, isSeller } from "@/lib/current-user";
import { SHIPMENT_LABELS } from "@/lib/eshopbox/status-map";

/**
 * GET /api/exports/orders — CSV of the caller's orders.
 *
 * Sellers get their own; admins get the marketplace. Reconciliation against a
 * courier invoice or a bank statement is a spreadsheet job, and until now the
 * only way to do it was copying rows out of the page by hand.
 *
 * Streaming isn't worth it at these volumes — the cap below keeps the whole
 * thing comfortably in memory.
 */
const MAX_ROWS = 5000;

/** RFC 4180: quote everything, double any embedded quotes. */
function csvCell(value: unknown): string {
  const text =
    value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isSeller(user)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const scope = req.nextUrl.searchParams.get("scope");
  // Only an admin may widen the scope beyond their own sales.
  const marketplace = scope === "all" && isAdmin(user);

  // Which products' orders are in scope.
  const products = await prisma.product.findMany({
    where: marketplace ? {} : { sellerId: user.id },
    select: { id: true, title: true, sellerId: true },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  const reservations = products.length
    ? await prisma.reservation.findMany({
        where: { productId: { in: products.map((p) => p.id) } },
        orderBy: { createdAt: "desc" },
        take: MAX_ROWS,
      })
    : [];
  const reservationById = new Map(reservations.map((r) => [r.id, r]));

  const orders = reservations.length
    ? await prisma.order.findMany({
        where: { reservationId: { in: reservations.map((r) => r.id) } },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const [shipments, fulfilments, buyers] = await Promise.all([
    orders.length
      ? prisma.shipment.findMany({
          where: { orderId: { in: orders.map((o) => o.id) } },
        })
      : [],
    orders.length
      ? prisma.localFulfilment.findMany({
          where: { orderId: { in: orders.map((o) => o.id) } },
        })
      : [],
    reservations.length
      ? prisma.user.findMany({
          where: { id: { in: [...new Set(reservations.map((r) => r.userId))] } },
          select: { id: true, email: true },
        })
      : [],
  ]);
  const shipmentByOrder = new Map(shipments.map((s) => [s.orderId, s]));
  const fulfilmentByOrder = new Map(fulfilments.map((f) => [f.orderId, f]));
  const buyerById = new Map(buyers.map((b) => [b.id, b.email]));

  const header = [
    "Order ID",
    "Placed at",
    "Product",
    "Qty",
    "Buyer",
    "Payment",
    "Items (₹)",
    "Delivery (₹)",
    "Total (₹)",
    "Order status",
    "Fulfilment",
    "Courier",
    "AWB",
    "Shipment status",
    "Delivered at",
  ];

  const lines = [csvRow(header)];

  for (const order of orders) {
    const reservation = reservationById.get(order.reservationId);
    if (!reservation) continue;
    const product = productById.get(reservation.productId);
    const shipment = shipmentByOrder.get(order.id);
    const fulfilment = fulfilmentByOrder.get(order.id);

    const route = fulfilment
      ? fulfilment.method === "SELLER_DELIVERY"
        ? "Seller delivery"
        : `Buyer pickup${fulfilment.pickupStatus ? ` (${fulfilment.pickupStatus.toLowerCase()})` : ""}`
      : shipment?.trackingId
        ? "Courier"
        : "Not arranged";

    lines.push(
      csvRow([
        order.id,
        order.createdAt.toISOString(),
        product?.title ?? "Deleted product",
        reservation.quantity,
        buyerById.get(reservation.userId) ?? "",
        order.paymentMethod,
        ((order.amountInPaise - order.deliveryFeeInPaise) / 100).toFixed(2),
        (order.deliveryFeeInPaise / 100).toFixed(2),
        (order.amountInPaise / 100).toFixed(2),
        order.status,
        route,
        shipment?.courierName ?? "",
        shipment?.trackingId ?? "",
        shipment ? SHIPMENT_LABELS[shipment.status] : "",
        order.deliveredAt?.toISOString() ?? "",
      ]),
    );
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `${marketplace ? "marketplace" : "my"}-orders-${stamp}.csv`;

  return new NextResponse(lines.join("\r\n"), {
    headers: {
      // BOM so Excel opens UTF-8 (₹, seller names) correctly on Windows.
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
