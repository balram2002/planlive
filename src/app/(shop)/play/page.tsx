import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { timeAgo } from "@/lib/time";
import { PlayFeed, type PlaySlide } from "@/components/play-feed";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Play — swipe through live streams",
  description: "Swipe through the most popular live streams happening now.",
};

/** Popularity-ordered slide data (seller followers as the live proxy). */
async function loadSlides(): Promise<PlaySlide[]> {
  const streams = await prisma.stream
    .findMany({
      where: { status: "LIVE" },
      orderBy: { startedAt: "desc" },
      take: 15,
    })
    .catch(() => []);
  if (streams.length === 0) return [];

  const categories = await prisma.category
    .findMany({ where: { isActive: true } })
    .catch(() => []);
  const now = Date.now();

  const slides = await Promise.all(
    streams.map(async (stream) => {
      const [seller, products, followers] = await Promise.all([
        prisma.user.findUnique({ where: { id: stream.sellerId } }).catch(() => null),
        prisma.product
          .findMany({
            where: { streamId: stream.id },
            select: { priceInPaise: true },
          })
          .catch(() => []),
        prisma.follow.count({ where: { sellerId: stream.sellerId } }).catch(() => 0),
      ]);
      return {
        id: stream.id,
        sellerId: stream.sellerId,
        sellerName:
          seller?.username ?? (seller ? seller.email.split("@")[0] : "seller"),
        sellerAvatar: seller?.imageUrl ?? null,
        categoryName:
          categories.find((c) => c.id === stream.categoryId)?.name ?? null,
        startedAgo: timeAgo(stream.startedAt, now),
        followers,
        productCount: products.length,
        fromPaise:
          products.length > 0
            ? Math.min(...products.map((p) => p.priceInPaise))
            : null,
        thumbnailUrl: stream.thumbnailUrl,
      };
    }),
  );

  // Most-followed sellers first — "popular" without live viewer telemetry.
  return slides.sort((a, b) => b.followers - a.followers);
}

export default async function PlayPage() {
  const slides = await loadSlides();

  if (slides.length === 0) {
    return (
      <div className="animate-page-in px-4 py-16">
        <EmptyState
          icon="🎬"
          title="Nothing to play yet"
          description="When sellers go live, you can swipe through their streams here."
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PlayFeed slides={slides} />
    </div>
  );
}
