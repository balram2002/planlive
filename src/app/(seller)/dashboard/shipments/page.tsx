import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isSeller } from "@/lib/current-user";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { ProductThumb } from "@/components/product-thumb";
import { ShipmentPanel } from "@/components/shipping/shipment-panel";
import { BulkLabelButton } from "@/components/shipping/bulk-label-button";
import { eshopboxConfigured } from "@/lib/eshopbox/client";
import {
  isCancellable,
  SHIPMENT_LABELS,
  SHIPMENT_TONES,
} from "@/lib/eshopbox/status-map";
import { formatPrice } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Orders ready to hand to a courier. */
const SHIPPABLE = new Set(["PAID", "PLACED"]);

/**
 * The seller's packing station: everything waiting for a label, everything
 * waiting for the courier, and everything already moving — in the order they
 * need to act on it.
 */
export default async function SellerShipmentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!isSeller(user)) redirect("/dashboard");

  const myProducts = await prisma.product.findMany({
    where: { sellerId: user.id },
    select: { id: true, title: true, imageUrl: true },
  });
  const productById = new Map(myProducts.map((p) => [p.id, p]));

  if (myProducts.length === 0) {
    return (
      <div className="animate-page-in space-y-5">
        <Header />
        <EmptyState
          icon="📦"
          title="No products yet"
          description="Add a product and sell it live — parcels to pack will appear here."
          action={<ButtonLink href="/dashboard/products/new">Add product</ButtonLink>}
        />
      </div>
    );
  }

  // Confirmed reservations against this seller's products → their orders.
  const reservations = await prisma.reservation.findMany({
    where: {
      productId: { in: myProducts.map((p) => p.id) },
      status: "CONFIRMED",
      userId: { not: user.id },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const orders =
    reservations.length === 0
      ? []
      : await prisma.order.findMany({
          where: {
            reservationId: { in: reservations.map((r) => r.id) },
            status: { in: ["PAID", "PLACED", "SHIPPED", "DELIVERED", "RTO"] },
          },
          orderBy: { createdAt: "desc" },
        });

  const shipments =
    orders.length === 0
      ? []
      : await prisma.shipment.findMany({
          where: { orderId: { in: orders.map((o) => o.id) } },
        });

  const reservationById = new Map(reservations.map((r) => [r.id, r]));
  const shipmentByOrder = new Map(shipments.map((s) => [s.orderId, s]));

  const rows = orders.map((order) => {
    const reservation = reservationById.get(order.reservationId)!;
    return {
      order,
      reservation,
      product: productById.get(reservation.productId) ?? null,
      shipment: shipmentByOrder.get(order.id) ?? null,
    };
  });

  // Three working buckets, in the order a seller moves through them.
  const toLabel = rows.filter(
    (r) => SHIPPABLE.has(r.order.status) && !r.shipment?.trackingId,
  );
  const toHandOver = rows.filter(
    (r) => r.shipment?.trackingId && isCancellable(r.shipment.status),
  );
  const inFlight = rows.filter(
    (r) =>
      r.shipment?.trackingId &&
      !isCancellable(r.shipment.status) &&
      r.shipment.status !== "CANCELLED",
  );

  const labelUrls = toHandOver
    .map((r) => r.shipment?.labelUrl)
    .filter((url): url is string => Boolean(url));

  const ready = eshopboxConfigured();

  return (
    <div className="animate-page-in space-y-6">
      <Header />

      {!ready ? (
        <Card className="border-warning/30 bg-warning/5 p-4">
          <p className="text-sm font-medium text-warning">
            Shipping isn&apos;t connected
          </p>
          <p className="mt-1 text-xs text-muted">
            Add your Eshopbox credentials to the server environment to book
            couriers and print labels.
          </p>
        </Card>
      ) : null}

      <div className="grid grid-cols-3 gap-3">
        <Stat label="To label" value={toLabel.length} tone="warning" />
        <Stat label="To hand over" value={toHandOver.length} tone="primary" />
        <Stat label="In transit" value={inFlight.length} tone="muted" />
      </div>

      {/* 1. Book a courier */}
      <Section
        title="Waiting for a label"
        hint="Book a courier to get an AWB and a printable label."
        count={toLabel.length}
        emptyIcon="✅"
        emptyText="Every paid order has a label."
      >
        {toLabel.map((row) => (
          <ShipmentRow key={row.order.id} row={row} shippable={ready} />
        ))}
      </Section>

      {/* 2. Pack and hand over */}
      <Section
        title="Ready for pickup"
        hint="Print each label, tape it to the box, and hand it to the courier."
        count={toHandOver.length}
        emptyIcon="📭"
        emptyText="Nothing waiting to be collected."
        action={
          labelUrls.length > 1 ? (
            <BulkLabelButton labelUrls={labelUrls} />
          ) : null
        }
      >
        {toHandOver.map((row) => (
          <ShipmentRow key={row.order.id} row={row} shippable={ready} />
        ))}
      </Section>

      {/* 3. Already moving */}
      <Section
        title="On the way"
        hint="Tracking updates arrive automatically from the courier."
        count={inFlight.length}
        emptyIcon="🚚"
        emptyText="No parcels in transit."
      >
        {inFlight.map((row) => (
          <ShipmentRow key={row.order.id} row={row} shippable={ready} />
        ))}
      </Section>
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Shipments</h1>
      <p className="text-sm text-muted">
        Your packing queue — book couriers, print labels, track parcels.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "warning" | "primary" | "muted";
}) {
  const color =
    tone === "warning"
      ? "text-warning"
      : tone === "primary"
        ? "text-primary"
        : "text-foreground";
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
    </Card>
  );
}

function Section({
  title,
  hint,
  count,
  emptyIcon,
  emptyText,
  action,
  children,
}: {
  title: string;
  hint: string;
  count: number;
  emptyIcon: string;
  emptyText: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">
            {title}{" "}
            {count > 0 ? (
              <span className="text-sm font-medium text-faint">({count})</span>
            ) : null}
          </h2>
          <p className="text-xs text-muted">{hint}</p>
        </div>
        {action}
      </div>

      {count === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-faint">
          <span className="mr-1.5">{emptyIcon}</span>
          {emptyText}
        </p>
      ) : (
        <ul className="grid gap-2.5 xl:grid-cols-2">{children}</ul>
      )}
    </section>
  );
}

