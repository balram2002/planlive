"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { signInPath } from "@/lib/back-to";

/**
 * Link to the dedicated /sign-in page that captures where the user was:
 * current path + query go into ?backTo=, and the scroll position is stashed
 * in sessionStorage so ScrollRestorer can put them back exactly where they
 * left off after auth.
 */
function SignInLinkInner({
  className,
  children,
  onNavigate,
}: {
  className?: string;
  children: React.ReactNode;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const query = searchParams.toString();
  const backTo = query ? `${pathname}?${query}` : pathname;

  function rememberScroll() {
    try {
      // ":once" marks this as a one-shot restore that ScrollRestorer consumes
      // on arrival, regardless of navigation type — coming back from sign-in
      // is a forward navigation, which it otherwise deliberately ignores.
      sessionStorage.setItem(`scroll:${backTo}:once`, String(window.scrollY));
    } catch {
      // Storage unavailable (private mode quirks) — backTo still works.
    }
    onNavigate?.();
  }

  return (
    <Link
      href={signInPath(backTo)}
      onClick={rememberScroll}
      className={className}
    >
      {children}
    </Link>
  );
}

export function SignInLink(props: {
  className?: string;
  children: React.ReactNode;
  onNavigate?: () => void;
}) {
  // useSearchParams needs a Suspense boundary during prerender.
  return (
    <Suspense
      fallback={
        <Link href="/sign-in" className={props.className}>
          {props.children}
        </Link>
      }
    >
      <SignInLinkInner {...props} />
    </Suspense>
  );
}
