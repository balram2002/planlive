"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import { LiveBadge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/format";
import { haptics } from "@/lib/haptics";

export type PlaySlide = {
  id: string;
  title: string | null;
  sellerId: string;
  sellerName: string;
  sellerAvatar: string | null;
  categoryName: string | null;
  startedAgo: string;
  followers: number;
  productCount: number;
  fromPaise: number | null;
  thumbnailUrl: string | null;
};

/**
 * TikTok-style vertical feed of live streams: full-height slides with
 * CSS scroll-snap (native momentum) + spring entrance animations as each
 * slide scrolls into view. Tap → the live room.
 */
export function PlayFeed({ slides }: { slides: PlaySlide[] }) {
  return (
    // absolute-inset scroll container: its height is definite (from the
    // relative flex-1 parent), so the h-full slides always fill the screen —
    // percentage heights through flex/min-h chains resolve to 0 otherwise.
    <div
      data-no-swipe
      className="no-scrollbar absolute inset-0 snap-y snap-mandatory overflow-y-auto overscroll-contain"
    >
      {slides.map((slide) => (
        <section
          key={slide.id}
          className="relative h-full snap-start snap-always overflow-hidden bg-black"
        >
          {/* Backdrop — slow settle-zoom that re-plays entering from either
              direction (whileInView reverses on exit, so up- and down-scroll
              both feel alive). */}
          <motion.div
            initial={{ scale: 1.1, opacity: 0.6 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ amount: 0.45 }}
            transition={{ type: "spring", stiffness: 90, damping: 22 }}
            className="absolute inset-0 will-change-transform"
          >
            {slide.thumbnailUrl ? (
              <Image
                src={slide.thumbnailUrl}
                alt=""
                fill
                sizes="448px"
                className="object-cover"
                priority={slides.indexOf(slide) === 0}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-surface-2 to-black text-6xl opacity-40">
                🎥
              </div>
            )}
          </motion.div>
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/85" />

          {/* Top row — drops in from above, lifts away on exit. */}
          <motion.div
            initial={{ opacity: 0, y: -28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ amount: 0.45 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            className="absolute inset-x-0 top-0 flex items-center justify-between p-4"
          >
            <LiveBadge />
            <span className="rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
              {slide.startedAgo}
            </span>
          </motion.div>

          {/* Bottom info — springs up on enter, sinks back on exit. */}
          <motion.div
            initial={{ opacity: 0, y: 56, scale: 0.98 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ amount: 0.45 }}
            transition={{
              type: "spring",
              stiffness: 260,
              damping: 28,
              delay: 0.05,
            }}
            className="absolute inset-x-0 bottom-0 p-5 pb-6"
          >
            <Link
              href={`/seller/${slide.sellerId}`}
              className="flex items-center gap-2.5"
            >
              <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border-2 border-white/40 bg-primary">
                {slide.sellerAvatar ? (
                  <Image
                    src={slide.sellerAvatar}
                    alt={slide.sellerName}
                    fill
                    sizes="44px"
                    className="object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-sm font-bold uppercase text-white">
                    {slide.sellerName.slice(0, 1)}
                  </span>
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-base font-bold text-white">
                  @{slide.sellerName}
                </span>
                <span className="text-xs text-white/60">
                  {slide.followers}{" "}
                  {slide.followers === 1 ? "follower" : "followers"}
                  {slide.categoryName ? ` · ${slide.categoryName}` : ""}
                </span>
              </span>
            </Link>

            {slide.title ? (
              <p className="mt-2.5 line-clamp-2 text-lg font-bold leading-snug text-white">
                {slide.title}
              </p>
            ) : null}
            <p className="mt-1.5 text-sm text-white/80">
              {slide.productCount}{" "}
              {slide.productCount === 1 ? "product" : "products"} live
              {slide.fromPaise !== null
                ? ` · from ${formatPrice(slide.fromPaise)}`
                : ""}
            </p>

            <motion.div whileTap={{ scale: 0.97 }} className="mt-3">
              <Link
                href={`/live/${slide.id}`}
                onClick={() => haptics.impact()}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-base font-bold text-white shadow-[0_4px_24px_rgb(225_29_72/0.45)]"
              >
                ▶ Watch live
              </Link>
            </motion.div>
          </motion.div>

          {/* Scroll hint on the first slide */}
          {slides.indexOf(slide) === 0 && slides.length > 1 ? (
            <motion.div
              aria-hidden
              animate={{ y: [0, 6, 0], opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 1.8 }}
              className="absolute bottom-28 left-1/2 -translate-x-1/2 text-white/70"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </motion.div>
          ) : null}
        </section>
      ))}
    </div>
  );
}
