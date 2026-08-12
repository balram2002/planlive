"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { useToast } from "@/components/toast";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/cn";

export type ShareTarget = {
  /** Absolute or app-relative URL. Relative is resolved against the origin. */
  url: string;
  title: string;
  /** One-line context shown in the preview and prefilled into messages. */
  description?: string;
  /** Cover image for the preview card. */
  imageUrl?: string | null;
  /** Small pill over the cover, e.g. "LIVE NOW". */
  badge?: string;
};

type Channel = {
  key: string;
  label: string;
  /** Builds the outbound URL. */
  href: (url: string, text: string) => string;
  className: string;
  icon: React.ReactNode;
};

/**
 * Channels people actually use in this market, in rough order of use.
 * Each opens the platform's own composer with the text prefilled — no SDKs,
 * no tracking scripts, nothing that needs a CSP exception.
 */
const CHANNELS: Channel[] = [
  {
    key: "whatsapp",
    label: "WhatsApp",
    href: (url, text) =>
      `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
    className: "bg-[#25D366]/15 text-[#128C7E] dark:text-[#25D366]",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-5 w-5"
        aria-hidden
      >
        <path d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.86 9.86 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.44 9.9-9.9 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.16 8.16 0 0 1-1.25-4.39c0-4.54 3.7-8.23 8.23-8.23 2.2 0 4.26.86 5.82 2.41a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.7 8.25-8.24 8.25Zm4.52-6.17c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.53.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.44.13-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.16 0-.43.06-.65.31-.22.25-.86.84-.86 2.05s.88 2.38 1 2.54c.12.17 1.73 2.64 4.19 3.7.59.25 1.04.4 1.4.52.59.19 1.12.16 1.55.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.22-.17-.47-.29Z" />
      </svg>
    ),
  },
  {
    key: "telegram",
    label: "Telegram",
    href: (url, text) =>
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    className: "bg-[#229ED9]/15 text-[#1c7fb0] dark:text-[#4bb8ee]",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-5 w-5"
        aria-hidden
      >
        <path d="M21.94 4.6 18.9 19.2c-.23 1.02-.84 1.27-1.7.79l-4.7-3.46-2.27 2.18c-.25.25-.46.46-.94.46l.33-4.78 8.7-7.86c.38-.34-.08-.53-.59-.19L6.98 13.1l-4.63-1.45c-1-.31-1.03-1 .21-1.48l18.1-6.98c.84-.3 1.57.2 1.28 1.4Z" />
      </svg>
    ),
  },
  {
    key: "x",
    label: "X",
    href: (url, text) =>
      `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    className: "bg-foreground/10 text-foreground",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-5 w-5"
        aria-hidden
      >
        <path d="M17.53 3h3.06l-6.69 7.64L21.75 21h-6.16l-4.83-6.3L5.24 21H2.18l7.15-8.17L2.25 3h6.32l4.36 5.77L17.53 3Zm-1.07 16.14h1.7L7.62 4.76H5.8l10.66 14.38Z" />
      </svg>
    ),
  },
  {
    key: "facebook",
    label: "Facebook",
    href: (url) =>
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    className: "bg-[#1877F2]/15 text-[#1461c9] dark:text-[#4c9bff]",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-5 w-5"
        aria-hidden
      >
        <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.49-3.91 3.77-3.91 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.44 2.91h-2.34V22c4.78-.76 8.44-4.92 8.44-9.94Z" />
      </svg>
    ),
  },
  {
    key: "email",
    label: "Email",
    href: (url, text) =>
      `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(`${text}\n\n${url}`)}`,
    className: "bg-surface-2 text-muted",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
        <path
          d="M3 7.5A1.5 1.5 0 0 1 4.5 6h15A1.5 1.5 0 0 1 21 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5v-9Zm0 .5 9 6 9-6"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

// Client-mount detection without a setState-in-effect.
const emptySubscribe = () => () => {};
function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

/** Resolves an app-relative path to a full URL for sharing. */
function absoluteUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (typeof window === "undefined") return url;
  return new URL(url, window.location.origin).toString();
}

/**
 * The app's one share sheet.
 *
 * A share is only as good as what the recipient sees, so the modal previews
 * the exact card that will be posted — cover, title, context, host. Channels
 * are plain composer links rather than SDKs: nothing to load, nothing that
 * needs a CSP exception, and they work offline-first from the user's own app.
 */
