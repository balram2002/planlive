import Image from "next/image";
import Link from "next/link";
import { LiveBadge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/format";

export type DiscoverStream = {
  id: string;
  sellerId: string;
  sellerName: string;
  sellerAvatar: string | null;
  categoryName: string | null;
  startedAgo: string;
  productCount: number;
  fromPaise: number | null;
  thumbnailUrl: string | null;
};

/**
 * Discover-grid tile: image-first (thumbnails are mandatory for new streams),
 * LIVE + started-ago on top, seller identity + category + pricing below.
 * Locked 3:4 aspect so cards never jump while images load.
 */
export function StreamCard({ stream }: { stream: DiscoverStream }) {
  return (
    <Link
      href={`/live/${stream.id}`}
      className="group relative block aspect-[3/4] overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-surface-2 via-surface to-black/70 shadow-card transition-all duration-200 hover:shadow-pop active:scale-[0.98]"
    >
      {stream.thumbnailUrl ? (
        <Image
          src={stream.thumbnailUrl}
          alt={`${stream.sellerName}'s live stream`}
          fill
          sizes="(max-width: 448px) 50vw, 224px"
          className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-4xl opacity-40 transition-opacity group-hover:opacity-60">
          🎥
        </div>
      )}

      {/* Top row: LIVE + started ago */}
      <div className="absolute inset-x-2.5 top-2.5 flex items-center justify-between">
        <LiveBadge />
        <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
          {stream.startedAgo}
        </span>
      </div>

      {/* Bottom info */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent p-2.5 pt-10">
        <div className="flex items-center gap-1.5">
          <span className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full border border-white/30 bg-primary">
            {stream.sellerAvatar ? (
              <Image
                src={stream.sellerAvatar}
                alt={stream.sellerName}
                fill
                sizes="24px"
                className="object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[10px] font-bold uppercase text-white">
                {stream.sellerName.slice(0, 1)}
              </span>
            )}
          </span>
          <p className="min-w-0 truncate text-sm font-semibold text-white">
            @{stream.sellerName}
          </p>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {stream.categoryName ? (
            <span className="rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur">
              {stream.categoryName}
            </span>
          ) : null}
          <span className="text-[10px] text-white/60">
            {stream.productCount}{" "}
            {stream.productCount === 1 ? "product" : "products"}
            {stream.fromPaise !== null
              ? ` · from ${formatPrice(stream.fromPaise)}`
              : ""}
          </span>
        </div>
      </div>
    </Link>
  );
}
