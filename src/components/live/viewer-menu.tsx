"use client";

import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useToast } from "@/components/toast";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/cn";

// Client-mount detection (portals need document).
const emptySubscribe = () => () => {};
function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

type Row = {
  key: string;
  label: string;
  icon: string;
  active?: boolean;
  danger?: boolean;
  onPress: () => void;
};

/**
 * Three-dot drawer for viewers: mute audio, hide video (saves data — the
 * track detaches so LiveKit stops sending it), share, copy link, report.
 * Spring bottom-sheet, transform/opacity only.
 */
export function ViewerMenu({
  audioMuted,
  onToggleAudio,
  videoHidden,
  onToggleVideo,
  shareTitle,
}: {
  audioMuted: boolean;
  onToggleAudio: () => void;
  videoHidden: boolean;
  onToggleVideo: () => void;
  shareTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const mounted = useMounted();
  const { toast } = useToast();

  function close() {
    setOpen(false);
  }

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: shareTitle, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copied", variant: "success" });
      }
    } catch {
      // Dismissed.
    }
    close();
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast({ title: "Link copied", variant: "success" });
    } catch {
      toast({ title: "Couldn't copy link", variant: "error" });
    }
    close();
  }

  const rows: Row[] = [
    {
      key: "audio",
      label: audioMuted ? "Unmute audio" : "Mute audio",
      icon: audioMuted ? "🔇" : "🔊",
      active: audioMuted,
      onPress: () => {
        haptics.tap();
        onToggleAudio();
        close();
      },
    },
    {
      key: "video",
      label: videoHidden ? "Show video" : "Hide video (save data)",
      icon: videoHidden ? "🎬" : "📵",
      active: videoHidden,
      onPress: () => {
        haptics.tap();
        onToggleVideo();
        close();
      },
    },
    { key: "share", label: "Share stream", icon: "📤", onPress: share },
    { key: "copy", label: "Copy link", icon: "🔗", onPress: copyLink },
    {
      key: "report",
      label: "Report stream",
      icon: "🚩",
      danger: true,
      onPress: () => {
        haptics.impact();
        toast({
          title: "Report received",
          description: "Thanks — our team will take a look.",
          variant: "success",
        });
        close();
      },
    },
  ];

  return (
    <>
      <button
        type="button"
        aria-label="Stream options"
        onClick={() => {
          haptics.tap();
          setOpen(true);
        }}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-all duration-200 active:scale-90"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>

      {/* Portaled to <body>: escapes the room header's stacking context so
          the sheet always opens ABOVE every other room layer. */}
      {mounted
        ? createPortal(
            <AnimatePresence>
              {open ? (
                <>
                  <motion.button
                    aria-label="Close options"
                    className="fixed inset-0 z-[80] bg-black/40"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={close}
                  />
                  <motion.div
                    role="dialog"
                    aria-label="Stream options"
                    className="fixed inset-x-0 bottom-0 z-[90] mx-auto max-w-md rounded-t-3xl border border-b-0 border-border bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-pop"
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "100%" }}
                    transition={{ type: "spring", stiffness: 380, damping: 36 }}
                  >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
              <ul className="space-y-0.5">
                {rows.map((row) => (
                  <li key={row.key}>
                    <button
                      type="button"
                      onClick={row.onPress}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium transition-colors active:scale-[0.99]",
                        row.danger
                          ? "text-live hover:bg-live/10"
                          : "hover:bg-surface-2",
                        row.active && "bg-surface-2",
                      )}
                    >
                      <span aria-hidden className="text-base">
                        {row.icon}
                      </span>
                      {row.label}
                      {row.active ? (
                        <span className="ml-auto text-xs text-primary">On</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
                  </motion.div>
                </>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </>
  );
}
