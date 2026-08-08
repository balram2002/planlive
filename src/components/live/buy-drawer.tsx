"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/ui/action-button";
import { AddressForm, type SavedAddress } from "@/components/profile/address-form";
import { ProductThumb } from "@/components/product-thumb";
import { AttributeChips } from "@/components/products/attribute-chips";
import { formatPrice } from "@/lib/format";
import { COD_DELIVERY_FEE_PAISE, priceBreakdown } from "@/lib/pricing";
import { RESERVATION_TTL_MINUTES } from "@/lib/reservation-window";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/cn";
import type { PinnedProduct } from "./viewer-room";

export type BuyFlow = {
  product: PinnedProduct;
};

type Step = "address" | "payment" | "processing" | "success";

/** The stock hold, once a payment method has been chosen. */
type Hold = { reservationId: string; expiresAt: string };

/**
 * Checkout funnel in a bottom drawer:
 * 1. pick (or create) a delivery address,
 * 2. choose Cash on Delivery or Pay online (Razorpay) — this is what takes
 *    the stock hold,
 * 3. beautiful success screen → back to live / home.
 *
 * Nothing is reserved until step 2. Opening the drawer and browsing addresses
 * is not a commitment, so the item stays in stock for other buyers until this
 * one actually picks how they're paying; from there the countdown
 * runs in the header.
 */
