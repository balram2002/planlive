import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const orderTone = {
  PAID: "success",
  PLACED: "success",
  CREATED: "warning",
  FAILED: "live",
} as const;

export default async function AdminOrdersPage() {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const reservations = await prisma.reservation.findMany({
    where: { id: { in: orders.map((o) => o.reservationId) } },
    select: { id: true, productId: true, userId: true },
  });
  const resById = new Map(reservations.map((r) => [r.id, r]));

  const [products, buyers] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: [...new Set(reservations.map((r) => r.productId))] } },
      select: { id: true, title: true },
    }),
    prisma.user.findMany({
      where: { id: { in: [...new Set(reservations.map((r) => r.userId))] } },
      select: { id: true, email: true },
    }),
  ]);
  const productById = new Map(products.map((p) => [p.id, p.title]));
  const buyerById = new Map(buyers.map((b) => [b.id, b.email]));

  return (
    <div className="animate-page-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
        <p className="text-sm text-muted">
          Payment activity across the marketplace (latest 100).
        </p>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto" data-no-swipe>
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-faint">
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Buyer</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const res = resById.get(order.reservationId);
                return (
                  <tr
                    key={order.id}
                    className="border-b border-border/60 last:border-0 transition-colors hover:bg-surface-2/50"
                  >
                    <td className="max-w-[220px] truncate px-4 py-3 font-medium">
                      {res ? (productById.get(res.productId) ?? "Deleted product") : "—"}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-muted">
                      {res ? (buyerById.get(res.userId) ?? "—") : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatPrice(order.amountInPaise)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={orderTone[order.status]}>{order.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {order.createdAt.toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                );
              })}
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-faint">
                    No orders yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
