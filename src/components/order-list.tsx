import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatPrice } from "@/lib/format";
import type { OrderRow } from "@/lib/order-rows";

export function orderStatusBadge(row: OrderRow) {
  if (row.order?.status === "PAID") return <Badge tone="success">Paid</Badge>;
  if (row.order?.status === "PLACED")
    return <Badge tone="success">COD · placed</Badge>;
  switch (row.reservation.status) {
    case "PENDING":
      return <Badge tone="warning">Awaiting payment</Badge>;
    case "CONFIRMED":
      return <Badge tone="success">Confirmed</Badge>;
    case "EXPIRED":
      return <Badge>Expired</Badge>;
    case "CANCELLED":
      return <Badge>Cancelled</Badge>;
  }
}

/** Reservation/order rows as animated cards; used by Orders and Sales. */
export function OrderList({ rows, empty }: { rows: OrderRow[]; empty: string }) {
  if (rows.length === 0) {
    return <p className="px-1 text-sm text-faint">{empty}</p>;
  }
  return (
    <ul className="grid gap-2.5 lg:grid-cols-2">
      {rows.map((row, i) => (
        <li
          key={row.reservation.id}
          className="animate-item-in"
          style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
        >
          <Card className="flex items-center gap-3 p-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-lg">
              🛍️
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {row.product?.title ?? "Deleted product"}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {row.reservation.quantity} ×{" "}
                {row.product ? formatPrice(row.product.priceInPaise) : "—"} ·{" "}
                {row.reservation.createdAt.toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                })}
              </p>
            </div>
            {orderStatusBadge(row)}
          </Card>
        </li>
      ))}
    </ul>
  );
}
