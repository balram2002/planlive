import Link from "next/link";
import { SignInButton } from "@clerk/nextjs";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isSeller } from "@/lib/current-user";
import { formatPrice } from "@/lib/format";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { deleteProduct } from "./actions";

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
          <h1 className="text-xl font-semibold">Sell on LiveShop</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm text-muted">
            {request?.status === "PENDING"
              ? "Your seller application is under review — we'll unlock this dashboard once an admin approves it."
              : "Selling requires an approved application. It takes two minutes to apply."}
          </p>
          <div className="mt-6">
            {request?.status === "PENDING" ? (
              <ButtonLink href="/become-a-seller" variant="secondary" className="w-full">
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
  const [products, activeStream, paidOrders] = await Promise.all([
    prisma.product.findMany({
      where: { sellerId: user.id },
      orderBy: { title: "asc" },
    }),
    prisma.stream.findFirst({
      where: { sellerId: user.id, status: "LIVE" },
    }),
    // Seller revenue: PAID orders on reservations for this seller's products.
    prisma.product
      .findMany({ where: { sellerId: user.id }, select: { id: true } })
      .then((mine) =>
        mine.length === 0
          ? []
          : prisma.reservation
              .findMany({
                where: { productId: { in: mine.map((p) => p.id) }, status: "CONFIRMED" },
                select: { id: true },
              })
              .then((rs) =>
                rs.length === 0
                  ? []
                  : prisma.order.findMany({
                      where: {
                        reservationId: { in: rs.map((r) => r.id) },
                        status: "PAID",
                      },
                      select: { amountInPaise: true },
                    }),
              ),
      ),
  ]);

  const totalStock = products.reduce((sum, p) => sum + p.availableStock, 0);
  const revenue = paidOrders.reduce((sum, o) => sum + o.amountInPaise, 0);

  const stats = [
    { label: "Products", value: String(products.length) },
    { label: "Units in stock", value: String(totalStock) },
    { label: "Paid sales", value: String(paidOrders.length) },
    { label: "Revenue", value: formatPrice(revenue) },
  ];

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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat, i) => (
          <Card
            key={stat.label}
            className="animate-item-in p-4"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <p className="text-xs uppercase tracking-wide text-faint">
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
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-lg">
                  🏷️
                </div>
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
