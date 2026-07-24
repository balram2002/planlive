import type { ShipmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ActionButton } from "@/components/ui/action-button";
import { EmptyState } from "@/components/ui/empty-state";
import { AdminShipmentControls } from "@/components/admin/shipment-controls";
import { eshopboxConfigured } from "@/lib/eshopbox/client";
import {
  isCancellable,
  SHIPMENT_LABELS,
  SHIPMENT_TONES,
} from "@/lib/eshopbox/status-map";
import { formatPrice } from "@/lib/format";
import { adminSyncShipments } from "./actions";

export const dynamic = "force-dynamic";

/** States that need a human to look at them. */
const NEEDS_ATTENTION: ShipmentStatus[] = [
  "EXCEPTION",
  "FAILED_DELIVERY",
  "RTO",
];

/** Marketplace-wide courier oversight. */
export default async function AdminShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const attentionOnly = filter === "attention";

  const shipments = await prisma.shipment.findMany({
    where: attentionOnly ? { status: { in: NEEDS_ATTENTION } } : undefined,
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  const [orders, sellers] = await Promise.all([
    prisma.order.findMany({
      where: { id: { in: shipments.map((s) => s.orderId) } },
    }),
    prisma.user.findMany({
      where: { id: { in: [...new Set(shipments.map((s) => s.sellerId))] } },
      select: { id: true, email: true },
    }),
  ]);
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const sellerById = new Map(sellers.map((s) => [s.id, s.email]));

  // Counts are over all shipments, not the current filter.
  const [total, attention, inFlight] = await Promise.all([
    prisma.shipment.count(),
    prisma.shipment.count({ where: { status: { in: NEEDS_ATTENTION } } }),
    prisma.shipment.count({
      where: {
        status: { in: ["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"] },
      },
    }),
  ]);

  const stats = [
    { label: "Total shipments", value: total },
    { label: "In transit", value: inFlight },
    { label: "Need attention", value: attention },
  ];

  return (
    <div className="animate-page-in space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Shipments</h1>
          <p className="text-sm text-muted">
            Every parcel booked with Eshopbox across the marketplace.
          </p>
        </div>
        {eshopboxConfigured() ? (
          <form action={adminSyncShipments}>
            <ActionButton
              haptic="tap"
              className="rounded-full border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-primary/50 hover:text-foreground"
            >
              ↻ Sync tracking now
            </ActionButton>
          </form>
        ) : null}
      </div>

      {!eshopboxConfigured() ? (
        <Card className="border-warning/30 bg-warning/5 p-4">
          <p className="text-sm font-medium text-warning">
            Eshopbox isn&apos;t configured
          </p>
          <p className="mt-1 text-xs text-muted">
            Set ESHOPBOX_CLIENT_ID, ESHOPBOX_CLIENT_SECRET and
            ESHOPBOX_REFRESH_TOKEN to enable courier booking.
          </p>
        </Card>
      ) : null}

      <div className="grid grid-cols-3 gap-3">
        {stats.map((stat) => (
          <Card key={stat.label} className="p-4">
            <p className="text-xs uppercase tracking-wide text-faint">
              {stat.label}
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{stat.value}</p>
          </Card>
        ))}
      </div>

      <div className="flex gap-2">
        <FilterLink href="/admin/shipments" active={!attentionOnly}>
          All
        </FilterLink>
        <FilterLink
          href="/admin/shipments?filter=attention"
          active={attentionOnly}
        >
          Needs attention {attention > 0 ? `(${attention})` : ""}
        </FilterLink>
      </div>

      {shipments.length === 0 ? (
        <EmptyState
          icon="📦"
          title={attentionOnly ? "Nothing needs attention" : "No shipments yet"}
          description={
            attentionOnly
              ? "Every parcel is moving normally."
              : "Shipments appear here once sellers book couriers."
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto" data-no-swipe>
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-faint">
                  <th className="px-4 py-3 font-medium">AWB</th>
                  <th className="px-4 py-3 font-medium">Courier</th>
                  <th className="px-4 py-3 font-medium">Seller</th>
                  <th className="px-4 py-3 font-medium">Value</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                  <th className="px-4 py-3 font-medium">Manage</th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((shipment) => {
                  const order = orderById.get(shipment.orderId);
                  return (
                    <tr
                      key={shipment.id}
                      className="border-b border-border/60 last:border-0 transition-colors hover:bg-surface-2/50"
                    >
                      <td className="px-4 py-3">
                        {shipment.trackingId ? (
                          <span className="font-mono text-xs tabular-nums">
                            {shipment.trackingId}
                          </span>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {shipment.courierName ?? "—"}
                      </td>
                      <td className="max-w-[180px] truncate px-4 py-3 text-muted">
                        {sellerById.get(shipment.sellerId) ?? "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {order ? formatPrice(order.amountInPaise) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={SHIPMENT_TONES[shipment.status]}>
                          {SHIPMENT_LABELS[shipment.status]}
                        </Badge>
                        {shipment.lastError ? (
                          <p className="mt-1 max-w-[220px] text-[11px] leading-snug text-live">
                            {shipment.lastError}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        {shipment.updatedAt.toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <AdminShipmentControls
                          orderId={shipment.orderId}
                          hasTracking={Boolean(shipment.trackingId)}
                          cancellable={isCancellable(shipment.status)}
                          labelUrl={shipment.labelUrl}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={
        active
          ? "rounded-full bg-primary/15 px-3.5 py-1.5 text-xs font-semibold text-primary"
          : "rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
      }
    >
      {children}
    </a>
  );
}
