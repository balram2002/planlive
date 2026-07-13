"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import {
  onboardSeller,
  type AdminActionState,
} from "@/app/(admin)/admin/actions";

/** Onboard a seller: promotes an existing user or sends a Clerk invitation. */
export function OnboardSellerForm() {
  const [state, formAction, pending] = useActionState<AdminActionState, FormData>(
    onboardSeller,
    {},
  );
  const { toast } = useToast();

  // Surface each action result as a toast (state identity changes per submit).
  useEffect(() => {
    if (state.success) toast({ title: state.success, variant: "success" });
    else if (state.error) toast({ title: state.error, variant: "error" });
  }, [state, toast]);

  return (
    <form action={formAction} className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="email"
          name="email"
          required
          placeholder="seller@example.com"
          className="sm:max-w-xs"
          aria-label="Seller email"
        />
        <Button type="submit" disabled={pending} className="shrink-0">
          {pending ? "Working…" : "Onboard seller"}
        </Button>
      </div>
      {state.error ? (
        <p className="rounded-xl border border-live/30 bg-live/10 px-3 py-2 text-sm text-live">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          {state.success}
        </p>
      ) : null}
    </form>
  );
}
