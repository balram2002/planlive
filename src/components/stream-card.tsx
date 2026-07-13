import Image from "next/image";
import Link from "next/link";
import { LiveBadge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/format";

export type DiscoverStream = {
  id: string;
  sellerName: string;
  productCount: number;
  fromPaise: number | null;
  thumbnailUrl: string | null;
};

/** Discover-grid tile linking into a live stream. Locked 3:4 aspect ratio so
 * cards never jump while thumbnails load; gradient fallback without one. */
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

      <div className="absolute left-2.5 top-2.5">
        <LiveBadge />
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-3 pt-10">
        <p className="truncate text-sm font-semibold text-white">
          @{stream.sellerName}
        </p>
        <p className="mt-0.5 text-xs text-white/60">
          {stream.productCount}{" "}
          {stream.productCount === 1 ? "product" : "products"}
          {stream.fromPaise !== null
            ? ` · from ${formatPrice(stream.fromPaise)}`
            : ""}
        </p>
      </div>
    </Link>
  );
}
