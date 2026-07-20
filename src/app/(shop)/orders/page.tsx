import type { Metadata } from "next";
import Link from "next/link";
import { SignInButton } from "@clerk/nextjs";
import { getCurrentUser, isSeller } from "@/lib/current-user";
import { loadOrderRows } from "@/lib/order-rows";
import { OrderList } from "@/components/order-list";
import { BrandFooter } from "@/components/brand-footer";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

// Personal purchase history — private.
export const metadata: Metadata = {
  title: "Your orders",
  robots: { index: false, follow: false },
};

export default async function OrdersPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="animate-page-in px-4 py-16">
        <EmptyState
          title="Sign in to see your orders"
          description="Your purchases and their payment status will appear here."
          action={
            <SignInButton mode="modal">
              <Button>Sign in</Button>
            </SignInButton>
          }
        />
      </div>
    );
  }

  const purchases = await loadOrderRows({ userId: user.id });

  return (
    <div className="animate-page-in space-y-5 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
        {isSeller(user) ? (
          <Link
            href="/dashboard/sales"
            className="text-sm font-medium text-primary transition-opacity hover:opacity-80"
          >
            View sales →
          </Link>
        ) : null}
      </div>

      {purchases.length === 0 ? (
        <EmptyState
          icon="🧾"
          title="No orders yet"
          description="Buy something from a live stream and it'll show up here."
        />
      ) : (
        <OrderList rows={purchases} empty="" />
      )}
      <BrandFooter />
    </div>
  );
}
