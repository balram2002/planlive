"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Spinner } from "@/components/ui/action-button";
import { ImageUploader } from "@/components/upload/image-uploader";
import { useToast } from "@/components/toast";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/cn";
import {
  createProductInLive,
  type LiveProductState,
} from "@/app/(seller)/go-live/actions";

/**
 * Seller-only "add a product without leaving the stream" flow.
 *
 * A single trigger + bottom-sheet, in two presentations:
 *  - "overlay": a compact pill floated over the broadcast video, so the
 *    seller can add a product from the main live room itself.
 *  - "block":  a full-width button for the live console sidebar.
 *
 * The sheet carries a real photo uploader (direct-to-ImageKit), because every
 * other product surface is image-first and a photo-less product looks broken
 * to buyers.
 */
export function LiveAddProduct({
  streamId,
  variant = "block",
}: {
  streamId: string;
  variant?: "overlay" | "block";
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === "overlay" ? (
        <button
          type="button"
          onClick={() => {
            haptics.tap();
            setOpen(true);
          }}
          className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-white/15 bg-black/55 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur-md transition-all active:scale-95"
        >
          <PlusIcon />
          Add product
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            haptics.tap();
            setOpen(true);
          }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-3 text-sm font-semibold text-muted transition-colors hover:border-primary/50 hover:text-foreground"
        >
          <PlusIcon />
          Add a new product live
        </button>
      )}

      <AddProductSheet
        streamId={streamId}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function AddProductSheet({
  streamId,
  open,
  onClose,
}: {
  streamId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState<LiveProductState, FormData>(
    createProductInLive,
    {},
  );
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (state.error) toast({ title: state.error, variant: "error" });
  }, [state, toast]);

  // On success: toast, reset the form, and close. In an effect (not render)
  // because it reads a ref and calls a parent callback.
  const handledSuccess = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!state.success || state.success === handledSuccess.current) return;
    handledSuccess.current = state.success;
    toast({ title: state.success, variant: "success" });
    setImageUrl(null);
    formRef.current?.reset();
    onClose();
  }, [state.success, toast, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            aria-label="Close"
            className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-label="Add a product"
            data-no-swipe
            className="fixed inset-x-0 bottom-0 z-[90] mx-auto max-h-[88dvh] max-w-md overflow-y-auto no-scrollbar rounded-t-3xl border border-b-0 border-border bg-surface p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-pop"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
            <h2 className="text-base font-semibold">Add a product</h2>
            <p className="mb-4 text-xs text-muted">
              It goes straight into your live queue for buyers to grab.
            </p>

            <form ref={formRef} action={formAction} className="space-y-4">
              <input type="hidden" name="streamId" value={streamId} />

              <ImageUploader
                kind="product"
                label="Product photo (required)"
                value={imageUrl}
                onChange={setImageUrl}
                aspect="tile"
                maxWidth={1080}
              />
              <input type="hidden" name="imageUrl" value={imageUrl ?? ""} />

              <input
                name="title"
                required
                minLength={2}
                maxLength={100}
                placeholder="Product title"
                className="w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-base placeholder:text-faint focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />

              <div className="grid grid-cols-2 gap-3">
                <input
                  name="price"
                  type="number"
                  inputMode="decimal"
                  min="1"
                  step="0.01"
                  required
                  placeholder="Price ₹"
                  className="w-full min-w-0 rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-base placeholder:text-faint focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <input
                  name="stock"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  required
                  placeholder="Stock"
                  className="w-full min-w-0 rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-base placeholder:text-faint focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <p className="text-[11px] leading-relaxed text-faint">
                Parcel size defaults to a small packet — set exact dimensions
                later from your dashboard so shipping is priced right.
              </p>

              <button
                type="submit"
                disabled={pending || !imageUrl}
                className={cn(
                  "w-full rounded-full py-3 text-sm font-semibold transition-all active:scale-[0.98]",
                  pending || !imageUrl
                    ? "bg-surface-2 text-faint"
                    : "bg-primary text-primary-foreground",
                )}
              >
                {pending ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner /> Adding…
                  </span>
                ) : !imageUrl ? (
                  "Add a photo to continue"
                ) : (
                  "Add to stream"
                )}
              </button>
            </form>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
