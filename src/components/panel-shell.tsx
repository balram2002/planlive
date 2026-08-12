"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { ThemeToggle } from "@/components/theme-toggle";
import { MenuSheet } from "@/components/menu-sheet";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/cn";

export type PanelNavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Only mark active on exact match (for index routes like /admin). */
  exact?: boolean;
};

const DRAWER_WIDTH = 288; // w-72

/**
 * Responsive panel shell shared by the seller and admin areas.
 * - Desktop (lg+): fixed sidebar + full-width content area.
 * - Mobile: sticky top bar with a hamburger that opens a drag-dismissable
 *   drawer. A thin left-edge strip opens it by swipe, matching the gesture
 *   people already expect from native apps.
 */
export function PanelShell({
  brand,
  brandHref,
  accent,
  themeClass,
  items,
  children,
}: {
  brand: string;
  brandHref: string;
  /** Small label chip next to the brand, e.g. "Seller" / "Admin". */
  accent: string;
  /** Area accent scope, e.g. "theme-seller" | "theme-admin". */
  themeClass?: string;
  items: PanelNavItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isActive = (item: PanelNavItem) =>
    item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + "/");

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // Navigating always dismisses the drawer — otherwise tapping a link leaves
  // it hanging over the page it just opened. Render-phase adjustment rather
  // than an effect (react.dev "adjusting state when props change"), so it's
  // already closed on the first paint of the new route.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setDrawerOpen(false);
  }

  // Escape closes it, matching every other overlay in the app.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  // Lock the page behind the drawer so the backdrop doesn't scroll with it.
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  /**
   * Edge swipe to open.
   *
   * This was a 20px Framer drag-strip pinned to the left edge, and it never
   * fired: that is exactly where iOS Safari and Android Chrome put their own
   * back-navigation gesture, so the OS consumed the touch before the element
   * saw it. Native listeners on the window let us watch a wider zone and
   * decide from the gesture's shape instead of relying on the browser
   * handing us a drag on a sliver.
   *
   * Deliberately passive: we never preventDefault, so vertical scrolling
   * stays perfectly smooth and the browser's own gesture still wins if the
   * user starts right on the bezel.
   */
  useEffect(() => {
    // Desktop has a permanent sidebar; no gesture needed.
    if (typeof window === "undefined") return;

    const EDGE_ZONE = 32; // px from the left edge that counts as "from edge"
    const DISTANCE = 60; // px of horizontal travel to commit
    const SLOPE = 1.5; // horizontal must dominate vertical by this factor

    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      // Opening starts near the edge; closing can start anywhere in the drawer.
      tracking = drawerOpen || startX <= EDGE_ZONE;
    };

    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      // A scroll that happens to drift sideways must not open the drawer.
      if (Math.abs(dx) < DISTANCE || Math.abs(dx) < dy * SLOPE) return;

      if (dx > 0 && !drawerOpen) {
        haptics.tap();
        setDrawerOpen(true);
      } else if (dx < 0 && drawerOpen) {
        haptics.tap();
        setDrawerOpen(false);
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [drawerOpen]);

  /** Close when dragged far enough left, or flicked left at any distance. */
  const onDragEnd = (_e: unknown, info: PanInfo) => {
    if (info.offset.x < -DRAWER_WIDTH / 3 || info.velocity.x < -400) {
      haptics.tap();
      setDrawerOpen(false);
    }
  };

  const navList = (
    <nav className="flex-1 space-y-1 overflow-y-auto p-3">
      {items.map((item) => {
        const active = isActive(item);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => haptics.tap()}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted hover:bg-surface-2 hover:text-foreground active:scale-[0.98]",
            )}
          >
            {active ? (
              <motion.span
                layoutId="panel-nav-active"
                className="absolute inset-y-1 left-0 w-1 rounded-full bg-primary"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            ) : null}
            <span
              className={cn(
                "shrink-0 transition-transform duration-200",
                !active && "group-hover:scale-110",
              )}
            >
              {item.icon}
            </span>
            <span className="min-w-0 truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className={cn("min-h-dvh bg-background", themeClass)}>
      {/* ---------- Desktop sidebar ---------- */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-surface lg:flex">
        <Link
          href={brandHref}
          className="flex h-16 items-center gap-2 border-b border-border px-5"
        >
          <span className="text-lg font-bold tracking-tight">{brand}</span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
            {accent}
          </span>
        </Link>

        {navList}

        <div className="flex items-center justify-between border-t border-border p-4">
          <UserButton appearance={{ elements: { avatarBox: "h-8 w-8" } }} />
          <ThemeToggle />
        </div>
      </aside>

      {/* ---------- Mobile top bar ---------- */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
        <div className="flex h-14 items-center gap-2 px-3">
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            onClick={() => {
              haptics.tap();
              setDrawerOpen(true);
            }}
            className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground transition-all duration-200 hover:bg-surface-2 active:scale-90"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-5 w-5"
              aria-hidden
            >
              <path
                d="M4 7h16M4 12h16M4 17h16"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <Link href={brandHref} className="flex min-w-0 items-center gap-2">
            <span className="truncate text-lg font-bold tracking-tight">
              {brand}
            </span>
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
              {accent}
            </span>
          </Link>

          <div className="ml-auto shrink-0">
            <UserButton appearance={{ elements: { avatarBox: "h-8 w-8" } }} />
          </div>
        </div>
      </header>

      {/* ---------- Mobile drawer ---------- */}
      <AnimatePresence>
        {drawerOpen ? (
          <>
            <motion.button
              aria-label="Close menu"
              onClick={closeDrawer}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] lg:hidden"
            />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label={`${brand} menu`}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ left: 0.6, right: 0 }}
              onDragEnd={onDragEnd}
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 400, damping: 40 }}
              className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85%] flex-col border-r border-border bg-surface shadow-pop lg:hidden"
            >
              <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-4 pt-[env(safe-area-inset-top)]">
                <Link
                  href={brandHref}
                  className="flex min-w-0 items-center gap-2"
                >
                  <span className="truncate text-lg font-bold tracking-tight">
                    {brand}
                  </span>
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
                    {accent}
                  </span>
                </Link>
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={closeDrawer}
                  className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-all hover:bg-surface-2 hover:text-foreground active:scale-90"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className="h-4 w-4"
                    aria-hidden
                  >
                    <path
                      d="m6 6 12 12M18 6 6 18"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>

              {navList}

              <div className="shrink-0 border-t border-border p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
                <button
                  type="button"
                  onClick={() => {
                    haptics.tap();
                    setDrawerOpen(false);
                    setMenuOpen(true);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className="h-5 w-5 shrink-0"
                    aria-hidden
                  >
                    <path
                      d="M4 7h16M4 12h16M4 17h10"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                  Account &amp; more
                </button>

                <div className="mt-2 flex items-center justify-between rounded-xl px-3 py-2">
                  <span className="text-sm font-medium text-muted">Theme</span>
                  <ThemeToggle />
                </div>

                {/* Affordance for the gesture, so it's discoverable. */}
                <p className="mt-1 px-3 text-[10px] text-faint">
                  Swipe left to close
                </p>
              </div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      {/* ---------- Content ---------- */}
      <main className="lg:pl-60">
        <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-4 lg:px-8 lg:pt-8">
          {children}
        </div>
      </main>

      <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}
