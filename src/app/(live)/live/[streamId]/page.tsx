import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { ViewerRoom } from "@/components/live/viewer-room";

/**
 * Dynamic, shareable metadata per stream: "@seller is live" with product
 * count. Falls back gracefully if the lookup fails so metadata can never take
 * the page down.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ streamId: string }>;
}): Promise<Metadata> {
  const fallback: Metadata = {
    title: "Live stream",
    description: "Watch live and shop in real time on liveWAB.",
  };
  try {
    const { streamId } = await params;
    const stream = await prisma.stream.findUnique({ where: { id: streamId } });
    if (!stream) return fallback;

    if (stream.status !== "LIVE") {
      return {
        title: "Stream ended",
        description: "This stream has ended — find more live sellers on Discover.",
        robots: { index: false },
      };
    }

    const [seller, productCount] = await Promise.all([
      prisma.user.findUnique({ where: { id: stream.sellerId } }),
      prisma.product.count({ where: { streamId: stream.id } }),
    ]);
    const name = seller ? seller.email.split("@")[0] : "seller";
    const title = `@${name} is live`;
    const description = `Watch @${name} live now — ${productCount} ${
      productCount === 1 ? "product" : "products"
    } up for grabs. Reserve instantly with Buy Now.`;

    return {
      title,
      description,
      openGraph: { title: `${title} · liveWAB`, description, url: `/live/${stream.id}` },
      twitter: { card: "summary", title: `${title} · liveWAB`, description },
    };
  } catch {
    return fallback;
  }
}

/** Buyer-facing live stream page: video + overlays + product rail. */
export default async function LiveStreamPage({
  params,
}: {
  params: Promise<{ streamId: string }>;
}) {
  const { streamId } = await params;

  const stream = await prisma.stream.findUnique({ where: { id: streamId } });
  if (!stream) notFound();

  // Stream is over — friendly ended state instead of a broken player.
  if (stream.status !== "LIVE") {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
        <span className="text-3xl">🌙</span>
        <h1 className="text-xl font-semibold">This stream has ended</h1>
        <p className="text-sm text-muted">
          Check the Discover page for sellers who are live right now.
        </p>
        <Link
          href="/discover"
          className="mt-2 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-hover"
        >
          Browse live streams
        </Link>
      </div>
    );
  }

  const viewer = await getCurrentUser().catch(() => null);

  const [seller, products, follow] = await Promise.all([
    prisma.user.findUnique({ where: { id: stream.sellerId } }),
    prisma.product.findMany({
      where: { streamId: stream.id },
      orderBy: { title: "asc" },
    }),
    viewer
      ? prisma.follow.findUnique({
          where: {
            followerId_sellerId: {
              followerId: viewer.id,
              sellerId: stream.sellerId,
            },
          },
        })
      : Promise.resolve(null),
  ]);

  const sellerName =
    seller?.username ?? (seller ? seller.email.split("@")[0] : "seller");

  // Fullscreen room — the (live) layout has no top bar / bottom nav.
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewerRoom
        streamId={stream.id}
        sellerId={stream.sellerId}
        sellerName={sellerName}
        sellerAvatar={seller?.imageUrl ?? null}
        // Server-issued identity of the broadcaster — used by clients to
        // verify moderation packets (delete/mute) really came from the host.
        sellerIdentity={`user_${stream.sellerId}`}
        initiallyFollowing={Boolean(follow)}
        featuredProductId={stream.featuredProductId}
        startedAt={stream.startedAt.toISOString()}
        products={products.map((p) => ({
          id: p.id,
          title: p.title,
          priceInPaise: p.priceInPaise,
          availableStock: p.availableStock,
          imageUrl: p.imageUrl,
        }))}
      />
    </div>
  );
}
