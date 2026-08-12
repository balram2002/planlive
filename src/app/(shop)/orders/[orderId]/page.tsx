import { APP_TIMEZONE } from "@/lib/datetime";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { ProductThumb } from "@/components/product-thumb";
import { OrderTrack } from "@/components/order-track";
import { TrackingTimeline } from "@/components/shipping/tracking-timeline";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CancelOrderButton } from "@/components/orders/cancel-order-button";
import { PickupRequestCard } from "@/components/orders/pickup-request-card";
import { PICKUP_WINDOW_DAYS, shopLocation } from "@/lib/local-fulfilment";
import { formatPrice } from "@/lib/format";
import { isCancellable } from "@/lib/eshopbox/status-map";
import { stageTimestamps, trackStage } from "@/lib/order-status";

export const dynamic = "force-dynamic";

// Private to the buyer.
export const metadata: Metadata = {
  title: "Order details",
  robots: { index: false, follow: false },
};

type AddressSnapshot = {
  fullName?: string;
  phone?: string;
  line1?: string;
  line2?: string | null;
  city?: string;
  state?: string;
  pincode?: string;
};

function parseAddress(json: string | null): AddressSnapshot | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as AddressSnapshot;
  } catch {
    return null;
  }
}

/** Full order detail: what was bought, where it's going, and where it is. */
export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;

  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?backTo=%2Forders%2F${orderId}`);

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) notFound();

  const reservation = await prisma.reservation.findUnique({
    where: { id: order.reservationId },
  });
  // Ownership check — an order ID must never leak someone else's purchase.
  if (!reservation || reservation.userId !== user.id) notFound();

  const [product, shipment, fulfilment] = await Promise.all([
    prisma.product.findUnique({ where: { id: reservation.productId } }),
    prisma.shipment.findUnique({ where: { orderId: order.id } }),
    prisma.localFulfilment.findUnique({ where: { orderId: order.id } }),
  ]);

  // Only a pickup needs the buyer's input; a seller-delivered order just
  // arrives, so there's nothing to show them beyond the normal track.
  const seller = fulfilment
    ? await prisma.user.findUnique({ where: { id: fulfilment.sellerId } })
    : null;
  const shop = shopLocation(seller?.shopAddressJson ?? null);

  const address = parseAddress(order.addressJson);
  const inFulfilment = trackStage(order.status);
  const itemsTotal = order.amountInPaise - order.deliveryFeeInPaise;

  return (
    <div className="animate-page-in space-y-4 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight">Order details</h1>
        <Link
          href="/orders"
          className="shrink-0 text-sm font-medium text-primary transition-opacity hover:opacity-80"
        >
          ← All orders
        </Link>
      </div>

      {/* Item */}
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <ProductThumb
            src={product?.imageUrl ?? null}
            alt={product?.title ?? ""}
            sizes="64px"
            className="w-16"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-snug">
              {product?.title ?? "Deleted product"}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Qty {reservation.quantity} ·{" "}
              {order.paymentMethod === "COD"
                ? "Cash on delivery"
                : "Paid online"}
            </p>
            {/* A 24-char ObjectId has no break opportunity, so it runs past
                the card (and the phone frame) unless told it may break. */}
            <p className="mt-1 break-all font-mono text-[10px] text-faint">
              #{order.id}
            </p>
          </div>
        </div>
      </Card>

      {/* Progress */}
      {inFulfilment ? (
        <Card className="p-4">
          <h2 className="mb-1 text-sm font-semibold">Progress</h2>
          <OrderTrack
            status={order.status}
            timestamps={stageTimestamps(order, reservation)}
            className="pt-2"
          />
        </Card>
      ) : order.status === "RTO" ? (
        <Card className="border-warning/30 bg-warning/5 p-4">
          <Badge tone="warning">Returning to seller</Badge>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            The courier couldn&apos;t complete delivery, so this parcel is on
            its way back. If you paid online, your refund starts automatically
            once it reaches the seller.
          </p>
        </Card>
      ) : order.status === "CANCELLED" ? (
        <Card className="p-4">
          <Badge>Cancelled</Badge>
          <p className="mt-2 text-sm text-muted">This order was cancelled.</p>
        </Card>
      ) : order.status === "FAILED" ? (
        <Card className="border-live/30 bg-live/5 p-4">
          <Badge tone="live">Payment failed</Badge>
          <p className="mt-2 text-sm text-muted">
            We couldn&apos;t take payment for this order. Nothing was charged.
          </p>
        </Card>
      ) : null}

      {/* Courier */}
      {shipment?.trackingId ? (
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Shipment</h2>
          <TrackingTimeline shipment={shipment} />
        </Card>
      ) : inFulfilment ? (
        <Card className="p-4">
          <h2 className="text-sm font-semibold">Shipment</h2>
          <p className="mt-1.5 text-sm text-muted">
            The seller is preparing your parcel. Tracking details appear here
            once it&apos;s handed to the courier.
          </p>
        </Card>
      ) : null}

      {/* Delivery address */}
      {address ? (
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-semibold">Delivery address</h2>
          <p className="text-sm leading-relaxed text-muted">
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
        </Card>
      ) : null}

      {/* Pickup negotiation, when the seller has asked. */}
      {fulfilment?.method === "BUYER_PICKUP" && fulfilment.pickupStatus ? (
        <PickupRequestCard
          orderId={order.id}
          windowDays={PICKUP_WINDOW_DAYS}
          pickup={{
            pickupStatus: fulfilment.pickupStatus,
            pickupDeadline: fulfilment.pickupDeadline?.toISOString() ?? null,
            note: fulfilment.note,
            shopName: shop?.shopName ?? "the shop",
            shopAddress: shop
              ? [shop.line1, shop.city, shop.pincode].filter(Boolean).join(", ")
              : "",
            shopPhone: shop?.phone ?? "",
          }}
        />
      ) : fulfilment?.method === "SELLER_DELIVERY" &&
        !fulfilment.completedAt ? (
        <Card className="border-primary/30 bg-primary/5 p-4">
          <Badge tone="primary">Seller delivery</Badge>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            You&apos;re local to {shop?.shopName ?? "this seller"}, so
            they&apos;re delivering this to you personally instead of using a
            courier.
          </p>
        </Card>
      ) : null}

      {/* Cancellation — only while the parcel is still with the seller. */}
      {["PAID", "PLACED"].includes(order.status) ? (
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-semibold">Changed your mind?</h2>
          <CancelOrderButton
            orderId={order.id}
            disabledReason={
              shipment?.trackingId && !isCancellable(shipment.status)
                ? "The courier already has this parcel. Refuse delivery and it will come back to the seller."
                : undefined
            }
          />
        </Card>
      ) : null}

      {/* Payment breakdown */}
      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">Payment</h2>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Item total</dt>
            <dd className="tabular-nums">{formatPrice(itemsTotal)}</dd>
          </div>
          {order.deliveryFeeInPaise > 0 ? (
            <div className="flex justify-between">
              <dt className="text-muted">Delivery charge</dt>
              <dd className="tabular-nums">
                {formatPrice(order.deliveryFeeInPaise)}
              </dd>
            </div>
          ) : null}
          <div className="mt-2 flex justify-between border-t border-border pt-2">
            <dt className="font-semibold">
              {order.paymentMethod === "COD" ? "Pay on delivery" : "Total paid"}
            </dt>
            <dd className="font-bold tabular-nums">
              {formatPrice(order.amountInPaise)}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-[11px] text-faint">
          Ordered{" "}
          {order.createdAt.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: APP_TIMEZONE,
          })}
        </p>
      </Card>
    </div>
  );
}
