"use client";

import { useState } from "react";
import { useToast } from "@/components/toast";
import { haptics } from "@/lib/haptics";

/**
 * Opens every pending shipping label at once, so a seller printing a morning
 * batch doesn't have to click through orders one at a time.
 *
 * Labels open as separate tabs rather than being merged into one PDF: the
 * files live on Eshopbox's storage and merging them would mean proxying and
 * re-rendering PDFs server-side. Browsers block bursts of `window.open`, so
 * the tabs are staggered, and the first blocked pop-up aborts the rest with
 * an explanation instead of silently opening nothing.
 */
export function BulkLabelButton({ labelUrls }: { labelUrls: string[] }) {
  const [opening, setOpening] = useState(false);
  const { toast } = useToast();

  function openAll() {
    haptics.tap();
    setOpening(true);

    let index = 0;
    const openNext = () => {
      if (index >= labelUrls.length) {
        setOpening(false);
        return;
      }
      const win = window.open(labelUrls[index], "_blank", "noopener,noreferrer");
      if (!win) {
        setOpening(false);
        toast({
          title: "Pop-ups are blocked",
          description:
            "Allow pop-ups for this site to print labels in one go, or open them individually.",
          variant: "error",
        });
        return;
      }
      index++;
      // ~250ms apart keeps Chrome and Safari from treating this as spam.
      setTimeout(openNext, 250);
    };

    openNext();
  }

  return (
    <button
      type="button"
      onClick={openAll}
      disabled={opening}
      className="shrink-0 rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {opening ? "Opening…" : `🖨️ Print all ${labelUrls.length} labels`}
    </button>
  );
}
