"use client";

import { useActionState, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/action-button";
import { Field, Input } from "@/components/ui/input";
import { ImageUploader } from "@/components/upload/image-uploader";
import { useToast } from "@/components/toast";
import {
  adminUpdateProduct,
  type AdminProductState,
} from "@/app/(admin)/admin/products/actions";

export type EditableProduct = {
  id: string;
  title: string;
  priceInPaise: number;
  availableStock: number;
  imageUrl: string | null;
  isLive: boolean;
};

/**
 * Expandable inline editor for a product row in the admin table.
 * Kept in a <details>-style disclosure rather than a modal so an admin can
 * scan the table and fix several listings without losing their place.
 */
export function ProductRowEditor({ product }: { product: EditableProduct }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<
    AdminProductState,
    FormData
  >(adminUpdateProduct, {});
  const [imageUrl, setImageUrl] = useState<string | null>(product.imageUrl);
  const { toast } = useToast();

  useEffect(() => {
    if (state.error) toast({ title: state.error, variant: "error" });
    else if (state.success) toast({ title: state.success, variant: "success" });
  }, [state, toast]);

  // Collapse the editor once a save succeeds — a render-phase adjustment
  // (react.dev "adjusting state during render"), not a cascading effect.
  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    if (state.success) setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="rounded-full px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
      >
        {open ? "Close" : "Edit"}
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <form
              action={formAction}
              className="mt-3 space-y-4 rounded-2xl border border-border bg-surface-2/40 p-4 text-left"
            >
              <input type="hidden" name="id" value={product.id} />

              <ImageUploader
                kind="product"
                label="Product photo (required)"
                value={imageUrl}
                onChange={setImageUrl}
                aspect="tile"
                maxWidth={1080}
              />
              <input type="hidden" name="imageUrl" value={imageUrl ?? ""} />

              <Field label="Title" htmlFor={`ap-title-${product.id}`}>
                <Input
                  id={`ap-title-${product.id}`}
                  name="title"
                  defaultValue={product.title}
                  required
                  maxLength={100}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Price (₹)" htmlFor={`ap-price-${product.id}`}>
                  <Input
                    id={`ap-price-${product.id}`}
                    name="price"
                    type="number"
                    min="1"
                    step="0.01"
                    defaultValue={product.priceInPaise / 100}
                    required
                  />
                </Field>
                <Field label="Stock" htmlFor={`ap-stock-${product.id}`}>
                  <Input
                    id={`ap-stock-${product.id}`}
                    name="stock"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={product.availableStock}
                    required
                  />
                </Field>
              </div>

              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={pending || !imageUrl}
                  className="flex-1"
                >
                  {pending ? (
                    <span className="inline-flex items-center gap-2">
                      <Spinner /> Saving…
                    </span>
                  ) : (
                    "Save changes"
                  )}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
