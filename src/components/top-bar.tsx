import Link from "next/link";
import { Show, UserButton } from "@clerk/nextjs";
import { LiveBadge } from "@/components/ui/badge";
import { SignInLink } from "@/components/auth/sign-in-link";
import type { NavRole } from "@/components/bottom-nav";

/**
 * Shop header. Buyers/guests get the master search bar (streams, categories,
 * sellers) with account controls on the right; sellers/admins get the brand
 * header (their tooling lives in the panels).
 */
export function TopBar({ role = null }: { role?: NavRole }) {
  const buyerMode = role !== "SELLER" && role !== "ADMIN";

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-md items-center gap-2.5 px-4">
        {buyerMode ? (
          <>
            <Link
              href="/"
              aria-label="LiveShop home"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-black text-white transition-opacity active:opacity-80"
            >
              L
            </Link>

            {/* Master search — streams, categories, sellers. */}
            <form action="/search" className="min-w-0 flex-1">
              <div className="relative">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
                >
                  <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.8" />
                  <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                <input
                  type="search"
                  name="q"
                  placeholder="Search lives, categories, sellers…"
                  className="h-9 w-full rounded-full border border-border bg-surface-2 pl-9 pr-3 text-sm placeholder:text-faint focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/25"
                />
              </div>
            </form>

            <div className="flex shrink-0 items-center">
              <Show when="signed-in">
                <UserButton appearance={{ elements: { avatarBox: "h-8 w-8" } }} />
              </Show>
              <Show when="signed-out">
                <SignInLink className="rounded-full bg-foreground px-3.5 py-1.5 text-sm font-medium text-background transition-all duration-200 hover:opacity-90 active:scale-[0.97]">
                  Sign in
                </SignInLink>
              </Show>
            </div>
          </>
        ) : (
          <>
            <Link
              href="/"
              className="flex items-center gap-2 transition-opacity active:opacity-70"
            >
              <span className="text-lg font-bold tracking-tight">LiveShop</span>
              <LiveBadge />
            </Link>
            <div className="ml-auto flex items-center gap-2.5">
              <UserButton appearance={{ elements: { avatarBox: "h-8 w-8" } }} />
            </div>
          </>
        )}
      </div>
    </header>
  );
}
