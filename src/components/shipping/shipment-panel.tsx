"use client";

import { useActionState, useEffect } from "react";
import type { ShipmentStatus } from "@prisma/client";
import { motion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/action-button";
import { useToast } from "@/components/toast";
import {
  cancelShipmentAction,
  createShipmentAction,
  type ShippingActionState,
} from "@/app/(seller)/dashboard/sales/shipping-actions";
import { SHIPMENT_LABELS, SHIPMENT_TONES } from "@/lib/eshopbox/status-map";

export type ShipmentSummary = {
  status: ShipmentStatus;
  trackingId: string | null;
  courierName: string | null;
  labelUrl: string | null;
  courierStatus: string | null;
  lastError: string | null;
  cancellable: boolean;
} | null;

/**
 * Per-order shipping controls for the seller: book a parcel, print the
 * courier label, or cancel before pickup.
 *
 * The "Print label" action opens Eshopbox's PDF in a new tab rather than
 * embedding it — sellers print these, and the browser's own PDF viewer has
 * the print dialog they already know.
 */
export function ShipmentPanel({
  orderId,
  shipment,
  shippable,
}: {
  orderId: string;
  shipment: ShipmentSummary;
  /** False until the order is paid (or COD-placed). */
  shippable: boolean;
}) {
  const [bookState, bookAction, booking] = useActionState<
    ShippingActionState,
    FormData
  >(createShipmentAction, {});
  const [cancelState, cancelAction, cancelling] = useActionState<
    ShippingActionState,
    FormData
  >(cancelShipmentAction, {});
  const { toast } = useToast();

  useEffect(() => {
    if (bookState.error) toast({ title: bookState.error, variant: "error" });
    else if (bookState.success) {
      toast({ title: bookState.success, variant: "success" });
    }
  }, [bookState, toast]);

  useEffect(() => {
    if (cancelState.error) toast({ title: cancelState.error, variant: "error" });
    else if (cancelState.success) {
      toast({ title: cancelState.success, variant: "success" });
    }
  }, [cancelState, toast]);

  // Nothing booked yet.
  if (!shipment || (!shipment.trackingId && shipment.status === "EXCEPTION")) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-3">
        {shipment?.lastError ? (
          <p className="mb-2 rounded-xl border border-live/30 bg-live/10 px-3 py-2 text-xs leading-relaxed text-live">
            {shipment.lastError}
          </p>
        ) : null}

        {shippable ? (
          <form action={bookAction}>
            <input type="hidden" name="orderId" value={orderId} />
            <motion.button
              type="submit"
              disabled={booking}
              whileTap={{ scale: 0.98 }}
              className="w-full rounded-full bg-primary py-2.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {booking ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner /> Booking courier…
                </span>
              ) : shipment?.lastError ? (
                "Retry booking"
              ) : (
                "📦 Create shipment & label"
              )}
            </motion.button>
          </form>
        ) : (
          <p className="text-center text-xs text-faint">
            Shipping unlocks once payment is confirmed.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2.5 rounded-2xl border border-border bg-surface-2/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <Badge tone={SHIPMENT_TONES[shipment.status]}>
          {SHIPMENT_LABELS[shipment.status]}
        </Badge>
        {shipment.courierName ? (
          <span className="truncate text-[11px] text-muted">
            {shipment.courierName}
          </span>
        ) : null}
      </div>

      {shipment.trackingId ? (
        <p className="font-mono text-[11px] tabular-nums text-muted">
          AWB {shipment.trackingId}
        </p>
      ) : null}

      {/* The courier's own wording, when it adds detail our label doesn't. */}
      {shipment.courierStatus &&
      shipment.courierStatus.toUpperCase() !== shipment.status ? (
        <p className="text-[10px] uppercase tracking-wide text-faint">
          Courier: {shipment.courierStatus.replaceAll("_", " ").toLowerCase()}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {shipment.labelUrl ? (
          <a
            href={shipment.labelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-full bg-foreground px-3 py-2 text-center text-xs font-semibold text-background transition-opacity hover:opacity-90"
          >
            🖨️ Print label
          </a>
        ) : null}

        {shipment.cancellable ? (
          <form action={cancelAction} className="shrink-0">
            <input type="hidden" name="orderId" value={orderId} />
            <button
              type="submit"
              disabled={cancelling}
              className="rounded-full border border-border px-3 py-2 text-xs font-medium text-muted transition-colors hover:border-live/40 hover:text-live disabled:opacity-50"
            >
              {cancelling ? "Cancelling…" : "Cancel"}
            </button>
          </form>
        ) : null}
      </div>

      {shipment.lastError ? (
        <p className="text-[11px] leading-relaxed text-live">{shipment.lastError}</p>
      ) : null}
    </div>
  );
}
