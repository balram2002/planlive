import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { StreamCard, type DiscoverStream } from "@/components/stream-card";
import { ButtonLink } from "@/components/ui/button";
import { LiveBadge } from "@/components/ui/badge";

// Module scope: evaluated once, keeps the component render pure.
const YEAR = new Date().getFullYear();

const features = [
  { icon: "📡", label: "Live streams" },
  { icon: "⚡", label: "Instant reserve" },
  { icon: "🔒", label: "Secure checkout" },
];

const steps = [
  {
    icon: "🎥",
    title: "Watch sellers live",
    text: "Real people, real products, no edited photos — see it before you buy it.",
  },
  {
    icon: "⚡",
    title: "Tap Buy Now",
    text: "The item is reserved for you instantly — a 10-minute hold, race-proof.",
  },
  {
    icon: "🎉",
    title: "Pay & it's yours",
    text: "Checkout in seconds with UPI, cards, and more via Razorpay.",
  },
];

/** Landing page — live-now rail + role-aware CTAs. */
export default async function Home() {
  // Both lookups degrade gracefully if the DB is unreachable.
  const [user, liveStreams] = await Promise.all([
    getCurrentUser().catch(() => null),
    prisma.stream
      .findMany({ where: { status: "LIVE" }, orderBy: { startedAt: "desc" }, take: 4 })
      .catch(() => []),
  ]);
  const role = user?.role ?? null;

  const liveCards: DiscoverStream[] = await Promise.all(
    liveStreams.map(async (stream) => {
      const [seller, products] = await Promise.all([
        prisma.user
          .findUnique({ where: { id: stream.sellerId } })
          .catch(() => null),
        prisma.product
          .findMany({
            where: { streamId: stream.id },
            select: { priceInPaise: true },
          })
          .catch(() => []),
      ]);
      return {
        id: stream.id,
        sellerName: seller ? seller.email.split("@")[0] : "seller",
        productCount: products.length,
        fromPaise:
          products.length > 0
            ? Math.min(...products.map((p) => p.priceInPaise))
            : null,
        thumbnailUrl: stream.thumbnailUrl,
      };
    }),
  );

  // Second hero CTA adapts to the account.
  const secondaryCta =
    role === "ADMIN"
      ? { href: "/admin", label: "Open admin panel" }
      : role === "SELLER"
        ? { href: "/dashboard", label: "Go to seller dashboard" }
        : role === "BUYER"
          ? { href: "/dashboard", label: "Start selling" }
          : null;

  return (
    <div className="animate-page-in flex flex-col px-5 py-8">
      {/* ---------- Hero ---------- */}
      <div className="relative overflow-hidden rounded-3xl border border-border bg-surface p-6 shadow-card">
        <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-10 h-36 w-36 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative space-y-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-live/10 px-2.5 py-1 text-xs font-semibold text-live">
            <span className="h-1.5 w-1.5 rounded-full bg-live animate-live-pulse" />
            Live shopping
          </span>
          <h1 className="text-3xl font-bold leading-tight tracking-tight">
            Shop live.
            <br />
            Buy now.
          </h1>
          <p className="max-w-xs text-sm text-muted">
            Watch sellers go live, grab products in real time, and check out in
            seconds.
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <ButtonLink href="/discover" size="lg">
              Browse live streams
            </ButtonLink>
            {secondaryCta ? (
              <ButtonLink href={secondaryCta.href} variant="secondary" size="lg">
                {secondaryCta.label}
              </ButtonLink>
            ) : null}
          </div>
        </div>
      </div>

      {/* ---------- Feature bullets ---------- */}
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

      {/* ---------- Live right now ---------- */}
      {liveCards.length > 0 ? (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              Live right now <LiveBadge />
            </h2>
            <Link
              href="/discover"
              className="text-sm font-medium text-primary transition-opacity hover:opacity-80"
            >
              See all →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {liveCards.map((stream, i) => (
              <div
                key={stream.id}
                className="animate-item-in"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <StreamCard stream={stream} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ---------- How it works ---------- */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">How it works</h2>
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
                <span className="block text-sm font-semibold">
                  {i + 1}. {step.title}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                  {step.text}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- Seller CTA ---------- */}
      {role !== "ADMIN" && role !== "SELLER" ? (
        <section className="mt-8 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-surface to-surface p-6 shadow-card">
          <h2 className="text-xl font-bold tracking-tight">
            Got something to sell?
          </h2>
          <p className="mt-1.5 max-w-xs text-sm text-muted">
            Go live in minutes, feature your products, and sell to buyers in
            real time — no storefront needed.
          </p>
          <ButtonLink href="/dashboard" size="lg" className="mt-4 w-full">
            Become a seller
          </ButtonLink>
        </section>
      ) : null}

      {/* ---------- Footer ---------- */}
      <footer className="mt-10 border-t border-border pt-6 pb-2 text-center">
        <p className="text-sm font-semibold">LiveShop</p>
        <p className="mt-1 text-xs text-faint">
          Live shopping marketplace — watch, reserve, own it.
        </p>
        <nav className="mt-3 flex items-center justify-center gap-4 text-xs text-muted">
          <Link href="/discover" className="hover:text-foreground">
            Live streams
          </Link>
          <Link href="/orders" className="hover:text-foreground">
            Orders
          </Link>
          <Link href="/dashboard" className="hover:text-foreground">
            Sell
          </Link>
        </nav>
        <p className="mt-4 text-[10px] text-faint">© {YEAR} LiveShop</p>
      </footer>
    </div>
  );
}
