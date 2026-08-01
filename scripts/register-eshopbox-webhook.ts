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

/**
 * Every documented subtype for both resources.
 *
 * Re-running is safe and expected: an already-registered event comes back as
 * "Webhook already exists" and is reported as a skip, so this list is the
 * single source of truth rather than something to comment in and out.
 */
const SHIPMENT_SUBTYPES = [
  "created",
  "packed",
  "ready_to_ship",
  "picked_up",
  "out_for_pickup",
  "pickup_failed",
  "intransit",
  "out_for_delivery",
  "delivered",
  "failed_delivery",
  "rto_created",
  "rto_intransit",
  "rto_out_for_delivery",
  "rto_delivered",
  "rto_failed",
  "shipment_delayed",
  "dispatched",
  "shipment_held",
  "unhold",
  "return_expected",
  "cancelled_order",
  "ndr_resolution_submitted",
  "damage",
  "lost",
];

const RETURN_SUBTYPES = [
  "created",
  "approved",
  "pickup_pending",
  "out_for_pickup",
  "pickup_cancelled",
  "pickup_failed",
  "picked_up",
  "intransit",
  "out_for_delivery",
  "delivered",
  "delivered_warehouse",
  "failed_delivery",
  "complete",
  "return_cancelled",
  "lost",
];

const EVENTS = [
  ...SHIPMENT_SUBTYPES.map((eventSubType) => ({
    resource: "shipment",
    eventSubType,
  })),
  ...RETURN_SUBTYPES.map((eventSubType) => ({
    resource: "returnShipment",
    eventSubType,
  })),
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

  const endpoint = `${appUrl.replace(/\/$/, "")}/api/webhooks/eshopbox`;
  const baseUrl = `https://${ESHOPBOX_ACCOUNT_SLUG}.myeshopbox.com`;

  console.log(`Registering ${endpoint}\n  on ${baseUrl}\n`);

  let registered = 0;
  let existing = 0;
  const failures: string[] = [];

  for (const event of EVENTS) {
    // The resource is pinned onto the URL. Both resources reuse the same
    // subtype names for opposite meanings ("delivered"), and the payload does
    // not reliably say which one it is — so the endpoint is told explicitly
    // rather than left to guess from the body.
    const webhookUrl = `${endpoint}?resource=${event.resource}`;
    const label = `${event.resource}.${event.eventSubType}`;
    try {
      await eshopboxRequest({
        method: "POST",
        baseUrl,
        path: "/api/v1/webhook",
        headers: { ProxyHost: ESHOPBOX_ACCOUNT_SLUG },
        body: {
          resource: event.resource,
          eventType: "PUT",
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
      registered++;
      console.log(`  ✅ ${label}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Already-registered and not-supported are both expected outcomes of
      // running the full list; only anything else is a real problem.
      if (/already exists/i.test(message)) {
        existing++;
        console.log(`  ↺  ${label} (already registered)`);
      } else if (/does not exist|not subscribe/i.test(message)) {
        console.log(`  –  ${label} (not offered by this account)`);
      } else {
        failures.push(`${label}: ${message}`);
        console.error(`  ⚠️  ${label}: ${message}`);
      }
    }
  }

  console.log(
    `\nDone. ${registered} newly registered, ${existing} already present.`,
  );
  if (failures.length > 0) {
    console.log(`${failures.length} need attention:`);
    for (const failure of failures) console.log(`  - ${failure}`);
  }
  console.log("Verify deliveries in the Eshopbox dashboard.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
