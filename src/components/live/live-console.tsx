"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/format";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/cn";
import {
  addProductToStream,
  adjustStock,
  createProductInLive,
  removeProductFromStream,
  setFeaturedProduct,
} from "@/app/(seller)/go-live/actions";

export type ConsoleProduct = {
  id: string;
  title: string;
  priceInPaise: number;
  availableStock: number;
  inStream: boolean;
};

type Stats = { reservations: number; confirmedUnits: number; revenuePaise: number };

/**
 * Seller live console: manage the product queue (add/remove), pin the
 * featured product, adjust stock, and watch live sales stats — all without
 * leaving the stream. Mutations are server actions (server-side authz), and
 * every change broadcasts to viewers over the data channel.
 */
export function LiveConsole({
  streamId,
  products,
  featuredProductId,
}: {
  streamId: string;
  products: ConsoleProduct[];
  featuredProductId: string | null;
}) {
  const [stats, setStats] = useState<Stats | null>(null);

  // Light polling for the stats panel (15s; seller-only endpoint).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/streams/${streamId}/stats`);
        if (!res.ok || cancelled) return;
        setStats(await res.json());
      } catch {
        // Transient — next tick retries.
      }
    }
    void load();
    const timer = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [streamId]);

  const inStream = products.filter((p) => p.inStream);
  const available = products.filter((p) => !p.inStream);

  return (
    <div className="space-y-5">
      {/* Live stats */}
      <div className="grid grid-cols-3 gap-2.5">
        {[
          { label: "Reservations", value: stats ? String(stats.reservations) : "—" },
          { label: "Units sold", value: stats ? String(stats.confirmedUnits) : "—" },
          { label: "Revenue", value: stats ? formatPrice(stats.revenuePaise) : "—" },
        ].map((stat) => (
          <Card key={stat.label} className="p-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-faint">
              {stat.label}
            </p>
            <span className="relative mt-0.5 inline-flex h-7 items-center justify-center overflow-hidden">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={stat.value}
                  initial={{ y: 12, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -12, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 480, damping: 32 }}
                  className="text-lg font-bold tabular-nums"
                >
                  {stat.value}
                </motion.span>
              </AnimatePresence>
            </span>
          </Card>
        ))}
      </div>

      {/* Live queue */}
      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-faint">
          In this stream ({inStream.length})
        </h2>
        {inStream.length === 0 ? (
          <p className="py-2 text-sm text-faint">
            No products in the stream — add one below.
          </p>
        ) : (
          <ul className="space-y-2.5">
            <AnimatePresence initial={false}>
              {inStream.map((product) => {
                const featured = product.id === featuredProductId;
                return (
                  <motion.li
                    key={product.id}
                    layout="position"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    className={cn(
                      "rounded-2xl border p-3 transition-colors duration-300",
                      featured ? "border-primary/60 bg-primary/5" : "border-border",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-medium">
                        {featured ? "★ " : ""}
                        {product.title}
                      </p>
                      <span className="shrink-0 text-sm text-muted">
                        {formatPrice(product.priceInPaise)}
                      </span>
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      {/* Stock stepper */}
                      <span className="flex items-center gap-1 rounded-full border border-border bg-surface-2 px-1 py-0.5">
                        <form action={adjustStock}>
                          <input type="hidden" name="streamId" value={streamId} />
                          <input type="hidden" name="productId" value={product.id} />
                          <input type="hidden" name="delta" value="-1" />
                          <button
                            type="submit"
                            disabled={product.availableStock <= 0}
                            onClick={() => haptics.tap()}
                            aria-label="Decrease stock"
                            className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold transition-all active:scale-90 disabled:opacity-30"
                          >
                            −
                          </button>
                        </form>
                        <Badge tone={product.availableStock > 0 ? "success" : "warning"}>
                          {product.availableStock}
                        </Badge>
                        <form action={adjustStock}>
                          <input type="hidden" name="streamId" value={streamId} />
                          <input type="hidden" name="productId" value={product.id} />
                          <input type="hidden" name="delta" value="1" />
                          <button
                            type="submit"
                            onClick={() => haptics.tap()}
                            aria-label="Increase stock"
                            className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold transition-all active:scale-90"
                          >
                            +
                          </button>
                        </form>
                      </span>

                      {/* Pin / unpin featured */}
                      <form action={setFeaturedProduct}>
                        <input type="hidden" name="streamId" value={streamId} />
                        <input
                          type="hidden"
                          name="productId"
                          value={featured ? "" : product.id}
                        />
                        <button
                          type="submit"
                          onClick={() => haptics.tap()}
                          className={cn(
                            "rounded-full px-3 py-1.5 text-xs font-medium transition-all active:scale-95",
                            featured
                              ? "bg-primary/10 text-primary"
                              : "text-muted hover:bg-surface-2 hover:text-foreground",
                          )}
                        >
                          {featured ? "Unpin" : "Feature"}
                        </button>
                      </form>

                      {/* Remove from stream */}
                      <form action={removeProductFromStream} className="ml-auto">
                        <input type="hidden" name="streamId" value={streamId} />
                        <input type="hidden" name="productId" value={product.id} />
                        <button
                          type="submit"
                          onClick={() => haptics.tap()}
                          className="rounded-full px-3 py-1.5 text-xs font-medium text-live transition-all hover:bg-live/10 active:scale-95"
                        >
                          Remove
                        </button>
                      </form>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}

        {/* Add more products mid-stream */}
        {available.length > 0 ? (
          <div className="mt-4 border-t border-border pt-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
              Add to stream
            </h3>
            <ul className="space-y-1.5">
              {available.map((product) => (
                <li
                  key={product.id}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="min-w-0 truncate text-sm text-muted">
                    {product.title}
                  </span>
                  <form action={addProductToStream}>
                    <input type="hidden" name="streamId" value={streamId} />
                    <input type="hidden" name="productId" value={product.id} />
                    <button
                      type="submit"
                      onClick={() => haptics.tap()}
                      className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium transition-all hover:bg-border active:scale-95"
                    >
                      + Add
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Create a brand-new product without leaving the stream */}
        <div className="mt-4 border-t border-border pt-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
            Quick-create product
          </h3>
          <form action={createProductInLive} className="space-y-2">
            <input type="hidden" name="streamId" value={streamId} />
            <input
              name="title"
              required
              minLength={2}
              maxLength={100}
              placeholder="Product title"
              className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm placeholder:text-faint focus:border-primary/60 focus:outline-none"
            />
            <div className="flex gap-2">
              <input
                name="price"
                type="number"
                min="1"
                step="0.01"
                required
                placeholder="Price ₹"
                className="w-full min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm placeholder:text-faint focus:border-primary/60 focus:outline-none"
              />
              <input
                name="stock"
                type="number"
                min="0"
                step="1"
                required
                placeholder="Stock"
                className="w-full min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm placeholder:text-faint focus:border-primary/60 focus:outline-none"
              />
              <button
                type="submit"
                onClick={() => haptics.tap()}
                className="shrink-0 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-all active:scale-95"
              >
                Add live
              </button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}
