"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { ThemeToggle } from "@/components/theme-toggle";
import { MenuSheet } from "@/components/menu-sheet";
import { SwipeNav } from "@/components/swipe-nav";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/cn";

export type PanelNavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Only mark active on exact match (for index routes like /admin). */
  exact?: boolean;
};

/**
 * Responsive panel shell shared by the seller and admin areas.
 * - Desktop (lg+): fixed sidebar + full-width content area.
 * - Mobile: sticky top bar + bottom tab bar (native-app feel).
 */
export function PanelShell({
  brand,
  brandHref,
  accent,
  items,
  children,
}: {
  brand: string;
  brandHref: string;
  /** Small label chip next to the brand, e.g. "Seller" / "Admin". */
  accent: string;
  items: PanelNavItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (item: PanelNavItem) =>
    item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + "/");

  return (
    <div className="min-h-dvh bg-background">
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

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted hover:bg-surface-2 hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "transition-transform duration-200",
                    !active && "group-hover:scale-110",
                  )}
                >
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center justify-between border-t border-border p-4">
          <UserButton appearance={{ elements: { avatarBox: "h-8 w-8" } }} />
          <ThemeToggle />
        </div>
      </aside>

      {/* ---------- Mobile top bar (theme toggle lives in the More sheet) ---------- */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Link href={brandHref} className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight">{brand}</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
              {accent}
            </span>
          </Link>
          <UserButton appearance={{ elements: { avatarBox: "h-8 w-8" } }} />
        </div>
      </header>

      {/* ---------- Content (swipe between tabs on mobile) ---------- */}
      <main className="lg:pl-60">
        <SwipeNav routes={items.map((i) => i.href)}>
          <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-4 lg:px-8 lg:pb-10 lg:pt-8">
            {children}
          </div>
        </SwipeNav>
      </main>

      {/* ---------- Mobile bottom tabs ---------- */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <ul className="flex items-stretch">
          {items.map((item) => {
            const active = isActive(item);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  onClick={() => haptics.tap()}
                  className={cn(
                    "relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-all duration-200 active:scale-90",
                    active ? "text-primary" : "text-faint hover:text-muted",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0 h-0.5 w-8 rounded-full bg-primary transition-all duration-300",
                      active ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0",
                    )}
                  />
                  {item.icon}
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => {
                haptics.tap();
                setMenuOpen(true);
              }}
              className="flex w-full flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-faint transition-all duration-200 hover:text-muted active:scale-90"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
                <path
                  d="M4 7h16M4 12h16M4 17h10"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              More
            </button>
          </li>
        </ul>
      </nav>

      <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}
