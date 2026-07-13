"use client";

import { useState } from "react";
import { useToast } from "@/components/toast";
import { haptics } from "@/lib/haptics";

/** Native share sheet on mobile; copies the link elsewhere. */
export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  async function share() {
    haptics.tap();
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ title: "Link copied", description: url, variant: "success" });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Share sheet dismissed — nothing to do.
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      aria-label="Share stream"
      className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-all duration-200 active:scale-90"
    >
      {copied ? (
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
          <path
            d="m5 12 5 5L20 7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
          <path
            d="M12 3v12m0-12L8 7m4-4 4 4M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}
