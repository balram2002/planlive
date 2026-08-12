"use client";

import { useActionState, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/action-button";
import { useToast } from "@/components/toast";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/cn";
import { formatDateTime, formatDayMonth } from "@/lib/datetime";
import {
  cancelFulfilmentAction,
  completeFulfilmentAction,
  requestPickupAction,
  sellerDeliverAction,
  type FulfilmentActionState,
} from "@/app/(seller)/dashboard/sales/fulfilment-actions";

export type LocalFulfilmentView = {
  method: "SELLER_DELIVERY" | "BUYER_PICKUP";
  pickupStatus:
    "REQUESTED" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "COLLECTED" | null;
  pickupDeadline: string | null;
  completedAt: string | null;
  note: string | null;
} | null;

/**
 * Seller-side local fulfilment controls.
 *
 * Only rendered when the buyer is in the seller's own PIN code — that check
 * lives on the server, so this component just reflects it. It shows one of
 * three things: the initial choice, the state of a live pickup negotiation,
 * or the handover confirmation.
 *
 * REJECTED and EXPIRED deliberately return to the *choice* view with an
 * explanatory banner, because both mean the same thing operationally: the
 * seller has to decide again.
 */
export function LocalFulfilmentPanel({
  orderId,
  fulfilment,
  windowDays,
}: {
  orderId: string;
  fulfilment: LocalFulfilmentView;
  windowDays: number;
}) {
  const [deliverState, deliverAction, delivering] = useActionState<
    FulfilmentActionState,
    FormData
  >(sellerDeliverAction, {});
  const [pickupState, pickupAction, requesting] = useActionState<
    FulfilmentActionState,
    FormData
  >(requestPickupAction, {});
  const [doneState, doneAction, completing] = useActionState<
    FulfilmentActionState,
    FormData
  >(completeFulfilmentAction, {});
  const [cancelState, cancelAction, cancelling] = useActionState<
    FulfilmentActionState,
    FormData
  >(cancelFulfilmentAction, {});

  const [expanded, setExpanded] = useState<"none" | "deliver" | "pickup">(
    "none",
  );
  const { toast } = useToast();

  useEffect(() => {
    for (const s of [deliverState, pickupState, doneState, cancelState]) {
      if (s.error) toast({ title: s.error, variant: "error" });
      else if (s.success) toast({ title: s.success, variant: "success" });
    }
  }, [deliverState, pickupState, doneState, cancelState, toast]);

  const busy = delivering || requesting || completing || cancelling;

  // Completed — nothing left to do.
  if (fulfilment?.completedAt) {
    return (
      <div className="rounded-2xl border border-success/30 bg-success/5 p-3">
        <Badge tone="success">
          {fulfilment.method === "BUYER_PICKUP"
            ? "Collected"
            : "Delivered by you"}
        </Badge>
        <p className="mt-1.5 text-xs text-muted">
          Handed over on {formatDayMonth(fulfilment.completedAt)}.
        </p>
      </div>
    );
  }

  // Pickup in flight — waiting on the buyer, or on collection.
  if (
    fulfilment?.method === "BUYER_PICKUP" &&
    (fulfilment.pickupStatus === "REQUESTED" ||
      fulfilment.pickupStatus === "ACCEPTED")
  ) {
    const accepted = fulfilment.pickupStatus === "ACCEPTED";
    return (
      <div
        className={cn(
          "rounded-2xl border p-3",
          accepted
            ? "border-success/30 bg-success/5"
            : "border-warning/30 bg-warning/5",
        )}
      >
        <Badge tone={accepted ? "success" : "warning"}>
          {accepted ? "Buyer will collect" : "Waiting on the buyer"}
        </Badge>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          {accepted && fulfilment.pickupDeadline ? (
            <>
              Have it ready by{" "}
              <span className="font-semibold text-foreground">
                {formatDateTime(fulfilment.pickupDeadline)}
              </span>
              .
            </>
          ) : (
            "We've asked them to collect — you'll be emailed either way."
          )}
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {accepted ? (
            <form action={doneAction} className="flex-1">
              <input type="hidden" name="orderId" value={orderId} />
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-full bg-primary py-2 text-xs font-semibold text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {completing ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Spinner /> Saving
                  </span>
                ) : (
                  "✅ Buyer collected it"
                )}
              </button>
            </form>
          ) : null}
          <form
            action={cancelAction}
            className={accepted ? "shrink-0" : "flex-1"}
          >
            <input type="hidden" name="orderId" value={orderId} />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full border border-border px-3 py-2 text-xs font-medium text-muted transition-colors hover:text-foreground disabled:opacity-50"
            >
              {cancelling ? "…" : "Cancel"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Seller delivery chosen — just needs confirming when dropped off.
  if (fulfilment?.method === "SELLER_DELIVERY") {
    return (
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3">
        <Badge tone="primary">You&apos;re delivering this</Badge>
        <p className="mt-1.5 text-xs text-muted">
          No courier booked. Mark it delivered once it&apos;s with the buyer.
        </p>
        <div className="mt-3 flex gap-2">
          <form action={doneAction} className="flex-1">
            <input type="hidden" name="orderId" value={orderId} />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-primary py-2 text-xs font-semibold text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {completing ? (
                <span className="inline-flex items-center gap-1.5">
                  <Spinner /> Saving
                </span>
              ) : (
                "✅ Delivered"
              )}
            </button>
          </form>
          <form action={cancelAction} className="shrink-0">
            <input type="hidden" name="orderId" value={orderId} />
            <button
              type="submit"
              disabled={busy}
              className="rounded-full border border-border px-3 py-2 text-xs font-medium text-muted transition-colors hover:text-foreground disabled:opacity-50"
            >
              {cancelling ? "…" : "Cancel"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Choice view — including after a rejection or an expired window.
  const setback =
    fulfilment?.pickupStatus === "REJECTED"
      ? "The buyer would rather it was delivered. Choose how to get it to them."
      : fulfilment?.pickupStatus === "EXPIRED"
        ? `The ${windowDays}-day collection window passed. Choose how to get it to them.`
        : null;

  return (
    <div className="rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-3">
      <p className="text-xs font-semibold text-primary">
        📍 This buyer is in your PIN code
      </p>
      {setback ? (
        <p className="mt-1.5 rounded-xl bg-surface px-2.5 py-2 text-[11px] leading-relaxed text-live">
          {setback}
        </p>
      ) : (
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          You can skip the courier — deliver it yourself, or ask the buyer to
          collect.
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            haptics.tap();
            setExpanded((e) => (e === "deliver" ? "none" : "deliver"));
          }}
          className={cn(
            "flex-1 rounded-full border px-3 py-2 text-xs font-semibold transition-colors",
            expanded === "deliver"
              ? "border-primary/60 bg-primary/10 text-primary"
              : "border-border text-muted hover:text-foreground",
          )}
        >
          🛵 I&apos;ll deliver
        </button>
        <button
          type="button"
          onClick={() => {
            haptics.tap();
            setExpanded((e) => (e === "pickup" ? "none" : "pickup"));
          }}
          className={cn(
            "flex-1 rounded-full border px-3 py-2 text-xs font-semibold transition-colors",
            expanded === "pickup"
              ? "border-primary/60 bg-primary/10 text-primary"
              : "border-border text-muted hover:text-foreground",
          )}
        >
          🏪 Ask to collect
        </button>
      </div>

      <AnimatePresence initial={false}>
        {expanded !== "none" ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <form
              action={expanded === "deliver" ? deliverAction : pickupAction}
              className="mt-2.5 space-y-2"
            >
              <input type="hidden" name="orderId" value={orderId} />
              <input
                name="note"
                maxLength={300}
                placeholder={
                  expanded === "deliver"
                    ? "Note for the buyer (optional) — e.g. “I'll drop by this evening”"
                    : "Shop timings or instructions (optional)"
                }
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-base placeholder:text-faint focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30 sm:text-sm"
              />
              {expanded === "pickup" ? (
                <p className="text-[11px] leading-relaxed text-faint">
                  They can accept or decline. If they accept, they get{" "}
                  {windowDays} days to collect — you&apos;ll be emailed either
                  way.
                </p>
              ) : null}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-full bg-primary py-2 text-xs font-semibold text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {delivering || requesting ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Spinner /> Saving
                  </span>
                ) : expanded === "deliver" ? (
                  "Confirm — I'll deliver this"
                ) : (
                  "Send pickup request"
                )}
              </button>
            </form>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
