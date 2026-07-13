"use client";

/**
 * Haptic feedback via the Vibration API. Android Chrome vibrates; iOS Safari
 * silently ignores (no error), so every call is safe everywhere.
 */
function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Some browsers throw on unsupported patterns — never let haptics break UX.
    }
  }
}

export const haptics = {
  /** Tiny tick for taps, toggles, swipes. */
  tap: () => vibrate(10),
  /** Light double-pulse for confirmations (reserved, copied, sent). */
  success: () => vibrate([15, 60, 25]),
  /** Firmer triple-pulse for failures and destructive actions. */
  error: () => vibrate([45, 70, 45]),
  /** Single medium pulse for important state changes (live start/end, paid). */
  impact: () => vibrate(35),
};
