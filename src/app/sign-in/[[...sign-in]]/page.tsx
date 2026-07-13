import type { Metadata } from "next";
import Link from "next/link";
import { SignIn } from "@clerk/nextjs";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false },
};

/** Only same-app relative paths — never an absolute URL (open-redirect guard). */
function safeBackTo(value: string | undefined): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ backTo?: string }>;
}) {
  const { backTo } = await searchParams;
  const redirectTo = safeBackTo(backTo);

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* Brand pane */}
      <div className="relative flex flex-col justify-center overflow-hidden border-b border-border bg-surface px-8 py-10 lg:w-1/2 lg:border-b-0 lg:border-r lg:px-16">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-12 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
        <Link href="/" className="relative mb-6 inline-flex items-center gap-2">
          <span className="text-2xl font-bold tracking-tight">LiveShop</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-live px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-live-pulse" />
            Live
          </span>
        </Link>
        <h1 className="relative max-w-md text-3xl font-bold leading-tight tracking-tight lg:text-4xl">
          Shop live.
          <br />
          Buy before it&apos;s gone.
        </h1>
        <p className="relative mt-3 max-w-sm text-sm text-muted">
          Sign in to reserve products the second they drop, chat with sellers,
          and track your orders.
        </p>
      </div>

      {/* Auth pane — Clerk styled by the app-wide CSS-variable appearance. */}
      <div className="animate-page-in flex flex-1 items-center justify-center px-4 py-10">
        <SignIn fallbackRedirectUrl={redirectTo} signUpFallbackRedirectUrl={redirectTo} />
      </div>
    </div>
  );
}
