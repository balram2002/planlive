"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import type { FormState } from "@/app/(seller)/dashboard/actions";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export function ProductForm({
  action,
  submitLabel,
  defaultValues,
}: {
  action: Action;
  submitLabel: string;
  defaultValues?: { title?: string; priceRupees?: number; stock?: number };
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    {},
  );
  const { toast } = useToast();

  useEffect(() => {
    if (state.error) toast({ title: state.error, variant: "error" });
  }, [state, toast]);

  return (
    <form action={formAction} className="space-y-5">
      <Field label="Product title" htmlFor="title">
        <Input
          id="title"
          name="title"
          placeholder="Vintage denim jacket"
          defaultValue={defaultValues?.title}
          maxLength={100}
          required
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Price (₹)" htmlFor="price">
          <Input
            id="price"
            name="price"
            type="number"
            inputMode="decimal"
            min="1"
            step="0.01"
            placeholder="1499"
            defaultValue={defaultValues?.priceRupees}
            required
          />
        </Field>

        <Field label="Stock" htmlFor="stock" hint="Units available">
          <Input
            id="stock"
            name="stock"
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            placeholder="10"
            defaultValue={defaultValues?.stock}
            required
          />
        </Field>
      </div>

      {state.error ? (
        <p className="rounded-xl border border-live/30 bg-live/10 px-3 py-2 text-sm text-live">
          {state.error}
        </p>
      ) : null}

      <div className="flex gap-3 pt-1">
        <Button type="submit" disabled={pending} className="flex-1">
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Link
          href="/dashboard"
          className="inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-medium text-muted hover:text-foreground"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
