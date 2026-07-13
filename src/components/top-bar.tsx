import Link from "next/link";
import { Show, UserButton } from "@clerk/nextjs";
import { LiveBadge } from "@/components/ui/badge";
import { SignInLink } from "@/components/auth/sign-in-link";

export function TopBar() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
        <Link
          href="/"
          className="flex items-center gap-2 transition-opacity active:opacity-70"
        >
          <span className="text-lg font-bold tracking-tight">LiveShop</span>
          <LiveBadge />
        </Link>

        <div className="flex items-center gap-2.5">
          <Show when="signed-in">
            <UserButton appearance={{ elements: { avatarBox: "h-8 w-8" } }} />
          </Show>
          <Show when="signed-out">
            {/* Header entry point → dedicated sign-in page (backTo captured). */}
            <SignInLink className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background transition-all duration-200 hover:opacity-90 active:scale-[0.97]">
              Sign in
            </SignInLink>
          </Show>
        </div>
      </div>
    </header>
  );
}
