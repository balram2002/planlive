"use client";

import { useActionState, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Spinner } from "@/components/ui/action-button";
import { useToast } from "@/components/toast";
import { haptics } from "@/lib/haptics";
import {
  cancelOrder,
  type CancelOrderState,
} from "@/app/(shop)/orders/actions";

/**
 * Buyer cancellation with a confirm step.
 *
 * Cancelling is irreversible and can involve a refund, so it asks first —
 * but inline rather than as a modal, because a full-screen dialog for a
 * single yes/no is heavier than the decision deserves.
 */
export function CancelOrderButton({
  orderId,
  disabledReason,
}: {
  orderId: string;
  /** When set, the control renders as an explanation instead of a button. */
  disabledReason?: string;
}) {
  const [state, formAction, pending] = useActionState<
    CancelOrderState,
    FormData
  >(cancelOrder, {});
  const [confirming, setConfirming] = useState(false);
  const { toast } = useToast();

  // Collapse the confirm step as soon as the action answers. Render-phase
  // adjustment, not an effect — the effect below is only for the toast,
  // which is an external system and belongs there.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.error || state.success) setConfirming(false);
  }

  useEffect(() => {
    if (state.error) toast({ title: state.error, variant: "error" });
    else if (state.success) toast({ title: state.success, variant: "success" });
  }, [state, toast]);

  if (disabledReason) {
    return (
      <p className="rounded-xl bg-surface-2 px-3 py-2 text-center text-[11px] leading-relaxed text-faint">
        {disabledReason}
      </p>
    );
  }

  return (
    <div>
      <AnimatePresence mode="wait" initial={false}>
        {confirming ? (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <p className="mb-2 text-xs leading-relaxed text-muted">
              Cancel this order? The item goes back on sale and any payment is
              refunded.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="flex-1 rounded-full border border-border py-2 text-xs font-semibold text-muted transition-colors hover:text-foreground"
              >
                Keep it
              </button>
              <form action={formAction} className="flex-1">
                <input type="hidden" name="orderId" value={orderId} />
                <button
                  type="submit"
                  disabled={pending}
                  className="w-full rounded-full bg-live py-2 text-xs font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {pending ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Spinner /> Cancelling…
                    </span>
                  ) : (
                    "Yes, cancel"
                  )}
                </button>
              </form>
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="trigger"
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              haptics.tap();
              setConfirming(true);
            }}
            className="w-full rounded-full border border-border py-2 text-xs font-semibold text-muted transition-colors hover:border-live/40 hover:text-live"
          >
            Cancel order
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
