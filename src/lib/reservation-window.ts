/**
 * The unpaid-hold window, in a module with no server-only imports.
 *
 * `lib/reservations.ts` pulls in Prisma and the mailer, so a client component
 * can't import the constant from there. Keeping it here means the countdown
 * copy in the buy drawer and the actual expiry logic can never disagree.
 */

/**
 * How long an unpaid hold survives.
 *
 * Five minutes, not ten: a hold is dead stock to every other viewer in the
 * room, and live drops are decided in seconds. Anyone who genuinely wants the
 * item can re-reserve it instantly once it's back.
 *
 * The sweeper runs every 45s, so the worst-case real lifetime is TTL + 45s.
 */
export const RESERVATION_TTL_MS = 5 * 60 * 1000;

/** Human form, so UI copy can never drift from the constant. */
export const RESERVATION_TTL_MINUTES = RESERVATION_TTL_MS / 60_000;
