"use client";

import { useActionState, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { formatPrice } from "@/lib/format";
import { haptics } from "@/lib/haptics";
import { downscaleImage } from "@/lib/downscale-image";
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

/** Product picker + thumbnail + start button for beginning a live stream. */
export function GoLiveForm({ products }: { products: PickableProduct[] }) {
  const [state, formAction, pending] = useActionState<StartStreamState, FormData>(
    startStream,
    {},
  );
  const { toast } = useToast();

  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [thumbFile, setThumbFile] = useState<Blob | null>(null);
  const [uploading, setUploading] = useState(false);

  async function onPickThumbnail(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const small = await downscaleImage(file);
      setThumbFile(small);
      setPreview(URL.createObjectURL(small));
    } catch {
      toast({ title: "Couldn't read that image", variant: "error" });
    }
  }

  /**
   * Uploads the (downscaled) thumbnail first, then submits the start form
   * with the returned URL riding along as a hidden field.
   */
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!thumbFile) return; // no thumbnail — plain server action submit
    e.preventDefault();
    haptics.impact();
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", thumbFile, "thumbnail.jpg");
      const res = await fetch("/api/upload", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) {
        toast({ title: json.error ?? "Thumbnail upload failed", variant: "error" });
        return;
      }
      const form = new FormData(e.currentTarget);
      form.set("thumbnailUrl", json.url);
      formAction(form);
    } catch {
      toast({ title: "Thumbnail upload failed", variant: "error" });
    } finally {
      setUploading(false);
    }
  }

  const busy = pending || uploading;

  return (
    <form action={formAction} onSubmit={onSubmit} className="space-y-5">
      {/* Thumbnail */}
      <div>
        <p className="mb-1.5 text-sm font-medium text-muted">
          Stream thumbnail{" "}
          <span className="font-normal text-faint">(optional)</span>
        </p>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onPickThumbnail}
          className="hidden"
        />
        <input type="hidden" name="thumbnailUrl" value="" />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="relative block aspect-[3/4] w-32 overflow-hidden rounded-2xl border border-dashed border-border bg-surface-2 transition-all duration-200 hover:border-primary/50 active:scale-[0.98]"
        >
          {preview ? (
            <Image
              src={preview}
              alt="Thumbnail preview"
              fill
              unoptimized
              className="object-cover"
            />
          ) : (
            <span className="flex h-full flex-col items-center justify-center gap-1 text-xs text-faint">
              <span className="text-xl">🖼️</span>
              Add cover
            </span>
          )}
        </button>
        {preview ? (
          <button
            type="button"
            onClick={() => {
              setPreview(null);
              setThumbFile(null);
              if (fileInput.current) fileInput.current.value = "";
            }}
            className="mt-1.5 text-xs font-medium text-muted hover:text-live"
          >
            Remove
          </button>
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
              defaultChecked={product.availableStock > 0}
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

      <Button type="submit" size="lg" disabled={busy} className="w-full">
        {uploading ? "Uploading cover…" : pending ? "Starting…" : "🔴 Go live"}
      </Button>
    </form>
  );
}
