import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { signInPath } from "@/lib/back-to";
import { getCurrentUser, isSeller } from "@/lib/current-user";
import { loadOrderRows } from "@/lib/order-rows";
import { OrderList } from "@/components/order-list";
import { ShipmentPanel } from "@/components/shipping/shipment-panel";
import { LocalFulfilmentPanel } from "@/components/shipping/local-fulfilment-panel";
import { isLocalEligible, PICKUP_WINDOW_DAYS } from "@/lib/local-fulfilment";
import { ShopAddressGate } from "@/components/seller/shop-address-gate";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { eshopboxConfigured } from "@/lib/eshopbox/client";
import { isCancellable } from "@/lib/eshopbox/status-map";
import { formatPrice } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Orders in these states are ready to hand to a courier. */
const SHIPPABLE = new Set(["PAID", "PLACED"]);

/** True once the saved shop address has everything a courier pickup needs. */
function shopAddressComplete(json: string | null): boolean {
  if (!json) return false;
  try {
    const s = JSON.parse(json);
    return Boolean(
      String(s?.shopName ?? "").trim() &&
      String(s?.phone ?? "").trim() &&
      String(s?.line1 ?? "").trim() &&
      String(s?.city ?? "").trim() &&
      String(s?.state ?? "").trim() &&
      /^\d{6}$/.test(String(s?.pincode ?? "")),
    );
  } catch {
    return false;
  }
}

