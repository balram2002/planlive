import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isSeller } from "@/lib/current-user";
import { loadOrderRows } from "@/lib/order-rows";
import { OrderList } from "@/components/order-list";
import { ShipmentPanel } from "@/components/shipping/shipment-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { eshopboxConfigured } from "@/lib/eshopbox/client";
import { isCancellable } from "@/lib/eshopbox/status-map";

export const dynamic = "force-dynamic";

/** Orders in these states are ready to hand to a courier. */
const SHIPPABLE = new Set(["PAID", "PLACED"]);

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

  // "To pack" is the seller's actual working queue each morning.
  const awaitingLabel = rows.filter(
    (row) =>
      row.order && SHIPPABLE.has(row.order.status) && !row.shipment?.trackingId,
  ).length;
  const toHandOver = rows.filter(
    (row) => row.shipment && isCancellable(row.shipment.status),
  ).length;

  return (
    <div className="animate-page-in space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sales</h1>
        <p className="text-sm text-muted">
          Orders on your products — book couriers and print labels here.
        </p>
      </div>

      {!shippingReady ? (
        <Card className="border-warning/30 bg-warning/5 p-4">
          <p className="text-sm font-medium text-warning">
            Shipping isn&apos;t connected yet
          </p>
          <p className="mt-1 text-xs text-muted">
            Add your Eshopbox credentials to the server environment to book
            couriers and print labels from here.
          </p>
        </Card>
      ) : rows.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wide text-faint">
              Awaiting label
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{awaitingLabel}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wide text-faint">
              Ready for pickup
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{toHandOver}</p>
          </Card>
        </div>
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
                shippable={shippingReady && SHIPPABLE.has(row.order.status)}
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
