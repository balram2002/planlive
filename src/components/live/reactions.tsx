"use client";

import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useDataChannel } from "@livekit/components-react";
import { haptics } from "@/lib/haptics";

const EMOJIS = ["❤️", "🔥", "👏", "😍"];
const MAX_FLOATS = 24;

type Float = {
  id: number;
  emoji: string;
  x0: number;
  drift1: number;
  drift2: number;
  rotate: number;
  duration: number;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Reaction engine: listens for {type:'reaction'} data messages, keeps the
 * floating-bubble state, and exposes `react()` to send one (with local echo
 * + haptic). UI is rendered separately by <FloatingReactions/>.
 */
export function useReactions() {
  const [floats, setFloats] = useState<Float[]>([]);
  const nextId = useRef(0);

  const spawn = useCallback((emoji: string) => {
    if (!EMOJIS.includes(emoji)) return;
    const id = nextId.current++;
    setFloats((prev) => {
      const next = [
        ...prev,
        {
          id,
          emoji,
          x0: Math.random() * 44,
          drift1: (Math.random() - 0.5) * 48,
          drift2: (Math.random() - 0.5) * 64,
          rotate: (Math.random() - 0.5) * 40,
          duration: 2 + Math.random() * 0.8,
        },
      ];
      return next.length > MAX_FLOATS ? next.slice(-MAX_FLOATS) : next;
    });
  }, []);

  const remove = useCallback((id: number) => {
    setFloats((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const onData = useCallback(
    (msg: { payload: Uint8Array }) => {
      try {
        const data = JSON.parse(decoder.decode(msg.payload));
        if (data?.type === "reaction" && typeof data.emoji === "string") {
          spawn(data.emoji);
        }
      } catch {
        // Not for us.
      }
    },
    [spawn],
  );

  const { send } = useDataChannel(onData);

  const react = useCallback(
    (emoji: string = "❤️") => {
      haptics.tap();
      spawn(emoji); // local echo
      // Lossy is fine — a dropped reaction is invisible; keeps the room light.
      send(encoder.encode(JSON.stringify({ type: "reaction", emoji })), {
        reliable: false,
      }).catch(() => {
        // Reactions are best-effort by nature.
      });
    },
    [send, spawn],
  );

  return { floats, remove, react };
}

/**
 * The floating bubble layer (Instagram/TikTok style): scale up, rise with a
 * randomized wobble + rotation, fade near the top. transform/opacity only;
 * bubbles remove themselves from state when their animation completes.
 */
export function FloatingReactions({
  floats,
  onDone,
  className = "pointer-events-none absolute bottom-28 right-4 z-10 h-0 w-16",
}: {
  floats: Float[];
  onDone: (id: number) => void;
  className?: string;
}) {
  return (
    <div aria-hidden className={className}>
      <AnimatePresence>
        {floats.map((f) => (
          <motion.span
            key={f.id}
            className="absolute bottom-0 text-2xl will-change-transform"
            style={{ left: f.x0 }}
            initial={{ opacity: 0, scale: 0.4, y: 0, x: 0, rotate: 0 }}
            animate={{
              opacity: [0, 1, 1, 0],
              scale: [0.4, 1.15, 1, 0.9],
              y: [0, -140, -280, -420],
              x: [0, f.drift1, f.drift2, f.drift1 / 2],
              rotate: [0, f.rotate, -f.rotate / 2, f.rotate / 3],
            }}
            transition={{ duration: f.duration, ease: "easeOut" }}
            onAnimationComplete={() => onDone(f.id)}
          >
            {f.emoji}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}
