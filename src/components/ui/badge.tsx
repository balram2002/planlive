import * as React from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "primary" | "live" | "success" | "warning";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted border border-border",
  primary: "bg-primary/15 text-primary",
  live: "bg-live/15 text-live",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
};

export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

/** Red pulsing "LIVE" pill for active streams. */
export function LiveBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-live px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white",
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-white animate-live-pulse" />
      Live
    </span>
  );
}
