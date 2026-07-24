import type { Metadata } from "next";
import { PanelShell } from "@/components/panel-shell";
import {
  IconBox,
  IconBroadcast,
  IconCalendar,
  IconChart,
  IconReceipt,
  IconTruck,
} from "@/components/panel-icons";

// Seller tooling is private — keep it out of search engines.
export const metadata: Metadata = {
  title: "Seller dashboard",
  robots: { index: false, follow: false },
};

/**
 * Seller area shell: full-wide desktop layout with sidebar, app-like mobile
 * layout with bottom tabs. Role gating happens in the pages/actions (a buyer
 * visiting /dashboard sees the become-a-seller onboarding).
 */
export default function SellerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PanelShell
      brand="liveWAB"
      brandHref="/"
      accent="Seller"
      themeClass="theme-seller"
      items={[
        { href: "/dashboard", label: "Dashboard", icon: <IconChart />, exact: true },
        { href: "/go-live", label: "Go live", icon: <IconBroadcast /> },
        { href: "/dashboard/schedule", label: "Schedule", icon: <IconCalendar /> },
        { href: "/dashboard/categories", label: "Categories", icon: <IconBox /> },
        { href: "/dashboard/sales", label: "Sales", icon: <IconReceipt /> },
        { href: "/dashboard/shipments", label: "Shipments", icon: <IconTruck /> },
      ]}
    >
      {children}
    </PanelShell>
  );
}
