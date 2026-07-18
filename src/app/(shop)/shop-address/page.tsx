import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isSeller } from "@/lib/current-user";
import {
  ShopAddressForm,
  type ShopAddress,
} from "@/components/profile/shop-address-form";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Shop address",
  robots: { index: false, follow: false },
};

/** Seller-only: shop address with pinpoint location (own menu entry). */
export default async function ShopAddressPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?backTo=%2Fshop-address");
  if (!isSeller(user)) redirect("/become-a-seller");

  return (
    <div className="animate-page-in space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Shop address</h1>
          <p className="text-sm text-muted">
            Buyers see only your shop&apos;s city — the exact address stays
            private.
          </p>
        </div>
        <Link
          href="/profile"
          className="text-sm font-medium text-primary transition-opacity hover:opacity-80"
        >
          ← Profile
        </Link>
      </div>

      <Card className="p-5">
        <ShopAddressForm initial={parseShopAddress(user.shopAddressJson)} />
      </Card>
    </div>
  );
}

function parseShopAddress(json: string | null): ShopAddress | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as ShopAddress;
  } catch {
    return null;
  }
}
