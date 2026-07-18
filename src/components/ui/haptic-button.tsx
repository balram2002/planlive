"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/action-button";
import { haptics } from "@/lib/haptics";

type Pattern = keyof typeof haptics;

/**
 * Drop-in Button that fires a haptic on press and, inside a server-action
 * form, shows a spinner while the action is pending.
 */
export function HapticButton({
  pattern = "impact",
  onClick,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { pattern?: Pattern }) {
  const { pending } = useFormStatus();

  return (
    <Button
      {...props}
      disabled={pending || props.disabled}
      onClick={(e) => {
        haptics[pattern]();
        onClick?.(e);
      }}
    >
      {pending ? <Spinner className="h-4 w-4" /> : children}
    </Button>
  );
}
