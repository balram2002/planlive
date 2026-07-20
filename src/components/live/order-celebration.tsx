"use client";

import { useEffect, useMemo } from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { playCelebration } from "@/lib/celebrate-sound";

export type Celebration = {
  id: number;
  buyerName: string;
  productTitle: string;
  productImageUrl: string | null;
  quantity: number;
};

/**
 * Deterministic 0..1 "randomness" from a seed + channel. Pure, so it's safe
 * to call while rendering — unlike Math.random(), which React's purity rules
 * (correctly) reject.
 */
function noise(seed: number, channel: number): number {
  const x = Math.sin(seed * 12.9898 + channel * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const VISIBLE_MS = 3600;
const CONFETTI_COUNT = 14;
const CONFETTI_COLORS = ["#e11d48", "#f59e0b", "#10b981", "#3b82f6", "#a855f7"];

/**
 * Centre-screen "someone just bought this" moment.
 *
 * Kept minimal on purpose: one card, a light confetti burst, and a short
 * chime. It sits above the video but is fully pointer-events-none, so it
 * never intercepts a tap on the stream, the chat, or the buy button
 * underneath — the celebration is something you watch, not something you
 * have to dismiss.
 */
export function OrderCelebration({
  celebration,
  onDone,
}: {
  celebration: Celebration | null;
  onDone: () => void;
}) {
  const reduceMotion = useReducedMotion();

  const id = celebration?.id ?? null;

  // Confetti scatter is *derived* from the burst id rather than sampled from
  // Math.random(): rendering stays pure (so a re-render can't reshuffle
  // pieces mid-flight), while each burst still looks different from the last.
  const confetti = useMemo(
    () =>
      Array.from({ length: CONFETTI_COUNT }, (_, i) => {
        const seed = (id ?? 0) * 977 + i;
        return {
          key: i,
          color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          angle: (i / CONFETTI_COUNT) * Math.PI * 2,
          distance: 90 + noise(seed, 1) * 70,
          rotate: (noise(seed, 2) - 0.5) * 540,
          delay: noise(seed, 3) * 0.08,
          size: 5 + noise(seed, 4) * 5,
        };
      }),
    [id],
  );

  useEffect(() => {
    if (id === null) return;
    playCelebration();
    const timer = setTimeout(onDone, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [id, onDone]);

  return (
    <AnimatePresence>
      {celebration ? (
        // motion.div (not a plain div): AnimatePresence only defers unmount
        // for motion children, and without that the inner exit animations
        // would be cut off the instant the celebration clears.
        <motion.div
          key={celebration.id}
          aria-live="polite"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center px-8"
        >
          {/* Soft radial wash so the card reads over any video content. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.55),transparent_70%)]"
          />

          {/* Confetti burst */}
          {!reduceMotion ? (
            <div className="absolute" aria-hidden>
              {confetti.map((piece) => (
                <motion.span
                  key={piece.key}
                  className="absolute rounded-[2px] will-change-transform"
                  style={{
                    width: piece.size,
                    height: piece.size * 1.6,
                    background: piece.color,
                  }}
                  initial={{ opacity: 0, x: 0, y: 0, scale: 0.6, rotate: 0 }}
                  animate={{
                    opacity: [0, 1, 1, 0],
                    x: Math.cos(piece.angle) * piece.distance,
                    y: [
                      0,
                      Math.sin(piece.angle) * piece.distance,
                      Math.sin(piece.angle) * piece.distance + 120,
                    ],
                    scale: [0.6, 1, 0.9],
                    rotate: piece.rotate,
                  }}
                  transition={{
                    duration: 1.5,
                    delay: piece.delay,
                    ease: "easeOut",
                  }}
                />
              ))}
            </div>
          ) : null}

          <motion.div
            initial={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.82, y: 12 }
            }
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={
              reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: -8 }
            }
            transition={{ type: "spring", stiffness: 320, damping: 24 }}
            className="relative flex w-full max-w-[280px] flex-col items-center rounded-3xl border border-white/15 bg-black/70 px-5 py-6 text-center backdrop-blur-xl"
          >
            <motion.span
              initial={reduceMotion ? false : { scale: 0, rotate: -25 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 15,
                delay: 0.08,
              }}
              className="text-4xl"
              aria-hidden
            >
              🎉
            </motion.span>

            <p className="mt-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
              Just ordered
            </p>

            <p className="mt-1.5 text-base font-bold leading-snug text-white">
              {celebration.buyerName}
            </p>

            <div className="mt-3 flex w-full items-center gap-2.5 rounded-2xl bg-white/10 p-2">
              <span className="relative aspect-square w-11 shrink-0 overflow-hidden rounded-xl bg-white/10">
                {celebration.productImageUrl ? (
                  <Image
                    src={celebration.productImageUrl}
                    alt=""
                    fill
                    sizes="44px"
                    className="object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-lg">
                    🏷️
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-xs font-medium text-white">
                  {celebration.productTitle}
                </span>
                {celebration.quantity > 1 ? (
                  <span className="text-[10px] text-white/60">
                    × {celebration.quantity}
                  </span>
                ) : null}
              </span>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
