import {
  eshopboxRequest,
  EshopboxError,
  ESHOPBOX_ACCOUNT_SLUG,
  ESHOPBOX_PICKUP_LOCATION_CODE,
} from "./client";

/**
 * Pre-booking checks: can we deliver there at all, and what will it cost?
 *
 * Both live on the account host (`<slug>.myeshopbox.com`) rather than the WMS
 * host the booking endpoints use, so every call here passes an explicit
 * baseUrl. Neither creates anything — they are safe to call freely from the
 * dashboard, which is the whole point of exposing them to sellers.
 */

function accountHost(): string {
  if (!ESHOPBOX_ACCOUNT_SLUG) {
    throw new Error(
      "ESHOPBOX_ACCOUNT_SLUG is required for serviceability checks.",
    );
  }
  return `https://${ESHOPBOX_ACCOUNT_SLUG}.myeshopbox.com`;
}

/** Which services a courier offers on a given lane. */
export type ServiceableFlags = {
  COD?: boolean;
  PICKUP?: boolean;
  EXCHANGE?: boolean;
  PREPAID?: boolean;
};

export type CourierOption = {
  courierName: string;
  zone?: string;
  /** Promised delivery date, ISO-ish ("2026-01-15"). */
  sla?: string;
  pickupLocation?: string;
  serviceable?: ServiceableFlags;
};

export type ServiceabilityInput = {
  dropPincode: string;
  pickupPincode: string;
  /** Grams. */
  deadWeight: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
};

export type ServiceabilityResult = {
  options: CourierOption[];
  /** True when at least one courier will carry it. */
  serviceable: boolean;
  codAvailable: boolean;
  prepaidAvailable: boolean;
  /** Earliest promised delivery date across couriers. */
  bestSla: string | null;
};

/**
 * Checks a pickup → drop lane for a parcel of the given size.
 *
 * An empty `result` array is a valid answer meaning "nobody serves this
 * lane" — it is not an error, so it resolves rather than throws.
 */
export async function checkServiceability(
  input: ServiceabilityInput,
): Promise<ServiceabilityResult> {
  let res: { result?: CourierOption[] };
  try {
    res = await eshopboxRequest<{ result?: CourierOption[] }>({
      method: "POST",
      baseUrl: accountHost(),
      path: "/api/v2/pincodeserviceability",
      headers: { ProxyHost: ESHOPBOX_ACCOUNT_SLUG },
      body: {
        dropPincode: input.dropPincode,
        pickupPincode: input.pickupPincode,
        deadWeight: Math.max(1, Math.round(input.deadWeight)),
        length: Math.max(1, Math.round(input.lengthCm)),
        width: Math.max(1, Math.round(input.widthCm)),
        height: Math.max(1, Math.round(input.heightCm)),
      },
    });
  } catch (err) {
    // A PIN they don't recognise comes back as 404 "Invalid Request". That's
    // an answer ("we can't deliver there"), not a failure — surfacing it as an
    // error would show the seller a scary red banner for a normal outcome.
    if (err instanceof EshopboxError && err.status === 404) {
      return {
        options: [],
        serviceable: false,
        codAvailable: false,
        prepaidAvailable: false,
        bestSla: null,
      };
    }
    throw err;
  }

  const options = res.result ?? [];
  // A courier can be listed with every flag false and a blank SLA, which
  // means "not on this lane" — counting it would report a dead lane as live.
  const usable = options.filter(
    (o) => o.serviceable?.COD || o.serviceable?.PREPAID,
  );
  const slas = usable
    .map((o) => o.sla)
    .filter((s): s is string => Boolean(s))
    .sort();

  return {
    options,
    serviceable: usable.length > 0,
    codAvailable: options.some((o) => o.serviceable?.COD),
    prepaidAvailable: options.some((o) => o.serviceable?.PREPAID),
    bestSla: slas[0] ?? null,
  };
}

// ------------------------------------------------------------ rate calculator

/** One plan's price breakdown. Their JSON uses spaces in some keys. */
export type RateBreakdown = {
  shippingBaseFreight?: number;
  expressSurcharge?: number;
  "COD collection fees"?: number;
  reverseShippingFees?: number;
  fuelSurcharge?: number;
  "Doorstep QC fees"?: number;
  gst?: number;
  totalShippingCharges?: number;
  estimatedDeliveryDays?: number;
  chargeableWeight?: string;
  /** 1 / 0, not a boolean. */
  isServiceable?: number;
};

export type RateQuote = {
  /** e.g. "eshopboxPrime" */
  plan: string;
  totalCharges: number;
  estimatedDeliveryDays: number | null;
  chargeableWeightGrams: number | null;
  serviceable: boolean;
  breakdown: RateBreakdown;
};

export type RateInput = {
  journeyType: "forward" | "reverse";
  pickupPincode: string;
  dropPincode: string;
  /** Grams. */
  orderWeight: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  paymentMethod: "COD" | "ONLINE";
  /** Rupees; required for COD. */
  codAmount?: number;
  doorstepQc?: boolean;
};

export type RateResult = { zone: string | null; quotes: RateQuote[] };

/**
 * Prices a lane across every plan the account has.
 *
 * The response nests plans under a plan-group key (`essentialPlan`), which
 * varies per account, so every group is flattened rather than reading one
 * hardcoded name.
 */
export async function calculateRate(input: RateInput): Promise<RateResult> {
  const res = await eshopboxRequest<Record<string, unknown>>({
    method: "POST",
    baseUrl: accountHost(),
    path: "/shipping/api/v1/calculate/rate",
    headers: { ProxyHost: ESHOPBOX_ACCOUNT_SLUG },
    body: {
      journeyType: input.journeyType,
      pickupPincode: input.pickupPincode,
      dropPincode: input.dropPincode,
      orderWeight: String(Math.max(1, Math.round(input.orderWeight))),
      length: String(Math.max(1, Math.round(input.lengthCm))),
      width: String(Math.max(1, Math.round(input.widthCm))),
      height: String(Math.max(1, Math.round(input.heightCm))),
      paymentMethod:
        input.paymentMethod === "COD" ? "Cash on delivery" : "Prepaid",
      ...(input.paymentMethod === "COD"
        ? { codAmountToBeCollected: input.codAmount ?? 0 }
        : {}),
      ...(input.journeyType === "reverse"
        ? { doorstepQc: input.doorstepQc ?? false }
        : {}),
    },
  });

  const zone = typeof res.zone === "string" ? res.zone : null;
  const quotes: RateQuote[] = [];

  for (const [groupKey, group] of Object.entries(res)) {
    if (groupKey === "zone" || !group || typeof group !== "object") continue;
    for (const [plan, raw] of Object.entries(group as Record<string, unknown>)) {
      if (!raw || typeof raw !== "object") continue;
      const b = raw as RateBreakdown;
      quotes.push({
        plan,
        totalCharges: Number(b.totalShippingCharges ?? 0),
        estimatedDeliveryDays: b.estimatedDeliveryDays ?? null,
        chargeableWeightGrams: b.chargeableWeight
          ? Number(b.chargeableWeight)
          : null,
        // Their flag is numeric; treat "missing" as serviceable so a plan is
        // never hidden just because the field was omitted.
        serviceable: b.isServiceable === undefined ? true : b.isServiceable === 1,
        breakdown: b,
      });
    }
  }

  quotes.sort((a, b) => a.totalCharges - b.totalCharges);
  return { zone, quotes };
}

/** The marketplace default pickup PIN, when a seller hasn't set a shop one. */
export function defaultPickupHint(): string {
  return ESHOPBOX_PICKUP_LOCATION_CODE;
}
