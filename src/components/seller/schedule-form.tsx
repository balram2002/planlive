"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { ImageUploader } from "@/components/upload/image-uploader";
import { useToast } from "@/components/toast";
import { formatPrice } from "@/lib/format";
import {
  createSchedule,
  type ScheduleState,
} from "@/app/(seller)/dashboard/schedule/actions";

type PickableProduct = {
  id: string;
  title: string;
  priceInPaise: number;
};

export function ScheduleForm({ products }: { products: PickableProduct[] }) {
  const [state, formAction, pending] = useActionState<ScheduleState, FormData>(
    createSchedule,
    {},
  );
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (state.error) toast({ title: state.error, variant: "error" });
  }, [state, toast]);

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Stream title" htmlFor="sch-title">
        <Input
          id="sch-title"
          name="title"
          placeholder="Friday drip drop 🔥"
          required
          maxLength={80}
        />
      </Field>

      <Field label="Date & time" htmlFor="sch-when">
        <Input
          id="sch-when"
          name="scheduledFor"
          type="datetime-local"
          required
        />
      </Field>

      <ImageUploader
        kind="thumbnail"
        label="Cover image (optional)"
        value={thumbnailUrl}
        onChange={setThumbnailUrl}
        aspect="portrait"
      />
      <input type="hidden" name="thumbnailUrl" value={thumbnailUrl ?? ""} />

      {products.length > 0 ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-muted">
            Planned lineup (optional)
          </legend>
          <div className="space-y-2">
            {products.map((product) => (
              <label
                key={product.id}
                className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border bg-surface p-3 transition-colors has-[:checked]:border-primary/60 has-[:checked]:bg-primary/5"
              >
                <input
                  type="checkbox"
                  name="productIds"
                  value={product.id}
                  className="h-4 w-4 shrink-0 accent-primary"
                />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {product.title}
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {formatPrice(product.priceInPaise)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Scheduling…" : "Schedule stream"}
      </Button>
    </form>
  );
}
