import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/current-user";

// Admin is private — never indexed.
export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};
import { PanelShell } from "@/components/panel-shell";
import {
  IconBag,
  IconBox,
  IconBroadcast,
  IconChart,
  IconReceipt,
  IconTruck,
  IconUsers,
} from "@/components/panel-icons";

/**
 * Admin area shell. Server-guarded: only ADMIN role gets in (bootstrap the
 * first admin with `npm run make-admin -- you@example.com`).
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!isAdmin(user) || !user.isActive) redirect("/");

  return (
    <PanelShell
      brand="liveWAB"
      brandHref="/admin"
      accent="Admin"
      themeClass="theme-admin"
      items={[
        { href: "/admin", label: "Overview", icon: <IconChart />, exact: true },
        { href: "/admin/sellers", label: "Sellers", icon: <IconBag /> },
        { href: "/admin/categories", label: "Categories", icon: <IconBox /> },
        { href: "/admin/users", label: "Users", icon: <IconUsers /> },
        { href: "/admin/streams", label: "Streams", icon: <IconBroadcast /> },
        { href: "/admin/products", label: "Products", icon: <IconBox /> },
        { href: "/admin/orders", label: "Orders", icon: <IconReceipt /> },
        { href: "/admin/shipments", label: "Shipments", icon: <IconTruck /> },
      ]}
    >
      {children}
    </PanelShell>
  );
}
