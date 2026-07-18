import { prisma } from "@/lib/prisma";
import { timeAgo } from "@/lib/time";
import { StreamCard, type DiscoverStream } from "@/components/stream-card";
import { CategoryRail } from "@/components/category-rail";
import { EmptyState } from "@/components/ui/empty-state";

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
        title: stream.title,
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

  return (
    <div className="space-y-4">
      {/* Category tiles — client rail with useTransition pending feedback. */}
      {categories.length > 0 ? (
        <CategoryRail
          categories={categories.map((c) => ({
            id: c.id,
            name: c.name,
            imageUrl: c.imageUrl,
          }))}
          selectedId={selected?.id ?? null}
          basePath={basePath}
        />
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
