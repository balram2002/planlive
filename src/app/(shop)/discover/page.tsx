import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { StreamCard, type DiscoverStream } from "@/components/stream-card";
import { EmptyState } from "@/components/ui/empty-state";

// Always render fresh so new streams appear without a rebuild.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Live now — watch & shop",
  description:
    "Browse sellers broadcasting live right now. Tap in, chat, and grab products before they sell out.",
  openGraph: {
    title: "Live now on LiveShop",
    description: "Browse sellers broadcasting live right now.",
    url: "/discover",
  },
};

/** Discover: grid of up to 4 concurrent live streams (MVP constraint). */
export default async function DiscoverPage() {
  const streams = await prisma.stream.findMany({
    where: { status: "LIVE" },
    orderBy: { startedAt: "desc" },
    take: 4,
  });

  const cards: DiscoverStream[] = await Promise.all(
    streams.map(async (stream) => {
      const [seller, products] = await Promise.all([
        prisma.user.findUnique({ where: { id: stream.sellerId } }),
        prisma.product.findMany({
          where: { streamId: stream.id },
          select: { priceInPaise: true },
        }),
      ]);
      return {
        id: stream.id,
        sellerName: seller ? seller.email.split("@")[0] : "seller",
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
    <div className="animate-page-in space-y-5 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Live now</h1>
        <p className="text-sm text-muted">
          {cards.length > 0
            ? `${cards.length} ${cards.length === 1 ? "seller is" : "sellers are"} broadcasting right now.`
            : "Up to 4 sellers broadcasting at once."}
        </p>
      </div>

      {cards.length === 0 ? (
        <EmptyState
          icon="📡"
          title="No live streams right now"
          description="Check back soon — when sellers go live they'll show up here."
        />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {cards.map((stream, i) => (
            <div
              key={stream.id}
              className="animate-item-in"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <StreamCard stream={stream} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
