import Link from "next/link";
import type { Prisma, ShipmentStatus } from "@prisma/client";
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

const IN_FLIGHT: ShipmentStatus[] = [
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
];

/** Named filters, so the tab strip and the query stay in one place. */
const FILTERS = {
  all: { label: "All", where: undefined as Prisma.ShipmentWhereInput | undefined },
  attention: {
    label: "Needs attention",
    where: { status: { in: NEEDS_ATTENTION } },
  },
  transit: { label: "In transit", where: { status: { in: IN_FLIGHT } } },
  pickup: {
    label: "Awaiting pickup",
    where: { status: { in: ["BOOKED", "PICKUP_PENDING"] as ShipmentStatus[] } },
  },
  delivered: { label: "Delivered", where: { status: "DELIVERED" as const } },
  returns: {
    label: "Returns",
    where: { status: { in: ["RTO", "RTO_DELIVERED"] as ShipmentStatus[] } },
  },
} satisfies Record<
  string,
  { label: string; where: Prisma.ShipmentWhereInput | undefined }
>;

type FilterKey = keyof typeof FILTERS;

/** Marketplace-wide courier oversight. */
export default async function AdminShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const { filter, q } = await searchParams;
  const active: FilterKey =
    filter && filter in FILTERS ? (filter as FilterKey) : "all";
  const query = (q ?? "").trim();

  // Search matches an AWB or an order id — the two things support is ever
  // handed. Both are exact-ish, so `contains` keeps partial pastes working.
  const searchWhere: Prisma.ShipmentWhereInput | undefined = query
    ? {
        OR: [
          { trackingId: { contains: query, mode: "insensitive" } },
          { returnTrackingId: { contains: query, mode: "insensitive" } },
          { externalShipmentId: { contains: query, mode: "insensitive" } },
          ...(/^[a-f\d]{24}$/i.test(query) ? [{ orderId: query }] : []),
        ],
      }
    : undefined;

  const where: Prisma.ShipmentWhereInput | undefined =
    FILTERS[active].where && searchWhere
      ? { AND: [FILTERS[active].where, searchWhere] }
      : (FILTERS[active].where ?? searchWhere);

  const shipments = await prisma.shipment.findMany({
    where,
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
  const [total, attention, inFlight, delivered] = await Promise.all([
    prisma.shipment.count(),
    prisma.shipment.count({ where: { status: { in: NEEDS_ATTENTION } } }),
    prisma.shipment.count({ where: { status: { in: IN_FLIGHT } } }),
    prisma.shipment.count({ where: { status: "DELIVERED" } }),
  ]);

  const stats = [
    { label: "Total", value: total },
    { label: "In transit", value: inFlight },
    { label: "Delivered", value: delivered },
    { label: "Need attention", value: attention },
  ];

  return (
    <div className="animate-page-in space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Shipments</h1>
          <p className="mt-1 text-sm text-muted">
            Every parcel booked with Eshopbox across the marketplace.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            href="/admin/serviceability"
            className="rounded-full border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-primary/50 hover:text-foreground"
          >
            Check a PIN
          </Link>
          {eshopboxConfigured() ? (
            <form action={adminSyncShipments}>
              <ActionButton
                haptic="tap"
                className="rounded-full border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-primary/50 hover:text-foreground"
              >
                ↻ Sync tracking
              </ActionButton>
            </form>
          ) : null}
        </div>
      </div>

      {!eshopboxConfigured() ? (
        <Card className="border-warning/30 bg-warning/5 p-4">
          <p className="text-sm font-medium text-warning">
            Eshopbox isn&apos;t configured
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Set ESHOPBOX_CLIENT_ID, ESHOPBOX_CLIENT_SECRET and
            ESHOPBOX_REFRESH_TOKEN to enable courier booking.
          </p>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="p-4">
            <p className="truncate text-xs uppercase tracking-wide text-faint">
              {stat.label}
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{stat.value}</p>
          </Card>
        ))}
      </div>

      {/* Search */}
      <Card className="p-3">
        <form method="get" className="flex flex-wrap gap-2">
          <input type="hidden" name="filter" value={active} />
          <input
            name="q"
            defaultValue={query}
            placeholder="Search AWB, shipment id, or order id"
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
              href={`/admin/shipments?filter=${active}`}
              className="shrink-0 rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-foreground"
            >
              Clear
            </Link>
          ) : null}
        </form>
      </Card>

      {/* Filters — horizontally scrollable so they never wrap into a mess. */}
      <div className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0" data-no-swipe>
        <div className="flex w-max gap-2">
          {(Object.keys(FILTERS) as FilterKey[]).map((key) => (
            <Link
              key={key}
              href={`/admin/shipments?filter=${key}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
              className={
                key === active
                  ? "shrink-0 whitespace-nowrap rounded-full bg-primary/15 px-3.5 py-1.5 text-xs font-semibold text-primary"
                  : "shrink-0 whitespace-nowrap rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
              }
            >
              {FILTERS[key].label}
              {key === "attention" && attention > 0 ? ` (${attention})` : ""}
            </Link>
          ))}
        </div>
      </div>

      {shipments.length === 0 ? (
        <EmptyState
          icon="📦"
          title={query ? "Nothing matched" : "No shipments here"}
          description={
            query
              ? "No parcel matches that AWB or order id."
              : "Shipments appear here once sellers book couriers."
          }
        />
      ) : (
        <>
          {/* Mobile: cards. A 7-column table cannot be made to fit a phone,
              so it isn't attempted — this is the same data, stacked. */}
          <ul className="space-y-2.5 lg:hidden">
            {shipments.map((shipment) => {
              const order = orderById.get(shipment.orderId);
              return (
                <li key={shipment.id}>
                  <Card className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/admin/shipments/${shipment.id}`}
                          className="block break-all font-mono text-xs font-medium text-primary hover:underline"
                        >
                          {shipment.trackingId ?? shipment.externalShipmentId}
                        </Link>
                        <p className="mt-1 truncate text-xs text-muted">
                          {shipment.courierName ?? "No courier yet"}
                        </p>
                      </div>
                      <Badge tone={SHIPMENT_TONES[shipment.status]}>
                        {SHIPMENT_LABELS[shipment.status]}
                      </Badge>
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-xs">
                      <div className="min-w-0">
                        <dt className="text-faint">Seller</dt>
                        <dd className="truncate">
                          {sellerById.get(shipment.sellerId) ?? "—"}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-faint">Value</dt>
                        <dd className="tabular-nums">
                          {order ? formatPrice(order.amountInPaise) : "—"}
                        </dd>
                      </div>
                    </dl>

                    {shipment.lastError ? (
                      <p className="mt-2 text-[11px] leading-snug text-live">
                        {shipment.lastError}
                      </p>
                    ) : null}

                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                      <Link
                        href={`/admin/shipments/${shipment.id}`}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        View details →
                      </Link>
                      <AdminShipmentControls
                        orderId={shipment.orderId}
                        hasTracking={Boolean(shipment.trackingId)}
                        cancellable={isCancellable(shipment.status)}
                        labelUrl={shipment.labelUrl}
                      />
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>

          {/* Desktop: full table. */}
          <Card className="hidden overflow-hidden lg:block">
            <div className="overflow-x-auto" data-no-swipe>
              <table className="w-full min-w-[900px] text-sm">
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
                        className="border-b border-border/60 transition-colors last:border-0 hover:bg-surface-2/50"
                      >
                        <td className="max-w-[180px] px-4 py-3">
                          <Link
                            href={`/admin/shipments/${shipment.id}`}
                            className="block truncate font-mono text-xs tabular-nums text-primary hover:underline"
                          >
                            {shipment.trackingId ?? shipment.externalShipmentId}
                          </Link>
                        </td>
                        <td className="max-w-[140px] truncate px-4 py-3 text-muted">
                          {shipment.courierName ?? "—"}
                        </td>
                        <td className="max-w-[180px] truncate px-4 py-3 text-muted">
                          {sellerById.get(shipment.sellerId) ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums">
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
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">
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
        </>
      )}
    </div>
  );
}
