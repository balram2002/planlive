import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isSeller } from "@/lib/current-user";
import { ProfileForm } from "@/components/profile/profile-form";
import {
  ShopAddressForm,
  type ShopAddress,
} from "@/components/profile/shop-address-form";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Edit profile",
  robots: { index: false, follow: false },
};

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?backTo=%2Fprofile");

  return (
    <div className="animate-page-in space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Edit profile</h1>
          <p className="text-sm text-muted">{user.email}</p>
        </div>
        <Link
          href="/addresses"
          className="text-sm font-medium text-primary transition-opacity hover:opacity-80"
        >
          Addresses →
        </Link>
      </div>

      <ProfileForm
        defaults={{
          username: user.username ?? "",
          name: user.name ?? "",
          imageUrl: user.imageUrl,
          birthday: user.birthday ? user.birthday.toISOString().slice(0, 10) : "",
          gender: user.gender ?? "",
        }}
      />

      {/* Sellers: shop address with pinpoint location. */}
      {isSeller(user) ? (
        <Card className="p-5">
          <h2 className="mb-1 text-base font-semibold">Shop address</h2>
          <p className="mb-4 text-xs text-muted">
            Shown as your shop&apos;s city on your public profile — exact
            address stays private.
          </p>
          <ShopAddressForm initial={parseShopAddress(user.shopAddressJson)} />
        </Card>
      ) : null}
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
