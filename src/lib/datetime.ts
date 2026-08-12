/**
 * Date/time formatting, pinned to one timezone.
 *
 * Two problems solved at once:
 *
 *  1. HYDRATION. A client component that calls `toLocaleString` during render
 *     produces one string on the server (whose TZ is UTC in Docker) and a
 *     different one in the browser (IST, +5:30). React compares the two and
 *     reports a hydration mismatch. Pinning the zone makes both sides agree.
 *
 *  2. CORRECTNESS. Even without hydration, a UTC server was showing Indian
 *     sellers and buyers the wrong wall-clock time — a pickup deadline of
 *     "9:00 PM" rendered server-side as "3:30 PM". Pinning fixes the meaning,
 *     not just the mismatch.
 *
 * The zone is a constant rather than the viewer's local zone on purpose: the
 * marketplace, its couriers and its pickup windows all operate on IST, so a
 * deadline should read the same to everyone discussing it. Override with
 * NEXT_PUBLIC_APP_TIMEZONE if that ever stops being true.
 *
 * Client-safe: no server-only imports.
 */

export const APP_TIMEZONE =
  process.env.NEXT_PUBLIC_APP_TIMEZONE?.trim() || "Asia/Kolkata";

const LOCALE = "en-IN";

type Input = Date | string | number | null | undefined;

function toDate(value: Input): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "12 Aug 2026" */
export function formatDate(value: Input, fallback = "—"): string {
  const date = toDate(value);
  if (!date) return fallback;
  return date.toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: APP_TIMEZONE,
  });
}

/** "12 Aug" — for dense rows where the year is noise. */
export function formatDayMonth(value: Input, fallback = "—"): string {
  const date = toDate(value);
  if (!date) return fallback;
  return date.toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "short",
    timeZone: APP_TIMEZONE,
  });
}

/** "Tue, 12 Aug, 09:30 pm" — anything with a deadline attached. */
export function formatDateTime(value: Input, fallback = "—"): string {
  const date = toDate(value);
  if (!date) return fallback;
  return date.toLocaleString(LOCALE, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TIMEZONE,
  });
}

/** "12 Aug, 09:30 pm" — same, without the weekday. */
export function formatShortDateTime(value: Input, fallback = "—"): string {
  const date = toDate(value);
  if (!date) return fallback;
  return date.toLocaleString(LOCALE, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TIMEZONE,
  });
}
