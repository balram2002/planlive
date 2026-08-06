"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/toast";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/cn";

/**
 * Shipping-label preview.
 *
 * Sellers need to *see* the label before printing — a wrong parcel's label on
 * the wrong box is an expensive mistake to discover at the courier's van. The
 * PDF renders inline in an iframe (browsers have a native PDF viewer with its
 * own print control), with an explicit Download that names the file after the
 * AWB so a stack of them stays sortable on disk.
 */
export function LabelViewer({
  labelUrl,
  trackingId,
  courierName,
  productTitle,
  trigger = "button",
  className,
}: {
  labelUrl: string;
  trackingId: string | null;
  courierName?: string | null;
  productTitle?: string | null;
  /** "button" for panels, "link" for dense table rows. */
  trigger?: "button" | "link";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  const fileName = `label-${trackingId ?? "shipment"}.pdf`;

  /**
   * Downloads via blob so the file lands with our name.
   *
   * A plain `download` attribute is ignored cross-origin, and the label is
   * served from Google Cloud Storage — so without this the browser either
   * navigates to the PDF or saves it under a UUID nobody can identify later.
   */
  const download = useCallback(async () => {
    haptics.tap();
    setDownloading(true);
    try {
      const res = await fetch(labelUrl);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch {
      // CORS or an expired link — the direct tab still works.
      toast({
        title: "Opening the label in a new tab instead",
        variant: "error",
      });
      window.open(labelUrl, "_blank", "noopener,noreferrer");
    } finally {
      setDownloading(false);
    }
  }, [labelUrl, fileName, toast]);

  return (
    <>
      {trigger === "link" ? (
        <button
          type="button"
          onClick={() => {
            haptics.tap();
            setOpen(true);
          }}
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10",
            className,
          )}
        >
          Label
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            haptics.tap();
            setOpen(true);
          }}
          className={cn(
            "flex-1 rounded-full bg-foreground px-3 py-2 text-center text-xs font-semibold text-background transition-opacity hover:opacity-90",
            className,
          )}
        >
          🖨️ View &amp; print label
        </button>
      )}

      <AnimatePresence>
        {open ? (
          <>
            <motion.button
              aria-label="Close label"
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[95] bg-black/70 backdrop-blur-[2px]"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Shipping label"
              data-no-swipe
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 360, damping: 32 }}
              className="fixed inset-x-0 bottom-0 z-[100] mx-auto flex h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-b-0 border-border bg-surface shadow-pop sm:inset-4 sm:bottom-4 sm:h-auto sm:rounded-3xl sm:border-b"
            >
              {/* Header */}
              <div className="shrink-0 border-b border-border px-4 py-3 sm:px-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold">Shipping label</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      {courierName ? (
                        <Badge tone="primary">{courierName}</Badge>
                      ) : null}
                      {trackingId ? (
                        <span className="break-all font-mono text-[11px] tabular-nums text-muted">
                          AWB {trackingId}
                        </span>
                      ) : null}
                    </div>
                    {productTitle ? (
                      <p className="mt-1 truncate text-xs text-muted">
                        {productTitle}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={() => setOpen(false)}
                    className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-all hover:bg-surface-2 hover:text-foreground active:scale-90"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      className="h-4 w-4"
                      aria-hidden
                    >
                      <path
                        d="m6 6 12 12M18 6 6 18"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Preview */}
              <div className="min-h-0 flex-1 bg-surface-2">
                <iframe
                  src={labelUrl}
                  title="Shipping label preview"
                  className="h-full w-full border-0"
                />
              </div>

              {/* Actions */}
              <div className="shrink-0 border-t border-border px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:px-5">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={download}
                    disabled={downloading}
                    className="flex-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-all active:scale-[0.99] disabled:opacity-50"
                  >
                    {downloading ? "Downloading…" : "⬇ Download PDF"}
                  </button>
                  <a
                    href={labelUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => haptics.tap()}
                    className="flex-1 rounded-full border border-border py-2.5 text-center text-sm font-semibold text-muted transition-colors hover:border-primary/50 hover:text-foreground"
                  >
                    Open in new tab
                  </a>
                </div>
                <p className="mt-2 text-center text-[11px] text-faint">
                  Print at 100% scale — couriers reject resized barcodes.
                </p>
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
