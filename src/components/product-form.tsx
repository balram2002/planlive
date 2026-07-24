"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/action-button";
import { Field, Input } from "@/components/ui/input";
import { ImageUploader } from "@/components/upload/image-uploader";
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
  defaultValues?: {
    title?: string;
    priceRupees?: number;
    stock?: number;
    imageUrl?: string | null;
    weightGrams?: number;
    lengthCm?: number;
    breadthCm?: number;
    heightCm?: number;
  };
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    {},
  );
  const [imageUrl, setImageUrl] = useState<string | null>(
    defaultValues?.imageUrl ?? null,
  );
  const { toast } = useToast();

  useEffect(() => {
    if (state.error) toast({ title: state.error, variant: "error" });
  }, [state, toast]);

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <ImageUploader
          kind="product"
          label="Product photo (required)"
          value={imageUrl}
          onChange={setImageUrl}
          aspect="tile"
          maxWidth={1080}
        />
        <input type="hidden" name="imageUrl" value={imageUrl ?? ""} />
        {!imageUrl ? (
          <p className="mt-2 text-xs text-faint">
            Buyers see this photo in the live room, the product list and their
            orders. Square crops look best.
          </p>
        ) : null}
      </div>

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

      {/* Parcel details — the courier prices and books from these. */}
      <fieldset className="rounded-2xl border border-border p-4">
        <legend className="px-1.5 text-xs font-semibold uppercase tracking-wide text-faint">
          Parcel details
        </legend>
        <p className="mb-3 text-xs text-muted">
          Measure the packed box. Couriers charge on whichever is greater —
          actual weight or volume — so accurate numbers keep your costs down.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Weight (grams)" htmlFor="weightGrams">
            <Input
              id="weightGrams"
              name="weightGrams"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              placeholder="500"
              defaultValue={defaultValues?.weightGrams ?? 500}
              required
            />
          </Field>
          <Field label="Length (cm)" htmlFor="lengthCm">
            <Input
              id="lengthCm"
              name="lengthCm"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              placeholder="25"
              defaultValue={defaultValues?.lengthCm ?? 25}
              required
            />
          </Field>
          <Field label="Breadth (cm)" htmlFor="breadthCm">
            <Input
              id="breadthCm"
              name="breadthCm"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              placeholder="20"
              defaultValue={defaultValues?.breadthCm ?? 20}
              required
            />
          </Field>
          <Field label="Height (cm)" htmlFor="heightCm">
            <Input
              id="heightCm"
              name="heightCm"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              placeholder="5"
              defaultValue={defaultValues?.heightCm ?? 5}
              required
            />
          </Field>
        </div>
      </fieldset>

      {state.error ? (
        <p className="rounded-xl border border-live/30 bg-live/10 px-3 py-2 text-sm text-live">
          {state.error}
        </p>
      ) : null}

      <div className="flex gap-3 pt-1">
        <Button type="submit" disabled={pending || !imageUrl} className="flex-1">
          {pending ? (
            <span className="inline-flex items-center gap-2"><Spinner /> Saving…</span>
          ) : !imageUrl ? (
            "Add a photo to continue"
          ) : (
            submitLabel
          )}
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
