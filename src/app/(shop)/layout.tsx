import { TopBar } from "@/components/top-bar";
import { BottomNav } from "@/components/bottom-nav";
import { SwipeNav } from "@/components/swipe-nav";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

/**
 * Buyer-facing shell: phone-width app column (Whatnot-style), centered as a
 * frame on larger screens. Nav adapts to the account's role (buyer / seller /
 * admin). Horizontal swipes move between the top-level tabs.
 */
export default async function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Role drives which middle tab + menu links this account sees.
  const user = await getCurrentUser().catch(() => null);
  const role = user?.role ?? null;

  // Buyers get the become-a-seller drawer on the Sell tab; its form offers
  // the live marketplace categories (falling back to the static list).
  const isBuyer = role !== "SELLER" && role !== "ADMIN";
  const sellerCategories = isBuyer
    ? await prisma.category
        .findMany({
          where: { isActive: true },
          orderBy: { name: "asc" },
          select: { name: true },
        })
        .then((rows) => [...new Set(rows.map((r) => r.name))])
        .catch(() => [])
    : [];

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col border-x border-border/60 bg-background shadow-card">
      <TopBar role={role} />
      <SwipeNav
        routes={["/", "/play", "/orders"]}
        className="flex flex-1 flex-col"
      >
        <main className="flex flex-1 flex-col">{children}</main>
      </SwipeNav>
      <BottomNav role={role} sellerCategories={sellerCategories} />
    </div>
  );
}
