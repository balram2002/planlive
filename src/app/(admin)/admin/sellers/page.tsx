import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { SellerReqStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { approveSellerRequest, rejectSellerRequest } from "../actions";

export const dynamic = "force-dynamic";

type Search = {
  tab?: string; // requests | sellers
  status?: string; // pending | approved | rejected
  q?: string;
};

const statusTone = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "live",
} as const;

function tabHref(next: Partial<Search>, current: Search): string {
  const params = new URLSearchParams();
  const merged = { ...current, ...next };
  if (merged.tab && merged.tab !== "requests") params.set("tab", merged.tab);
  if (merged.status && merged.status !== "pending")
    params.set("status", merged.status);
  if (merged.q) params.set("q", merged.q);
  const qs = params.toString();
  return `/admin/sellers${qs ? `?${qs}` : ""}`;
}

/** Sellers hub: application review queue (pending/approved/rejected) + roster. */
export default async function AdminSellersPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const search = await searchParams;
  const tab = search.tab === "sellers" ? "sellers" : "requests";
  const status = (
    ["pending", "approved", "rejected"].includes(search.status ?? "")
      ? search.status
      : "pending"
  ) as "pending" | "approved" | "rejected";
  const q = search.q?.trim() ?? "";

  const pendingCount = await prisma.sellerRequest.count({
    where: { status: "PENDING" },
  });

  return (
    <div className="animate-page-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sellers</h1>
        <p className="text-sm text-muted">
          Review applications and manage the seller roster.
        </p>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 rounded-full border border-border bg-surface p-1 text-sm font-medium">
        {[
          {
            key: "requests",
            label: `Seller requests${pendingCount > 0 ? ` (${pendingCount})` : ""}`,
          },
          { key: "sellers", label: "All sellers" },
        ].map((t) => (
          <Link
            key={t.key}
            href={tabHref({ tab: t.key }, search)}
            className={cn(
              "flex-1 rounded-full px-4 py-2 text-center transition-colors duration-200",
              tab === t.key
                ? "bg-primary/10 text-primary"
                : "text-muted hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "requests" ? (
        <RequestsTab status={status} q={q} search={search} />
      ) : (
        <SellersTab q={q} />
      )}
    </div>
  );
}

async function RequestsTab({
  status,
  q,
  search,
}: {
  status: "pending" | "approved" | "rejected";
  q: string;
  search: Search;
}) {
  const statusEnum = status.toUpperCase() as SellerReqStatus;

  const requests = await prisma.sellerRequest.findMany({
    where: {
      status: statusEnum,
      ...(q ? { brandName: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const users = await prisma.user.findMany({
    where: { id: { in: requests.map((r) => r.userId) } },
    select: { id: true, email: true, username: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  return (
    <div className="space-y-4">
      {/* Status filter + search */}
      <div className="flex flex-wrap items-center gap-2">
        {(["pending", "approved", "rejected"] as const).map((s) => (
          <Link
            key={s}
            href={tabHref({ status: s }, search)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-medium capitalize transition-colors",
              status === s
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border bg-surface text-muted hover:text-foreground",
            )}
          >
            {s}
          </Link>
        ))}
        <form method="GET" className="ml-auto flex gap-2">
          {status !== "pending" ? (
            <input type="hidden" name="status" value={status} />
          ) : null}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search brand…"
            className="w-44 rounded-xl border border-border bg-surface px-3 py-1.5 text-sm placeholder:text-faint focus:border-primary/60 focus:outline-none"
          />
        </form>
      </div>

      {requests.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-sm text-faint">
          No {status} applications{q ? ` matching “${q}”` : ""}.
        </p>
      ) : (
        <ul className="space-y-3">
          {requests.map((request) => {
            const applicant = userById.get(request.userId);
            return (
              <li key={request.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold">
                          {request.brandName}
                        </p>
                        <Badge tone={statusTone[request.status]}>
                          {request.status}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        {applicant?.email ?? "Unknown user"} · {request.phone} ·{" "}
                        {request.category}
                      </p>
                    </div>
                    <p className="shrink-0 text-xs text-faint">
                      {request.createdAt.toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>

                  <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2.5 text-sm leading-relaxed text-muted">
                    {request.about}
                  </p>

                  {request.status === "PENDING" ? (
                    <div className="mt-3 flex gap-2">
                      <form action={approveSellerRequest} className="flex-1">
                        <input type="hidden" name="requestId" value={request.id} />
                        <button
                          type="submit"
                          className="w-full rounded-full bg-success/10 py-2 text-sm font-semibold text-success transition-colors hover:bg-success/20"
                        >
                          Approve
                        </button>
                      </form>
                      <form action={rejectSellerRequest} className="flex-1">
                        <input type="hidden" name="requestId" value={request.id} />
                        <button
                          type="submit"
                          className="w-full rounded-full bg-live/10 py-2 text-sm font-semibold text-live transition-colors hover:bg-live/20"
                        >
                          Reject
                        </button>
                      </form>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-faint">
                      Reviewed {request.reviewedAt?.toLocaleDateString("en-IN")} by{" "}
                      {request.reviewedBy ?? "—"}
                    </p>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

async function SellersTab({ q }: { q: string }) {
  const sellers = await prisma.user.findMany({
    where: {
      role: "SELLER",
      ...(q ? { email: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const productCounts = new Map<string, number>();
  for (const seller of sellers) {
    productCounts.set(
      seller.id,
      await prisma.product.count({ where: { sellerId: seller.id } }),
    );
  }

  return (
    <div className="space-y-4">
      <form method="GET" className="flex gap-2">
        <input type="hidden" name="tab" value="sellers" />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by email…"
          className="w-full max-w-xs rounded-xl border border-border bg-surface px-3.5 py-2 text-base placeholder:text-faint focus:border-primary/60 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-xl border border-border bg-surface px-4 text-sm font-medium text-muted transition-colors hover:text-foreground"
        >
          Search
        </button>
      </form>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto" data-no-swipe>
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-faint">
                <th className="px-4 py-3 font-medium">Seller</th>
                <th className="px-4 py-3 font-medium">Username</th>
                <th className="px-4 py-3 font-medium">Products</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {sellers.map((seller) => (
                <tr
                  key={seller.id}
                  className="border-b border-border/60 transition-colors last:border-0 hover:bg-surface-2/50"
                >
                  <td className="max-w-[220px] truncate px-4 py-3 font-medium">
                    {seller.email}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {seller.username ? `@${seller.username}` : "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {productCounts.get(seller.id) ?? 0}
                  </td>
                  <td className="px-4 py-3">
                    {seller.isActive ? (
                      <Badge tone="success">Active</Badge>
                    ) : (
                      <Badge tone="warning">Suspended</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {seller.createdAt.toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                </tr>
              ))}
              {sellers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-faint">
                    No sellers found{q ? ` for “${q}”` : ""}.
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