export function ShareModal({
  open,
  onClose,
  target,
}: {
  open: boolean;
  onClose: () => void;
  target: ShareTarget;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  // navigator.share exists only in the browser, and only on some platforms.
  // Reading it through useSyncExternalStore keeps the server and first client
  // render identical (no hydration mismatch) without a setState-in-effect.
  const mounted = useMounted();
  const canNativeShare =
    mounted && typeof navigator !== "undefined" && !!navigator.share;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  // Reset the copied tick whenever the sheet reopens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setCopied(false);
  }

  const shareUrl = absoluteUrl(target.url);
  const shareText = target.description
    ? `${target.title} — ${target.description}`
    : target.title;

  const copy = useCallback(async () => {
    haptics.tap();
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast({ title: "Link copied", variant: "success" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Couldn't copy — long-press the link", variant: "error" });
    }
  }, [shareUrl, toast]);

  const nativeShare = useCallback(async () => {
    haptics.tap();
    try {
      await navigator.share({
        title: target.title,
        text: target.description,
        url: shareUrl,
      });
      onClose();
    } catch {
      // Sheet dismissed — not an error.
    }
  }, [target.title, target.description, shareUrl, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            aria-label="Close share"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[95] bg-black/60 backdrop-blur-[2px]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Share"
            data-no-swipe
            initial={{ opacity: 0, y: 32, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className="fixed inset-x-0 bottom-0 z-[100] mx-auto w-full max-w-md overflow-hidden rounded-t-3xl border border-b-0 border-border bg-surface shadow-pop sm:inset-0 sm:my-auto sm:h-fit sm:rounded-3xl sm:border-b"
          >
            <div className="max-h-[88dvh] overflow-y-auto p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border sm:hidden" />

              <div className="mb-4 flex items-start justify-between gap-3">
                <h2 className="text-base font-semibold">Share</h2>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={onClose}
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

              {/* Preview of the card recipients will see. */}
              <div className="overflow-hidden rounded-2xl border border-border bg-surface-2">
                {target.imageUrl ? (
                  <div className="relative aspect-[16/9] w-full bg-surface">
                    <Image
                      src={target.imageUrl}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 100vw, 420px"
                      className="object-cover"
                    />
                    {target.badge ? (
                      <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full bg-live px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                        <span className="h-1.5 w-1.5 rounded-full bg-white animate-live-pulse" />
                        {target.badge}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <div className="p-3">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug">
                    {target.title}
                  </p>
                  {target.description ? (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
                      {target.description}
                    </p>
                  ) : null}
                  <p className="mt-1.5 truncate text-[11px] text-faint">
                    {shareUrl.replace(/^https?:\/\//, "")}
                  </p>
                </div>
              </div>

              {/* Copy link */}
              <div className="mt-4 flex items-center gap-2 rounded-2xl border border-border bg-surface-2 p-2 pl-3.5">
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted">
                  {shareUrl}
                </span>
                <button
                  type="button"
                  onClick={copy}
                  className={cn(
                    "shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition-all active:scale-95",
                    copied
                      ? "bg-success/15 text-success"
                      : "bg-primary text-primary-foreground",
                  )}
                >
                  {copied ? "Copied ✓" : "Copy"}
                </button>
              </div>

              {/* Channels */}
              <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-5">
                {canNativeShare ? (
                  <ChannelTile
                    label="More"
                    className="bg-primary/10 text-primary"
                    onClick={nativeShare}
                    icon={
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        className="h-5 w-5"
                        aria-hidden
                      >
                        <path
                          d="M12 3v12m0-12L8 7m4-4 4 4M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    }
                  />
                ) : null}

                {CHANNELS.map((channel) => (
                  <ChannelTile
                    key={channel.key}
                    label={channel.label}
                    className={channel.className}
                    icon={channel.icon}
                    href={channel.href(shareUrl, shareText)}
                    onClick={() => haptics.tap()}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

/** One channel button — a link when it navigates out, a button otherwise. */
function ChannelTile({
  label,
  icon,
  className,
  href,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  className: string;
  href?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-full transition-transform duration-200 group-active:scale-90",
          className,
        )}
      >
        {icon}
      </span>
      <span className="w-full truncate text-center text-[10px] font-medium text-muted">
        {label}
      </span>
    </>
  );

  const shell = "group flex min-w-0 flex-col items-center gap-1.5";

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
        className={shell}
      >
        {body}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={shell}>
      {body}
    </button>
  );
}
