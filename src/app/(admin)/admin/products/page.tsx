import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ProductThumb } from "@/components/product-thumb";
import { ActionButton } from "@/components/ui/action-button";
import { ProductRowEditor } from "@/components/admin/product-row-editor";
import { adminDeleteProduct } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  const products = await prisma.product.findMany({
    where: q
      ? { title: { contains: q.trim(), mode: "insensitive" } }
      : undefined,
    orderBy: { title: "asc" },
    take: 100,
  });

  const sellerIds = [...new Set(products.map((p) => p.sellerId))];
  const sellers = await prisma.user.findMany({
    where: { id: { in: sellerIds } },
    select: { id: true, email: true },
  });
  const sellerById = new Map(sellers.map((s) => [s.id, s.email]));

  return (
    <div className="animate-page-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Products</h1>
        <p className="text-sm text-muted">Every listing across the marketplace.</p>
      </div>

      <form method="GET" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by title…"
          className="w-full max-w-xs rounded-xl border border-border bg-surface px-3.5 py-2 text-base placeholder:text-faint focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          type="submit"
          className="rounded-xl border border-border bg-surface px-4 text-sm font-medium text-muted transition-colors hover:text-foreground"
        >
          Search
        </button>
      </form>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto" data-no-swipe>
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-faint">
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Seller</th>
                <th className="px-4 py-3 font-medium">Price</th>
                <th className="px-4 py-3 font-medium">Stock</th>
                <th className="px-4 py-3 font-medium">Live</th>
                <th className="px-4 py-3 font-medium">Manage</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr
                  key={product.id}
                  className="border-b border-border/60 last:border-0 transition-colors hover:bg-surface-2/50"
                >
                  <td className="max-w-[240px] px-4 py-3 font-medium">
                    <span className="flex items-center gap-2.5">
                      <ProductThumb
                        src={product.imageUrl}
                        alt=""
                        sizes="36px"
                        rounded="rounded-lg"
                        className="w-9"
                      />
                      <span className="min-w-0 truncate">{product.title}</span>
                    </span>
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-muted">
                    {sellerById.get(product.sellerId) ?? "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatPrice(product.priceInPaise)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={product.availableStock > 0 ? "success" : "warning"}>
                      {product.availableStock}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {product.streamId ? <Badge tone="live">Live</Badge> : <span className="text-faint">—</span>}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-center gap-1">
                      <ProductRowEditor
                        product={{
                          id: product.id,
                          title: product.title,
                          priceInPaise: product.priceInPaise,
                          availableStock: product.availableStock,
                          imageUrl: product.imageUrl,
                          isLive: product.streamId !== null,
                        }}
                      />
                      {product.streamId ? (
                        <span
                          className="cursor-not-allowed px-3 py-1.5 text-xs font-medium text-faint"
                          title="Featured in a live stream — end the stream first"
                        >
                          Delete
                        </span>
                      ) : (
                        <form action={adminDeleteProduct}>
                          <input type="hidden" name="id" value={product.id} />
                          <ActionButton
                            haptic="impact"
                            className="rounded-full px-3 py-1.5 text-xs font-medium text-live transition-colors hover:bg-live/10"
                          >
                            Delete
                          </ActionButton>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {products.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-faint">
                    No products found{q ? ` for “${q}”` : ""}.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
