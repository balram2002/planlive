"use client";

import { Button } from "@/components/ui/button";
import { haptics } from "@/lib/haptics";

type Pattern = keyof typeof haptics;

/**
 * Drop-in Button that fires a haptic on press. Usable inside server-rendered
 * forms (type="submit" keeps the form action working).
 */
export function HapticButton({
  pattern = "impact",
  onClick,
  ...props
}: React.ComponentProps<typeof Button> & { pattern?: Pattern }) {
  return (
    <Button
      {...props}
      onClick={(e) => {
        haptics[pattern]();
        onClick?.(e);
      }}
    />
  );
}
