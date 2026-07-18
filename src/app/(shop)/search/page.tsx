import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { timeAgo } from "@/lib/time";
import { StreamCard, type DiscoverStream } from "@/components/stream-card";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Search",
  robots: { index: false },
};

/**
 * Master search: one query, three result groups —
 * live streams (by seller/category match), categories, sellers.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  if (query.length < 2) {
    return (
      <div className="animate-page-in px-4 py-10">
        <EmptyState
          icon="🔎"
          title="Search LiveShop"
          description="Find live streams, categories, and sellers — try at least 2 characters."
        />
      </div>
    );
  }

  // Matching sellers + categories first; streams derive from both.
  const [sellers, categories] = await Promise.all([
    prisma.user.findMany({
      where: {
        role: "SELLER",
        isActive: true,
        OR: [
          { username: { contains: query, mode: "insensitive" } },
          { name: { contains: query, mode: "insensitive" } },
          // Email local-part doubles as the public @handle when no username.
          { email: { contains: query, mode: "insensitive" } },
        ],
      },
      take: 10,
    }),
    prisma.category.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { subcategory: { contains: query, mode: "insensitive" } },
        ],
      },
      take: 12,
    }),
  ]);

  // Live streams matching by their own title OR a matched seller/category.
  const liveStreams = await prisma.stream.findMany({
    where: {
      status: "LIVE",
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { sellerId: { in: sellers.map((s) => s.id) } },
        { categoryId: { in: categories.map((c) => c.id) } },
      ],
    },
    orderBy: { startedAt: "desc" },
    take: 8,
  });

  const streamCards: DiscoverStream[] = await Promise.all(
    liveStreams.map(async (stream) => {
      const [seller, products, category] = await Promise.all([
        prisma.user.findUnique({ where: { id: stream.sellerId } }),
        prisma.product.findMany({
          where: { streamId: stream.id },
          select: { priceInPaise: true },
        }),
        stream.categoryId
          ? prisma.category.findUnique({ where: { id: stream.categoryId } })
          : Promise.resolve(null),
      ]);
      return {
        id: stream.id,
        title: stream.title,
        sellerId: stream.sellerId,
        sellerName:
          seller?.username ?? (seller ? seller.email.split("@")[0] : "seller"),
        sellerAvatar: seller?.imageUrl ?? null,
        categoryName: category?.name ?? null,
        startedAgo: timeAgo(stream.startedAt),
        productCount: products.length,
        fromPaise:
          products.length > 0
            ? Math.min(...products.map((p) => p.priceInPaise))
            : null,
        thumbnailUrl: stream.thumbnailUrl,
      };
    }),
  );

  const nothing =
    streamCards.length === 0 && categories.length === 0 && sellers.length === 0;

  return (
    <div className="animate-page-in space-y-6 px-4 py-5">
      <p className="text-sm text-muted">
        Results for <span className="font-semibold text-foreground">“{query}”</span>
      </p>

      {nothing ? (
        <EmptyState
          icon="🕳️"
          title="Nothing found"
          description="Try a different word — or browse everything on the home page."
        />
      ) : null}

      {/* Live streams */}
      {streamCards.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">
            Live now
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {streamCards.map((stream) => (
              <StreamCard key={stream.id} stream={stream} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Categories */}
      {categories.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">
            Categories
          </h2>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <Link
                key={category.id}
                href={`/discover?category=${category.id}`}
                className="flex items-center gap-2 rounded-full border border-border bg-surface py-1 pl-1 pr-3.5 text-sm font-medium transition-all hover:bg-surface-2 active:scale-[0.98]"
              >
                <span className="relative h-7 w-7 overflow-hidden rounded-full bg-surface-2">
                  {category.imageUrl ? (
                    <Image
                      src={category.imageUrl}
                      alt=""
                      fill
                      sizes="28px"
                      className="object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-xs">
                      🗂️
                    </span>
                  )}
                </span>
                {category.name}
                {category.subcategory ? (
                  <span className="text-xs text-muted">
                    · {category.subcategory}
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Sellers */}
      {sellers.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">
            Sellers
          </h2>
          <ul className="space-y-2">
            {sellers.map((seller) => {
              const name = seller.username ?? seller.email.split("@")[0];
              return (
                <li key={seller.id}>
                  <Link href={`/seller/${seller.id}`}>
                    <Card className="flex items-center gap-3 p-3 transition-shadow hover:shadow-pop">
                      <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-primary">
                        {seller.imageUrl ? (
                          <Image
                            src={seller.imageUrl}
                            alt={name}
                            fill
                            sizes="40px"
                            className="object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-sm font-bold uppercase text-white">
                            {name.slice(0, 1)}
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          @{name}
                        </span>
                        {seller.name ? (
                          <span className="block truncate text-xs text-muted">
                            {seller.name}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-xs font-medium text-primary">
                        View shop →
                      </span>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
