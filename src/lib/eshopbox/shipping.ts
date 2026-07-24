import {
  eshopboxRequest,
  ESHOPBOX_CHANNEL_ID,
  ESHOPBOX_PICKUP_LOCATION_CODE,
} from "./client";

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
  /** Per-unit dimensions (cm) and weight (grams), as decimal strings. */
  itemLength?: number;
  itemBreadth?: number;
  itemHeight?: number;
  itemWeight?: string;
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
  /** Seller's warehouse code; falls back to the account-wide default. */
  pickupLocationCode?: string;
  orderDate?: Date;
  /** Buyer's email, for the courier's own delivery notifications. */
  customerEmail?: string;
  /** Invoice reference shown on the shipping label. */
  invoiceNumber?: string;
};

export type CreateShipmentResult = {
  courierName: string;
  trackingId: string;
  label_url: string;
  shipmentId: string;
  routingCode?: string;
  labelStream?: string;
  shippingMode?: string;
  gstin?: string;
  transporterID?: string;
};

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
  const locationCode =
    input.pickupLocationCode || ESHOPBOX_PICKUP_LOCATION_CODE;

  const orderDate = input.orderDate ?? new Date();

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
      // Their API types every parcel dimension as a decimal string.
      shipmentLength: input.shipmentLength.toFixed(2),
      shipmentBreadth: input.shipmentBreadth.toFixed(2),
      shipmentHeight: input.shipmentHeight.toFixed(2),
      shipmentWeight: input.shipmentWeight.toFixed(2),
      pickupLocation: { locationCode },
    },
  });
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
