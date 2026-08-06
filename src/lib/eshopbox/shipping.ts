import { eshopboxRequest, ESHOPBOX_CHANNEL_ID } from "./client";

/**
 * Typed wrappers over the three Eshopbox shipping endpoints we use:
 * book a parcel, poll its tracking, and cancel it.
 *
 * Field names below mirror the Shipper Integration Wrapper API exactly —
 * their casing is inconsistent (`isCOD`, `label_url`, `trackingID` vs
 * `trackingId`), so it is deliberately preserved rather than tidied up.
 */

// ------------------------------------------------------------- create order

export type EshopboxAddress = {
  customerName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  /** NOTE: their field is `contactPhone`, not `phone`. */
  contactPhone?: string;
  email?: string;
};

export type EshopboxItem = {
  itemID: string;
  productTitle: string;
  quantity: number;
  itemTotal: number;
  productImageUrl?: string;
  /**
   * Per-unit dimensions (cm) and weight (grams). Their example sends these as
   * plain numbers (`"itemWeight": 200.64`) — unlike the parcel-level fields,
   * which the parameter table types as decimal strings.
   */
  itemLength?: number;
  itemBreadth?: number;
  itemHeight?: number;
  itemWeight?: number;
};

/**
 * Where the courier collects the parcel.
 *
 * `locationCode` alone is enough when the warehouse already exists in the
 * Eshopbox workspace. When it doesn't, their docs mark every address field
 * "*Mandatory if location code is blank or location is not created in
 * Eshopbox" — so we send the seller's shop address inline instead.
 */
export type EshopboxPickupLocation = {
  locationCode?: string;
  locationName?: string;
  companyName?: string;
  contactPerson?: string;
  contactNumber?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  country?: string;
  pincode?: string;
};

/**
 * Eshopbox expects `YYYY-MM-DD HH:mm:ss` (their examples are unambiguous:
 * "2024-01-01 09:00:00"). An ISO-8601 string with `T`/`Z` is rejected or
 * silently misparsed, so format explicitly.
 */
function formatEshopboxDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

export type CreateShipmentInput = {
  /** Our idempotency key — unique per parcel. */
  shipmentId: string;
  customerOrderId: string;
  isCOD: boolean;
  /** Rupees, not paise: Eshopbox works in currency units. */
  invoiceTotal: number;
  shippingAddress: EshopboxAddress;
  items: EshopboxItem[];
  /** Centimetres. */
  shipmentLength: number;
  shipmentBreadth: number;
  shipmentHeight: number;
  /** Grams. */
  shipmentWeight: number;
  /** Warehouse code, or the full pickup address when no code exists. */
  pickupLocation: EshopboxPickupLocation;
  orderDate?: Date;
  /** Buyer's email, for the courier's own delivery notifications. */
  customerEmail?: string;
  /** Invoice reference shown on the shipping label. */
  invoiceNumber?: string;
};

export type CreateShipmentResult = {
  courierName: string;
  trackingId: string;
  /**
   * The label PDF link.
   *
   * Their docs name this `label_url`; the live API actually returns
   * `labelUrl`. Reading only the documented spelling silently stored a null
   * label on every booking — the PDF was there the whole time. Both are
   * accepted, and `pickLabelUrl` below is the only thing that should read
   * them.
   */
  labelUrl?: string;
  label_url?: string;
  shipmentId: string;
  routingCode?: string;
  /** Occasionally a base64 PDF instead of a link. */
  labelStream?: string;
  shippingMode?: string;
  gstin?: string;
  transporterID?: string;
};

/** The label as something a browser can open, whichever shape they sent. */
export function pickLabelUrl(result: CreateShipmentResult): string | null {
  const direct = result.labelUrl?.trim() || result.label_url?.trim();
  if (direct) return direct;
  // Base64 fallback: wrap it so the viewer can render it like any other PDF.
  const stream = result.labelStream?.trim();
  if (stream) return `data:application/pdf;base64,${stream}`;
  return null;
}

/**
 * Books a parcel and returns the AWB + label URL.
 *
 * Throws EshopboxError with their message on failure — most commonly
 * "Label couldn't be generated due to pincode not serviceable", which the
 * seller needs to read verbatim to act on it.
 */
