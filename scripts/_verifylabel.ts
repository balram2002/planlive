/**
 * Exercises the real bookShipment() path against the existing shipment to
 * confirm the label-refresh works and lands in the DB.
 */
import { PrismaClient } from "@prisma/client";
import { bookShipment } from "../src/lib/shipping-service";

const prisma = new PrismaClient();

async function main() {
  const shipment = await prisma.shipment.findFirst({
    where: { trackingId: { not: null } },
    orderBy: { bookedAt: "desc" },
  });
  if (!shipment) return console.log("No shipment to refresh.");

  const before = shipment.labelUrl;
  console.log(
    `Before: status=${shipment.status} awb=${shipment.trackingId} label=${before ?? "*** EMPTY ***"}`,
  );

  const order = await prisma.order.findUnique({
    where: { id: shipment.orderId },
  });
  const seller = await prisma.user.findUnique({
    where: { id: shipment.sellerId },
  });
  if (!order || !seller) return console.log("Missing order/seller.");

  const result = await bookShipment({
    order,
    seller,
    actorEmail: "label-refresh-verification",
  });

  if (!result.ok) return console.log("FAILED:", result.error);

  const after = await prisma.shipment.findUnique({
    where: { id: shipment.id },
  });
  console.log(
    `\nAfter:  status=${after?.status} awb=${after?.trackingId} label=${after?.labelUrl ?? "*** STILL EMPTY ***"}`,
  );
  console.log(
    `\nAWB unchanged (no duplicate): ${after?.trackingId === shipment.trackingId}`,
  );
  console.log(`Status preserved: ${after?.status === shipment.status}`);
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
