"use client";

import { useActionState, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/action-button";
import { useToast } from "@/components/toast";
import { haptics } from "@/lib/haptics";
import {
  respondPickupAction,
  type FulfilmentActionState,
} from "@/app/(seller)/dashboard/sales/fulfilment-actions";

export type BuyerPickupView = {
  pickupStatus: "REQUESTED" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "COLLECTED";
  pickupDeadline: string | null;
  note: string | null;
  shopName: string;
  shopAddress: string;
  shopPhone: string;
};

/**
 * The buyer's side of a pickup request.
 *
 * Deliberately a decision, not a notification: the seller is asking a favour
 * — collecting in person instead of having it delivered — so declining has to
 * be as easy as accepting, and the copy says plainly that declining costs
 * nothing.
 */
export function PickupRequestCard({
  orderId,
  pickup,
  windowDays,
}: {
  orderId: string;
  pickup: BuyerPickupView;
  windowDays: number;
}) {
  const [state, formAction, pending] = useActionState<
    FulfilmentActionState,
    FormData
  >(respondPickupAction, {});
  const [declining, setDeclining] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (state.error) toast({ title: state.error, variant: "error" });
    else if (state.success) toast({ title: state.success, variant: "success" });
  }, [state, toast]);

  // Accepted — show the deadline and where to go.
  if (pickup.pickupStatus === "ACCEPTED") {
    return (
      <Card className="border-success/30 bg-success/5 p-4">
        <Badge tone="success">You&apos;re collecting this</Badge>
        {pickup.pickupDeadline ? (
          <p className="mt-2 text-sm leading-relaxed">
            Collect by{" "}
            <span className="font-semibold">
              {new Date(pickup.pickupDeadline).toLocaleString("en-IN", {
                weekday: "long",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </p>
        ) : null}
        <ShopBlock pickup={pickup} />
      </Card>
    );
  }

  if (pickup.pickupStatus === "EXPIRED") {
    return (
      <Card className="border-warning/30 bg-warning/5 p-4">
        <Badge tone="warning">Collection window closed</Badge>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          The {windowDays}-day window has passed. Nothing is lost — the seller
          will arrange delivery instead.
        </p>
      </Card>
    );
  }

  if (pickup.pickupStatus === "REJECTED") {
    return (
      <Card className="p-4">
        <Badge>Pickup declined</Badge>
        <p className="mt-2 text-sm text-muted">
          This will be delivered to you as normal.
        </p>
      </Card>
    );
  }

  if (pickup.pickupStatus === "COLLECTED") {
    return (
      <Card className="border-success/30 bg-success/5 p-4">
        <Badge tone="success">Collected</Badge>
        <p className="mt-2 text-sm text-muted">
          Thanks — this order is complete.
        </p>
      </Card>
    );
  }

  // REQUESTED — the actual decision.
  return (
    <Card className="border-warning/30 bg-warning/5 p-4">
      <Badge tone="warning">Waiting on you</Badge>
      <h2 className="mt-2 text-sm font-semibold">
        Would you like to collect this order?
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        You&apos;re in the same area as {pickup.shopName}, so they&apos;ve asked
        whether you&apos;d rather pick it up in person.
      </p>

      <ShopBlock pickup={pickup} />

      {pickup.note ? (
        <p className="mt-2 rounded-xl bg-surface px-3 py-2 text-xs leading-relaxed text-muted">
          &ldquo;{pickup.note}&rdquo;
        </p>
      ) : null}

      <p className="mt-3 text-[11px] leading-relaxed text-faint">
        Accept and you&apos;ll have {windowDays} days to collect. Declining
        costs nothing — it&apos;ll be delivered as normal.
      </p>

      <form action={formAction} className="mt-3 space-y-2">
        <input type="hidden" name="orderId" value={orderId} />
        {declining ? (
          <input
            name="note"
            maxLength={300}
            placeholder="Reason (optional)"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-base placeholder:text-faint focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30 sm:text-sm"
          />
        ) : null}
        <div className="flex gap-2">
          <button
            type="submit"
            name="decision"
            value="DECLINE"
            disabled={pending}
            onClick={() => {
              haptics.tap();
              setDeclining(true);
            }}
            className="flex-1 rounded-full border border-border py-2.5 text-xs font-semibold text-muted transition-colors hover:text-foreground disabled:opacity-50"
          >
            No, deliver it
          </button>
          <button
            type="submit"
            name="decision"
            value="ACCEPT"
            disabled={pending}
            onClick={() => haptics.tap()}
            className="flex-1 rounded-full bg-primary py-2.5 text-xs font-semibold text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {pending ? (
              <span className="inline-flex items-center gap-1.5">
                <Spinner /> Saving
              </span>
            ) : (
              "Yes, I'll collect"
            )}
          </button>
        </div>
      </form>
    </Card>
  );
}

function ShopBlock({ pickup }: { pickup: BuyerPickupView }) {
  return (
    <div className="mt-3 rounded-xl bg-surface px-3 py-2.5">
      <p className="text-xs font-semibold">{pickup.shopName}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-muted">
        {pickup.shopAddress}
      </p>
      {pickup.shopPhone ? (
        <a
          href={`tel:${pickup.shopPhone}`}
          className="mt-1 inline-block text-xs font-medium text-primary"
        >
          📞 {pickup.shopPhone}
        </a>
      ) : null}
    </div>
  );
}