/** Seller sales history: every reservation/order against their products. */
export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim().toLowerCase();
  const user = await getCurrentUser();
  if (!user) redirect(signInPath("/dashboard/sales"));
  if (!isSeller(user)) redirect("/dashboard");

  const myProducts = await prisma.product.findMany({
    where: { sellerId: user.id },
    select: { id: true },
  });

  const allRows =
    myProducts.length === 0
      ? []
      : (
          await loadOrderRows({
            productId: { in: myProducts.map((p) => p.id) },
          })
        ).filter((row) => row.reservation.userId !== user.id);

  // Matched in memory: the rows are already loaded and capped, and the three
  // things a seller searches by (title, order id, AWB) live on three
  // different documents — one query per field would cost more than this.
  const rows = query
    ? allRows.filter((row) => {
        const haystack = [
          row.product?.title,
          row.order?.id,
          row.shipment?.trackingId,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
    : allRows;

  // Local fulfilment: which of these orders are in the seller's own PIN code,
  // and what state any existing arrangement is in.
  const orderIds = allRows
    .map((r) => r.order?.id)
    .filter((id): id is string => !!id);
  const fulfilments = orderIds.length
    ? await prisma.localFulfilment.findMany({
        where: { orderId: { in: orderIds } },
      })
    : [];
  const fulfilmentByOrder = new Map(fulfilments.map((f) => [f.orderId, f]));

  const shippingReady = eshopboxConfigured();
  // A pickup code registered in Eshopbox works without a local address; only
  // when there's neither do we need to nag.
  const canPickUp =
    Boolean(user.pickupLocationCode?.trim()) ||
    shopAddressComplete(user.shopAddressJson);

  // "To pack" is the seller's actual working queue each morning.
  const awaitingLabel = allRows.filter(
    (row) =>
      row.order && SHIPPABLE.has(row.order.status) && !row.shipment?.trackingId,
  ).length;
  const toHandOver = allRows.filter(
    (row) => row.shipment && isCancellable(row.shipment.status),
  ).length;
  const inTransit = allRows.filter((row) =>
    row.shipment
      ? ["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(
          row.shipment.status,
        )
      : false,
  ).length;
  const needsAttention = allRows.filter((row) =>
    row.shipment
      ? ["EXCEPTION", "FAILED_DELIVERY", "RTO"].includes(row.shipment.status)
      : false,
  ).length;

  // Revenue counts only orders that actually completed payment or are COD.
  const earnedPaise = allRows.reduce(
    (sum, row) =>
      row.order &&
      ["PAID", "PLACED", "SHIPPED", "DELIVERED"].includes(row.order.status)
        ? sum + row.order.amountInPaise
        : sum,
    0,
  );

  const stats = [
    {
      label: "Awaiting label",
      value: String(awaitingLabel),
      tone: "warning" as const,
    },
    {
      label: "Ready for pickup",
      value: String(toHandOver),
      tone: "primary" as const,
    },
    { label: "In transit", value: String(inTransit), tone: "primary" as const },
    {
      label: "Needs attention",
      value: String(needsAttention),
      tone: "live" as const,
    },
  ];

  return (
    <div className="animate-page-in space-y-5">
      {/* Blocking setup for a seller who can't ship yet. */}
      <ShopAddressGate open={shippingReady && !canPickUp} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Sales</h1>
          <p className="mt-1 text-sm text-muted">
            Orders on your products — book couriers and print labels here.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <a
            href="/api/exports/orders"
            className="rounded-full border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-primary/50 hover:text-foreground"
          >
            ⬇ Export CSV
          </a>
          <Link
            href="/dashboard/serviceability"
            className="rounded-full border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-primary/50 hover:text-foreground"
          >
            Check a PIN code
          </Link>
        </div>
      </div>

      {!shippingReady ? (
        <Card className="border-warning/30 bg-warning/5 p-4">
          <p className="text-sm font-medium text-warning">
            Shipping isn&apos;t connected yet
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Add your Eshopbox credentials to the server environment to book
            couriers and print labels from here.
          </p>
        </Card>
      ) : null}
      {/* The gate above renders its own re-open banner once dismissed, so
          there's no second copy of this message linking off the page. */}

      {allRows.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {stats.map((stat) => (
              <Card key={stat.label} className="p-4">
                <p className="truncate text-xs uppercase tracking-wide text-faint">
                  {stat.label}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  {stat.value}
                </p>
              </Card>
            ))}
          </div>

          <Card className="flex flex-wrap items-center justify-between gap-2 p-4">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-faint">
                Confirmed revenue
              </p>
              <p className="mt-0.5 text-xl font-bold tabular-nums">
                {formatPrice(earnedPaise)}
              </p>
            </div>
            <Badge tone="success">{allRows.length} orders</Badge>
          </Card>
        </>
      ) : null}

      {allRows.length > 0 ? (
        <Card className="p-3">
          <form method="get" className="flex flex-wrap gap-2">
            <input
              name="q"
              defaultValue={query}
              placeholder="Search product, order id, or AWB"
              className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3.5 py-2 text-base placeholder:text-faint focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30 sm:text-sm"
            />
            <button
              type="submit"
              className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Search
            </button>
            {query ? (
              <Link
                href="/dashboard/sales"
                className="shrink-0 rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-foreground"
              >
                Clear
              </Link>
            ) : null}
          </form>
        </Card>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          icon="💸"
          title={allRows.length === 0 ? "No sales yet" : "Nothing matched"}
          description={
            allRows.length === 0
              ? "Go live and feature your products — sales will land here."
              : "No order matches that search."
          }
        />
      ) : (
        <OrderList
          rows={rows}
          empty=""
          // The seller panel below already shows courier state and controls.
          showTracking={false}
          actions={(row) => {
            if (!row.order) return null;
            const fulfilment = fulfilmentByOrder.get(row.order.id) ?? null;
            const local =
              SHIPPABLE.has(row.order.status) &&
              isLocalEligible({
                orderAddressJson: row.order.addressJson,
                sellerShopAddressJson: user.shopAddressJson,
              });

            return (
              <div className="space-y-2.5">
                {/* Only offered when the buyer shares the shop's PIN code. */}
                {local || fulfilment ? (
                  <LocalFulfilmentPanel
                    orderId={row.order.id}
                    windowDays={PICKUP_WINDOW_DAYS}
                    fulfilment={
                      fulfilment
                        ? {
                            method: fulfilment.method,
                            pickupStatus: fulfilment.pickupStatus,
                            pickupDeadline:
                              fulfilment.pickupDeadline?.toISOString() ?? null,
                            completedAt:
                              fulfilment.completedAt?.toISOString() ?? null,
                            note: fulfilment.note,
                          }
                        : null
                    }
                  />
                ) : null}

                {/* Courier booking stays available unless a local route is
                    actively in progress — the two must never both run. */}
                {!fulfilment ? (
                  <ShipmentPanel
                    orderId={row.order.id}
                    productTitle={row.product?.title}
                    shippable={
                      shippingReady &&
                      canPickUp &&
                      SHIPPABLE.has(row.order.status)
                    }
                    shipment={
                      row.shipment
                        ? {
                            status: row.shipment.status,
                            trackingId: row.shipment.trackingId,
                            courierName: row.shipment.courierName,
                            labelUrl: row.shipment.labelUrl,
                            courierStatus: row.shipment.courierStatus,
                            lastError: row.shipment.lastError,
                            cancellable: isCancellable(row.shipment.status),
                          }
                        : null
                    }
                  />
                ) : null}
              </div>
            );
          }}
        />
      )}
    </div>
  );
}
