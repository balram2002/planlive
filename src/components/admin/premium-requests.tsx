"use client";

import { useActionState, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/action-button";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/cn";
import {
  reviewPremiumRequest,
  revokePremiumAccess,
  type PremiumReviewState,
} from "@/app/(admin)/admin/sellers/premium-actions";

export type PremiumRequestRow = {
  id: string;
  sellerEmail: string;
  sellerName: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  message: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

/**
 * Premium broadcasting applications, inside the admin Sellers tab.
 *
 * Pending items come first and carry the approve/reject controls; approved
 * sellers stay listed so access can be revoked without hunting for the row.
 */
export function PremiumRequests({ rows }: { rows: PremiumRequestRow[] }) {
  const [filter, setFilter] = useState<"PENDING" | "APPROVED" | "REJECTED">(
    rows.some((r) => r.status === "PENDING") ? "PENDING" : "APPROVED",
  );

  const counts = {
    PENDING: rows.filter((r) => r.status === "PENDING").length,
    APPROVED: rows.filter((r) => r.status === "APPROVED").length,
    REJECTED: rows.filter((r) => r.status === "REJECTED").length,
  };
  const visible = rows.filter((r) => r.status === filter);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Premium broadcasting</h2>
          <p className="mt-0.5 text-sm text-muted">
            Sellers applying for the premium streaming backend.
          </p>
        </div>
        {counts.PENDING > 0 ? (
          <Badge tone="warning">{counts.PENDING} awaiting review</Badge>
        ) : null}
      </div>

      <div className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0" data-no-swipe>
        <div className="flex w-max gap-2">
          {(["PENDING", "APPROVED", "REJECTED"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                filter === key
                  ? "bg-primary/15 font-semibold text-primary"
                  : "border border-border text-muted hover:text-foreground",
              )}
            >
              {key === "PENDING"
                ? "Pending"
                : key === "APPROVED"
                  ? "Approved"
                  : "Rejected"}{" "}
              ({counts[key]})
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-faint">
            {filter === "PENDING"
              ? "No applications waiting."
              : filter === "APPROVED"
                ? "No sellers have premium access yet."
                : "Nothing rejected."}
          </p>
        </Card>
      ) : (
        <ul className="grid gap-2.5 lg:grid-cols-2">
          {visible.map((row) => (
            <li key={row.id}>
              <RequestCard row={row} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RequestCard({ row }: { row: PremiumRequestRow }) {
  const [reviewState, reviewAction, reviewing] = useActionState<
    PremiumReviewState,
    FormData
  >(reviewPremiumRequest, {});
  const [revokeState, revokeAction, revoking] = useActionState<
    PremiumReviewState,
    FormData
  >(revokePremiumAccess, {});
  const { toast } = useToast();

  useEffect(() => {
    if (reviewState.error) toast({ title: reviewState.error, variant: "error" });
    else if (reviewState.success) {
      toast({ title: reviewState.success, variant: "success" });
    }
  }, [reviewState, toast]);

  useEffect(() => {
    if (revokeState.error) toast({ title: revokeState.error, variant: "error" });
    else if (revokeState.success) {
      toast({ title: revokeState.success, variant: "success" });
    }
  }, [revokeState, toast]);

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {row.sellerName ?? row.sellerEmail.split("@")[0]}
          </p>
          <p className="mt-0.5 break-all text-xs text-muted">
            {row.sellerEmail}
          </p>
        </div>
        <Badge
          tone={
            row.status === "APPROVED"
              ? "success"
              : row.status === "PENDING"
                ? "warning"
                : "live"
          }
        >
          {row.status === "APPROVED"
            ? "Enabled"
            : row.status === "PENDING"
              ? "Pending"
              : "Rejected"}
        </Badge>
      </div>

      {row.message ? (
        <p className="mt-2.5 rounded-xl bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted">
          {row.message}
        </p>
      ) : null}

      {row.reviewNote ? (
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          Note: {row.reviewNote}
        </p>
      ) : null}

      <p className="mt-2 text-[11px] text-faint">
        Applied {new Date(row.createdAt).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </p>

      {row.status === "PENDING" ? (
        <form action={reviewAction} className="mt-3 space-y-2">
          <input type="hidden" name="requestId" value={row.id} />
          <input
            name="reviewNote"
            maxLength={300}
            placeholder="Note for the seller (optional)"
            className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-base placeholder:text-faint focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30 sm:text-sm"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              name="decision"
              value="REJECTED"
              disabled={reviewing}
              className="flex-1 rounded-full border border-border py-2 text-xs font-semibold text-muted transition-colors hover:border-live/40 hover:text-live disabled:opacity-50"
            >
              Reject
            </button>
            <button
              type="submit"
              name="decision"
              value="APPROVED"
              disabled={reviewing}
              className="flex-1 rounded-full bg-primary py-2 text-xs font-semibold text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {reviewing ? (
                <span className="inline-flex items-center gap-1.5">
                  <Spinner /> Saving
                </span>
              ) : (
                "Approve"
              )}
            </button>
          </div>
        </form>
      ) : row.status === "APPROVED" ? (
        <form action={revokeAction} className="mt-3">
          <input type="hidden" name="requestId" value={row.id} />
          <button
            type="submit"
            disabled={revoking}
            className="w-full rounded-full border border-border py-2 text-xs font-semibold text-muted transition-colors hover:border-live/40 hover:text-live disabled:opacity-50"
          >
            {revoking ? "Revoking…" : "Revoke access"}
          </button>
        </form>
      ) : null}
    </Card>
  );
}
