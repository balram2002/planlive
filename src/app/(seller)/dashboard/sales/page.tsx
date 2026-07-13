import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isSeller } from "@/lib/current-user";
import { loadOrderRows } from "@/lib/order-rows";
import { OrderList } from "@/components/order-list";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

/** Seller sales history: every reservation/order against their products. */
export default async function SalesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!isSeller(user)) redirect("/dashboard");

  const myProducts = await prisma.product.findMany({
    where: { sellerId: user.id },
    select: { id: true },
  });

  const rows =
    myProducts.length === 0
      ? []
      : (
          await loadOrderRows({ productId: { in: myProducts.map((p) => p.id) } })
        ).filter((row) => row.reservation.userId !== user.id);

  return (
    <div className="animate-page-in space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sales</h1>
        <p className="text-sm text-muted">
          Reservations and payments on your products.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="💸"
          title="No sales yet"
          description="Go live and feature your products — sales will land here."
        />
      ) : (
        <OrderList rows={rows} empty="" />
      )}
    </div>
  );
}
