import { TopBar } from "@/components/top-bar";
import { BottomNav } from "@/components/bottom-nav";
import { SwipeNav } from "@/components/swipe-nav";
import { getCurrentUser } from "@/lib/current-user";

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

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col border-x border-border/60 bg-background shadow-card">
      <TopBar role={role} />
      <SwipeNav
        routes={["/", "/discover", "/orders"]}
        className="flex flex-1 flex-col"
      >
        <main className="flex flex-1 flex-col">{children}</main>
      </SwipeNav>
      <BottomNav role={role} />
    </div>
  );
}
