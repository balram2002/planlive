import "server-only";
import { after } from "next/server";
import nodemailer, { type Transporter } from "nodemailer";

/**
 * Transactional email over SMTP via Nodemailer.
 *
 * Reliability decisions worth knowing:
 *
 *  - **Pooled connections.** A pool reuses a handful of authenticated SMTP
 *    sockets instead of reconnecting per message. TLS handshakes dominate the
 *    cost of sending, and most providers throttle connection *rate* far more
 *    aggressively than message rate.
 *  - **Rate limiting is built in.** `maxMessages` / `rateDelta` keep us under
 *    provider caps; exceeding them gets a sending domain temporarily blocked,
 *    which is much worse than a slow queue.
 *  - **Send after the response.** `after()` defers delivery until the HTTP
 *    response is flushed, while keeping the invocation alive — unlike a bare
 *    floating promise, which serverless will kill mid-flight.
 *  - **Fail-soft.** Nothing here throws. A bounced receipt must never turn a
 *    successful checkout into an error.
 */

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT ?? 587);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASSWORD;

/** Envelope sender, e.g. `liveWAB <orders@yourdomain.com>`. */
const from = process.env.EMAIL_FROM ?? "liveWAB <no-reply@localhost>";
/** Where buyer replies should land; falls back to the sender. */
const replyTo = process.env.EMAIL_REPLY_TO ?? undefined;

const MAX_ATTEMPTS = 3;

export function emailConfigured(): boolean {
  return Boolean(host && user && pass);
}

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  /** Plain-text alternative; improves deliverability and spam scoring. */
  text?: string;
};

let transporter: Transporter | null = null;

/** Lazily builds the pooled transport (module load must stay side-effect free). */
function getTransport(): Transporter | null {
  if (!host || !user || !pass) return null;
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host,
    port,
    // 465 is implicit TLS; 587 upgrades via STARTTLS.
    secure: port === 465,
    auth: { user, pass },

    pool: true,
    maxConnections: 3,
    maxMessages: 50,
    // At most 10 messages per second, whatever the queue depth.
    rateDelta: 1000,
    rateLimit: 10,

    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,

    // Never silently downgrade to an unencrypted session.
    requireTLS: port !== 465,
    tls: { minVersion: "TLSv1.2" },
  });

  return transporter;
}

/**
 * Verifies SMTP credentials and connectivity. Called by the diagnostics
 * script so configuration problems surface before a real order does.
 */
export async function verifyEmailTransport(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const transport = getTransport();
  if (!transport) {
    return { ok: false, error: "SMTP is not configured (SMTP_HOST/USER/PASSWORD)." };
  }
  try {
    await transport.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A permanent SMTP failure — a bad recipient, a rejected sender — can't be
 * fixed by trying again. 4xx codes are transient (greylisting, throttling)
 * and are worth a retry.
 */
function isPermanent(err: unknown): boolean {
  const code = (err as { responseCode?: number })?.responseCode;
  return typeof code === "number" && code >= 500 && code < 600;
}

/** Sends immediately, awaiting the result. Returns false instead of throwing. */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  const transport = getTransport();
  if (!transport) {
    // Not configured (local dev, preview envs) — log so the flow stays
    // observable, and treat it as a no-op rather than an error.
    console.info(`[email] skipped (SMTP unset): ${message.subject}`);
    return false;
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(message.to)) {
    console.error(`[email] invalid recipient: ${message.to}`);
    return false;
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await transport.sendMail({
        from,
        to: message.to,
        replyTo,
        subject: message.subject,
        html: message.html,
        text: message.text ?? stripHtml(message.html),
      });
      return true;
    } catch (err) {
      if (isPermanent(err)) {
        console.error(`[email] permanent failure for "${message.subject}":`, err);
        return false;
      }
      if (attempt === MAX_ATTEMPTS) {
        console.error(
          `[email] giving up after ${MAX_ATTEMPTS} attempts ("${message.subject}"):`,
          err,
        );
        return false;
      }
      // Back off: 500ms, then 1s.
      await sleep(500 * 2 ** (attempt - 1));
    }
  }
  return false;
}

/**
 * Fire-and-forget send that still completes reliably. Safe to call from route
 * handlers and server actions.
 */
export function queueEmail(message: EmailMessage): void {
  try {
    after(() => sendEmail(message));
  } catch {
    // Outside a request scope (scripts, tests) `after` throws — send inline.
    void sendEmail(message);
  }
}

/** Crude HTML→text fallback, so every message has a plain-text part. */
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|tr|div|h1|h2|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
