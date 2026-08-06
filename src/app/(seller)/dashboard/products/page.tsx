import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { signInPath } from "@/lib/back-to";
import { getCurrentUser, isSeller } from "@/lib/current-user";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ProductThumb } from "@/components/product-thumb";
import { formatPrice } from "@/lib/format";

export const dynamic = "force-dynamic";

/** The schema defaults. A product still on all four is unmeasured. */
const DEFAULT_DIMS = { weightGrams: 500, lengthCm: 25, breadthCm: 20, heightCm: 5 };

function usesDefaultDims(p: {
  weightGrams: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
}): boolean {
  return (
    p.weightGrams === DEFAULT_DIMS.weightGrams &&
    p.lengthCm === DEFAULT_DIMS.lengthCm &&
    p.breadthCm === DEFAULT_DIMS.breadthCm &&
    p.heightCm === DEFAULT_DIMS.heightCm
  );
}

const FILTERS = {
  all: "All",
  live: "In a live stream",
  out: "Out of stock",
  unmeasured: "Needs measuring",
} as const;

type FilterKey = keyof typeof FILTERS;

/**
 * The seller's catalogue.
 *
 * Products previously had no index of their own — only a preview block on the
 * dashboard — so a seller with more than a handful had no way to find, filter
 * or audit them. This is also where unmeasured parcels surface: a product left
 * on the default 500 g / 25×20×5 box gets billed at that size by the courier,
 * which is the quietest way to lose money on every order.
 */
export default async function SellerProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect(signInPath("/dashboard/products"));
  if (!isSeller(user)) redirect("/dashboard");

  const { q, filter } = await searchParams;
  const query = (q ?? "").trim();
  const active: FilterKey =
    filter && filter in FILTERS ? (filter as FilterKey) : "all";

  const where: Prisma.ProductWhereInput = {
    sellerId: user.id,
    ...(query ? { title: { contains: query, mode: "insensitive" } } : {}),
    ...(active === "live" ? { streamId: { not: null } } : {}),
    ...(active === "out" ? { availableStock: { lte: 0 } } : {}),
    ...(active === "unmeasured" ? DEFAULT_DIMS : {}),
  };

  const [products, all] = await Promise.all([
    prisma.product.findMany({ where, orderBy: { title: "asc" }, take: 200 }),
    prisma.product.findMany({
      where: { sellerId: user.id },
      select: {
        availableStock: true,
        streamId: true,
        priceInPaise: true,
        weightGrams: true,
        lengthCm: true,
        breadthCm: true,
        heightCm: true,
      },
    }),
  ]);

  const liveStreamIds = [
    ...new Set(all.map((p) => p.streamId).filter((id): id is string => Boolean(id))),
  ];
  const liveStreams = liveStreamIds.length
    ? await prisma.stream.findMany({
        where: { id: { in: liveStreamIds }, status: "LIVE" },
        select: { id: true },
      })
    : [];
  const liveIds = new Set(liveStreams.map((s) => s.id));

  const stats = [
    { label: "Products", value: String(all.length) },
    {
      label: "In stock",
      value: String(all.reduce((n, p) => n + p.availableStock, 0)),
    },
    {
      label: "Out of stock",
      value: String(all.filter((p) => p.availableStock <= 0).length),
    },
    {
      label: "Needs measuring",
      value: String(all.filter(usesDefaultDims).length),
    },
  ];

  const unmeasured = all.filter(usesDefaultDims).length;

  return (
    <div className="animate-page-in space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Products</h1>
          <p className="mt-1 text-sm text-muted">
            Your catalogue — price, stock, and the parcel size couriers bill you
            for.
          </p>
        </div>
        <ButtonLink href="/dashboard/products/new" size="sm">
          + Add product
        </ButtonLink>
      </div>

      {all.length > 0 ? (
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
      ) : null}

      {unmeasured > 0 && active !== "unmeasured" ? (
        <Card className="border-warning/30 bg-warning/5 p-4">
          <p className="text-sm font-medium text-warning">
            {unmeasured} product{unmeasured === 1 ? "" : "s"} still on the
            default parcel size
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Couriers charge on the higher of actual and volumetric weight, so a
            wrong box size costs you on every order.{" "}
            <Link
              href="/dashboard/products?filter=unmeasured"
              className="font-semibold text-primary underline-offset-2 hover:underline"
            >
              Review them
            </Link>
          </p>
        </Card>
      ) : null}

      {all.length > 0 ? (
        <>
          <Card className="p-3">
            <form method="get" className="flex flex-wrap gap-2">
              <input type="hidden" name="filter" value={active} />
              <input
                name="q"
                defaultValue={query}
                placeholder="Search your products"
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
                  href={`/dashboard/products?filter=${active}`}
                  className="shrink-0 rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-foreground"
                >
                  Clear
                </Link>
              ) : null}
            </form>
          </Card>

          <div
            className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0"
            data-no-swipe
          >
            <div className="flex w-max gap-2">
              {(Object.keys(FILTERS) as FilterKey[]).map((key) => (
                <Link
                  key={key}
                  href={`/dashboard/products?filter=${key}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
                  className={
                    key === active
                      ? "shrink-0 whitespace-nowrap rounded-full bg-primary/15 px-3.5 py-1.5 text-xs font-semibold text-primary"
                      : "shrink-0 whitespace-nowrap rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
                  }
                >
                  {FILTERS[key]}
                </Link>
              ))}
            </div>
          </div>
        </>
      ) : null}

      {products.length === 0 ? (
        <EmptyState
          icon="🏷️"
          title={
            all.length === 0
              ? "No products yet"
              : query
                ? "Nothing matched"
                : "Nothing in this filter"
          }
          description={
            all.length === 0
              ? "Add your first product, then go live and sell it."
              : "Try a different search or filter."
          }
          action={
            all.length === 0 ? (
              <ButtonLink href="/dashboard/products/new">Add product</ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid gap-2.5 lg:grid-cols-2">
          {products.map((product, i) => {
            const live = product.streamId && liveIds.has(product.streamId);
            const needsDims = usesDefaultDims(product);
            return (
              <li
                key={product.id}
                className="animate-item-in"
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              >
                <Card className="p-3">
                  <div className="flex items-start gap-3">
                    <ProductThumb
                      src={product.imageUrl}
                      alt={product.title}
                      sizes="56px"
                      className="w-14"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-medium">
                          {product.title}
                        </p>
                        {live ? <Badge tone="live">Live</Badge> : null}
                      </div>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums">
                        {formatPrice(product.priceInPaise)}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge
                          tone={product.availableStock > 0 ? "success" : "warning"}
                        >
                          {product.availableStock > 0
                            ? `${product.availableStock} in stock`
                            : "Out of stock"}
                        </Badge>
                        <span className="whitespace-nowrap rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted tabular-nums">
                          {product.weightGrams} g · {product.lengthCm}×
                          {product.breadthCm}×{product.heightCm} cm
                        </span>
                        {needsDims ? (
                          <Badge tone="warning">Default size</Badge>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <Link
                    href={`/dashboard/products/${product.id}`}
                    className="mt-3 block rounded-full border border-border py-2 text-center text-xs font-semibold text-muted transition-colors hover:border-primary/50 hover:text-foreground"
                  >
                    Edit product
                  </Link>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
