"use client";

import { useActionState, useEffect } from "react";
import { Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/action-button";
import { useToast } from "@/components/toast";
import {
  applyForPremium,
  type PremiumRequestState,
} from "@/app/(seller)/dashboard/premium/actions";

/** Seller's premium broadcasting application. */
export function PremiumApplyForm({
  resubmitting = false,
}: {
  resubmitting?: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    PremiumRequestState,
    FormData
  >(applyForPremium, {});
  const { toast } = useToast();

  useEffect(() => {
    if (state.error) toast({ title: state.error, variant: "error" });
    else if (state.success) {
      toast({ title: state.success, variant: "success" });
    }
  }, [state, toast]);

  return (
    <form action={formAction} className="space-y-3">
      <Textarea
        name="message"
        rows={4}
        maxLength={500}
        placeholder="How often do you go live, and what do you sell? (optional)"
      />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-all active:scale-[0.99] disabled:opacity-50"
      >
        {pending ? (
          <span className="inline-flex items-center gap-2">
            <Spinner /> Sending…
          </span>
        ) : resubmitting ? (
          "Apply again"
        ) : (
          "Apply for premium"
        )}
      </button>
    </form>
  );
}
