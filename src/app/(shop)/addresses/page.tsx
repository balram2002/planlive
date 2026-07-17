import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { AddressManager } from "@/components/profile/address-manager";

export const metadata: Metadata = {
  title: "Addresses",
  robots: { index: false, follow: false },
};

export default async function AddressesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?backTo=%2Faddresses");

  return (
    <div className="animate-page-in space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Addresses</h1>
          <p className="text-sm text-muted">
            Up to 3 saved — one active for fast checkout.
          </p>
        </div>
        <Link
          href="/profile"
          className="text-sm font-medium text-primary transition-opacity hover:opacity-80"
        >
          ← Profile
        </Link>
      </div>

      <AddressManager />
    </div>
  );
}
