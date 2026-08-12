import type { Metadata } from "next";
import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { safeBackTo, signInPath } from "@/lib/back-to";

export const metadata: Metadata = {
  title: "Create account",
  robots: { index: false },
};

/**
 * Sign-up mirrors sign-in, including `?backTo=`.
 *
 * Without it, anyone who followed a shared live-room link and chose "create
 * account" was dropped on the homepage afterwards, having lost the stream
 * they came for.
 */
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ backTo?: string; redirect_url?: string }>;
}) {
  const params = await searchParams;
  const target = safeBackTo(params.backTo ?? params.redirect_url, "");
  const redirectTo = target || "/";

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* Brand pane */}
      <div className="relative flex flex-col justify-center overflow-hidden border-b border-border bg-surface px-8 py-10 lg:w-1/2 lg:border-b-0 lg:border-r lg:px-16">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-12 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
        <Link href="/" className="relative mb-6 inline-flex items-center gap-2">
          <span className="text-2xl font-bold tracking-tight">liveWAB</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-live px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-live-pulse" />
            Live
          </span>
        </Link>
        <h1 className="relative max-w-md text-3xl font-bold leading-tight tracking-tight lg:text-4xl">
          Join the drop.
          <br />
          Start shopping live.
        </h1>
        <p className="relative mt-3 max-w-sm text-sm text-muted">
          Create an account to reserve products, follow your favourite sellers,
          and track every order.
        </p>
      </div>

      {/* Auth pane — Clerk styled by the app-wide CSS-variable appearance. */}
      <div className="animate-page-in flex flex-1 items-center justify-center px-4 py-10">
        {/* Forced for the same reason as sign-in — see the note there. */}
        <SignUp
          {...(target
            ? {
                forceRedirectUrl: target,
                signInForceRedirectUrl: target,
              }
            : {})}
          signInUrl={signInPath(redirectTo)}
        />
      </div>
    </div>
  );
}
