"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/action-button";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/cn";

type ServiceableFlags = {
  COD?: boolean;
  PICKUP?: boolean;
  EXCHANGE?: boolean;
  PREPAID?: boolean;
};

type CourierOption = {
  courierName: string;
  zone?: string;
  sla?: string;
  pickupLocation?: string;
  serviceable?: ServiceableFlags;
};

type Serviceability = {
  options: CourierOption[];
  serviceable: boolean;
  codAvailable: boolean;
  prepaidAvailable: boolean;
  bestSla: string | null;
};

type RateQuote = {
  plan: string;
  totalCharges: number;
  estimatedDeliveryDays: number | null;
  chargeableWeightGrams: number | null;
  serviceable: boolean;
  breakdown: Record<string, unknown>;
};

type Result = {
  serviceability: Serviceability;
  rates: { zone: string | null; quotes: RateQuote[] } | null;
};

/** Turns "eshopboxPrime" into "Eshopbox Prime". */
function prettyPlan(plan: string): string {
  return plan
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

function formatSla(sla: string | null): string | null {
  if (!sla) return null;
  const at = new Date(sla);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/**
 * Pincode serviceability + live rate check, shared by the seller and admin
 * dashboards.
 *
 * Answers the two questions that otherwise only surface as a failed booking:
 * can this lane be served at all, and what will it cost. Both underlying
 * Eshopbox calls are read-only, so checking costs nothing.
 */
export function ServiceabilityChecker({
  defaultPickupPincode = "",
  className,
}: {
  /** Prefilled from the seller's shop address where we know it. */
  defaultPickupPincode?: string;
  className?: string;
}) {
  const [pickupPincode, setPickup] = useState(defaultPickupPincode);
  const [dropPincode, setDrop] = useState("");
  const [weightGrams, setWeight] = useState("500");
  const [lengthCm, setLength] = useState("25");
  const [widthCm, setWidth] = useState("20");
  const [heightCm, setHeight] = useState("5");
  const [paymentMethod, setPaymentMethod] = useState<"COD" | "ONLINE">("COD");
  const [codAmount, setCodAmount] = useState("");

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const pinsValid =
    /^\d{6}$/.test(pickupPincode) && /^\d{6}$/.test(dropPincode);

  async function check(event: React.FormEvent) {
    event.preventDefault();
    if (!pinsValid || pending) return;
    haptics.tap();
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/shipping/serviceability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickupPincode,
          dropPincode,
          weightGrams: Number(weightGrams),
          lengthCm: Number(lengthCm),
          widthCm: Number(widthCm),
          heightCm: Number(heightCm),
          paymentMethod,
          codAmount: Number(codAmount || 0),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Check failed.");
        return;
      }
      setResult(body);
    } catch {
      setError("Network error — try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={cn("space-y-4", className)}>
      <Card className="p-4 sm:p-5">
        <form onSubmit={check} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Pickup PIN code" htmlFor="svc-pickup">
              <Input
                id="svc-pickup"
                value={pickupPincode}
                onChange={(e) => setPickup(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                maxLength={6}
                placeholder="452001"
                autoComplete="off"
              />
            </Field>
            <Field label="Delivery PIN code" htmlFor="svc-drop">
              <Input
                id="svc-drop"
                value={dropPincode}
                onChange={(e) => setDrop(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                maxLength={6}
                placeholder="560034"
                autoComplete="off"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Weight (g)" htmlFor="svc-weight">
              <Input
                id="svc-weight"
                value={weightGrams}
                onChange={(e) => setWeight(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
              />
            </Field>
            <Field label="Length (cm)" htmlFor="svc-length">
              <Input
                id="svc-length"
                value={lengthCm}
                onChange={(e) => setLength(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
              />
            </Field>
            <Field label="Width (cm)" htmlFor="svc-width">
              <Input
                id="svc-width"
                value={widthCm}
                onChange={(e) => setWidth(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
              />
            </Field>
            <Field label="Height (cm)" htmlFor="svc-height">
              <Input
                id="svc-height"
                value={heightCm}
                onChange={(e) => setHeight(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Payment" htmlFor="svc-payment">
              <div className="flex gap-2" id="svc-payment">
                {(["COD", "ONLINE"] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={cn(
                      "flex-1 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors",
                      paymentMethod === method
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border text-muted hover:text-foreground",
                    )}
                  >
                    {method === "COD" ? "Cash on delivery" : "Prepaid"}
                  </button>
                ))}
              </div>
            </Field>
            {paymentMethod === "COD" ? (
              <Field label="COD amount (₹)" htmlFor="svc-cod">
                <Input
                  id="svc-cod"
                  value={codAmount}
                  onChange={(e) => setCodAmount(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  placeholder="440"
                />
              </Field>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={!pinsValid || pending}
            className="w-full rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-all active:scale-[0.99] disabled:opacity-50"
          >
            {pending ? (
              <span className="inline-flex items-center gap-2">
                <Spinner /> Checking…
              </span>
            ) : (
              "Check serviceability"
            )}
          </button>
        </form>
      </Card>

      {error ? (
        <Card className="border-live/30 bg-live/5 p-4">
          <p className="text-sm text-live">{error}</p>
        </Card>
      ) : null}

      <AnimatePresence mode="wait">
        {result ? (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="space-y-4"
          >
            <ServiceabilitySummary data={result.serviceability} />
            {result.rates && result.rates.quotes.length > 0 ? (
              <RateTable
                zone={result.rates.zone}
                quotes={result.rates.quotes}
              />
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ServiceabilitySummary({ data }: { data: Serviceability }) {
  const sla = formatSla(data.bestSla);
  return (
    <Card
      className={cn(
        "p-4 sm:p-5",
        data.serviceable
          ? "border-success/30 bg-success/5"
          : "border-live/30 bg-live/5",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={data.serviceable ? "success" : "live"}>
          {data.serviceable ? "Serviceable" : "Not serviceable"}
        </Badge>
        {data.serviceable ? (
          <>
            <Badge tone={data.codAvailable ? "success" : "neutral"}>
              COD {data.codAvailable ? "available" : "unavailable"}
            </Badge>
            <Badge tone={data.prepaidAvailable ? "success" : "neutral"}>
              Prepaid {data.prepaidAvailable ? "available" : "unavailable"}
            </Badge>
          </>
        ) : null}
      </div>

      {data.serviceable ? (
        sla ? (
          <p className="mt-2 text-sm text-muted">
            Earliest promised delivery{" "}
            <span className="font-semibold text-foreground">{sla}</span>
          </p>
        ) : null
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-muted">
          No courier covers this lane for a parcel of that size. Try a
          different delivery PIN, or reduce the parcel dimensions.
        </p>
      )}

      {data.options.length > 0 ? (
        <div className="mt-3 -mx-1 overflow-x-auto px-1" data-no-swipe>
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-faint">
                <th className="py-2 pr-3 font-medium">Courier</th>
                <th className="py-2 pr-3 font-medium">Zone</th>
                <th className="py-2 pr-3 font-medium">By</th>
                <th className="py-2 font-medium">Services</th>
              </tr>
            </thead>
            <tbody>
              {data.options.map((option) => {
                const flags = option.serviceable ?? {};
                const usable = flags.COD || flags.PREPAID;
                return (
                  <tr
                    key={option.courierName}
                    className={cn(
                      "border-b border-border/50 last:border-0",
                      !usable && "opacity-45",
                    )}
                  >
                    <td className="py-2 pr-3 font-medium">
                      {option.courierName}
                    </td>
                    <td className="py-2 pr-3 text-muted">
                      {option.zone || "—"}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-muted">
                      {formatSla(option.sla ?? null) ?? "—"}
                    </td>
                    <td className="py-2">
                      <span className="flex flex-wrap gap-1">
                        {(["COD", "PREPAID", "PICKUP", "EXCHANGE"] as const)
                          .filter((key) => flags[key])
                          .map((key) => (
                            <span
                              key={key}
                              className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted"
                            >
                              {key}
                            </span>
                          ))}
                        {!usable ? (
                          <span className="text-[10px] text-faint">
                            unavailable
                          </span>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}

function RateTable({
  zone,
  quotes,
}: {
  zone: string | null;
  quotes: RateQuote[];
}) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Estimated shipping cost</h3>
        {zone ? <Badge>{zone} zone</Badge> : null}
      </div>

      <div className="-mx-1 overflow-x-auto px-1" data-no-swipe>
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-faint">
              <th className="py-2 pr-3 font-medium">Plan</th>
              <th className="py-2 pr-3 font-medium">Total</th>
              <th className="py-2 pr-3 font-medium">ETA</th>
              <th className="py-2 font-medium">Billed wt.</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((quote, i) => (
              <tr
                key={quote.plan}
                className={cn(
                  "border-b border-border/50 last:border-0",
                  !quote.serviceable && "opacity-45",
                )}
              >
                <td className="py-2 pr-3">
                  <span className="flex items-center gap-1.5">
                    <span className="font-medium">
                      {prettyPlan(quote.plan)}
                    </span>
                    {i === 0 && quote.serviceable ? (
                      <Badge tone="success">Cheapest</Badge>
                    ) : null}
                  </span>
                </td>
                <td className="whitespace-nowrap py-2 pr-3 font-semibold tabular-nums">
                  ₹{quote.totalCharges.toFixed(2)}
                </td>
                <td className="whitespace-nowrap py-2 pr-3 text-muted">
                  {quote.estimatedDeliveryDays != null
                    ? `${quote.estimatedDeliveryDays}d`
                    : "—"}
                </td>
                <td className="whitespace-nowrap py-2 text-muted tabular-nums">
                  {quote.chargeableWeightGrams != null
                    ? `${quote.chargeableWeightGrams} g`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-faint">
        Estimates from Eshopbox&apos;s rate card, inclusive of GST. The final
        charge uses the higher of actual and volumetric weight.
      </p>
    </Card>
  );
}
