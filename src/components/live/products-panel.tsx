"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SignInButton } from "@clerk/nextjs";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { haptics } from "@/lib/haptics";
import type { PinnedProduct } from "./viewer-room";

/**
 * Full-height right-side products panel for the live room. Everything
 * shoppable lives here: featured pin, live stock, Buy Now → Pay flow.
 */
export function ProductsPanel({
  open,
  onClose,
  products,
  featuredId,
}: {
  open: boolean;
  onClose: () => void;
  products: PinnedProduct[];
  featuredId: string | null;
}) {
  const ordered = featuredId
    ? [
        ...products.filter((p) => p.id === featuredId),
        ...products.filter((p) => p.id !== featuredId),
      ]
    : products;

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            aria-label="Close products"
            className="absolute inset-0 z-30 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-label="Products in this stream"
            data-no-swipe
            className="absolute bottom-0 right-0 top-0 z-40 flex w-[320px] max-w-[85%] flex-col border-l border-border bg-surface shadow-pop"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
          >
            <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
              <h2 className="text-sm font-semibold">
                Products{" "}
                <span className="text-faint">({products.length})</span>
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-all hover:bg-surface-2 hover:text-foreground active:scale-90"
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
                  <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </header>

            <div className="no-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {ordered.length === 0 ? (
                <p className="py-10 text-center text-sm text-faint">
                  No products in this stream yet.
                </p>
              ) : (
                <AnimatePresence initial={false}>
                  {ordered.map((product) => (
                    <motion.div
                      key={product.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    >
                      <PanelProductCard
                        product={product}
                        featured={product.id === featuredId}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

type BuyState =
  | { phase: "idle" }
  | { phase: "reserving" }
  | { phase: "reserved"; reservationId: string; expiresAt: string }
  | { phase: "paying"; reservationId: string; expiresAt: string }
  | { phase: "processing"; reservationId: string }
  | { phase: "paid" }
  | { phase: "error"; message: string };

function PanelProductCard({
  product,
  featured,
}: {
  product: PinnedProduct;
  featured: boolean;
}) {
  const [buy, setBuy] = useState<BuyState>({ phase: "idle" });
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const { toast } = useToast();
  const liveStock = product.availableStock;
  const soldOut = liveStock <= 0;

  async function buyNow() {
    haptics.tap();
    setBuy({ phase: "reserving" });
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id }),
      });
      const body = await res.json();

      if (res.status === 401) {
        setBuy({ phase: "idle" });
        setNeedsSignIn(true);
        return;
      }
      if (!res.ok) {
        setBuy({ phase: "error", message: body.error ?? "Could not reserve." });
        toast({
          title: "Couldn't reserve",
          description: body.error ?? "Please try again.",
          variant: "error",
        });
        return;
      }
      setBuy({
        phase: "reserved",
        reservationId: body.reservationId,
        expiresAt: body.expiresAt,
      });
      toast({
        title: "Reserved for you ⚡",
        description: `${product.title} is held for 10 minutes — pay to lock it in.`,
        variant: "success",
      });
    } catch {
      setBuy({ phase: "error", message: "Network error — try again." });
      toast({
        title: "Network error",
        description: "Check your connection and try again.",
        variant: "error",
      });
    }
  }

  async function payNow(reservationId: string, expiresAt: string) {
    haptics.tap();
    setBuy({ phase: "paying", reservationId, expiresAt });
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId }),
      });
      const body = await res.json();
      if (!res.ok) {
        setBuy({ phase: "error", message: body.error ?? "Checkout failed." });
        return;
      }

      const { openRazorpayCheckout } = await import("./razorpay-checkout");
      const outcome = await openRazorpayCheckout({
        keyId: body.keyId,
        razorpayOrderId: body.razorpayOrderId,
        amountInPaise: body.amountInPaise,
        currency: body.currency,
        productTitle: body.productTitle,
        email: body.email,
      });

      if (outcome === "dismissed") {
        setBuy({ phase: "reserved", reservationId, expiresAt });
        return;
      }

      // Payment submitted — the webhook is the source of truth. Poll briefly.
      setBuy({ phase: "processing", reservationId });
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const poll = await fetch(`/api/reservations/${reservationId}`);
        if (!poll.ok) continue;
        const status = await poll.json();
        if (status.status === "CONFIRMED") {
          setBuy({ phase: "paid" });
          haptics.impact();
          toast({
            title: "Payment confirmed 🎉",
            description: `${product.title} is yours.`,
            variant: "success",
          });
          return;
        }
        if (status.status === "EXPIRED" || status.status === "CANCELLED") {
          setBuy({ phase: "error", message: "Reservation expired." });
          toast({ title: "Reservation expired", variant: "error" });
          return;
        }
      }
      setBuy({
        phase: "error",
        message: "Payment is processing — check Orders in a minute.",
      });
      toast({
        title: "Payment processing",
        description: "We'll confirm it shortly — check Orders in a minute.",
      });
    } catch {
      setBuy({ phase: "error", message: "Payment could not start." });
      toast({ title: "Payment could not start", variant: "error" });
    }
  }

  return (
    <div
      className={cn(
        "rounded-2xl border bg-surface p-3.5 shadow-card transition-colors duration-300",
        featured ? "border-primary/60 bg-primary/5" : "border-border",
      )}
    >
      {featured ? (
        <span className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
          ★ Featured
        </span>
      ) : null}
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-lg">
          🏷️
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{product.title}</p>
          <div className="mt-0.5 flex items-center justify-between">
            <span className="text-sm font-semibold">
              {formatPrice(product.priceInPaise)}
            </span>
            <span className="relative inline-flex h-4 items-center overflow-hidden text-xs text-muted">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={liveStock}
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -10, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 32 }}
                >
                  {soldOut ? "Sold out" : `${liveStock} left`}
                </motion.span>
              </AnimatePresence>
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3">
        {needsSignIn ? (
          <SignInButton mode="modal">
            <button className="block w-full rounded-full bg-foreground py-2 text-center text-sm font-semibold text-background transition-all active:scale-[0.97]">
              Sign in to buy
            </button>
          </SignInButton>
        ) : buy.phase === "reserved" ? (
          <PayNowButton
            expiresAt={buy.expiresAt}
            onPay={() => payNow(buy.reservationId, buy.expiresAt)}
            onExpired={() => setBuy({ phase: "idle" })}
          />
        ) : buy.phase === "paying" ? (
          <div className="rounded-full bg-surface-2 py-2 text-center text-sm font-semibold text-muted">
            Opening payment…
          </div>
        ) : buy.phase === "processing" ? (
          <div className="rounded-full bg-warning/15 py-2 text-center text-sm font-semibold text-warning">
            Confirming payment…
          </div>
        ) : buy.phase === "paid" ? (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            className="rounded-full bg-success/15 py-2 text-center text-sm font-semibold text-success"
          >
            Paid ✓ It&apos;s yours!
          </motion.div>
        ) : (
          <motion.button
            type="button"
            disabled={soldOut || buy.phase === "reserving"}
            onClick={buyNow}
            whileTap={{ scale: 0.97 }}
            className="w-full rounded-full bg-primary py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:bg-surface-2 disabled:text-faint"
          >
            {soldOut
              ? "Sold out"
              : buy.phase === "reserving"
                ? "Reserving…"
                : "Buy Now"}
          </motion.button>
        )}

        {buy.phase === "error" ? (
          <p className="mt-1.5 text-center text-[11px] text-live">
            {buy.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** "Pay now · 9:47" button with a live countdown on the 10-minute hold. */
function PayNowButton({
  expiresAt,
  onPay,
  onExpired,
}: {
  expiresAt: string;
  onPay: () => void;
  onExpired: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000)),
  );

  useEffect(() => {
    const timer = setInterval(() => {
      const left = Math.max(
        0,
        Math.floor((Date.parse(expiresAt) - Date.now()) / 1000),
      );
      setSecondsLeft(left);
      if (left <= 0) onExpired();
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, onExpired]);

  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <button
      type="button"
      onClick={onPay}
      className="w-full rounded-full bg-success py-2 text-sm font-semibold text-white transition-all active:scale-[0.97]"
    >
      Pay now · {mm}:{ss}
    </button>
  );
}
