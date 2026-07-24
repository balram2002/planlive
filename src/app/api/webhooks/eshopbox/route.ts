import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { applyTrackingUpdate } from "@/lib/shipping-service";

/**
 * Eshopbox shipment tracking webhook.
 *
 * SECURITY NOTE: Eshopbox does not sign its webhook payloads — there is no
 * HMAC header or shared signing secret in their API. What they *do* support
 * is arbitrary `webhookHeaders` supplied at registration time, so we register
 * with a secret header of our own and require it on every delivery. Without
 * this, the endpoint would let anyone on the internet mark orders delivered.
 *
 * The secret must match `ESHOPBOX_WEBHOOK_SECRET`, which the registration
 * script sends as `x-livewab-webhook-secret` (see scripts/register-eshopbox-webhook.ts).
 */

const secret = process.env.ESHOPBOX_WEBHOOK_SECRET;

/** Constant-time compare, so a wrong secret can't be guessed by timing. */
function secretMatches(provided: string | null): boolean {
  if (!secret || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  // timingSafeEqual throws on length mismatch — check it first, but the
  // length itself is not sensitive.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * The shipment webhook payload is large and quite different from the tracking
 * API's response — different casing (`trackingID` vs `trackingId`), lowercase
 * status values, and scan history as a `status_log` MAP keyed by status name
 * rather than a `statusLogs` array. Only the fields we act on are typed.
 */
type ShipmentWebhookPayload = {
  trackingID?: string;
  trackingId?: string;
  status?: string;
  currentStatus?: string;
  courierName?: string;
  courierPartnerName?: string;
  expectedDeliveryDate?: string;
  /** Tracking-API shape (array). */
  statusLogs?: unknown;
  /** Webhook shape: { "created": "2025-09-03 15:25:41", … } */
  status_log?: Record<string, string>;
  remarks?: string;
  customerOrderNumber?: string;
  externalShipmentID?: string;
};

/**
 * Normalises the webhook's `status_log` map into the same array shape the
 * tracking API returns, so the buyer-facing timeline renders identically no
 * matter which path delivered the update.
 */
function normaliseLogs(event: ShipmentWebhookPayload): unknown {
  if (Array.isArray(event.statusLogs)) return event.statusLogs;
  if (!event.status_log || typeof event.status_log !== "object") return undefined;

  return Object.entries(event.status_log)
    .filter(([, dateTime]) => typeof dateTime === "string")
    .map(([status, dateTime]) => ({
      status,
      dateTime,
      remarks: event.remarks || undefined,
    }))
    .sort((a, b) => Date.parse(a.dateTime) - Date.parse(b.dateTime));
}

export async function POST(req: NextRequest) {
  if (!secret) {
    console.error("[eshopbox] webhook hit but ESHOPBOX_WEBHOOK_SECRET is unset");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  if (!secretMatches(req.headers.get("x-livewab-webhook-secret"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: ShipmentWebhookPayload | ShipmentWebhookPayload[];
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Eshopbox sends a single object, but batching is cheap to support.
  const events = Array.isArray(payload) ? payload : [payload];

  for (const event of events) {
    // Their casing differs between the webhook (`trackingID`) and the
    // tracking API (`trackingId`) — accept either.
    const trackingId = event.trackingID || event.trackingId;
    const courierStatus = event.currentStatus || event.status;

    if (!trackingId || !courierStatus) {
      // The "created" event fires before an AWB is assigned (trackingID is
      // an empty string) — there's nothing to match on yet, and the booking
      // response already recorded that state.
      continue;
    }

    try {
      await applyTrackingUpdate({
        trackingId,
        courierStatus,
        courierName: event.courierPartnerName ?? event.courierName ?? null,
        expectedDeliveryDate: event.expectedDeliveryDate ?? null,
        statusLogs: normaliseLogs(event),
        source: "webhook",
      });
    } catch (err) {
      // Never 500: Eshopbox would retry the whole batch, and a poisoned
      // event would then block every later one. The polling job is the
      // backstop for anything we drop here.
      console.error(`[eshopbox] failed to apply update for ${trackingId}:`, err);
    }
  }

  return NextResponse.json({ received: true });
}
