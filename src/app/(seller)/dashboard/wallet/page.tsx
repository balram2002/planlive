import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { signInPath } from "@/lib/back-to";
import { getCurrentUser, isSeller } from "@/lib/current-user";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { AreaTrend, HBars, StatusStack } from "@/components/charts/charts";
import { formatPrice } from "@/lib/format";
import { COD_DELIVERY_FEE_PAISE } from "@/lib/pricing";

export const dynamic = "force-dynamic";

/** Rolling window for the trend chart. */
const DAYS = 30;

/**
 * Order states that represent money actually earned. CREATED/FAILED never
 * took payment; CANCELLED gave it back; RTO is money returning to the buyer.
 */
const EARNING_STATES = ["PAID", "PLACED", "SHIPPED", "DELIVERED"] as const;

/** Settled = the buyer has the goods and the money is no longer at risk. */
const SETTLED_STATES = ["DELIVERED"] as const;

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Seller wallet: what they earned, what shipping cost them, and what is
 * still in flight.
 *
 * Deliberately derived from orders and shipments rather than a stored
 * balance — there is no ledger table, so inventing one here would create a
 * second source of truth that could silently drift from the orders it claims
 * to describe. Every figure below is recomputed from the same rows the Sales
 * and Shipments screens show.
 */
