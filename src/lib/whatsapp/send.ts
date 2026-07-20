import "server-only";
import { after } from "next/server";

/**
 * WhatsApp notifications via Meta's WhatsApp Cloud API.
 *
 * IMPORTANT constraint of the platform (not of this code): a *business
 * initiated* conversation may only use a message TEMPLATE that Meta has
 * pre-approved. Free-form text is allowed only inside the 24-hour customer
 * service window that opens when the user messages you first. Every
 * notification we send here is business-initiated, so each one maps to a
 * named template; `WHATSAPP_ALLOW_FREEFORM=1` switches to plain text for
 * local testing against a number that has messaged you recently.
 *
 * Same failure discipline as email: never throws, retries transient errors,
 * and is scheduled with `after()` so it never delays the user's response.
 */

const GRAPH_VERSION = "v21.0";
const MAX_ATTEMPTS = 3;

const token = process.env.WHATSAPP_TOKEN;
const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
/** BCP-47 locale of your approved templates (e.g. en, en_US, en_GB). */
const templateLocale = process.env.WHATSAPP_TEMPLATE_LOCALE ?? "en";
const allowFreeform = process.env.WHATSAPP_ALLOW_FREEFORM === "1";
/** Default country code applied to bare 10-digit numbers. India = 91. */
const defaultCountryCode = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE ?? "91";

export function whatsappConfigured(): boolean {
  return Boolean(token && phoneNumberId);
}

export type WhatsappMessage = {
  /** Raw user-entered number; normalized before sending. */
  to: string;
  /** Approved template name in Meta Business Manager. */
  template: string;
  /** Ordered {{1}}, {{2}}… body substitutions. */
  parameters: string[];
  /** Plain-text equivalent, used when WHATSAPP_ALLOW_FREEFORM=1. */
  fallbackText: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Normalizes a user-entered phone number to the digits-only international
 * form the Cloud API expects (no `+`, no spaces).
 *
 * Returns null when the result can't plausibly be a real number, so we skip
 * the send instead of burning an API call on garbage input.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  // Strip the international access prefix people sometimes type (00 91 …).
  if (digits.startsWith("00")) digits = digits.slice(2);
  // A leading domestic trunk 0 (0 98765 43210) is not part of the number.
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  // Bare national number → prepend the configured country code.
  if (digits.length === 10) digits = `${defaultCountryCode}${digits}`;

  // E.164 allows at most 15 digits; anything under 10 can't be a mobile.
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

/** Sends immediately, awaiting the result. Returns false instead of throwing. */
export async function sendWhatsapp(message: WhatsappMessage): Promise<boolean> {
  if (!token || !phoneNumberId) {
    console.info(`[whatsapp] skipped (not configured): ${message.template}`);
    return false;
  }

  const to = normalizePhone(message.to);
  if (!to) {
    console.info(`[whatsapp] skipped (unusable number): ${message.template}`);
    return false;
  }

  const body = allowFreeform
    ? {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { preview_url: false, body: message.fallbackText },
      }
    : {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: message.template,
          language: { code: templateLocale },
          components: message.parameters.length
            ? [
                {
                  type: "body",
                  parameters: message.parameters.map((text) => ({
                    type: "text",
                    // Templates reject newlines/tabs in body params.
                    text: text.replace(/\s+/g, " ").slice(0, 1024),
                  })),
                },
              ]
            : [],
        },
      };

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (res.ok) return true;

      const detail = await res.text().catch(() => "");
      // 4xx means a bad number, an unapproved template, or an expired token —
      // retrying can't fix any of those.
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable) {
        console.error(
          `[whatsapp] ${res.status} for template "${message.template}": ${detail}`,
        );
        return false;
      }
      if (attempt === MAX_ATTEMPTS) {
        console.error(
          `[whatsapp] giving up after ${MAX_ATTEMPTS} attempts (${res.status}): ${detail}`,
        );
        return false;
      }
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) {
        console.error(`[whatsapp] network failure for "${message.template}":`, err);
        return false;
      }
    }
    await sleep(300 * 2 ** (attempt - 1));
  }
  return false;
}

/** Fire-and-forget send that still completes reliably (see email/send.ts). */
export function queueWhatsapp(message: WhatsappMessage): void {
  try {
    after(() => sendWhatsapp(message));
  } catch {
    // Outside a request scope (scripts, tests) — send inline.
    void sendWhatsapp(message);
  }
}
