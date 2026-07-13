import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { OnboardSellerForm } from "@/components/admin/onboard-seller-form";
import { promoteToAdmin, setUserActive, setUserRole } from "../actions";

export const dynamic = "force-dynamic";

const roleTone = {
  ADMIN: "primary",
  SELLER: "success",
  BUYER: "neutral",
} as const;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const me = await getCurrentUser();

  const users = await prisma.user.findMany({
    where: q
      ? { email: { contains: q.trim(), mode: "insensitive" } }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="animate-page-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        <p className="text-sm text-muted">
          Onboard sellers, manage roles, activate or suspend accounts.
        </p>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">Onboard a seller</h2>
        <p className="mb-3 text-xs text-muted">
          Existing users are promoted instantly; new emails get an invitation
          that signs them up as a seller.
        </p>
        <OnboardSellerForm />
      </Card>

      {/* Search (GET form — no JS needed) */}
      <form method="GET" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by email…"
          className="w-full max-w-xs rounded-xl border border-border bg-surface px-3.5 py-2 text-base placeholder:text-faint focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          type="submit"
          className="rounded-xl border border-border bg-surface px-4 text-sm font-medium text-muted transition-colors hover:text-foreground"
        >
          Search
        </button>
      </form>

      {/* Users table (desktop) / cards (mobile) */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto" data-no-swipe>
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-faint">
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isSelf = user.id === me?.id;
                const untouchable = user.role === "ADMIN";
                return (
                  <tr
                    key={user.id}
                    className="border-b border-border/60 last:border-0 transition-colors hover:bg-surface-2/50"
                  >
                    <td className="max-w-[220px] truncate px-4 py-3 font-medium">
                      {user.email}
                      {isSelf ? (
                        <span className="ml-1.5 text-xs text-faint">(you)</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={roleTone[user.role]}>{user.role}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {user.isActive ? (
                        <Badge tone="success">Active</Badge>
                      ) : (
                        <Badge tone="warning">Suspended</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {user.createdAt.toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      {untouchable ? (
                        <span className="block text-right text-xs text-faint">
                          —
                        </span>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5">
                          <form action={setUserRole}>
                            <input type="hidden" name="userId" value={user.id} />
                            <input
                              type="hidden"
                              name="role"
                              value={user.role === "SELLER" ? "BUYER" : "SELLER"}
                            />
                            <button
                              type="submit"
                              className="rounded-full px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                            >
                              {user.role === "SELLER"
                                ? "Demote to buyer"
                                : "Make seller"}
                            </button>
                          </form>
                          <form action={setUserActive}>
                            <input type="hidden" name="userId" value={user.id} />
                            <input
                              type="hidden"
                              name="active"
                              value={user.isActive ? "false" : "true"}
                            />
                            <button
                              type="submit"
                              className={
                                user.isActive
                                  ? "rounded-full px-3 py-1.5 text-xs font-medium text-live transition-colors hover:bg-live/10"
                                  : "rounded-full px-3 py-1.5 text-xs font-medium text-success transition-colors hover:bg-success/10"
                              }
                            >
                              {user.isActive ? "Suspend" : "Reactivate"}
                            </button>
                          </form>
                          {user.isActive ? (
                            <form action={promoteToAdmin}>
                              <input type="hidden" name="userId" value={user.id} />
                              <button
                                type="submit"
                                title="Grant full admin access — cannot be undone from this panel"
                                className="rounded-full px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                              >
                                Make admin
                              </button>
                            </form>
                          ) : null}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-faint">
                    No users found{q ? ` for “${q}”` : ""}.
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
