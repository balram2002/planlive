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
      {/* Category tiles — Whatnot-style rail: label up top, artwork below. */}
      {categories.length > 0 ? (
        <div
          className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1"
          data-no-swipe
        >
          <Link
            href={chipHref()}
            className={cn(
              "relative flex aspect-[4/5] w-[104px] shrink-0 flex-col overflow-hidden rounded-2xl border-2 bg-gradient-to-b from-primary via-primary to-primary-hover p-2.5 transition-all duration-200 active:scale-[0.97]",
              !selected
                ? "border-foreground shadow-pop"
                : "border-transparent opacity-90 hover:opacity-100",
            )}
          >
            <span className="text-sm font-bold leading-tight text-white">
              For You
            </span>
            <span className="absolute bottom-2 left-1/2 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-white/20 text-2xl backdrop-blur">
              ⚡
            </span>
          </Link>

          {categories.map((category) => {
            const active = selected?.id === category.id;
            return (
              <Link
                key={category.id}
                href={chipHref(category.id)}
                className={cn(
                  "relative flex aspect-[4/5] w-[104px] shrink-0 flex-col overflow-hidden rounded-2xl border-2 bg-surface-2 p-2.5 transition-all duration-200 active:scale-[0.97]",
                  active
                    ? "border-primary shadow-pop"
                    : "border-transparent hover:border-border",
                )}
              >
                {category.imageUrl ? (
                  <>
                    <Image
                      src={category.imageUrl}
                      alt=""
                      fill
                      sizes="104px"
                      className="object-cover"
                    />
                    {/* Keeps the top label readable over any artwork. */}
                    <span className="absolute inset-0 bg-gradient-to-b from-surface-2 via-surface-2/40 to-transparent" />
                  </>
                ) : (
                  <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-4xl opacity-70">
                    🗂️
                  </span>
                )}
                {/* Re-paint label above the scrim. */}
                <span className="absolute left-2.5 right-2.5 top-2.5 z-20 text-sm font-bold leading-tight text-foreground">
                  {category.name}
                </span>
              </Link>
            );
          })}
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
