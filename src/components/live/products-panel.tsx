"use client";

import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import type { PinnedProduct } from "./viewer-room";

/**
 * Full-height right-side products panel for the live room. Buy Now hands off
 * to the shared buy funnel (reserve → address → payment → success).
 */
export function ProductsPanel({
  open,
  onClose,
  products,
  featuredId,
  onBuy,
  buyingId,
}: {
  open: boolean;
  onClose: () => void;
  products: PinnedProduct[];
  featuredId: string | null;
  onBuy: (product: PinnedProduct) => void;
  /** Product currently being reserved (spinner state). */
  buyingId: string | null;
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
                Products <span className="text-faint">({products.length})</span>
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
                  {ordered.map((product) => {
                    const featured = product.id === featuredId;
                    const soldOut = product.availableStock <= 0;
                    const busy = buyingId === product.id;
                    return (
                      <motion.div
                        key={product.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
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
                            <p className="truncate text-sm font-medium">
                              {product.title}
                            </p>
                            <div className="mt-0.5 flex items-center justify-between">
                              <span className="text-sm font-semibold">
                                {formatPrice(product.priceInPaise)}
                              </span>
                              <span className="relative inline-flex h-4 items-center overflow-hidden text-xs text-muted">
                                <AnimatePresence mode="popLayout" initial={false}>
                                  <motion.span
                                    key={product.availableStock}
                                    initial={{ y: 10, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    exit={{ y: -10, opacity: 0 }}
                                    transition={{ type: "spring", stiffness: 500, damping: 32 }}
                                  >
                                    {soldOut
                                      ? "Sold out"
                                      : `${product.availableStock} left`}
                                  </motion.span>
                                </AnimatePresence>
                              </span>
                            </div>
                          </div>
                        </div>

                        <motion.button
                          type="button"
                          disabled={soldOut || busy}
                          onClick={() => onBuy(product)}
                          whileTap={{ scale: 0.97 }}
                          className="mt-3 w-full rounded-full bg-primary py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:bg-surface-2 disabled:text-faint"
                        >
                          {soldOut ? "Sold out" : busy ? "Reserving…" : "Buy Now"}
                        </motion.button>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
