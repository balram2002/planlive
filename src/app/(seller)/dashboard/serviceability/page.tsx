import Link from "next/link";
import { redirect } from "next/navigation";
import { signInPath } from "@/lib/back-to";
import { getCurrentUser, isSeller } from "@/lib/current-user";
import { Card } from "@/components/ui/card";
import { ServiceabilityChecker } from "@/components/shipping/serviceability-checker";
import { eshopboxConfigured } from "@/lib/eshopbox/client";

export const dynamic = "force-dynamic";

/** Pulls just the PIN out of the seller's saved shop address. */
function shopPincode(json: string | null): string {
  if (!json) return "";
  try {
    const parsed = JSON.parse(json);
    const pin = String(parsed?.pincode ?? "");
    return /^\d{6}$/.test(pin) ? pin : "";
  } catch {
    return "";
  }
}

/**
 * Seller-facing lane check.
 *
 * Lets a seller answer "can I actually ship to this customer, and what will
 * it cost" before booking — which is the difference between a considered
 * quote and a failed booking with a cryptic courier error.
 */
export default async function SellerServiceabilityPage() {
  const user = await getCurrentUser();
  if (!user) redirect(signInPath("/dashboard/serviceability"));
  if (!isSeller(user)) redirect("/dashboard");

  const pickup = shopPincode(user.shopAddressJson);

  return (
    <div className="animate-page-in space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Serviceability</h1>
        <p className="mt-1 text-sm text-muted">
          Check whether a delivery PIN is covered, and what shipping will cost,
          before you book a courier.
        </p>
      </div>

      {!eshopboxConfigured() ? (
        <Card className="border-warning/30 bg-warning/5 p-4">
          <p className="text-sm font-medium text-warning">
            Shipping isn&apos;t connected
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Eshopbox credentials are missing on the server, so lane checks
            can&apos;t run yet.
          </p>
        </Card>
      ) : (
        <>
          {!pickup ? (
            <Card className="border-warning/30 bg-warning/5 p-4">
              <p className="text-sm font-medium text-warning">
                No shop PIN code saved
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Add your shop address so the pickup PIN fills in automatically
                — and so couriers know where to collect.{" "}
                <Link
                  href="/shop-address"
                  className="font-semibold text-primary underline-offset-2 hover:underline"
                >
                  Set shop address
                </Link>
              </p>
            </Card>
          ) : null}

          <ServiceabilityChecker defaultPickupPincode={pickup} />
        </>
      )}
    </div>
  );
}
