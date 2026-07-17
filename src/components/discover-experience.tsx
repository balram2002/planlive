import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { timeAgo } from "@/lib/time";
import { StreamCard, type DiscoverStream } from "@/components/stream-card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";

/**
 * The buyer-facing live directory: horizontally scrollable ACTIVE category
 * chips + the live-stream grid (optionally filtered to one category).
 * Shared by the buyer homepage (/) and /discover.
 */
export async function DiscoverExperience({
  categoryId,
  basePath,
}: {
  categoryId?: string;
  basePath: string; // "/" or "/discover" — chips link back to the same page
}) {
  const [categories, streams] = await Promise.all([
    prisma.category
      .findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
      })
      .catch(() => []),
    prisma.stream
      .findMany({
        where: {
          status: "LIVE",
          ...(categoryId ? { categoryId } : {}),
        },
        orderBy: { startedAt: "desc" },
        take: 12,
      })
      .catch(() => []),
  ]);

  const selected = categoryId
    ? (categories.find((c) => c.id === categoryId) ?? null)
    : null;

  const cards: DiscoverStream[] = await Promise.all(
    streams.map(async (stream) => {
      const [seller, products] = await Promise.all([
        prisma.user
          .findUnique({ where: { id: stream.sellerId } })
          .catch(() => null),
        prisma.product
          .findMany({
            where: { streamId: stream.id },
            select: { priceInPaise: true },
          })
          .catch(() => []),
      ]);
      return {
        id: stream.id,
        sellerId: stream.sellerId,
        sellerName:
          seller?.username ?? (seller ? seller.email.split("@")[0] : "seller"),
        sellerAvatar: seller?.imageUrl ?? null,
        categoryName:
          categories.find((c) => c.id === stream.categoryId)?.name ?? null,
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

  const chipHref = (id?: string) =>
    id ? `${basePath}?category=${id}` : basePath;

  return (
    <div className="space-y-4">
      {/* Category rail */}
      {categories.length > 0 ? (
        <div
          className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4"
          data-no-swipe
        >
          <Link
            href={chipHref()}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
              !selected
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border bg-surface text-muted hover:text-foreground",
            )}
          >
            All
          </Link>
          {categories.map((category) => (
            <Link
              key={category.id}
              href={chipHref(category.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border py-1 pl-1 pr-3.5 text-xs font-semibold transition-colors",
                selected?.id === category.id
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border bg-surface text-muted hover:text-foreground",
              )}
            >
              <span className="relative h-6 w-6 overflow-hidden rounded-full bg-surface-2">
                {category.imageUrl ? (
                  <Image
                    src={category.imageUrl}
                    alt=""
                    fill
                    sizes="24px"
                    className="object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[11px]">
                    🗂️
                  </span>
                )}
              </span>
              {category.name}
            </Link>
          ))}
        </div>
      ) : null}

      {/* Heading */}
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">
          {selected ? selected.name : "Live now"}
        </h2>
        <span className="text-xs text-faint">
          {cards.length} {cards.length === 1 ? "stream" : "streams"}
        </span>
      </div>

      {/* Grid */}
      {cards.length === 0 ? (
        <EmptyState
          icon="📡"
          title={
            selected
              ? `Nobody is live in ${selected.name}`
              : "No live streams right now"
          }
          description="Check back soon — when sellers go live they'll show up here."
        />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {cards.map((stream, i) => (
            <div
              key={stream.id}
              className="animate-item-in"
              style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
            >
              <StreamCard stream={stream} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
