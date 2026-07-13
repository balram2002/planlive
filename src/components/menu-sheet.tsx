"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Show, SignOutButton, UserButton } from "@clerk/nextjs";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignInLink } from "@/components/auth/sign-in-link";

type SheetLink = { href: string; label: string; emoji: string };

/**
 * Bottom sheet for mobile: theme switcher (kept out of the header by design),
 * quick links, and account controls. Spring slide-up, backdrop fade.
 */
export function MenuSheet({
  open,
  onClose,
  links = [],
}: {
  open: boolean;
  onClose: () => void;
  links?: SheetLink[];
}) {
  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            aria-label="Close menu"
            className="fixed inset-0 z-40 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-label="Menu"
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-3xl border border-b-0 border-border bg-surface p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-pop"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />

            {/* Theme */}
            <div className="flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3">
              <span className="text-sm font-medium">Appearance</span>
              <ThemeToggle />
            </div>

            {/* Links */}
            {links.length > 0 ? (
              <nav className="mt-3 space-y-1">
                {links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={onClose}
                    className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-colors hover:bg-surface-2 active:scale-[0.99]"
                  >
                    <span aria-hidden>{link.emoji}</span>
                    {link.label}
                  </Link>
                ))}
              </nav>
            ) : null}

            {/* Account */}
            <div className="mt-3 border-t border-border pt-3">
              <Show when="signed-in">
                <div className="flex items-center justify-between px-4 py-2">
                  <span className="flex items-center gap-3 text-sm font-medium">
                    <UserButton
                      appearance={{ elements: { avatarBox: "h-8 w-8" } }}
                    />
                    Account
                  </span>
                  <SignOutButton>
                    <button className="text-sm font-medium text-live transition-opacity active:opacity-70">
                      Sign out
                    </button>
                  </SignOutButton>
                </div>
              </Show>
              <Show when="signed-out">
                <SignInLink
                  onNavigate={onClose}
                  className="block rounded-2xl bg-foreground px-4 py-3 text-center text-sm font-semibold text-background transition-all active:scale-[0.99]"
                >
                  Sign in
                </SignInLink>
              </Show>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
