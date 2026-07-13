"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * After returning from /sign-in (backTo flow), restores the scroll position
 * SignInLink stashed for this exact URL. Waits two frames + a small settle
 * delay so layout (fonts, images, dynamic content) has landed first.
 */
function ScrollRestorerInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams.toString();
    const key = `scroll:${query ? `${pathname}?${query}` : pathname}`;
    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem(key);
      if (stored !== null) sessionStorage.removeItem(key);
    } catch {
      return;
    }
    if (stored === null) return;

    const y = Number(stored);
    if (!Number.isFinite(y) || y <= 0) return;

    let cancelled = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (!cancelled) window.scrollTo({ top: y, behavior: "instant" });
        }, 60);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, searchParams]);

  return null;
}

export function ScrollRestorer() {
  return (
    <Suspense fallback={null}>
      <ScrollRestorerInner />
    </Suspense>
  );
}
