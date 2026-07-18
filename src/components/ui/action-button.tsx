"use client";

import { useFormStatus } from "react-dom";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/cn";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current align-middle",
        className,
      )}
    />
  );
}

/**
 * Submit button for server-action <form>s with built-in pending feedback:
 * while the action runs it disables and swaps to a spinner, so every tap
 * gives instant visual response. Styling stays per-call-site via className.
 */
export function ActionButton({
  children,
  pendingLabel,
  className,
  haptic,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  pendingLabel?: string;
  haptic?: keyof typeof haptics;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || props.disabled}
      aria-busy={pending}
      onClick={(e) => {
        if (haptic) haptics[haptic]();
        props.onClick?.(e);
      }}
      {...props}
      className={cn(className, pending && "pointer-events-none opacity-60")}
    >
      {pending ? (
        <span className="inline-flex items-center justify-center gap-1.5">
          <Spinner />
          {/* Keep the label visible — loader sits beside it, never replaces it. */}
          {pendingLabel ?? children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
