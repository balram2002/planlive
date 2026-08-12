import { requireAdmin } from "@/lib/authz";
import { Card } from "@/components/ui/card";
import { ServiceabilityChecker } from "@/components/shipping/serviceability-checker";
import {
  eshopboxConfigured,
  ESHOPBOX_PICKUP_LOCATION_CODE,
} from "@/lib/eshopbox/client";

export const dynamic = "force-dynamic";

/**
 * Marketplace-wide lane check.
 *
 * Support uses this to answer "why did this seller's booking fail" without
 * needing the seller's login — the same read-only Eshopbox lookups the seller
 * screen uses, with no pickup PIN assumed.
 */
export default async function AdminServiceabilityPage() {
  await requireAdmin();

  return (
    <div className="animate-page-in space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Serviceability</h1>
        <p className="mt-1 text-sm text-muted">
          Check courier coverage and live rates for any pickup → delivery lane.
        </p>
      </div>

      {!eshopboxConfigured() ? (
        <Card className="border-warning/30 bg-warning/5 p-4">
          <p className="text-sm font-medium text-warning">
            Eshopbox isn&apos;t configured
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Set ESHOPBOX_CLIENT_ID, ESHOPBOX_CLIENT_SECRET and
            ESHOPBOX_REFRESH_TOKEN to enable coverage checks.
          </p>
        </Card>
      ) : (
        <>
          <ServiceabilityChecker />

          <Card className="p-4">
            <h2 className="text-sm font-semibold">How this is used</h2>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted">
              <li>
                • A failed booking that says &ldquo;pincode not
                serviceable&rdquo; can be confirmed here in seconds.
              </li>
              <li>
                • Rates are the marketplace&apos;s own Eshopbox card, so they
                show what a shipment actually costs the business.
              </li>
              <li>
                • Sellers get the same checker on their own dashboard, prefilled
                with their shop PIN.
              </li>
            </ul>
            <p className="mt-3 text-[11px] text-faint">
              Default pickup location code:{" "}
              <span className="font-mono">
                {ESHOPBOX_PICKUP_LOCATION_CODE ||
                  "not set — sellers' shop addresses are sent inline"}
              </span>
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