export function BuyDrawer({
  flow,
  onClose,
  onStockChange,
}: {
  flow: BuyFlow | null;
  onClose: () => void;
  /** Keeps the live room's "n left" in sync when we take/keep a hold. */
  onStockChange?: (productId: string, availableStock: number) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("address");
  const [addresses, setAddresses] = useState<SavedAddress[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [placing, setPlacing] = useState(false);
  // Starts unselected: picking a method is what reserves the stock, so we
  // must never pre-select one on the buyer's behalf.
  const [method, setMethod] = useState<"COD" | "ONLINE" | null>(null);
  const [hold, setHold] = useState<Hold | null>(null);
  const [reserving, setReserving] = useState(false);
  const [codOrder, setCodOrder] = useState<{ amountInPaise: number } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Mirrors the server's pricing rules exactly (lib/pricing.ts).
  const items = flow ? flow.product.priceInPaise : 0;
  const cod = priceBreakdown(items, "COD");
  const online = priceBreakdown(items, "ONLINE");

  // Reset when a new buy flow opens — render-phase adjustment
  // (react.dev "adjusting state during render"), not an effect.
  const flowKey = flow?.product.id ?? null;
  const [lastFlowKey, setLastFlowKey] = useState<string | null>(null);
  if (flowKey !== lastFlowKey) {
    setLastFlowKey(flowKey);
    if (flowKey) {
      setStep("address");
      setCreating(false);
      setPlacing(false);
      setMethod(null);
      setHold(null);
      setReserving(false);
      setCodOrder(null);
    }
  }

  // Load saved addresses whenever the drawer opens (or after creating one).
  useEffect(() => {
    if (!flowKey) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/addresses");
        if (!res.ok || cancelled) return;
        const body = await res.json();
        setAddresses(body.addresses);
        const active = (body.addresses as SavedAddress[]).find((a) => a.isActive);
        setSelectedId(
          (prev) => prev ?? active?.id ?? body.addresses[0]?.id ?? null,
        );
      } catch {
        // Retry on next open.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [flowKey, reloadKey]);

  const loadAddresses = useCallback(() => setReloadKey((k) => k + 1), []);

  /**
   * Close handler that hands an unpaid hold back first.
   *
   * Only fires while the order hasn't been placed — on the success step the
   * reservation is confirmed and must be left alone.
   */
  const closeAndRelease = useCallback(() => {
    const abandoned = step !== "success" ? hold : null;
    const productId = flow?.product.id;
    onClose();
    if (!abandoned) return;

    void fetch(`/api/reservations/${abandoned.reservationId}`, {
      method: "DELETE",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (body?.released && productId) {
          onStockChange?.(productId, body.availableStock);
        }
      })
      .catch(() => {
        // The sweeper still expires it within the TTL.
      });
  }, [step, hold, flow, onClose, onStockChange]);

  /**
   * Takes the stock hold for this product, once.
   *
   * Called when the buyer picks a payment method — the first real signal of
   * intent. Toggling between COD and online reuses the same hold rather than
   * stacking a second one (which would trip the per-user pending cap).
   */
  async function ensureHold(next: "COD" | "ONLINE") {
    haptics.tap();
    if (!flow || reserving) return;
    if (hold) {
      setMethod(next);
      return;
    }

    setReserving(true);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: flow.product.id }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast({
          title: "Couldn't reserve",
          description: body.error ?? "Please try again.",
          variant: "error",
        });
        // Sold out while they were choosing an address — the drawer is dead.
        if (body.code === "SOLD_OUT") onClose();
        return;
      }
      setHold({ reservationId: body.reservationId, expiresAt: body.expiresAt });
      setMethod(next);
      onStockChange?.(flow.product.id, body.availableStock);
      toast({
        title: "Reserved for you ⚡",
        description: `Complete checkout within ${RESERVATION_TTL_MINUTES} minutes.`,
        variant: "success",
      });
    } catch {
      toast({ title: "Network error", variant: "error" });
    } finally {
      setReserving(false);
    }
  }

  async function placeCod() {
    if (!flow || !selectedId || !hold) return;
    haptics.tap();
    setPlacing(true);
    try {
      const res = await fetch("/api/checkout/cod", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationId: hold.reservationId,
          addressId: selectedId,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast({ title: body.error ?? "Couldn't place order", variant: "error" });
        return;
      }
      setCodOrder({ amountInPaise: body.amountInPaise });
      setStep("success");
      haptics.impact();
    } catch {
      toast({ title: "Network error", variant: "error" });
    } finally {
      setPlacing(false);
    }
  }

  async function payOnline() {
    if (!flow || !selectedId || !hold) return;
    haptics.tap();
    setPlacing(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationId: hold.reservationId,
          addressId: selectedId,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast({ title: body.error ?? "Checkout failed", variant: "error" });
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
      if (outcome === "dismissed") return; // stay on payment step

      setStep("processing");
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const poll = await fetch(`/api/reservations/${hold.reservationId}`);
        if (!poll.ok) continue;
        const status = await poll.json();
        if (status.status === "CONFIRMED") {
          setStep("success");
          haptics.impact();
          return;
        }
        if (status.status === "EXPIRED" || status.status === "CANCELLED") {
          toast({ title: "Reservation expired", variant: "error" });
          onClose();
          return;
        }
      }
      toast({
        title: "Payment processing",
        description: "We'll confirm it shortly — check Orders in a minute.",
      });
      onClose();
    } catch {
      toast({ title: "Payment could not start", variant: "error" });
    } finally {
      setPlacing(false);
    }
  }

  const selected = addresses?.find((a) => a.id === selectedId) ?? null;

  return (
    <AnimatePresence>
      {flow ? (
        <>
          <motion.button
            aria-label="Close checkout"
            className="absolute inset-0 z-40 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={step === "processing" ? undefined : closeAndRelease}
          />
          <motion.div
            role="dialog"
            aria-label="Checkout"
            data-no-swipe
            className="absolute inset-x-0 bottom-0 z-50 max-h-[85%] overflow-y-auto no-scrollbar rounded-t-3xl border border-b-0 border-border bg-surface p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-pop"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />

            {/* Product summary + hold countdown */}
            {step !== "success" ? (
              <div className="mb-4 flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
                <ProductThumb
                  src={flow.product.imageUrl}
                  alt={flow.product.title}
                  sizes="48px"
                  className="w-12"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {flow.product.title}
                  </p>
                  <p className="text-xs text-muted">
                    {formatPrice(flow.product.priceInPaise)}
                  </p>
                  {/* Confirms exactly which variant is being bought. */}
                  <AttributeChips
                    attributes={flow.product.attributes}
                    className="mt-1"
                  />
                </div>
                {hold ? (
                  <HoldCountdown expiresAt={hold.expiresAt} onExpired={onClose} />
                ) : (
                  <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-[10px] font-medium text-faint">
                    In stock
                  </span>
                )}
              </div>
            ) : null}

            <AnimatePresence mode="wait" initial={false}>
              {step === "address" ? (
                <motion.div
                  key="address"
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  transition={{ type: "spring", stiffness: 400, damping: 34 }}
                >
                  <h2 className="text-base font-semibold">Deliver to</h2>
                  <p className="mb-3 text-xs text-muted">
                    Choose a saved address or add a new one.
                  </p>

                  {addresses === null ? (
                    <div className="space-y-2">
                      <div className="skeleton h-20 rounded-2xl" />
                      <div className="skeleton h-20 rounded-2xl" />
                    </div>
                  ) : creating ? (
                    <AddressForm
                      compact
                      onCancel={() => setCreating(false)}
                      onCreated={(address) => {
                        setCreating(false);
                        setSelectedId(address.id);
                        loadAddresses();
                      }}
                    />
                  ) : (
                    <>
                      <div className="space-y-2">
                        {addresses.map((address) => (
                          <button
                            key={address.id}
                            type="button"
                            onClick={() => {
                              haptics.tap();
                              setSelectedId(address.id);
                            }}
                            className={cn(
                              "w-full rounded-2xl border p-3 text-left transition-all duration-200 active:scale-[0.99]",
                              selectedId === address.id
                                ? "border-primary/60 bg-primary/5"
                                : "border-border bg-surface hover:bg-surface-2",
                            )}
                          >
                            <span className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors",
                                  selectedId === address.id
                                    ? "border-primary"
                                    : "border-faint",
                                )}
                              >
                                {selectedId === address.id ? (
                                  <span className="h-2 w-2 rounded-full bg-primary" />
                                ) : null}
                              </span>
                              <span className="text-sm font-semibold">
                                {address.label}
                              </span>
                              {address.isActive ? (
                                <span className="text-[10px] font-medium uppercase tracking-wide text-primary">
                                  Active
                                </span>
                              ) : null}
                            </span>
                            <span className="mt-1 block pl-6 text-xs leading-relaxed text-muted">
                              {address.fullName} · {address.phone}
                              <br />
                              {address.line1}
                              {address.line2 ? `, ${address.line2}` : ""},{" "}
                              {address.city} — {address.pincode}
                            </span>
                          </button>
                        ))}
                      </div>

                      {addresses.length < 3 ? (
                        <button
                          type="button"
                          onClick={() => setCreating(true)}
                          className="mt-2 w-full rounded-2xl border border-dashed border-border py-3 text-sm font-medium text-muted transition-colors hover:border-primary/50 hover:text-foreground"
                        >
                          + Add new address
                        </button>
                      ) : null}

                      <button
                        type="button"
                        disabled={!selected}
                        onClick={() => {
                          haptics.tap();
                          setStep("payment");
                        }}
                        className="mt-4 w-full rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-40"
                      >
                        Next — choose payment
                      </button>
                    </>
                  )}
                </motion.div>
              ) : step === "payment" ? (
                <motion.div
                  key="payment"
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  transition={{ type: "spring", stiffness: 400, damping: 34 }}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-base font-semibold">Payment</h2>
                    <button
                      type="button"
                      onClick={() => setStep("address")}
                      className="text-xs font-medium text-primary"
                    >
                      ← Change address
                    </button>
                  </div>

                  {selected ? (
                    <p className="mb-3 rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
                      Delivering to{" "}
                      <span className="font-medium text-foreground">
                        {selected.label}
                      </span>{" "}
                      · {selected.city} — {selected.pincode}
                    </p>
                  ) : null}

                  {!hold ? (
                    <p className="mb-3 text-[11px] leading-relaxed text-faint">
                      Choosing a payment method holds this item for you for{" "}
                      {RESERVATION_TTL_MINUTES} minutes.
                    </p>
                  ) : null}

                  <div className="space-y-2.5">
                    {/* Cash on delivery — carries a flat delivery charge, so
                        the full breakdown is shown before committing. */}
                    <div
                      className={cn(
                        "rounded-2xl border transition-colors duration-200",
                        method === "COD"
                          ? "border-primary/50 bg-primary/5"
                          : "border-border bg-surface",
                      )}
                    >
                      <button
                        type="button"
                        disabled={reserving}
                        onClick={() => ensureHold("COD")}
                        className="flex w-full items-center gap-3 p-4 text-left disabled:opacity-60"
                      >
                        <span className="text-xl">💵</span>
                        <span className="flex-1">
                          <span className="block text-sm font-semibold">
                            Cash on Delivery
                          </span>
                          <span className="text-xs text-muted">
                            Pay when it arrives · +
                            {formatPrice(COD_DELIVERY_FEE_PAISE)} delivery
                          </span>
                        </span>
                        {reserving && method === null ? (
                          <Spinner />
                        ) : (
                          <Radio checked={method === "COD"} />
                        )}
                      </button>

                      <AnimatePresence initial={false}>
                        {method === "COD" ? (
                          <motion.div
                            key="cod-summary"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.22, ease: "easeOut" }}
                            className="overflow-hidden"
                          >
                            <div className="border-t border-border/60 px-4 py-3">
                              <SummaryRow
                                label="Item total"
                                value={formatPrice(cod.itemsInPaise)}
                              />
                              <SummaryRow
                                label="Delivery charge"
                                value={formatPrice(cod.deliveryFeeInPaise)}
                              />
                              <div className="my-2 border-t border-dashed border-border" />
                              <SummaryRow
                                label="Total payable"
                                value={formatPrice(cod.totalInPaise)}
                                strong
                              />
                              <button
                                type="button"
                                disabled={placing}
                                onClick={placeCod}
                                className="mt-3 w-full rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-50"
                              >
                                {placing
                                  ? "Placing order…"
                                  : `Place order · ${formatPrice(cod.totalInPaise)}`}
                              </button>
                            </div>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>

                    {/* Online — no extra charges, so no breakdown needed. */}
                    <div
                      className={cn(
                        "rounded-2xl border transition-colors duration-200",
                        method === "ONLINE"
                          ? "border-primary/50 bg-primary/5"
                          : "border-border bg-surface",
                      )}
                    >
                      <button
                        type="button"
                        disabled={reserving}
                        onClick={() => ensureHold("ONLINE")}
                        className="flex w-full items-center gap-3 p-4 text-left disabled:opacity-60"
                      >
                        <span className="text-xl">⚡</span>
                        <span className="flex-1">
                          <span className="block text-sm font-semibold">
                            Pay online
                          </span>
                          <span className="text-xs text-muted">
                            UPI, cards, netbanking · no delivery charge
                          </span>
                        </span>
                        {reserving && method === null ? (
                          <Spinner />
                        ) : (
                          <Radio checked={method === "ONLINE"} />
                        )}
                      </button>

                      <AnimatePresence initial={false}>
                        {method === "ONLINE" ? (
                          <motion.div
                            key="online-summary"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.22, ease: "easeOut" }}
                            className="overflow-hidden"
                          >
                            <div className="border-t border-border/60 px-4 py-3">
                              <SummaryRow
                                label="Total payable"
                                value={formatPrice(online.totalInPaise)}
                                strong
                              />
                              <button
                                type="button"
                                disabled={placing}
                                onClick={payOnline}
                                className="mt-3 w-full rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-50"
                              >
                                {placing
                                  ? "Opening checkout…"
                                  : `Pay ${formatPrice(online.totalInPaise)}`}
                              </button>
                            </div>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.div>
              ) : step === "processing" ? (
                <motion.div
                  key="processing"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center py-8 text-center"
                >
                  <motion.span
                    className="text-3xl"
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                  >
                    ⏳
                  </motion.span>
                  <p className="mt-3 text-sm font-semibold">Confirming payment…</p>
                  <p className="mt-1 text-xs text-muted">
                    Hang tight — this takes a few seconds.
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 320, damping: 24 }}
                  className="flex flex-col items-center py-6 text-center"
                >
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 380, damping: 16, delay: 0.05 }}
                    className="flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-3xl"
                  >
                    🎉
                  </motion.span>
                  <h2 className="mt-4 text-lg font-bold">
                    Order {codOrder ? "placed" : "confirmed"}!
                  </h2>
                  <p className="mt-1 max-w-xs text-sm text-muted">
                    {flow.product.title} is yours
                    {codOrder
                      ? ` — keep ${formatPrice(codOrder.amountInPaise)} ready for delivery (incl. ${formatPrice(COD_DELIVERY_FEE_PAISE)} delivery).`
                      : " — payment received."}
                  </p>
                  <div className="mt-6 flex w-full flex-col gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="w-full rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground transition-all active:scale-[0.98]"
                    >
                      Back to live
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push("/orders")}
                      className="w-full rounded-full border border-border py-3 text-sm font-semibold transition-all hover:bg-surface-2 active:scale-[0.98]"
                    >
                      View my orders
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

/** One line of the price summary. */
function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span
        className={cn(
          "text-xs",
          strong ? "font-semibold text-foreground" : "text-muted",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums",
          strong ? "text-sm font-bold" : "text-xs font-medium",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** Radio dot for the payment-method rows. */
function Radio({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        "flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200",
        checked ? "border-primary" : "border-faint",
      )}
    >
      {checked ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
    </span>
  );
}

/** Small "hold" countdown chip for the drawer header. */
function HoldCountdown({
  expiresAt,
  onExpired,
}: {
  expiresAt: string;
  onExpired: () => void;
}) {
  const [left, setLeft] = useState(() =>
    Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000)),
  );
  useEffect(() => {
    const timer = setInterval(() => {
      const next = Math.max(
        0,
        Math.floor((Date.parse(expiresAt) - Date.now()) / 1000),
      );
      setLeft(next);
      if (next <= 0) onExpired();
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, onExpired]);

  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, "0");
  return (
    <span className="shrink-0 rounded-full bg-warning/15 px-2.5 py-1 text-xs font-semibold tabular-nums text-warning">
      {mm}:{ss}
    </span>
  );
}
