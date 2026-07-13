import type { Metadata } from "next";
import { PanelShell } from "@/components/panel-shell";
import {
  IconBroadcast,
  IconChart,
  IconReceipt,
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
      brand="LiveShop"
      brandHref="/"
      accent="Seller"
      items={[
        { href: "/dashboard", label: "Dashboard", icon: <IconChart />, exact: true },
        { href: "/go-live", label: "Go live", icon: <IconBroadcast /> },
        { href: "/dashboard/sales", label: "Sales", icon: <IconReceipt /> },
      ]}
    >
      {children}
    </PanelShell>
  );
}
