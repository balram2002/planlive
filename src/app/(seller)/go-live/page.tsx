import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isSeller } from "@/lib/current-user";
import { GoLiveForm } from "@/components/go-live-form";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default async function GoLivePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!isSeller(user)) redirect("/dashboard");

  // Already broadcasting? Straight back to the studio.
  const activeStream = await prisma.stream.findFirst({
    where: { sellerId: user.id, status: "LIVE" },
  });
  if (activeStream) redirect(`/go-live/${activeStream.id}`);

  const products = await prisma.product.findMany({
    where: { sellerId: user.id },
    orderBy: { title: "asc" },
  });

  return (
    <div className="animate-page-in mx-auto max-w-lg lg:mx-0">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Go live</h1>
      <p className="mb-6 text-sm text-muted">
        Pick the products you&apos;ll be selling, then start your broadcast.
      </p>

      {products.length === 0 ? (
        <EmptyState
          icon="📦"
          title="Add a product first"
          description="You need at least one product before you can go live."
          action={
            <ButtonLink href="/dashboard/products/new">Add product</ButtonLink>
          }
        />
      ) : (
        <GoLiveForm
          products={products.map((p) => ({
            id: p.id,
            title: p.title,
            priceInPaise: p.priceInPaise,
            availableStock: p.availableStock,
          }))}
        />
      )}
    </div>
  );
}
