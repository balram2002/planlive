"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import {
  applySeller,
  type ApplyState,
} from "@/app/(shop)/become-a-seller/actions";
import { SELLER_CATEGORIES } from "@/lib/seller-categories";

export function SellerApplyForm({
  categories = [],
}: {
  /** Active marketplace categories from the DB; static list is the fallback. */
  categories?: string[];
}) {
  const [state, formAction, pending] = useActionState<ApplyState, FormData>(
    applySeller,
    {},
  );
  const options = categories.length > 0 ? categories : [...SELLER_CATEGORIES];

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Brand / shop name" htmlFor="brandName">
        <Input
          id="brandName"
          name="brandName"
          placeholder="e.g. Ritu's Thrift Corner"
          required
          maxLength={60}
        />
      </Field>

      <Field label="Phone" htmlFor="phone" hint="For order coordination">
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          placeholder="98765 43210"
          required
        />
      </Field>

      <Field label="What do you sell?" htmlFor="category">
        <select
          id="category"
          name="category"
          required
          className="w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-base text-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          {options.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="About your business"
        htmlFor="about"
        hint="What you sell, where you source, your experience — min 20 characters"
      >
        <Textarea id="about" name="about" rows={4} required minLength={20} maxLength={600} />
      </Field>

      {state.error ? (
        <p className="rounded-xl border border-live/30 bg-live/10 px-3 py-2 text-sm text-live">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Submitting…" : "Submit application"}
      </Button>
    </form>
  );
}
