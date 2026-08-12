import { APP_TIMEZONE } from "@/lib/datetime";
import Link from "next/link";
import { SignInButton } from "@clerk/nextjs";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isSeller } from "@/lib/current-user";
import { formatPrice } from "@/lib/format";
import { Button, ButtonLink } from "@/components/ui/button";
import { ProductThumb } from "@/components/product-thumb";
import { Card } from "@/components/ui/card";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { AreaTrend, HBars, StatusStack } from "@/components/charts/charts";
import { deleteProduct } from "./actions";

/** Axis/label money formatter — whole rupees, no paise noise on a chart. */
const formatRupees = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;

export default async function DashboardPage() {
  const user = await getCurrentUser();

  // Signed out.
  if (!user) {
    return (
      <div className="animate-page-in mx-auto max-w-md py-16">
        <EmptyState
          title="Sign in to sell"
          description="Create products, go live, and start selling in minutes."
          action={
            <SignInButton mode="modal">
              <Button>Sign in</Button>
            </SignInButton>
          }
        />
      </div>
    );
  }

  // Suspended accounts can't sell.
  if (!user.isActive) {
    return (
      <div className="animate-page-in mx-auto max-w-md py-16">
        <EmptyState
          icon="🚫"
          title="Account suspended"
          description="Your account has been deactivated by an administrator. Contact support if you believe this is a mistake."
        />
      </div>
    );
  }

  // Signed in but not a seller yet — route through the application funnel.
  if (!isSeller(user)) {
    const request = await prisma.sellerRequest.findUnique({
      where: { userId: user.id },
    });
    return (
      <div className="animate-page-in mx-auto max-w-md py-10">
        <Card className="p-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-2xl">
            🛍️
          </div>
          <h1 className="text-xl font-semibold">Sell on liveWAB</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm text-muted">
            {request?.status === "PENDING"
              ? "Your seller application is under review — we'll unlock this dashboard once an admin approves it."
              : "Selling requires an approved application. It takes two minutes to apply."}
          </p>
          <div className="mt-6">
            {request?.status === "PENDING" ? (
              <ButtonLink
                href="/become-a-seller"
                variant="secondary"
                className="w-full"
              >
                View application status
              </ButtonLink>
            ) : (
              <ButtonLink href="/become-a-seller" className="w-full">
                Apply to become a seller
              </ButtonLink>
            )}
          </div>
        </Card>
      </div>
    );
  }

  // Seller view.
  //
  // Shaped around what a live seller actually opens this page to find out, in
  // priority order: what needs me now, am I up or down, what's about to run
  // out, and what's selling. Vanity totals come after all of that.
  const DAYS = 14;
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (DAYS - 1));
  const prevSince = new Date(since);
  prevSince.setDate(prevSince.getDate() - DAYS);

  const [products, activeStream] = await Promise.all([
    prisma.product.findMany({
      where: { sellerId: user.id },
      orderBy: { title: "asc" },
    }),
    prisma.stream.findFirst({
      where: { sellerId: user.id, status: "LIVE" },
    }),
  ]);
  const productIds = products.map((p) => p.id);
  const productById = new Map(products.map((p) => [p.id, p]));

  // Every reservation on this seller's catalogue, which is what the live
  // funnel is measured from.
  const reservations = productIds.length
    ? await prisma.reservation.findMany({
        where: { productId: { in: productIds }, userId: { not: user.id } },
        orderBy: { createdAt: "desc" },
        take: 2000,
      })
    : [];
  const reservationById = new Map(reservations.map((r) => [r.id, r]));

  const orders = reservations.length
    ? await prisma.order.findMany({
        where: { reservationId: { in: reservations.map((r) => r.id) } },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const [shipments, fulfilments] = await Promise.all([
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
  ]);
  const shipmentByOrder = new Map(shipments.map((s) => [s.orderId, s]));
  const fulfilmentByOrder = new Map(fulfilments.map((f) => [f.orderId, f]));

  const EARNING = ["PAID", "PLACED", "SHIPPED", "DELIVERED"];
  const earning = orders.filter((o) => EARNING.includes(o.status));
  const net = (o: { amountInPaise: number; deliveryFeeInPaise: number }) =>
    o.amountInPaise - o.deliveryFeeInPaise;

  // ---- 1. What needs me now ----
  const awaitingLabel = orders.filter(
    (o) =>
      ["PAID", "PLACED"].includes(o.status) &&
      !shipmentByOrder.get(o.id)?.trackingId &&
      !fulfilmentByOrder.get(o.id),
  ).length;
  const pickupWaiting = fulfilments.filter(
    (f) => f.pickupStatus === "REQUESTED",
  ).length;
  const pickupReady = fulfilments.filter(
    (f) => f.pickupStatus === "ACCEPTED" && !f.completedAt,
  ).length;
  const courierProblems = shipments.filter((s) =>
    ["EXCEPTION", "FAILED_DELIVERY", "RTO"].includes(s.status),
  ).length;
  const needsDecision = fulfilments.filter(
    (f) =>
      (f.pickupStatus === "REJECTED" || f.pickupStatus === "EXPIRED") &&
      !f.completedAt,
  ).length;

  const actions = [
    {
      label: "Book a courier",
      count: awaitingLabel,
      href: "/dashboard/shipments",
      tone: "warn" as const,
    },
    {
      label: "Awaiting buyer reply",
      count: pickupWaiting,
      href: "/dashboard/shipments",
      tone: "info" as const,
    },
    {
      label: "Ready to hand over",
      count: pickupReady,
      href: "/dashboard/shipments",
      tone: "good" as const,
    },
    {
      label: "Choose delivery again",
      count: needsDecision,
      href: "/dashboard/shipments",
      tone: "warn" as const,
    },
    {
      label: "Courier problems",
      count: courierProblems,
      href: "/dashboard/shipments",
      tone: "bad" as const,
    },
  ].filter((a) => a.count > 0);

  // ---- 2. Revenue trend + period comparison ----
  const byDay = new Map<string, number>();
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    byDay.set(d.toISOString().slice(0, 10), 0);
  }
  let periodPaise = 0;
  let prevPeriodPaise = 0;
  for (const order of earning) {
    if (order.createdAt >= since) {
      periodPaise += net(order);
      const key = order.createdAt.toISOString().slice(0, 10);
      if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + net(order));
    } else if (order.createdAt >= prevSince) {
      prevPeriodPaise += net(order);
    }
  }
  const trend = [...byDay.entries()].map(([key, paise]) => ({
    label: new Date(key).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      timeZone: APP_TIMEZONE,
    }),
    value: paise / 100,
  }));
  // Null when there's no prior period to compare against — showing "+100%"
  // against zero history would be meaningless.
  const changePct =
    prevPeriodPaise > 0
      ? Math.round(((periodPaise - prevPeriodPaise) / prevPeriodPaise) * 100)
      : null;

  // ---- 3. The live funnel ----
  const reservedCount = reservations.length;
  const orderedCount = orders.length;
  const paidCount = earning.length;
  const conversion =
    reservedCount > 0 ? Math.round((paidCount / reservedCount) * 100) : 0;

  // ---- 4. Stock about to run out ----
  const lowStock = products
    .filter((p) => p.availableStock > 0 && p.availableStock <= 3)
    .slice(0, 5);
  const soldOut = products.filter((p) => p.availableStock <= 0).length;

  // ---- 5. Top earners ----
  const perProduct = new Map<string, number>();
  for (const order of earning) {
    const reservation = reservationById.get(order.reservationId);
    if (!reservation) continue;
    perProduct.set(
      reservation.productId,
      (perProduct.get(reservation.productId) ?? 0) + net(order),
    );
  }
  const topProducts = [...perProduct.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, paise]) => ({
      label: productById.get(id)?.title ?? "Deleted product",
      value: paise / 100,
    }));

  // ---- 6. Fulfilment mix, in journey order ----
  const fulfilmentSegments = [
    {
      label: "To ship",
      value: orders.filter((o) => ["PAID", "PLACED"].includes(o.status)).length,
      color: "var(--chart-warn)",
    },
    {
      label: "In transit",
      value: orders.filter((o) => o.status === "SHIPPED").length,
      color: "var(--chart-info)",
    },
    {
      label: "Delivered",
      value: orders.filter((o) => o.status === "DELIVERED").length,
      color: "var(--chart-good)",
    },
    {
      label: "Returned",
      value: orders.filter((o) => o.status === "RTO").length,
      color: "var(--chart-bad)",
    },
  ];

  const totalStock = products.reduce((sum, p) => sum + p.availableStock, 0);
  const revenue = earning.reduce((sum, o) => sum + net(o), 0);

  return (
    <div className="animate-page-in space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted">Manage your products and streams</p>
        </div>
        <ButtonLink
          href={activeStream ? `/go-live/${activeStream.id}` : "/go-live"}
          variant={activeStream ? "danger" : "primary"}
          size="sm"
        >
          {activeStream ? "● Back to studio" : "Go live"}
        </ButtonLink>
      </div>

      {activeStream ? (
        <Link
          href={`/go-live/${activeStream.id}`}
          className="flex items-center justify-between rounded-2xl border border-live/30 bg-live/5 px-4 py-3 transition-colors hover:bg-live/10"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-live">
            <span className="h-2 w-2 rounded-full bg-live animate-live-pulse" />
            You&apos;re live right now
          </span>
          <span className="text-sm text-live/80">Open studio →</span>
        </Link>
      ) : null}

      {/* ---- 1. What needs me now ----
          Above every metric on purpose: a seller opens this page to find out
          what to do, not how they're doing. An empty queue is itself the
          answer, so it says so rather than rendering nothing. */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-faint">
          Needs you
        </h2>
        {actions.length === 0 ? (
          <Card className="flex items-center gap-3 p-4">
            <span aria-hidden className="text-xl">
              ✅
            </span>
            <p className="text-sm text-muted">
              Nothing waiting — every order is on its way.
            </p>
          </Card>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {actions.map((action, i) => (
              <Link
                key={action.label}
                href={action.href}
                className="animate-item-in"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <Card className="flex items-center gap-3 p-4 transition-shadow hover:shadow-pop">
                  {/* Status colour never carries meaning alone — the count
                      and label say it too. */}
                  <span
                    aria-hidden
                    className="h-8 w-1.5 shrink-0 rounded-full"
                    style={{ background: `var(--chart-${action.tone})` }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-2xl font-bold tabular-nums">
                      {action.count}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {action.label}
                    </span>
                  </span>
                  <span aria-hidden className="shrink-0 text-faint">
                    →
                  </span>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ---- 2. Revenue: hero number + trend ----
          A single number can't answer "am I up or down", so the comparison
          rides alongside it and the trend shows the shape. */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-faint">
              Revenue · last {DAYS} days
            </p>
            <p className="mt-1 text-3xl font-bold tabular-nums">
              {formatPrice(periodPaise)}
            </p>
            {changePct !== null ? (
              <p className="mt-1 flex items-center gap-1.5 text-xs">
                <span
                  className="font-semibold"
                  style={{
                    color:
                      changePct >= 0 ? "var(--chart-good)" : "var(--chart-bad)",
                  }}
                >
                  {changePct >= 0 ? "▲" : "▼"} {Math.abs(changePct)}%
                </span>
                <span className="text-muted">vs previous {DAYS} days</span>
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted">
                No earlier period to compare against yet.
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs uppercase tracking-wide text-faint">
              All time
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {formatPrice(revenue)}
            </p>
          </div>
        </div>

        <div className="-mx-1 mt-4 overflow-x-auto px-1" data-no-swipe>
          <div className="min-w-[480px]">
            <AreaTrend points={trend} formatValue={formatRupees} />
          </div>
        </div>
      </Card>

      {/* ---- 3. Funnel + fulfilment ---- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4 sm:p-5">
          <h2 className="text-sm font-semibold">Live funnel</h2>
          <p className="mb-4 mt-0.5 text-xs text-muted">
            How many holds turn into money.
          </p>
          <ul className="space-y-3">
            {[
              { label: "Reserved", value: reservedCount },
              { label: "Checked out", value: orderedCount },
              { label: "Paid / placed", value: paidCount },
            ].map((step) => {
              const pct =
                reservedCount > 0 ? (step.value / reservedCount) * 100 : 0;
              return (
                <li key={step.label}>
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <span className="text-sm text-muted">{step.label}</span>
                    <span className="text-sm font-semibold tabular-nums">
                      {step.value}
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(pct, 2)}%`,
                        background: "var(--chart-series)",
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
            <span className="font-semibold text-foreground">{conversion}%</span>{" "}
            of reservations end in a paid order.
          </p>
        </Card>

        <Card className="p-4 sm:p-5">
          <h2 className="text-sm font-semibold">Fulfilment</h2>
          <p className="mb-4 mt-0.5 text-xs text-muted">
            Where your orders are, in journey order.
          </p>
          <StatusStack segments={fulfilmentSegments} />
        </Card>
      </div>

      {/* ---- 4. Stock + top earners ---- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Running low</h2>
            {soldOut > 0 ? (
              <Badge tone="warning">{soldOut} sold out</Badge>
            ) : null}
          </div>
          <p className="mb-3 mt-0.5 text-xs text-muted">
            Nothing kills a live drop like hitting zero mid-stream.
          </p>
          {lowStock.length === 0 ? (
            <p className="py-3 text-sm text-faint">
              Every product has healthy stock.
            </p>
          ) : (
            <ul className="space-y-2">
              {lowStock.map((product) => (
                <li key={product.id}>
                  <Link
                    href={`/dashboard/products/${product.id}`}
                    className="flex items-center gap-2.5 rounded-xl p-1.5 transition-colors hover:bg-surface-2"
                  >
                    <ProductThumb
                      src={product.imageUrl}
                      alt={product.title}
                      sizes="32px"
                      className="w-8"
                      rounded="rounded-lg"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {product.title}
                    </span>
                    <Badge tone="warning">{product.availableStock} left</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4 sm:p-5">
          <h2 className="text-sm font-semibold">Top earners</h2>
          <p className="mb-4 mt-0.5 text-xs text-muted">
            Net of delivery charges.
          </p>
          {topProducts.length === 0 ? (
            <p className="py-3 text-sm text-faint">No sales yet.</p>
          ) : (
            <HBars items={topProducts} formatValue={formatRupees} />
          )}
        </Card>
      </div>

      {/* ---- 5. Catalogue at a glance ---- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Products", value: String(products.length) },
          { label: "Units in stock", value: String(totalStock) },
          { label: "Orders", value: String(orders.length) },
          { label: "Conversion", value: `${conversion}%` },
        ].map((stat, i) => (
          <Card
            key={stat.label}
            className="animate-item-in p-4"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <p className="truncate text-xs uppercase tracking-wide text-faint">
              {stat.label}
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{stat.value}</p>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Products</h2>
        <ButtonLink href="/dashboard/products/new" size="sm">
          + Add product
        </ButtonLink>
      </div>

      {products.length === 0 ? (
        <EmptyState
          icon="📦"
          title="No products yet"
          description="Add your first product to sell it during a live stream."
          action={
            <ButtonLink href="/dashboard/products/new">Add product</ButtonLink>
          }
        />
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2">
          {products.map((product, i) => (
            <li
              key={product.id}
              className="animate-item-in"
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
            >
              <Card className="flex items-center gap-3 p-3 transition-shadow hover:shadow-pop">
                <ProductThumb
                  src={product.imageUrl}
                  alt={product.title}
                  sizes="48px"
                  className="w-12"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{product.title}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-sm text-muted">
                      {formatPrice(product.priceInPaise)}
                    </span>
                    <Badge
                      tone={product.availableStock > 0 ? "success" : "warning"}
                    >
                      {product.availableStock > 0
                        ? `${product.availableStock} in stock`
                        : "Sold out"}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Link
                    href={`/dashboard/products/${product.id}`}
                    className="rounded-full px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                  >
                    Edit
                  </Link>
                  {product.streamId ? (
                    <span
                      className="cursor-not-allowed rounded-full px-3 py-1.5 text-sm font-medium text-faint"
                      title="Featured in your live stream — end the stream to delete"
                    >
                      Live
                    </span>
                  ) : (
                    <form action={deleteProduct}>
                      <input type="hidden" name="id" value={product.id} />
                      <ActionButton
                        haptic="impact"
                        className="rounded-full px-3 py-1.5 text-sm font-medium text-live transition-colors hover:bg-live/10"
                        aria-label={`Delete ${product.title}`}
                      >
                        Delete
                      </ActionButton>
                    </form>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
