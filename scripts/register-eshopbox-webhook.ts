/**
 * Registers (or re-registers) our shipment-tracking webhook with Eshopbox.
 *
 * Eshopbox does not sign webhook payloads, so we pass a secret of our own via
 * the `webhookHeaders` field they support at registration time. Our endpoint
 * then rejects anything that doesn't carry it — without this the endpoint
 * would let anyone mark orders delivered.
 *
 * Run: npm run eshopbox:register-webhook
 *
 * Requires ESHOPBOX_ACCOUNT_SLUG, ESHOPBOX_WEBHOOK_SECRET and
 * NEXT_PUBLIC_APP_URL (must be a public HTTPS URL — use a tunnel locally).
 */
import {
  eshopboxRequest,
  eshopboxConfigured,
  ESHOPBOX_ACCOUNT_SLUG,
  ESHOPBOX_CHANNEL_ID,
} from "../src/lib/eshopbox/client";

const secret = process.env.ESHOPBOX_WEBHOOK_SECRET;
const appUrl = process.env.NEXT_PUBLIC_APP_URL;

/** Shipment lifecycle events we want pushed to us. */
const EVENTS = [
  { resource: "shipment", eventSubType: "created" },
  { resource: "shipment", eventSubType: "updated" },
  { resource: "shipment", eventSubType: "picked_up" },
  { resource: "shipment", eventSubType: "delivered" },
  { resource: "returnShipment", eventSubType: "updated" },
];

async function main() {
  if (!eshopboxConfigured()) {
    throw new Error(
      "Eshopbox credentials missing (ESHOPBOX_CLIENT_ID / _CLIENT_SECRET / _REFRESH_TOKEN).",
    );
  }
  if (!ESHOPBOX_ACCOUNT_SLUG) {
    throw new Error("ESHOPBOX_ACCOUNT_SLUG is required to register webhooks.");
  }
  if (!secret) {
    throw new Error(
      "ESHOPBOX_WEBHOOK_SECRET is required — it's what authenticates incoming webhooks.",
    );
  }
  if (!appUrl?.startsWith("https://")) {
    throw new Error(
      `NEXT_PUBLIC_APP_URL must be a public HTTPS URL (got: ${appUrl ?? "unset"}).`,
    );
  }

  const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/webhooks/eshopbox`;
  const baseUrl = `https://${ESHOPBOX_ACCOUNT_SLUG}.myeshopbox.com`;

  console.log(`Registering ${webhookUrl}\n  on ${baseUrl}\n`);

  for (const event of EVENTS) {
    try {
      await eshopboxRequest({
        method: "POST",
        baseUrl,
        path: "/api/v1/webhook",
        headers: { ProxyHost: ESHOPBOX_ACCOUNT_SLUG },
        body: {
          resource: event.resource,
          eventType: "POST",
          eventSubType: event.eventSubType,
          version: "v1",
          ...(ESHOPBOX_CHANNEL_ID
            ? { externalChannelID: ESHOPBOX_CHANNEL_ID }
            : {}),
          webhookUrl,
          webhookMethod: "POST",
          webhookHeaders: { "x-livewab-webhook-secret": secret },
        },
      });
      console.log(`  ✅ ${event.resource}.${event.eventSubType}`);
    } catch (err) {
      // One already-registered event shouldn't abort the rest.
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ⚠️  ${event.resource}.${event.eventSubType}: ${message}`);
    }
  }

  console.log("\nDone. Verify deliveries in the Eshopbox dashboard.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
