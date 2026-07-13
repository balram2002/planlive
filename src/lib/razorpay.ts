// NOTE: no "server-only" guard — shared with standalone scripts. Never import
// from a client component.
import crypto from "node:crypto";
import Razorpay from "razorpay";

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

export function razorpayConfigured(): boolean {
  return Boolean(keyId && keySecret);
}

/** Public key id — safe to send to the browser for the Checkout modal. */
export const RAZORPAY_KEY_ID = keyId ?? "";

let client: Razorpay | null = null;

export function getRazorpay(): Razorpay {
  if (!keyId || !keySecret) {
    throw new Error("Razorpay is not configured");
  }
  client ??= new Razorpay({ key_id: keyId, key_secret: keySecret });
  return client;
}

/**
 * Verifies the `x-razorpay-signature` header: HMAC-SHA256 of the raw request
 * body with the webhook secret. Constant-time comparison.
 */
export function verifyRazorpayWebhookSignature(
  rawBody: string,
  signature: string | null,
): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