export async function createShipment(
  input: CreateShipmentInput,
): Promise<CreateShipmentResult> {
  const orderDate = input.orderDate ?? new Date();

  // Eshopbox rejects the whole booking if any parcel dimension arrives blank,
  // zero or non-numeric, so each one is floored to a small-packet default
  // rather than trusted straight from the caller.
  const length = positiveOr(input.shipmentLength, 25);
  const breadth = positiveOr(input.shipmentBreadth, 20);
  const height = positiveOr(input.shipmentHeight, 5);
  const weight = positiveOr(input.shipmentWeight, 500);

  return eshopboxRequest<CreateShipmentResult>({
    method: "POST",
    path: "/api/v1/shipping/order",
    body: {
      shipmentId: input.shipmentId,
      customerOrderId: input.customerOrderId,
      ...(ESHOPBOX_CHANNEL_ID ? { channelId: ESHOPBOX_CHANNEL_ID } : {}),
      orderDate: formatEshopboxDate(orderDate),
      isCOD: input.isCOD,
      invoiceTotal: input.invoiceTotal,
      // COD parcels are collected on delivery; prepaid owe nothing on arrival.
      balanceDue: input.isCOD ? input.invoiceTotal : 0,
      ...(input.invoiceNumber
        ? {
            invoice: {
              number: input.invoiceNumber,
              date: formatEshopboxDate(orderDate),
            },
          }
        : {}),
      shippingAddress: input.shippingAddress,
      // We collect one address, so billing mirrors shipping.
      billingIsShipping: true,
      items: input.items,

      // Both dimension shapes go out together, deliberately.
      //
      // Eshopbox's parameter table documents flat decimal *strings*
      // (`shipmentLength`…), but the cURL example on the same page nests them
      // under `shipmentDimension` as *numbers*. Their validator reads the
      // nested object, so sending only the flat fields is what produced
      // "dimensions cannot be blank" on every booking. Sending both satisfies
      // either reading, and the unused one is ignored.
      shipmentLength: length.toFixed(2),
      shipmentBreadth: breadth.toFixed(2),
      shipmentHeight: height.toFixed(2),
      shipmentWeight: weight.toFixed(2),
      shipmentDimension: { length, breadth, height, weight },

      pickupLocation: input.pickupLocation,
    },
  });
}

/** Guards a dimension against 0, NaN and undefined — all of which Eshopbox
 *  reports as a blank dimension. */
function positiveOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

// ----------------------------------------------------------------- tracking

export type TrackingLog = {
  status: string;
  remarks?: string;
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  dateTime?: string;
  ndrStatus?: string;
};

export type TrackingDetail = {
  journeyType?: string;
  customerOrderNumber?: string;
  trackingId: string;
  currentStatus: string;
  dateTime?: string;
  expectedDeliveryDate?: string;
  courierPartnerName?: string;
  statusLogs?: TrackingLog[];
};

type TrackingResponse = {
  Status?: string;
  trackingDetails?: TrackingDetail[];
};

/** Eshopbox caps a tracking poll at 50 IDs per call. */
export const MAX_TRACKING_IDS = 50;

/**
 * Polls tracking for up to 50 AWBs at once. Used by the reconciliation job
 * as a safety net — the webhook is the primary, real-time path.
 */
export async function getTrackingDetails(
  trackingIds: string[],
): Promise<TrackingDetail[]> {
  if (trackingIds.length === 0) return [];
  if (trackingIds.length > MAX_TRACKING_IDS) {
    throw new Error(
      `getTrackingDetails accepts at most ${MAX_TRACKING_IDS} IDs per call.`,
    );
  }

  const res = await eshopboxRequest<TrackingResponse>({
    method: "GET",
    path: "/api/v1/shipping/trackingDetails",
    query: { trackingIds: trackingIds.join(",") },
  });
  return res.trackingDetails ?? [];
}

// ------------------------------------------------------------- cancellation

export type CancelResult = {
  status?: string;
  trackingId?: string;
  message?: string;
};

/** Cancels a booked AWB. Fails once the courier has already collected it. */
export async function cancelShipment(trackingId: string): Promise<CancelResult> {
  return eshopboxRequest<CancelResult>({
    method: "POST",
    path: "/api/v1/shipping/cancel",
    body: { trackingId },
  });
}
