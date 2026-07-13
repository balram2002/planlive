import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/format";
import { Card } from "@/components/ui/card";
import {
  AreaTrend,
  Columns,
  HBars,
  StatusStack,
  type SeriesPoint,
} from "@/components/charts/charts";

export const dynamic = "force-dynamic";

const DAYS = 14;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function dayLabel(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** ₹ compact for axis/labels: 1.2K / 4.5L style kept simple (K only). */
function inrCompact(paise: number): string {
  const r = paise / 100;
  if (r >= 100000) return `₹${(r / 100000).toFixed(1)}L`;
  if (r >= 1000) return `₹${(r / 1000).toFixed(1)}K`;
  return `₹${Math.round(r)}`;
}

/** All dashboard queries in one place; runs per-request (force-dynamic). */
async function loadDashboardData() {
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
  since.setUTCHours(0, 0, 0, 0);

  const [
    userCount,
    sellerCount,
    liveCount,
    productCount,
    paidOrders,
    reservations,
    recentConfirmed,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "SELLER" } }),
    prisma.stream.count({ where: { status: "LIVE" } }),
    prisma.product.count(),
    prisma.order.findMany({
      where: { status: "PAID" },
      select: { amountInPaise: true, createdAt: true },
    }),
    prisma.reservation.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.reservation.findMany({
      where: { status: "CONFIRMED" },
      select: { productId: true, quantity: true },
      take: 500,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // ---- KPI values ----
  const revenue = paidOrders.reduce((s, o) => s + o.amountInPaise, 0);

  // ---- 14-day series (revenue + order count per day) ----
  const days: Date[] = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(since);
    d.setUTCDate(d.getUTCDate() + i);
    return d;
  });
  const revenueByDay = new Map<string, number>();
  const ordersByDay = new Map<string, number>();
  for (const o of paidOrders) {
    if (o.createdAt < since) continue;
    const key = dayKey(o.createdAt);
    revenueByDay.set(key, (revenueByDay.get(key) ?? 0) + o.amountInPaise);
    ordersByDay.set(key, (ordersByDay.get(key) ?? 0) + 1);
  }
  const revenueSeries: SeriesPoint[] = days.map((d) => ({
    label: dayLabel(d),
    value: revenueByDay.get(dayKey(d)) ?? 0,
  }));
  const orderSeries: SeriesPoint[] = days.map((d) => ({
    label: dayLabel(d),
    value: ordersByDay.get(dayKey(d)) ?? 0,
  }));

  // ---- Reservation status breakdown ----
  const byStatus = new Map(reservations.map((r) => [r.status, r._count._all]));
  const statusSegments = [
    { label: "Confirmed", value: byStatus.get("CONFIRMED") ?? 0, color: "var(--chart-good)" },
    { label: "Pending", value: byStatus.get("PENDING") ?? 0, color: "var(--chart-warn)" },
    { label: "Expired", value: byStatus.get("EXPIRED") ?? 0, color: "var(--chart-info)" },
    { label: "Cancelled", value: byStatus.get("CANCELLED") ?? 0, color: "var(--chart-bad)" },
  ];

  // ---- Top products by confirmed units ----
  const unitsByProduct = new Map<string, number>();
  for (const r of recentConfirmed) {
    unitsByProduct.set(
      r.productId,
      (unitsByProduct.get(r.productId) ?? 0) + r.quantity,
    );
  }
  const topIds = [...unitsByProduct.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const topProducts = await prisma.product.findMany({
    where: { id: { in: topIds.map(([id]) => id) } },
    select: { id: true, title: true },
  });
  const titleById = new Map(topProducts.map((p) => [p.id, p.title]));
  const topItems = topIds.map(([id, units]) => ({
    label: titleById.get(id) ?? "Deleted product",
    value: units,
  }));

  const kpis: Array<{ label: string; value: string; sub?: string }> = [
    { label: "Total revenue", value: formatPrice(revenue) },
    { label: "Paid orders", value: String(paidOrders.length) },
    { label: "Users", value: `${userCount}`, sub: `${sellerCount} sellers` },
    { label: "Live now", value: String(liveCount), sub: `${productCount} products` },
  ];

  return { kpis, revenueSeries, orderSeries, statusSegments, topItems };
}

export default async function AdminOverviewPage() {
  const { kpis, revenueSeries, orderSeries, statusSegments, topItems } =
    await loadDashboardData();

  return (
    <div className="animate-page-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <p className="text-sm text-muted">
          Marketplace health at a glance — last {DAYS} days.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((kpi, i) => (
          <Card
            key={kpi.label}
            className="animate-item-in p-4"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <p className="text-xs uppercase tracking-wide text-faint">
              {kpi.label}
            </p>
            <p className="mt-1 text-2xl font-bold">{kpi.value}</p>
            {kpi.sub ? (
              <p className="mt-0.5 text-xs text-muted">{kpi.sub}</p>
            ) : null}
          </Card>
        ))}
      </div>

      {/* Trends — two measures, two charts (never a dual axis) */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="animate-item-in p-4" style={{ animationDelay: "200ms" }}>
          <h2 className="mb-3 text-sm font-semibold">Revenue · last {DAYS} days</h2>
          <AreaTrend points={revenueSeries} formatValue={inrCompact} />
        </Card>
        <Card className="animate-item-in p-4" style={{ animationDelay: "260ms" }}>
          <h2 className="mb-3 text-sm font-semibold">Paid orders · last {DAYS} days</h2>
          <Columns points={orderSeries} formatValue={(v) => String(Math.round(v))} />
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="animate-item-in p-4" style={{ animationDelay: "320ms" }}>
          <h2 className="mb-3 text-sm font-semibold">Reservations by status</h2>
          <StatusStack segments={statusSegments} />
        </Card>
        <Card className="animate-item-in p-4" style={{ animationDelay: "380ms" }}>
          <h2 className="mb-3 text-sm font-semibold">
            Top products · confirmed units
          </h2>
          {topItems.length === 0 ? (
            <p className="py-6 text-center text-sm text-faint">
              No confirmed sales yet.
            </p>
          ) : (
            <HBars items={topItems} formatValue={(v) => `${v}`} />
          )}
        </Card>
      </div>
    </div>
  );
}
