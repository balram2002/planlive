import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductThumb } from "@/components/product-thumb";
import { TrackingTimeline } from "@/components/shipping/tracking-timeline";
import { AdminShipmentControls } from "@/components/admin/shipment-controls";
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
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Everything support needs about one parcel on a single screen: the buyer's
 * order, both journey legs, the courier's scan history, the pickup contact,
 * and the same book/cancel/label controls as the list.
 */
export default async function AdminShipmentDetailPage({
  params,
}: {
  params: Promise<{ shipmentId: string }>;
}) {
  await requireAdmin();
  const { shipmentId } = await params;

  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
  });
  if (!shipment) notFound();

  const order = await prisma.order.findUnique({
    where: { id: shipment.orderId },
  });
  const reservation = order
    ? await prisma.reservation.findUnique({ where: { id: order.reservationId } })
    : null;

  const [product, seller, buyer] = await Promise.all([
    reservation
      ? prisma.product.findUnique({ where: { id: reservation.productId } })
      : null,
    prisma.user.findUnique({ where: { id: shipment.sellerId } }),
    reservation
      ? prisma.user.findUnique({ where: { id: reservation.userId } })
      : null,
  ]);

  const address = parseJson<AddressSnapshot>(order?.addressJson ?? null);
  const shop = parseJson<AddressSnapshot & { shopName?: string }>(
    seller?.shopAddressJson ?? null,
  );

  const timeline = [
    { label: "Booked", at: shipment.bookedAt },
    { label: "Picked up", at: shipment.pickedUpAt },
    { label: "Delivered", at: shipment.deliveredAt },
    { label: "Returned", at: shipment.returnedAt },
    { label: "Cancelled", at: shipment.cancelledAt },
    { label: "Last synced", at: shipment.syncedAt },
  ].filter((entry) => entry.at);

  return (
    <div className="animate-page-in space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/admin/shipments"
            className="text-xs font-medium text-primary transition-opacity hover:opacity-80"
          >
            ← All shipments
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Shipment</h1>
          <p className="mt-1 break-all font-mono text-xs text-faint">
            {shipment.externalShipmentId}
          </p>
        </div>
        <div className="shrink-0">
          <AdminShipmentControls
            orderId={shipment.orderId}
            hasTracking={Boolean(shipment.trackingId)}
            cancellable={isCancellable(shipment.status)}
            labelUrl={shipment.labelUrl}
                        trackingId={shipment.trackingId}
          />
        </div>
      </div>

      {shipment.lastError ? (
        <Card className="border-live/30 bg-live/5 p-4">
          <p className="text-sm font-medium text-live">Last booking error</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            {shipment.lastError}
          </p>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---- Status + legs ---- */}
        <Card className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Status</h2>
            <Badge tone={SHIPMENT_TONES[shipment.status]}>
              {SHIPMENT_LABELS[shipment.status]}
            </Badge>
          </div>

          <dl className="mt-3 space-y-2.5 text-sm">
            <Row label="Courier status">
              {shipment.courierStatus ? (
                <span className="break-words">
                  {shipment.courierStatus.replaceAll("_", " ").toLowerCase()}
                </span>
              ) : (
                "—"
              )}
            </Row>
            <Row label="Forward AWB">
              <span className="break-all font-mono text-xs">
                {shipment.trackingId ?? "—"}
              </span>
            </Row>
            <Row label="Forward courier">{shipment.courierName ?? "—"}</Row>
            {shipment.returnTrackingId ? (
              <>
                <Row label="Return AWB">
                  <span className="break-all font-mono text-xs">
                    {shipment.returnTrackingId}
                  </span>
                </Row>
                <Row label="Return courier">
                  {shipment.returnCourierName ?? "—"}
                </Row>
              </>
            ) : null}
            <Row label="Shipping mode">{shipment.shippingMode ?? "—"}</Row>
            <Row label="Routing code">
              <span className="break-all font-mono text-xs">
                {shipment.routingCode ?? "—"}
              </span>
            </Row>
            <Row label="Expected delivery">
              {shipment.expectedDeliveryDate
                ? shipment.expectedDeliveryDate.toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "—"}
            </Row>
          </dl>
        </Card>

        {/* ---- Order + buyer ---- */}
        <Card className="p-4 sm:p-5">
          <h2 className="text-sm font-semibold">Order</h2>
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
                  {order ? formatPrice(order.amountInPaise) : "—"}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-faint">Product no longer exists.</p>
          )}

          <dl className="mt-3 space-y-2.5 border-t border-border pt-3 text-sm">
            <Row label="Order id">
              <Link
                href="/admin/orders"
                className="break-all font-mono text-xs text-primary hover:underline"
              >
                {shipment.orderId}
              </Link>
            </Row>
            <Row label="Order status">{order?.status ?? "—"}</Row>
            <Row label="Payment">
              {order
                ? order.paymentMethod === "COD"
                  ? "Cash on delivery"
                  : "Paid online"
                : "—"}
            </Row>
            <Row label="Buyer">
              <span className="break-all">{buyer?.email ?? "—"}</span>
            </Row>
            <Row label="Seller">
              <span className="break-all">{seller?.email ?? "—"}</span>
            </Row>
          </dl>
        </Card>

        {/* ---- Delivery address ---- */}
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
        </Card>

        {/* ---- Pickup ---- */}
        <Card className="p-4 sm:p-5">
          <h2 className="text-sm font-semibold">Collected from</h2>
          {seller?.pickupLocationCode ? (
            <p className="mt-2 text-sm text-muted">
              Eshopbox warehouse code{" "}
              <span className="font-mono text-foreground">
                {seller.pickupLocationCode}
              </span>
            </p>
          ) : shop ? (
            <p className="mt-2 text-sm leading-relaxed text-muted">
              <span className="font-medium text-foreground">
                {shop.shopName}
              </span>
              {shop.phone ? ` · ${shop.phone}` : ""}
              <br />
              {shop.line1}
              {shop.line2 ? `, ${shop.line2}` : ""}
              <br />
              {shop.city}
              {shop.state ? `, ${shop.state}` : ""} — {shop.pincode}
            </p>
          ) : (
            <p className="mt-2 text-sm text-live">
              No pickup address or warehouse code — bookings for this seller
              will be rejected.
            </p>
          )}
        </Card>
      </div>

      {/* ---- Courier scans ---- */}
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

      {/* ---- Our own event log ---- */}
      {timeline.length > 0 ? (
        <Card className="p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-semibold">Record</h2>
          <dl className="grid gap-2.5 text-sm sm:grid-cols-2">
            {timeline.map((entry) => (
              <Row key={entry.label} label={entry.label}>
                {when(entry.at)}
              </Row>
            ))}
          </dl>
        </Card>
      ) : null}
    </div>
  );
}

/** Label/value pair that wraps instead of overflowing on narrow screens. */
function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <dt className="shrink-0 text-xs uppercase tracking-wide text-faint">
        {label}
      </dt>
      <dd className="min-w-0 max-w-full text-right text-sm">{children}</dd>
    </div>
  );
}
