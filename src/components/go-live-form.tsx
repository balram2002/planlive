"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/action-button";
import { ImageUploader } from "@/components/upload/image-uploader";
import { useToast } from "@/components/toast";
import { formatPrice } from "@/lib/format";
import { haptics } from "@/lib/haptics";
import {
  startStream,
  type StartStreamState,
} from "@/app/(seller)/go-live/actions";

type PickableProduct = {
  id: string;
  title: string;
  priceInPaise: number;
  availableStock: number;
};

type PickableCategory = { id: string; name: string; subcategory: string | null };

/** Product picker + cover + category + start button. Prefills from a schedule. */
export function GoLiveForm({
  products,
  categories,
  preselectedIds,
  initialThumbnailUrl = null,
  initialTitle = "",
  scheduledId,
}: {
  products: PickableProduct[];
  categories: PickableCategory[];
  preselectedIds?: string[];
  initialThumbnailUrl?: string | null;
  initialTitle?: string;
  scheduledId?: string;
}) {
  const [state, formAction, pending] = useActionState<StartStreamState, FormData>(
    startStream,
    {},
  );
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(
    initialThumbnailUrl,
  );
  const { toast } = useToast();

  useEffect(() => {
    if (state.error) toast({ title: state.error, variant: "error" });
  }, [state, toast]);

  const isPreselected = (id: string, stock: number) =>
    preselectedIds && preselectedIds.length > 0
      ? preselectedIds.includes(id)
      : stock > 0;

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label
          htmlFor="live-title"
          className="mb-1.5 block text-sm font-medium text-muted"
        >
          Stream title <span className="font-normal text-faint">(optional)</span>
        </label>
        <input
          id="live-title"
          name="title"
          defaultValue={initialTitle}
          maxLength={80}
          placeholder="Friday drip drop 🔥"
          className="w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-base text-foreground placeholder:text-faint focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <ImageUploader
        kind="thumbnail"
        label="Stream cover (required)"
        value={thumbnailUrl}
        onChange={setThumbnailUrl}
        aspect="portrait"
      />
      <input type="hidden" name="thumbnailUrl" value={thumbnailUrl ?? ""} />
      {scheduledId ? (
        <input type="hidden" name="scheduledId" value={scheduledId} />
      ) : null}

      <div>
        <label
          htmlFor="live-category"
          className="mb-1.5 block text-sm font-medium text-muted"
        >
          Category (required)
        </label>
        <select
          id="live-category"
          name="categoryId"
          required
          defaultValue=""
          className="w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-base text-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="" disabled>
            What are you selling today?
          </option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
              {category.subcategory ? ` · ${category.subcategory}` : ""}
            </option>
          ))}
        </select>
        {categories.length === 0 ? (
          <p className="mt-1.5 text-xs text-warning">
            No active categories — add one under Categories first.
          </p>
        ) : null}
      </div>

      <fieldset className="space-y-2.5">
        <legend className="mb-1 text-sm font-medium text-muted">
          Feature products in this stream
        </legend>
        {products.map((product) => (
          <label
            key={product.id}
            className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border bg-surface p-3 transition-colors has-[:checked]:border-primary/60 has-[:checked]:bg-primary/5"
          >
            <input
              type="checkbox"
              name="productIds"
              value={product.id}
              defaultChecked={isPreselected(product.id, product.availableStock)}
              className="h-4 w-4 shrink-0 accent-primary"
            />
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2">
              🏷️
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {product.title}
              </span>
              <span className="text-xs text-muted">
                {formatPrice(product.priceInPaise)} ·{" "}
                {product.availableStock > 0
                  ? `${product.availableStock} in stock`
                  : "sold out"}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {state.error ? (
        <p className="rounded-xl border border-live/30 bg-live/10 px-3 py-2 text-sm text-live">
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={pending || !thumbnailUrl || categories.length === 0}
        className="w-full"
        onClick={() => haptics.impact()}
      >
        {pending ? (
          <span className="inline-flex items-center gap-2"><Spinner /> Starting…</span>
        ) : !thumbnailUrl ? (
          "Add a cover to go live"
        ) : (
          "🔴 Go live"
        )}
      </Button>
    </form>
  );
}
