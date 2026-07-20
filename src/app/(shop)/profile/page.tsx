import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isSeller } from "@/lib/current-user";
import { ProfileForm } from "@/components/profile/profile-form";

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
          phone: user.phone ?? "",
          imageUrl: user.imageUrl,
          birthday: user.birthday ? user.birthday.toISOString().slice(0, 10) : "",
          gender: user.gender ?? "",
        }}
      />

      {/* Sellers manage their shop address on its own page (menu → Shop address). */}
      {isSeller(user) ? (
        <Link
          href="/shop-address"
          className="flex items-center justify-between rounded-2xl border border-border bg-surface p-4 shadow-card transition-all hover:shadow-pop active:scale-[0.99]"
        >
          <span className="flex items-center gap-3">
            <span aria-hidden>🏬</span>
            <span className="text-sm font-medium">Shop address</span>
          </span>
          <span className="text-sm text-primary">Manage →</span>
        </Link>
      ) : null}
    </div>
  );
}
