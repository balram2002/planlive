import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ProductThumb } from "@/components/product-thumb";
import { OrderTrack } from "@/components/order-track";
import { TrackingTimeline } from "@/components/shipping/tracking-timeline";
import { formatPrice } from "@/lib/format";
import { stageTimestamps, trackStage } from "@/lib/order-status";
import type { OrderRow } from "@/lib/order-rows";

export function orderStatusBadge(row: OrderRow) {
  switch (row.order?.status) {
    case "DELIVERED":
      return <Badge tone="success">Delivered</Badge>;
    case "SHIPPED":
      return <Badge tone="primary">Shipped</Badge>;
    case "RTO":
      return <Badge tone="warning">Returning</Badge>;
    case "CANCELLED":
      return <Badge>Cancelled</Badge>;
    case "PAID":
      return <Badge tone="success">Paid</Badge>;
    case "PLACED":
      return <Badge tone="success">COD · placed</Badge>;
    case "FAILED":
      return <Badge tone="live">Payment failed</Badge>;
    default:
      break;
  }
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

/**
 * Reservation/order rows as animated cards; used by Orders and Sales.
 *
 * Once an order enters fulfilment it also renders the Placed → Shipped →
 * Delivered track, so a buyer can see where their parcel is without opening
 * anything. `actions` lets the seller view slot in its status controls
 * without this component knowing about seller permissions.
 */
export function OrderList({
  rows,
  empty,
  actions,
  showTracking = true,
  detailHref,
}: {
  rows: OrderRow[];
  empty: string;
  actions?: (row: OrderRow) => React.ReactNode;
  /** Set false where `actions` already renders courier detail (seller view). */
  showTracking?: boolean;
  /** Supply to render a "View details" link per row. */
  detailHref?: (orderId: string) => string;
}) {
  if (rows.length === 0) {
    return <p className="px-1 text-sm text-faint">{empty}</p>;
  }
  return (
    <ul className="grid gap-2.5 lg:grid-cols-2">
      {rows.map((row, i) => {
        const inFulfilment = row.order ? trackStage(row.order.status) : null;
        return (
          <li
            key={row.reservation.id}
            className="animate-item-in"
            style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
          >
            <Card className="p-3">
              <div className="flex items-center gap-3">
                <ProductThumb
                  src={row.product?.imageUrl ?? null}
                  alt={row.product?.title ?? ""}
                  sizes="44px"
                  className="w-11"
                />
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
              </div>

              {inFulfilment && row.order ? (
                <>
                  <OrderTrack
                    status={row.order.status}
                    timestamps={stageTimestamps(row.order, row.reservation)}
                    className="mt-3 border-t border-border/60 pt-3"
                  />
                  {row.order.deliveryFeeInPaise > 0 ? (
                    <p className="mt-2 text-center text-[10px] text-faint">
                      Total {formatPrice(row.order.amountInPaise)} · incl.{" "}
                      {formatPrice(row.order.deliveryFeeInPaise)} delivery
                    </p>
                  ) : null}
                </>
              ) : null}

              {/* Courier detail, once a parcel exists. Sellers get their own
                  controls via `actions`, so this is the read-only view. */}
              {showTracking && row.shipment?.trackingId ? (
                <TrackingTimeline
                  shipment={row.shipment}
                  className="mt-3 border-t border-border/60 pt-3"
                />
              ) : null}

              {actions ? <div className="mt-3">{actions(row)}</div> : null}

              {/* Buyers get a full detail page; the seller view has its own
                  controls inline and doesn't need this. */}
              {detailHref && row.order ? (
                <Link
                  href={detailHref(row.order.id)}
                  className="mt-3 block rounded-full border border-border py-2 text-center text-xs font-semibold text-muted transition-colors hover:border-primary/50 hover:text-foreground"
                >
                  View details
                </Link>
              ) : null}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
