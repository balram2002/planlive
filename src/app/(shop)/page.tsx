import { getCurrentUser } from "@/lib/current-user";
import { DiscoverExperience } from "@/components/discover-experience";
import { BrandFooter } from "@/components/brand-footer";
import { ButtonLink } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const features = [
  { icon: "📡", label: "Live streams" },
  { icon: "⚡", label: "Instant reserve" },
  { icon: "🔒", label: "Secure checkout" },
];

const steps = [
  {
    icon: "🎥",
    title: "Go live in minutes",
    text: "Camera on, products pinned — sell face-to-face at scale.",
  },
  {
    icon: "⚡",
    title: "Race-proof Buy Now",
    text: "Stock is reserved atomically — no overselling, ever.",
  },
  {
    icon: "💸",
    title: "Get paid your way",
    text: "Online via Razorpay or cash on delivery, tracked per order.",
  },
];

/**
 * Role-split homepage:
 * - Buyers & guests land straight in the live directory (search, categories,
 *   streams) — the shopping experience IS the homepage.
 * - Sellers & admins see the marketing/ops landing with quick links.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  // Category filter arrives as ?category= from the tile rail.
  const { category } = await searchParams;
  const user = await getCurrentUser().catch(() => null);
  const role = user?.role ?? null;

  if (role !== "SELLER" && role !== "ADMIN") {
    return (
      <div className="animate-page-in px-4 py-4">
        <DiscoverExperience basePath="/" categoryId={category} />
        <BrandFooter
          links={[
            { href: "/play", label: "Play" },
            { href: "/orders", label: "Orders" },
            { href: "/become-a-seller", label: "Sell on liveWAB" },
          ]}
        />
      </div>
    );
  }

  // ---------- Seller / admin landing ----------
  const panelCta =
    role === "ADMIN"
      ? { href: "/admin", label: "Open admin panel" }
      : { href: "/dashboard", label: "Go to seller dashboard" };

  return (
    <div className="animate-page-in flex flex-col px-5 py-8">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-surface p-6 shadow-card">
        <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-10 h-36 w-36 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative space-y-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-live/10 px-2.5 py-1 text-xs font-semibold text-live">
            <span className="h-1.5 w-1.5 rounded-full bg-live animate-live-pulse" />
            {role === "ADMIN" ? "Marketplace HQ" : "Seller HQ"}
          </span>
          <h1 className="text-3xl font-bold leading-tight tracking-tight">
            Sell live.
            <br />
            Grow faster.
          </h1>
          <p className="max-w-xs text-sm text-muted">
            Plan streams, manage products, and watch orders land in real time.
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <ButtonLink href={panelCta.href} size="lg">
              {panelCta.label}
            </ButtonLink>
            <ButtonLink href="/go-live" variant="secondary" size="lg">
              🔴 Go live now
            </ButtonLink>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        {features.map((f, i) => (
          <div
            key={f.label}
            className="animate-item-in rounded-2xl border border-border bg-surface p-3 text-center shadow-card"
            style={{ animationDelay: `${100 + i * 60}ms` }}
          >
            <div className="text-xl">{f.icon}</div>
            <div className="mt-1 text-xs text-muted">{f.label}</div>
          </div>
        ))}
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Why sell here</h2>
        <ol className="space-y-3">
          {steps.map((step, i) => (
            <li
              key={step.title}
              className="animate-item-in flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-lg">
                {step.icon}
              </span>
              <span>
                <span className="block text-sm font-semibold">{step.title}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                  {step.text}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <BrandFooter
        links={[
          { href: "/discover", label: "Live streams" },
          { href: "/dashboard", label: "Dashboard" },
          { href: "/orders", label: "Orders" },
        ]}
      />
    </div>
  );
}
