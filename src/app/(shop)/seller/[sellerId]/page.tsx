import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isSeller } from "@/lib/current-user";
import { timeAgo } from "@/lib/time";
import { StreamCard, type DiscoverStream } from "@/components/stream-card";
import { FollowButton } from "@/components/follow-button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sellerId: string }>;
}): Promise<Metadata> {
  try {
    const { sellerId } = await params;
    const seller = await prisma.user.findUnique({ where: { id: sellerId } });
    if (!seller) return { title: "Seller" };
    const name = seller.username ?? seller.email.split("@")[0];
    return {
      title: `@${name}`,
      description: `Shop @${name}'s live streams on liveWAB.`,
    };
  } catch {
    return { title: "Seller" };
  }
}

/** Public seller shop page: identity, follow, live now, past streams. */
export default async function SellerProfilePage({
  params,
}: {
  params: Promise<{ sellerId: string }>;
}) {
  const { sellerId } = await params;

  const seller = await prisma.user.findUnique({ where: { id: sellerId } });
  if (!seller || !isSeller(seller) || !seller.isActive) notFound();

  const viewer = await getCurrentUser().catch(() => null);

  const [followers, following, liveStreams, pastStreams, productCount, categories] =
    await Promise.all([
      prisma.follow.count({ where: { sellerId: seller.id } }),
      viewer
        ? prisma.follow.findUnique({
            where: {
              followerId_sellerId: {
                followerId: viewer.id,
                sellerId: seller.id,
              },
            },
          })
        : Promise.resolve(null),
      prisma.stream.findMany({
        where: { sellerId: seller.id, status: "LIVE" },
        orderBy: { startedAt: "desc" },
      }),
      prisma.stream.findMany({
        where: { sellerId: seller.id, status: "ENDED" },
        orderBy: { startedAt: "desc" },
        take: 12,
      }),
      prisma.product.count({ where: { sellerId: seller.id } }),
      prisma.category.findMany({ where: { isActive: true } }),
    ]);

  const name = seller.username ?? seller.email.split("@")[0];

  const liveCards: DiscoverStream[] = await Promise.all(
    liveStreams.map(async (stream) => {
      const products = await prisma.product.findMany({
        where: { streamId: stream.id },
        select: { priceInPaise: true },
      });
      return {
        id: stream.id,
        title: stream.title,
        sellerId: seller.id,
        sellerName: name,
        sellerAvatar: seller.imageUrl,
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

  // Shop location (city/state only — never the full address publicly).
  let shopCity: string | null = null;
  if (seller.shopAddressJson) {
    try {
      const shop = JSON.parse(seller.shopAddressJson);
      shopCity = [shop.city, shop.state].filter(Boolean).join(", ") || null;
    } catch {
      shopCity = null;
    }
  }

  const stats = [
    { label: "Followers", value: followers },
    { label: "Products", value: productCount },
    { label: "Streams", value: liveStreams.length + pastStreams.length },
  ];

  return (
    <div className="animate-page-in space-y-6 px-4 py-6">
      {/* Identity */}
      <Card className="p-5">
        <div className="flex items-center gap-4">
          <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-primary">
            {seller.imageUrl ? (
              <Image
                src={seller.imageUrl}
                alt={name}
                fill
                sizes="64px"
                className="object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-xl font-bold uppercase text-white">
                {name.slice(0, 1)}
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-bold">@{name}</h1>
              {liveStreams.length > 0 ? <Badge tone="live">LIVE</Badge> : null}
            </div>
            {seller.name ? (
              <p className="truncate text-sm text-muted">{seller.name}</p>
            ) : null}
            {shopCity ? (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-faint">
                📍 {shopCity}
              </p>
            ) : null}
          </div>
          <FollowButton
            sellerId={seller.id}
            initialFollowing={Boolean(following)}
          />
        </div>

        <div className="mt-4 grid grid-cols-3 divide-x divide-border rounded-2xl bg-surface-2 py-3 text-center">
          {stats.map((stat) => (
            <div key={stat.label}>
              <p className="text-base font-bold tabular-nums">{stat.value}</p>
              <p className="text-[11px] text-muted">{stat.label}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Live now */}
      {liveCards.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">
            Live now
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {liveCards.map((stream) => (
              <StreamCard key={stream.id} stream={stream} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Past streams */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">
          Past streams
        </h2>
        {pastStreams.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-faint">
            No past streams yet.
          </p>
        ) : (
          <Card className="divide-y divide-border/60">
            {pastStreams.map((stream) => (
              <div key={stream.id} className="flex items-center gap-3 p-3.5">
                <span className="relative h-12 w-9 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                  {stream.thumbnailUrl ? (
                    <Image
                      src={stream.thumbnailUrl}
                      alt=""
                      fill
                      sizes="36px"
                      className="object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-sm">
                      🎥
                    </span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    {stream.startedAt.toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                  <p className="text-xs text-muted">
                    {categories.find((c) => c.id === stream.categoryId)?.name ??
                      "Live stream"}
                    {stream.endedAt
                      ? ` · ${Math.max(1, Math.round((stream.endedAt.getTime() - stream.startedAt.getTime()) / 60000))} min`
                      : ""}
                  </p>
                </div>
                <Badge>Ended</Badge>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