export default async function SellerWalletPage() {
  const user = await getCurrentUser();
  if (!user) redirect(signInPath("/dashboard/wallet"));
  if (!isSeller(user)) redirect("/dashboard");

  const products = await prisma.product.findMany({
    where: { sellerId: user.id },
    select: { id: true, title: true },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  if (products.length === 0) {
    return (
      <div className="animate-page-in space-y-5">
        <Header />
        <EmptyState
          icon="💰"
          title="No earnings yet"
          description="Add a product and sell it live — your earnings will appear here."
        />
      </div>
    );
  }

  // Reservations on this seller's products, excluding their own test buys.
  const reservations = await prisma.reservation.findMany({
    where: {
      productId: { in: products.map((p) => p.id) },
      userId: { not: user.id },
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
  const reservationById = new Map(reservations.map((r) => [r.id, r]));

  const orders = reservations.length
    ? await prisma.order.findMany({
        where: { reservationId: { in: reservations.map((r) => r.id) } },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const shipments = orders.length
    ? await prisma.shipment.findMany({
        where: { orderId: { in: orders.map((o) => o.id) } },
        select: { trackingId: true },
      })
    : [];

  // ---------------------------------------------------------------- totals
  const earning = orders.filter((o) =>
    (EARNING_STATES as readonly string[]).includes(o.status),
  );
  const settled = earning.filter((o) =>
    (SETTLED_STATES as readonly string[]).includes(o.status),
  );
  const inFlight = earning.filter(
    (o) => !(SETTLED_STATES as readonly string[]).includes(o.status),
  );

  // Gross is what the buyer paid; the COD delivery fee is collected on the
  // marketplace's behalf, so it is not the seller's to keep.
  const grossPaise = earning.reduce((sum, o) => sum + o.amountInPaise, 0);
  const deliveryFeesPaise = earning.reduce(
    (sum, o) => sum + o.deliveryFeeInPaise,
    0,
  );
  const netPaise = grossPaise - deliveryFeesPaise;

  const settledPaise =
    settled.reduce((sum, o) => sum + o.amountInPaise, 0) -
    settled.reduce((sum, o) => sum + o.deliveryFeeInPaise, 0);
  const pendingPaise = netPaise - settledPaise;

  const refundedPaise = orders
    .filter((o) => o.status === "CANCELLED" || o.status === "RTO")
    .reduce((sum, o) => sum + o.amountInPaise, 0);

  // --------------------------------------------------------------- trend
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (DAYS - 1));

  const byDay = new Map<string, number>();
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    byDay.set(dayKey(d), 0);
  }
  for (const order of earning) {
    const key = dayKey(order.createdAt);
    if (byDay.has(key)) {
      const net = order.amountInPaise - order.deliveryFeeInPaise;
      byDay.set(key, (byDay.get(key) ?? 0) + net);
    }
  }
  const trend = [...byDay.entries()].map(([key, value]) => ({
    // Short label; the axis is dense at 30 points so only every few show.
    label: new Date(key).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    }),
    value: value / 100,
  }));
  const windowPaise = [...byDay.values()].reduce((a, b) => a + b, 0);

  // ------------------------------------------------------- top performers
  const perProduct = new Map<string, number>();
  for (const order of earning) {
    const reservation = reservationById.get(order.reservationId);
    if (!reservation) continue;
    const net = order.amountInPaise - order.deliveryFeeInPaise;
    perProduct.set(
      reservation.productId,
      (perProduct.get(reservation.productId) ?? 0) + net,
    );
  }
  const topProducts = [...perProduct.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([productId, paise]) => ({
      label: productById.get(productId)?.title ?? "Deleted product",
      value: paise / 100,
    }));

  // ------------------------------------------------------------- payments
  const codCount = earning.filter((o) => o.paymentMethod === "COD").length;
  const onlineCount = earning.length - codCount;

  const paymentMix = [
    {
      label: "Paid online",
      value: onlineCount,
      color: "var(--chart-series)",
    },
    { label: "Cash on delivery", value: codCount, color: "var(--chart-warn)" },
  ];

  const fulfilment = [
    {
      label: "Delivered",
      value: settled.length,
      color: "var(--chart-good)",
    },
    {
      label: "In transit",
      value: inFlight.filter((o) => o.status === "SHIPPED").length,
      color: "var(--chart-series)",
    },
    {
      label: "To ship",
      value: inFlight.filter((o) => o.status !== "SHIPPED").length,
      color: "var(--chart-warn)",
    },
    {
      label: "Returned",
      value: orders.filter((o) => o.status === "RTO").length,
      color: "var(--chart-bad)",
    },
  ];

  // Courier spend we can actually evidence: parcels we booked.
  const bookedParcels = shipments.filter((s) => s.trackingId).length;

  return (
    <div className="animate-page-in space-y-5">
      <Header />

      {/* ---- Headline balances ---- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Balance
          label="Net earnings"
          value={formatPrice(netPaise)}
          hint="After delivery charges"
          emphasis
        />
        <Balance
          label="Settled"
          value={formatPrice(settledPaise)}
          hint={`${settled.length} delivered`}
        />
        <Balance
          label="In progress"
          value={formatPrice(pendingPaise)}
          hint={`${inFlight.length} orders moving`}
        />
        <Balance
          label="Refunded / returned"
          value={formatPrice(refundedPaise)}
          hint={`${orders.filter((o) => o.status === "CANCELLED" || o.status === "RTO").length} orders`}
        />
      </div>

      {/* ---- Trend ---- */}
      <Card className="p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Earnings, last {DAYS} days</h2>
            <p className="mt-0.5 text-xs text-muted">
              Net of delivery charges, by order date.
            </p>
          </div>
          <span className="shrink-0 text-lg font-bold tabular-nums">
            {formatPrice(windowPaise)}
          </span>
        </div>
        <div className="-mx-1 overflow-x-auto px-1" data-no-swipe>
          <div className="min-w-[520px]">
            <AreaTrend
              points={trend}
              formatValue={(v) => `₹${Math.round(v).toLocaleString("en-IN")}`}
            />
          </div>
        </div>
      </Card>

      {/* ---- Breakdown ---- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4 sm:p-5">
          <h2 className="text-sm font-semibold">Where the money went</h2>
          <p className="mt-0.5 text-xs text-muted">
            Gross collected, and what came off it.
          </p>
          <dl className="mt-4 space-y-2.5 text-sm">
            <Line label="Gross collected" value={formatPrice(grossPaise)} />
            <Line
              label="Delivery charges collected"
              value={`− ${formatPrice(deliveryFeesPaise)}`}
              hint={`₹${COD_DELIVERY_FEE_PAISE / 100} per COD order`}
              muted
            />
            <div className="my-2 border-t border-dashed border-border" />
            <Line label="Net earnings" value={formatPrice(netPaise)} strong />
          </dl>

          <div className="mt-4 rounded-xl bg-surface-2 p-3">
            <p className="text-xs leading-relaxed text-muted">
              Courier charges are billed to the marketplace Eshopbox account,
              not deducted here. You&apos;ve booked{" "}
              <span className="font-semibold text-foreground">
                {bookedParcels}
              </span>{" "}
              parcel{bookedParcels === 1 ? "" : "s"} — see live rates on{" "}
              <Link
                href="/dashboard/serviceability"
                className="font-semibold text-primary underline-offset-2 hover:underline"
              >
                Serviceability
              </Link>
              .
            </p>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <h2 className="text-sm font-semibold">Fulfilment</h2>
          <p className="mt-0.5 mb-4 text-xs text-muted">
            Where your paid orders currently sit.
          </p>
          <StatusStack segments={fulfilment} />

          <h3 className="mt-6 text-sm font-semibold">How buyers paid</h3>
          <div className="mt-3">
            <StatusStack segments={paymentMix} />
          </div>
        </Card>
      </div>

      {/* ---- Top products ---- */}
      {topProducts.length > 0 ? (
        <Card className="p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Top earners</h2>
            <Badge>{topProducts.length} products</Badge>
          </div>
          <HBars
            items={topProducts}
            formatValue={(v) => `₹${Math.round(v).toLocaleString("en-IN")}`}
          />
        </Card>
      ) : null}
    </div>
  );
}

function Header() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">Wallet</h1>
        <p className="mt-1 text-sm text-muted">
          Everything you&apos;ve earned, and what it cost to get there.
        </p>
      </div>
      <Link
        href="/dashboard/sales"
        className="shrink-0 rounded-full border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-primary/50 hover:text-foreground"
      >
        View sales
      </Link>
    </div>
  );
}

function Balance({
  label,
  value,
  hint,
  emphasis = false,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <Card
      className={
        emphasis ? "border-primary/40 bg-primary/5 p-4" : "p-4"
      }
    >
      <p className="truncate text-xs uppercase tracking-wide text-faint">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted">{hint}</p> : null}
    </Card>
  );
}

function Line({
  label,
  value,
  hint,
  strong = false,
  muted = false,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <dt className={strong ? "font-semibold" : muted ? "text-muted" : ""}>
        {label}
        {hint ? (
          <span className="ml-1 text-[11px] text-faint">({hint})</span>
        ) : null}
      </dt>
      <dd
        className={
          strong
            ? "text-base font-bold tabular-nums"
            : "font-medium tabular-nums"
        }
      >
        {value}
      </dd>
    </div>
  );
}
