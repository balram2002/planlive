import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isSeller } from "@/lib/current-user";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductThumb } from "@/components/product-thumb";
import { TrackingTimeline } from "@/components/shipping/tracking-timeline";
import { ShipmentPanel } from "@/components/shipping/shipment-panel";
import { formatPrice } from "@/lib/format";
import {
  isCancellable,
  SHIPMENT_LABELS,
  SHIPMENT_TONES,
} from "@/lib/eshopbox/status-map";

export const dynamic = "force-dynamic";

type AddressSnapshot = {
  fullName?: string;
  phone?: string;
  line1?: string;
  line2?: string | null;
  city?: string;
  state?: string;
  pincode?: string;
};

function parseJson<T>(json: string | null): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function when(date: Date | null | undefined): string {
  if (!date) return "—";
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * One parcel, in full, for the seller who owns it.
 *
 * The list view is a working queue; this is where a seller goes when a
 * specific parcel needs explaining — the courier's own scans, both journey
 * legs, and the label/cancel controls in one place.
 */
export default async function SellerShipmentDetailPage({
  params,
}: {
  params: Promise<{ shipmentId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!isSeller(user)) redirect("/dashboard");

  const { shipmentId } = await params;
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
  });
  // Ownership is checked server-side; a shipment id must never leak another
  // seller's parcel.
  if (!shipment || shipment.sellerId !== user.id) notFound();

  const order = await prisma.order.findUnique({
    where: { id: shipment.orderId },
  });
  const reservation = order
    ? await prisma.reservation.findUnique({ where: { id: order.reservationId } })
    : null;
  const product = reservation
    ? await prisma.product.findUnique({ where: { id: reservation.productId } })
    : null;

  const address = parseJson<AddressSnapshot>(order?.addressJson ?? null);

  const record = [
    { label: "Booked", at: shipment.bookedAt },
    { label: "Picked up", at: shipment.pickedUpAt },
    { label: "Delivered", at: shipment.deliveredAt },
    { label: "Returned", at: shipment.returnedAt },
    { label: "Cancelled", at: shipment.cancelledAt },
  ].filter((entry) => entry.at);

  return (
    <div className="animate-page-in space-y-5">
      <div className="min-w-0">
        <Link
          href="/dashboard/shipments"
          className="text-xs font-medium text-primary transition-opacity hover:opacity-80"
        >
          ← All shipments
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Parcel</h1>
          <Badge tone={SHIPMENT_TONES[shipment.status]}>
            {SHIPMENT_LABELS[shipment.status]}
          </Badge>
        </div>
        {shipment.trackingId ? (
          <p className="mt-1 break-all font-mono text-xs text-faint">
            AWB {shipment.trackingId}
          </p>
        ) : null}
      </div>

      {shipment.lastError ? (
        <Card className="border-live/30 bg-live/5 p-4">
          <p className="text-sm font-medium text-live">Courier error</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            {shipment.lastError}
          </p>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Item + actions */}
        <Card className="p-4 sm:p-5">
          <h2 className="text-sm font-semibold">Item</h2>
          {product ? (
            <div className="mt-3 flex items-center gap-3">
              <ProductThumb
                src={product.imageUrl}
                alt={product.title}
                sizes="56px"
                className="w-14"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{product.title}</p>
                <p className="mt-0.5 text-xs text-muted">
                  Qty {reservation?.quantity ?? 1} ·{" "}
                  {order ? formatPrice(order.amountInPaise) : "—"} ·{" "}
                  {order?.paymentMethod === "COD" ? "COD" : "Prepaid"}
                </p>
                <p className="mt-0.5 text-[11px] text-faint tabular-nums">
                  {product.weightGrams} g · {product.lengthCm}×
                  {product.breadthCm}×{product.heightCm} cm
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-faint">Product no longer exists.</p>
          )}

          {order ? (
            <div className="mt-4 border-t border-border pt-4">
              <ShipmentPanel
                orderId={order.id}
                shippable={false}
                shipment={{
                  status: shipment.status,
                  trackingId: shipment.trackingId,
                  courierName: shipment.courierName,
                  labelUrl: shipment.labelUrl,
                  courierStatus: shipment.courierStatus,
                  lastError: shipment.lastError,
                  cancellable: isCancellable(shipment.status),
                }}
              />
            </div>
          ) : null}
        </Card>

        {/* Delivery */}
        <Card className="p-4 sm:p-5">
          <h2 className="text-sm font-semibold">Deliver to</h2>
          {address ? (
            <p className="mt-2 text-sm leading-relaxed text-muted">
              <span className="font-medium text-foreground">
                {address.fullName}
              </span>
              {address.phone ? ` · ${address.phone}` : ""}
              <br />
              {address.line1}
              {address.line2 ? `, ${address.line2}` : ""}
              <br />
              {address.city}
              {address.state ? `, ${address.state}` : ""} — {address.pincode}
            </p>
          ) : (
            <p className="mt-2 text-sm text-faint">No address snapshot.</p>
          )}

          <dl className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <dt className="text-xs uppercase tracking-wide text-faint">
                Courier
              </dt>
              <dd>{shipment.courierName ?? "—"}</dd>
            </div>
            {shipment.returnTrackingId ? (
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <dt className="text-xs uppercase tracking-wide text-faint">
                  Return AWB
                </dt>
                <dd className="break-all font-mono text-xs">
                  {shipment.returnTrackingId}
                </dd>
              </div>
            ) : null}
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <dt className="text-xs uppercase tracking-wide text-faint">
                Expected by
              </dt>
              <dd>
                {shipment.expectedDeliveryDate
                  ? shipment.expectedDeliveryDate.toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  : "—"}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      <Card className="p-4 sm:p-5">
        <h2 className="mb-3 text-sm font-semibold">Courier scans</h2>
        {shipment.trackingId ? (
          <TrackingTimeline shipment={shipment} />
        ) : (
          <p className="text-sm text-faint">
            No AWB yet — nothing has been scanned.
          </p>
        )}
      </Card>

      {record.length > 0 ? (
        <Card className="p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-semibold">Record</h2>
          <dl className="grid gap-2.5 text-sm sm:grid-cols-2">
            {record.map((entry) => (
              <div
                key={entry.label}
                className="flex flex-wrap items-baseline justify-between gap-x-3"
              >
                <dt className="text-xs uppercase tracking-wide text-faint">
                  {entry.label}
                </dt>
                <dd>{when(entry.at)}</dd>
              </div>
            ))}
          </dl>
        </Card>
      ) : null}
    </div>
  );
}
