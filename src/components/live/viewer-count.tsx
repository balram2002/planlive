"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useParticipants } from "@livekit/components-react";
import { cn } from "@/lib/cn";

/**
 * Live participant count with animated changes: the number slides/pops on
 * change and the pill flashes soft green on increase (subtler on decrease).
 * transform/opacity only.
 */
export function ViewerCount() {
  const participants = useParticipants();
  const count = participants.length;

  const prev = useRef(count);
  const [direction, setDirection] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (count === prev.current) return;
    setDirection(count > prev.current ? "up" : "down");
    prev.current = count;
    const t = setTimeout(() => setDirection(null), 700);
    return () => clearTimeout(t);
  }, [count]);

  return (
    <motion.span
      animate={{ scale: direction ? [1, 1.12, 1] : 1 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={cn(
        "inline-flex items-center gap-1.5 overflow-hidden rounded-full px-2.5 py-1 text-xs font-medium text-white backdrop-blur transition-colors duration-500",
        direction === "up"
          ? "bg-emerald-500/60"
          : direction === "down"
            ? "bg-black/70"
            : "bg-black/60",
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5 shrink-0" aria-hidden>
        <path
          d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      </svg>
      <span className="relative inline-flex h-4 min-w-3 items-center justify-center">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={count}
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 32 }}
            className="tabular-nums"
          >
            {count}
          </motion.span>
        </AnimatePresence>
      </span>
    </motion.span>
  );
}
