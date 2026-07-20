import "server-only";
import { after } from "next/server";

/**
 * Transactional email over the Resend HTTP API.
 *
 * Deliberately dependency-free (plain fetch) and fail-soft: a bounced
 * notification must never break the checkout/profile flow that triggered it.
 * Delivery is retried a couple of times for transient 5xx/429 responses, and
 * is scheduled with `after()` so it runs once the HTTP response is already on
 * its way to the user — the request stays fast, but the runtime keeps the
 * invocation alive until the send finishes (unlike a bare floating promise,
 * which serverless will happily kill mid-flight).
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const MAX_ATTEMPTS = 3;

const apiKey = process.env.RESEND_API_KEY;
/** e.g. `liveWAB <orders@yourdomain.com>` — must be a verified Resend sender. */
const from = process.env.EMAIL_FROM ?? "liveWAB <onboarding@resend.dev>";

export function emailConfigured(): boolean {
  return Boolean(apiKey);
}

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  /** Plain-text alternative; improves deliverability and spam scoring. */
  text?: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sends immediately, awaiting the result. Returns false instead of throwing.
 * Prefer `queueEmail` from request handlers.
 */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  if (!apiKey) {
    // Not configured (local dev, preview envs) — log so the flow is still
    // observable, and treat it as a no-op rather than an error.
    console.info(`[email] skipped (RESEND_API_KEY unset): ${message.subject}`);
    return false;
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(message.to)) {
    console.error(`[email] invalid recipient: ${message.to}`);
    return false;
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          // Resend dedupes retries carrying the same idempotency key.
          "Idempotency-Key": idempotencyKey(message),
        },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          ...(message.text ? { text: message.text } : {}),
        }),
      });

      if (res.ok) return true;

      // 4xx (bad address, unverified sender…) will never succeed — stop.
      const retryable = res.status === 429 || res.status >= 500;
      const body = await res.text().catch(() => "");
      if (!retryable) {
        console.error(`[email] ${res.status} for "${message.subject}": ${body}`);
        return false;
      }
      if (attempt === MAX_ATTEMPTS) {
        console.error(
          `[email] giving up after ${MAX_ATTEMPTS} attempts (${res.status}): ${body}`,
        );
        return false;
      }
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) {
        console.error(`[email] network failure for "${message.subject}":`, err);
        return false;
      }
    }
    await sleep(300 * 2 ** (attempt - 1)); // 300ms, 600ms
  }
  return false;
}

/**
 * Fire-and-forget send that still completes reliably: `after()` defers the
 * work until the response has been flushed, and keeps the request alive for
 * it. Safe to call from route handlers and server actions.
 */
export function queueEmail(message: EmailMessage): void {
  try {
    after(() => sendEmail(message));
  } catch {
    // Outside a request scope (scripts, tests) `after` throws — send inline.
    void sendEmail(message);
  }
}

/** Stable per-message key so a retried request doesn't double-send. */
function idempotencyKey(message: EmailMessage): string {
  let hash = 5381;
  const seed = `${message.to}|${message.subject}|${message.html.length}`;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) + hash + seed.charCodeAt(i)) | 0;
  }
  return `lw-${(hash >>> 0).toString(36)}`;
}
