import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isSeller } from "@/lib/current-user";
import { SellerApplyForm } from "@/components/seller/apply-form";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Become a seller",
  description: "Apply to sell live on LiveShop.",
};

const perks = [
  { icon: "🎥", text: "Broadcast live and sell in real time" },
  { icon: "⚡", text: "Race-proof Buy Now reservations" },
  { icon: "💸", text: "Online payments or cash on delivery" },
];

export default async function BecomeSellerPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { submitted } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?backTo=%2Fbecome-a-seller");
  if (isSeller(user)) redirect("/dashboard");

  const [request, dbCategories] = await Promise.all([
    prisma.sellerRequest.findUnique({ where: { userId: user.id } }),
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { name: true },
    }),
  ]);
  // Prefer live marketplace categories; static list only as a bootstrap.
  const categoryNames = [...new Set(dbCategories.map((c) => c.name))];

  return (
    <div className="animate-page-in space-y-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Become a seller</h1>
        <p className="text-sm text-muted">
          Apply once — our team reviews every application.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {perks.map((perk, i) => (
          <div
            key={perk.icon}
            className="animate-item-in rounded-2xl border border-border bg-surface p-3 text-center shadow-card"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="text-lg">{perk.icon}</div>
            <p className="mt-1 text-[11px] leading-snug text-muted">{perk.text}</p>
          </div>
        ))}
      </div>

      {request?.status === "PENDING" || submitted ? (
        <Card className="p-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-warning/15 text-2xl">
            ⏳
          </div>
          <h2 className="text-lg font-semibold">Application under review</h2>
          <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted">
            We&apos;ve received your application for{" "}
            <span className="font-medium text-foreground">
              {request?.brandName}
            </span>
            . You&apos;ll be able to start selling the moment an admin approves
            it.
          </p>
          <Badge tone="warning" className="mt-4">
            Pending review
          </Badge>
          <div className="mt-5">
            <ButtonLink href="/discover" variant="secondary">
              Browse live streams meanwhile
            </ButtonLink>
          </div>
        </Card>
      ) : (
        <>
          {request?.status === "REJECTED" ? (
            <Card className="border-live/30 bg-live/5 p-4">
              <p className="text-sm font-medium text-live">
                Your previous application wasn&apos;t approved.
              </p>
              <p className="mt-1 text-xs text-muted">
                You can update the details below and apply again.
              </p>
            </Card>
          ) : null}
          <SellerApplyForm categories={categoryNames} />
        </>
      )}
    </div>
  );
}
