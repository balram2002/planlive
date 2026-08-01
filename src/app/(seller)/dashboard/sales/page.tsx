import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isSeller } from "@/lib/current-user";
import { loadOrderRows } from "@/lib/order-rows";
import { OrderList } from "@/components/order-list";
import { ShipmentPanel } from "@/components/shipping/shipment-panel";
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
export default async function SalesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!isSeller(user)) redirect("/dashboard");

  const myProducts = await prisma.product.findMany({
    where: { sellerId: user.id },
    select: { id: true },
  });

  const rows =
    myProducts.length === 0
      ? []
      : (
          await loadOrderRows({ productId: { in: myProducts.map((p) => p.id) } })
        ).filter((row) => row.reservation.userId !== user.id);

  const shippingReady = eshopboxConfigured();
  // A pickup code registered in Eshopbox works without a local address; only
  // when there's neither do we need to nag.
  const canPickUp =
    Boolean(user.pickupLocationCode?.trim()) ||
    shopAddressComplete(user.shopAddressJson);

  // "To pack" is the seller's actual working queue each morning.
  const awaitingLabel = rows.filter(
    (row) =>
      row.order && SHIPPABLE.has(row.order.status) && !row.shipment?.trackingId,
  ).length;
  const toHandOver = rows.filter(
    (row) => row.shipment && isCancellable(row.shipment.status),
  ).length;
  const inTransit = rows.filter((row) =>
    row.shipment
      ? ["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(
          row.shipment.status,
        )
      : false,
  ).length;
  const needsAttention = rows.filter((row) =>
    row.shipment
      ? ["EXCEPTION", "FAILED_DELIVERY", "RTO"].includes(row.shipment.status)
      : false,
  ).length;

  // Revenue counts only orders that actually completed payment or are COD.
  const earnedPaise = rows.reduce(
    (sum, row) =>
      row.order && ["PAID", "PLACED", "SHIPPED", "DELIVERED"].includes(row.order.status)
        ? sum + row.order.amountInPaise
        : sum,
    0,
  );

  const stats = [
    { label: "Awaiting label", value: String(awaitingLabel), tone: "warning" as const },
    { label: "Ready for pickup", value: String(toHandOver), tone: "primary" as const },
    { label: "In transit", value: String(inTransit), tone: "primary" as const },
    { label: "Needs attention", value: String(needsAttention), tone: "live" as const },
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
        <Link
          href="/dashboard/serviceability"
          className="shrink-0 rounded-full border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-primary/50 hover:text-foreground"
        >
          Check a PIN code
        </Link>
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
      ) : !canPickUp ? (
        <Card className="border-warning/30 bg-warning/5 p-4">
          <p className="text-sm font-medium text-warning">
            Add a pickup address to start shipping
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Couriers need somewhere to collect from.{" "}
            <Link
              href="/shop-address"
              className="font-semibold text-primary underline-offset-2 hover:underline"
            >
              Set it up
            </Link>
          </p>
        </Card>
      ) : null}

      {rows.length > 0 ? (
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
            <Badge tone="success">{rows.length} orders</Badge>
          </Card>
        </>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          icon="💸"
          title="No sales yet"
          description="Go live and feature your products — sales will land here."
        />
      ) : (
        <OrderList
          rows={rows}
          empty=""
          // The seller panel below already shows courier state and controls.
          showTracking={false}
          actions={(row) => {
            if (!row.order) return null;
            return (
              <ShipmentPanel
                orderId={row.order.id}
                shippable={
                  shippingReady && canPickUp && SHIPPABLE.has(row.order.status)
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
            );
          }}
        />
      )}
    </div>
  );
}
