"use client";

import { useActionState, useEffect } from "react";
import { Spinner } from "@/components/ui/action-button";
import { useToast } from "@/components/toast";
import {
  adminBookShipment,
  adminCancelShipment,
  type AdminShippingState,
} from "@/app/(admin)/admin/shipments/actions";

/**
 * Admin row controls: retry a failed booking, reprint a label, or cancel a
 * parcel on a seller's behalf.
 */
export function AdminShipmentControls({
  orderId,
  hasTracking,
  cancellable,
  labelUrl,
}: {
  orderId: string;
  hasTracking: boolean;
  cancellable: boolean;
  labelUrl: string | null;
}) {
  const [bookState, bookAction, booking] = useActionState<
    AdminShippingState,
    FormData
  >(adminBookShipment, {});
  const [cancelState, cancelAction, cancelling] = useActionState<
    AdminShippingState,
    FormData
  >(adminCancelShipment, {});
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

  return (
    <div className="flex items-center gap-1">
      {labelUrl ? (
        <a
          href={labelUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
        >
          Label
        </a>
      ) : null}

      {!hasTracking ? (
        <form action={bookAction}>
          <input type="hidden" name="orderId" value={orderId} />
          <button
            type="submit"
            disabled={booking}
            className="rounded-full px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
          >
            {booking ? <Spinner /> : "Retry"}
          </button>
        </form>
      ) : null}

      {cancellable ? (
        <form action={cancelAction}>
          <input type="hidden" name="orderId" value={orderId} />
          <button
            type="submit"
            disabled={cancelling}
            className="rounded-full px-2.5 py-1 text-xs font-medium text-live transition-colors hover:bg-live/10 disabled:opacity-50"
          >
            {cancelling ? <Spinner /> : "Cancel"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
