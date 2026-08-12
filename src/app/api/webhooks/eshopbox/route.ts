import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { applyTrackingUpdate } from "@/lib/shipping-service";
import type { ShipmentJourney } from "@/lib/eshopbox/status-map";

/**
 * Eshopbox shipment tracking webhook.
 *
 * Handles both registered resources — `shipment` (forward leg) and
 * `returnShipment` (reverse leg) — across every documented eventSubType:
 *
 *   shipment:       created, packed, ready_to_ship, picked_up, out_for_pickup,
 *                   pickup_failed, intransit, out_for_delivery, delivered,
 *                   failed_delivery, rto_created, rto_intransit,
 *                   rto_out_for_delivery, rto_delivered, rto_failed,
 *                   shipment_delayed, dispatched, shipment_held, unhold,
 *                   return_expected, cancelled_order,
 *                   ndr_resolution_submitted, damage, lost
 *   returnShipment: created, pickup_pending, out_for_pickup, pickup_cancelled,
 *                   pickup_failed, picked_up, intransit, out_for_delivery,
 *                   delivered, delivered_warehouse, failed_delivery, complete,
 *                   return_cancelled, approved, lost
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
  latest_status?: string;
  eventSubType?: string;
  resource?: string;
  journeyType?: string;
  courierName?: string;
  courierPartnerName?: string;
  expectedDeliveryDate?: string;
  /** Tracking-API shape (array). */
  statusLogs?: unknown;
  /** Webhook shape: { "created": "2025-09-03 15:25:41", … } */
  status_log?: Record<string, string> | unknown[];
  remarks?: string;
  /** Our own order id, echoed back from the booking call. */
  customerOrderNumber?: string;
  externalShipmentID?: string;
  /** Present only on the returnShipment resource. */
  customerReturnNumber?: string;
  returnShipmentId?: string;
  returnReason?: string;
  refundAmount?: unknown;
};

/**
 * Works out which leg an event describes.
 *
 * Both resources POST to the same URL, and their subtype names collide
 * ("delivered" means opposite things), so getting this wrong silently marks
 * buyers' orders delivered when a return arrives. Three independent signals,
 * most explicit first:
 *
 *  1. `?resource=` on the URL — what our registration script now pins.
 *  2. `resource` / `journeyType` in the body, when Eshopbox includes them.
 *  3. Fields that only ever exist on a return payload.
 */
function detectJourney(
  event: ShipmentWebhookPayload,
  fromQuery: string | null,
): ShipmentJourney {
  const explicit = (fromQuery ?? event.resource ?? "").toLowerCase();
  if (explicit.includes("return")) return "return";
  if (explicit === "shipment") return "forward";

  const journeyType = (event.journeyType ?? "").toLowerCase();
  if (journeyType === "return" || journeyType === "reverse") return "return";
  if (journeyType === "forward") return "forward";

  if (
    event.customerReturnNumber ||
    event.returnShipmentId ||
    event.returnReason ||
    event.refundAmount !== undefined
  ) {
    return "return";
  }
  return "forward";
}

/**
 * Normalises the webhook's `status_log` map into the same array shape the
 * tracking API returns, so the buyer-facing timeline renders identically no
 * matter which path delivered the update.
 */
function normaliseLogs(event: ShipmentWebhookPayload): unknown {
  if (Array.isArray(event.statusLogs)) return event.statusLogs;
  // Return payloads send status_log as an array already.
  if (Array.isArray(event.status_log)) return event.status_log;
  if (!event.status_log || typeof event.status_log !== "object")
    return undefined;

  return Object.entries(event.status_log as Record<string, string>)
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
    console.error(
      "[eshopbox] webhook hit but ESHOPBOX_WEBHOOK_SECRET is unset",
    );
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

  const resourceParam = req.nextUrl.searchParams.get("resource");

  // Eshopbox sends a single object, but batching is cheap to support.
  const events = Array.isArray(payload) ? payload : [payload];

  for (const event of events) {
    // Their casing differs between the webhook (`trackingID`) and the
    // tracking API (`trackingId`) — accept either.
    const trackingId = event.trackingID || event.trackingId || null;
    // The order id we sent at booking. This is the ONLY thing that ties a
    // return to its order: the reverse leg carries a different AWB, so
    // matching on tracking id alone silently dropped every return event.
    const customerOrderId = event.customerOrderNumber || null;
    const courierStatus =
      event.currentStatus ||
      event.status ||
      event.latest_status ||
      event.eventSubType;

    if (!courierStatus || (!trackingId && !customerOrderId)) {
      // The "created" event fires before an AWB is assigned (trackingID is
      // an empty string); without an order number too there is nothing to
      // match on, and the booking response already recorded that state.
      continue;
    }

    const journey = detectJourney(event, resourceParam);

    try {
      await applyTrackingUpdate({
        trackingId,
        customerOrderId,
        journey,
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
      console.error(
        `[eshopbox] failed to apply ${journey} update for ${trackingId ?? customerOrderId}:`,
        err,
      );
    }
  }

  return NextResponse.json({ received: true });
}
