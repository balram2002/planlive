import { redirect } from "next/navigation";
import { getCurrentUser, isSeller } from "@/lib/current-user";
import { signInPath } from "@/lib/back-to";
import { getPremiumState } from "@/lib/premium";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PremiumApplyForm } from "@/components/seller/premium-apply-form";

export const dynamic = "force-dynamic";

const PERKS = [
  {
    icon: "🎯",
    title: "Locked 1080p",
    body: "A fixed 1080p30 ladder on a dedicated premium network — no drop to a lower rung when the room fills up.",
  },
  {
    icon: "🌐",
    title: "Global edge delivery",
    body: "Viewers connect to the nearest edge, so distant buyers see the same stream your local ones do.",
  },
  {
    icon: "🛡️",
    title: "Separate capacity",
    body: "Premium broadcasts run on their own infrastructure, isolated from standard-tier load.",
  },
];

/** Seller-facing premium broadcasting overview + application. */
export default async function SellerPremiumPage() {
  const user = await getCurrentUser();
  if (!user) redirect(signInPath("/dashboard/premium"));
  if (!isSeller(user)) redirect("/dashboard");

  const premium = await getPremiumState(user.id);

  return (
    <div className="animate-page-in space-y-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">
            Premium broadcasting
          </h1>
          <StatusBadge status={premium.status} />
        </div>
        <p className="mt-1 text-sm text-muted">
          An upgraded streaming backend for sellers who go live regularly.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {PERKS.map((perk) => (
          <Card key={perk.title} className="p-4">
            <span aria-hidden className="text-xl">
              {perk.icon}
            </span>
            <p className="mt-2 text-sm font-semibold">{perk.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {perk.body}
            </p>
          </Card>
        ))}
      </div>

      {premium.status === "APPROVED" ? (
        <Card className="border-amber-300/40 bg-amber-300/5 p-4 sm:p-5">
          <p className="text-sm font-semibold">
            ✨ Premium is enabled on your account
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Pick <span className="font-medium text-foreground">Premium</span> on
            the go-live screen and enter your broadcast passphrase to start.
            Your stream will carry a gold ring so buyers can tell.
          </p>
          {premium.reviewNote ? (
            <p className="mt-2 rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
              {premium.reviewNote}
            </p>
          ) : null}
        </Card>
      ) : premium.status === "PENDING" ? (
        <Card className="border-warning/30 bg-warning/5 p-4 sm:p-5">
          <p className="text-sm font-semibold text-warning">
            Application under review
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            We&apos;ll enable premium on your account once it&apos;s approved.
            Standard streaming keeps working in the meantime.
          </p>
        </Card>
      ) : (
        <Card className="p-4 sm:p-5">
          {premium.status === "REJECTED" ? (
            <div className="mb-4 rounded-xl border border-live/30 bg-live/5 p-3">
              <p className="text-sm font-medium text-live">
                Your last application wasn&apos;t approved
              </p>
              {premium.reviewNote ? (
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {premium.reviewNote}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-muted">
                You&apos;re welcome to apply again.
              </p>
            </div>
          ) : null}

          <h2 className="text-sm font-semibold">Apply for premium</h2>
          <p className="mt-1 mb-4 text-xs leading-relaxed text-muted">
            Tell us a little about how you stream — it helps us prioritise.
          </p>
          <PremiumApplyForm resubmitting={premium.status === "REJECTED"} />
        </Card>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "APPROVED") return <Badge tone="success">Enabled</Badge>;
  if (status === "PENDING") return <Badge tone="warning">Under review</Badge>;
  if (status === "REJECTED") return <Badge tone="live">Not approved</Badge>;
  return <Badge>Not enabled</Badge>;
}
