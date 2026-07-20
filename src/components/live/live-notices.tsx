"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";

export type NoticeKind = "join" | "like" | "share" | "follow";

export type Notice = {
  id: number;
  kind: NoticeKind;
  /** Who triggered it — already display-formatted, no leading "@". */
  name: string;
};

const MAX_VISIBLE = 3;
const LIFETIME_MS = 4200;

const copy: Record<NoticeKind, { emoji: string; verb: string; tint: string }> = {
  join: { emoji: "👋", verb: "joined", tint: "text-white" },
  like: { emoji: "❤️", verb: "liked the stream", tint: "text-white" },
  share: { emoji: "🔗", verb: "shared the stream", tint: "text-white" },
  follow: { emoji: "⭐", verb: "followed the seller", tint: "text-white" },
};

/**
 * Rolling activity feed for the live room ("Ritu joined", "Amit liked…").
 *
 * Notices expire on a timer rather than on animation completion, so a burst
 * of activity can't wedge the queue, and only the newest few are ever mounted
 * — a busy room stays cheap to render.
 */
export function useLiveNotices() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const nextId = useRef(0);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const push = useCallback((kind: NoticeKind, name: string) => {
    const id = nextId.current++;
    setNotices((prev) => [...prev, { id, kind, name }].slice(-MAX_VISIBLE));

    const timer = setTimeout(() => {
      setNotices((prev) => prev.filter((n) => n.id !== id));
      timers.current.delete(timer);
    }, LIFETIME_MS);
    timers.current.add(timer);
  }, []);

  // Clear pending timers if the room unmounts mid-flight.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  return { notices, push };
}

/** The stacked pills themselves — bottom-left, above the chat dock. */
export function LiveNotices({
  notices,
  className,
}: {
  notices: Notice[];
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      aria-live="polite"
      className={cn(
        // top-24 clears the header chips and the "tap for sound" button.
        "pointer-events-none absolute left-3 top-24 z-20 flex w-[62%] max-w-[260px] flex-col items-start gap-1.5",
        className,
      )}
    >
      <AnimatePresence initial={false}>
        {notices.map((notice) => {
          const { emoji, verb, tint } = copy[notice.kind];
          return (
            <motion.div
              key={notice.id}
              layout={!reduceMotion}
              initial={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, x: -24, scale: 0.9 }
              }
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, x: -16, scale: 0.95 }
              }
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="flex max-w-full items-center gap-1.5 rounded-full border border-white/10 bg-black/55 py-1 pl-1.5 pr-2.5 backdrop-blur-md"
            >
              <span className="text-sm leading-none" aria-hidden>
                {emoji}
              </span>
              <span className={cn("min-w-0 truncate text-[11px]", tint)}>
                <span className="font-semibold">{notice.name}</span>{" "}
                <span className="text-white/70">{verb}</span>
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
