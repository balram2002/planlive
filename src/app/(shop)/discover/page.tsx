import type { Metadata } from "next";
import { DiscoverExperience } from "@/components/discover-experience";
import { BrandFooter } from "@/components/brand-footer";

// Always render fresh so new streams appear without a rebuild.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Live now — watch & shop",
  description:
    "Browse sellers broadcasting live right now. Tap in, chat, and grab products before they sell out.",
  openGraph: {
    title: "Live now on liveWAB",
    description: "Browse sellers broadcasting live right now.",
    url: "/discover",
  },
};

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;

  return (
    <div className="animate-page-in px-4 py-4">
      <DiscoverExperience categoryId={category} basePath="/discover" />
      <BrandFooter
        links={[
          { href: "/", label: "Home" },
          { href: "/play", label: "Play" },
          { href: "/orders", label: "Orders" },
        ]}
      />
    </div>
  );
}
