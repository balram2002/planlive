"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { SellerApplyForm } from "@/components/seller/apply-form";
import { SignInLink } from "@/components/auth/sign-in-link";
import { haptics } from "@/lib/haptics";

type Screen = "pitch" | "form";

const perks = [
  {
    icon: "🎥",
    title: "Sell face to face",
    text: "Go live, show the product, answer questions in real time.",
  },
  {
    icon: "⚡",
    title: "Never oversell",
    text: "Stock is reserved atomically the moment a buyer taps Buy Now.",
  },
  {
    icon: "💸",
    title: "Get paid your way",
    text: "Online via Razorpay or cash on delivery — tracked per order.",
  },
];

/**
 * Buyer-facing "become a seller" funnel, in a bottom sheet over the nav.
 *
 * Two screens live inside the same drawer so the user never loses their
 * place in the app: a short pitch, then the application form itself. The
 * screens cross-fade horizontally (wizard-style) while the drawer height
 * animates to fit — so the sheet grows into the form rather than jumping.
 */
export function BecomeSellerDrawer({
  open,
  onClose,
  signedIn,
  categories = [],
}: {
  open: boolean;
  onClose: () => void;
  signedIn: boolean;
  categories?: string[];
}) {
  const [screen, setScreen] = useState<Screen>("pitch");
  const reduceMotion = useReducedMotion();

  // Always reopen on the pitch — render-phase adjustment, not an effect.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setScreen("pitch");
  }

  const slide = (direction: 1 | -1) => ({
    initial: reduceMotion ? { opacity: 0 } : { opacity: 0, x: 28 * direction },
    animate: { opacity: 1, x: 0 },
    exit: reduceMotion ? { opacity: 0 } : { opacity: 0, x: -28 * direction },
  });

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            aria-label="Close"
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Become a seller"
            data-no-swipe
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[86dvh] max-w-md overflow-y-auto no-scrollbar rounded-t-3xl border border-b-0 border-border bg-surface pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-pop"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
          >
            <div className="sticky top-0 z-10 bg-surface/95 px-5 pt-3 backdrop-blur">
              <div className="mx-auto h-1 w-10 rounded-full bg-border" />
              <div className="flex items-center justify-between pb-3 pt-3">
                <span className="flex items-center gap-2">
                  {screen === "form" ? (
                    <button
                      type="button"
                      onClick={() => {
                        haptics.tap();
                        setScreen("pitch");
                      }}
                      aria-label="Back"
                      className="-ml-1 flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-foreground active:scale-90"
                    >
                      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
                        <path
                          d="M14 6 8 12l6 6"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  ) : null}
                  <span className="text-sm font-semibold">
                    {screen === "pitch" ? "Sell on liveWAB" : "Your application"}
                  </span>
                </span>

                {/* Two-step progress */}
                <span className="flex items-center gap-1.5" aria-hidden>
                  {(["pitch", "form"] as const).map((s) => (
                    <motion.span
                      key={s}
                      animate={{
                        width: screen === s ? 18 : 6,
                        opacity: screen === s ? 1 : 0.35,
                      }}
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      className="h-1.5 rounded-full bg-primary"
                    />
                  ))}
                </span>
              </div>
            </div>

            {/* Height animates between screens so nothing snaps. */}
            <motion.div
              layout={!reduceMotion}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              className="px-5"
            >
              <AnimatePresence mode="wait" initial={false}>
                {screen === "pitch" ? (
                  <motion.div
                    key="pitch"
                    {...slide(1)}
                    transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  >
                    <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-surface-2 to-surface-2 p-5">
                      <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-primary/20 blur-3xl" />
                      <span className="relative inline-flex items-center gap-1.5 rounded-full bg-live/10 px-2.5 py-1 text-[11px] font-semibold text-live">
                        <span className="h-1.5 w-1.5 rounded-full bg-live animate-live-pulse" />
                        Live selling
                      </span>
                      <h2 className="relative mt-3 text-2xl font-bold leading-tight tracking-tight">
                        Turn your stream
                        <br />
                        into a storefront.
                      </h2>
                      <p className="relative mt-2 text-sm leading-relaxed text-muted">
                        Apply once. Our team reviews every application — usually
                        within a day.
                      </p>
                    </div>

                    <ul className="mt-4 space-y-2">
                      {perks.map((perk, i) => (
                        <motion.li
                          key={perk.title}
                          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            delay: 0.06 + i * 0.06,
                            type: "spring",
                            stiffness: 380,
                            damping: 30,
                          }}
                          className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-3.5"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-base">
                            {perk.icon}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold">
                              {perk.title}
                            </span>
                            <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                              {perk.text}
                            </span>
                          </span>
                        </motion.li>
                      ))}
                    </ul>

                    {signedIn ? (
                      <motion.button
                        type="button"
                        onClick={() => {
                          haptics.tap();
                          setScreen("form");
                        }}
                        whileTap={{ scale: 0.98 }}
                        className="mt-5 w-full rounded-full bg-primary py-3.5 text-sm font-semibold text-primary-foreground shadow-pop transition-colors hover:bg-primary-hover"
                      >
                        Start your application →
                      </motion.button>
                    ) : (
                      <SignInLink
                        onNavigate={onClose}
                        className="mt-5 block rounded-full bg-primary py-3.5 text-center text-sm font-semibold text-primary-foreground shadow-pop transition-all active:scale-[0.98]"
                      >
                        Sign in to apply
                      </SignInLink>
                    )}

                    <p className="mt-2.5 text-center text-[11px] text-faint">
                      Free to apply · no listing fees
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="form"
                    {...slide(-1)}
                    transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  >
                    <p className="mb-4 text-xs leading-relaxed text-muted">
                      Tell us about your business. You&apos;ll get an email the
                      moment an admin reviews it.
                    </p>
                    <SellerApplyForm categories={categories} />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