type Row = {
  order: { id: string; status: string; amountInPaise: number; paymentMethod: string };
  reservation: { quantity: number; createdAt: Date };
  product: { title: string; imageUrl: string | null } | null;
  shipment: {
    status: keyof typeof SHIPMENT_LABELS;
    trackingId: string | null;
    courierName: string | null;
    labelUrl: string | null;
    courierStatus: string | null;
    lastError: string | null;
  } | null;
};

function ShipmentRow({ row, shippable }: { row: Row; shippable: boolean }) {
  return (
    <li>
      <Card className="p-3">
        <div className="flex items-center gap-3">
          <ProductThumb
            src={row.product?.imageUrl ?? null}
            alt={row.product?.title ?? ""}
            sizes="44px"
            className="w-11"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {row.product?.title ?? "Deleted product"}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Qty {row.reservation.quantity} ·{" "}
              {formatPrice(row.order.amountInPaise)} ·{" "}
              {row.order.paymentMethod === "COD" ? "COD" : "Prepaid"}
            </p>
          </div>
          {row.shipment ? (
            <Badge tone={SHIPMENT_TONES[row.shipment.status]}>
              {SHIPMENT_LABELS[row.shipment.status]}
            </Badge>
          ) : (
            <Badge tone="warning">No label</Badge>
          )}
        </div>

        <div className="mt-3">
          <ShipmentPanel
            orderId={row.order.id}
            shippable={shippable && SHIPPABLE.has(row.order.status)}
            shipment={
              row.shipment
                ? {
                    status: row.shipment.status,
                    trackingId: row.shipment.trackingId,
                    courierName: row.shipment.courierName,
                    labelUrl: row.shipment.labelUrl,
                    courierStatus: row.shipment.courierStatus,
                    lastError: row.shipment.lastError,
                    cancellable: isCancellable(row.shipment.status),
                  }
                : null
            }
          />
        </div>
      </Card>
    </li>
  );
}
