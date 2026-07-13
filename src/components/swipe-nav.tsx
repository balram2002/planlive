"use client";

import { useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { haptics } from "@/lib/haptics";

const MIN_DX = 72; // px of horizontal travel to count as a swipe
const MAX_DT = 600; // ms — quick flicks only
const DOMINANCE = 2; // horizontal must beat vertical by this factor

/**
 * Swipe left/right anywhere in the wrapped content to move between top-level
 * tabs (mobile gesture navigation). Deliberately conservative:
 * - only fires when the CURRENT path is one of `routes` (never on detail pages),
 * - ignores gestures starting on horizontally scrollable areas, inputs, or
 *   anything marked data-no-swipe (product rail, chat, tables),
 * - quick, clearly-horizontal flicks only, so vertical scrolling never fights it.
 */
export function SwipeNav({
  routes,
  children,
  className,
}: {
  routes: string[];
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const start = useRef<{ x: number; y: number; t: number } | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length !== 1) {
      start.current = null;
      return;
    }
    const target = e.target as Element;
    if (
      target.closest(
        "[data-no-swipe], input, textarea, select, [contenteditable]",
      )
    ) {
      start.current = null;
      return;
    }
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  }

  function onTouchEnd(e: React.TouchEvent) {
    const s = start.current;
    start.current = null;
    if (!s) return;

    const idx = routes.indexOf(pathname);
    if (idx === -1) return; // only swipe between top-level tabs

    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    const dt = Date.now() - s.t;

    if (dt > MAX_DT) return;
    if (Math.abs(dx) < MIN_DX) return;
    if (Math.abs(dx) < Math.abs(dy) * DOMINANCE) return;

    // Swipe left → next tab; swipe right → previous tab.
    const next = dx < 0 ? routes[idx + 1] : routes[idx - 1];
    if (!next) return;

    haptics.tap();
    router.push(next);
  }

  return (
    <div
      className={className}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {children}
    </div>
  );
}
