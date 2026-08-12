"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Scroll position memory, per URL.
 *
 * Two jobs, one store:
 *
 *  1. The sign-in round trip. SignInLink stashes the position before leaving,
 *     and it's restored when `?backTo=` brings the person back.
 *  2. Reloads and browser back/forward. A seller who refreshes a long
 *     shipments list should not be thrown back to the top of it.
 *
 * Restoring is deliberately NOT done on ordinary forward navigation. Landing
 * mid-page because you happened to visit that URL earlier in the session is
 * disorienting — a fresh navigation should start at the top, which is also
 * what the browser and Next.js already do. So restoration is gated on the
 * navigation actually being a reload or a back/forward, which the Navigation
 * Timing API reports, or on the explicit one-shot key.
 *
 * Positions are keyed by full URL (path + query), so a filtered or searched
 * view restores independently of the unfiltered one.
 */

const PREFIX = "scroll:";
/** Cap the store so a long session can't fill sessionStorage. */
const MAX_ENTRIES = 40;

function keyFor(pathname: string, query: string): string {
  return `${PREFIX}${query ? `${pathname}?${query}` : pathname}`;
}

/** True when the document was reloaded or reached via back/forward. */
function isRestoringNavigation(): boolean {
  try {
    const [entry] = performance.getEntriesByType(
      "navigation",
    ) as PerformanceNavigationTiming[];
    return entry?.type === "reload" || entry?.type === "back_forward";
  } catch {
    return false;
  }
}

/** Drops the oldest entries once the store grows past the cap. */
function trim(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(PREFIX)) keys.push(k);
    }
    if (keys.length <= MAX_ENTRIES) return;
    for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) {
      sessionStorage.removeItem(k);
    }
  } catch {
    // Storage unavailable (private mode) — nothing to trim.
  }
}

function ScrollRestorerInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  // ---- Remember, continuously ----
  useEffect(() => {
    const key = keyFor(pathname, query);
    let frame = 0;

    const save = () => {
      if (frame) return; // Coalesce to one write per frame.
      frame = requestAnimationFrame(() => {
        frame = 0;
        try {
          const y = window.scrollY;
          if (y > 0) sessionStorage.setItem(key, String(y));
          else sessionStorage.removeItem(key);
        } catch {
          // Storage unavailable — scrolling still works, just isn't remembered.
        }
      });
    };

    window.addEventListener("scroll", save, { passive: true });
    // A reload can happen without a final scroll event, so capture on the way
    // out too. `pagehide` fires on mobile Safari where `beforeunload` doesn't.
    window.addEventListener("pagehide", save);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", save);
      window.removeEventListener("pagehide", save);
      save();
      trim();
    };
  }, [pathname, query]);

  // ---- Restore, selectively ----
  useEffect(() => {
    const key = keyFor(pathname, query);
    const oneShotKey = `${key}:once`;

    let stored: string | null = null;
    let oneShot = false;
    try {
      // The sign-in flow's stash always wins and is consumed on use.
      const once = sessionStorage.getItem(oneShotKey);
      if (once !== null) {
        sessionStorage.removeItem(oneShotKey);
        stored = once;
        oneShot = true;
      } else if (isRestoringNavigation()) {
        stored = sessionStorage.getItem(key);
      }
    } catch {
      return;
    }
    if (stored === null) return;
    void oneShot;

    const y = Number(stored);
    if (!Number.isFinite(y) || y <= 0) return;

    // Two frames plus a short settle: images, fonts and streamed content all
    // change the page height, and restoring before that lands puts you in the
    // wrong place.
    let cancelled = false;
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        setTimeout(() => {
          if (!cancelled) window.scrollTo({ top: y, behavior: "instant" });
        }, 60);
      });
      void raf2;
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
    };
  }, [pathname, query]);

  return null;
}

export function ScrollRestorer() {
  return (
    <Suspense fallback={null}>
      <ScrollRestorerInner />
    </Suspense>
  );
}
