/**
 * Race-condition test for the Buy Now reservation flow (spec milestone 5).
 *
 * Seeds a product with EXACTLY 1 unit of stock on a LIVE stream, then fires
 * two reservation attempts at the same instant from two different buyers.
 * Passes when exactly one succeeds, the other gets SOLD_OUT, and stock lands
 * on 0 with exactly one PENDING reservation. Cleans up after itself.
 *
 * Run: npm run test:race   (needs a reachable DATABASE_URL / Atlas)
 */
import { prisma } from "../src/lib/prisma";
import { ReserveError, reserveProduct } from "../src/lib/reservations";

function fail(message: string): never {
  console.error(`\n❌ FAIL: ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

async function main() {
  const tag = `race_test_${Date.now()}`;
  console.log("Seeding test data…");

  const seller = await prisma.user.create({
    data: { clerkId: `${tag}_seller`, email: `${tag}_seller@test.local`, role: "SELLER" },
  });
  const buyerA = await prisma.user.create({
    data: { clerkId: `${tag}_a`, email: `${tag}_a@test.local` },
  });
  const buyerB = await prisma.user.create({
    data: { clerkId: `${tag}_b`, email: `${tag}_b@test.local` },
  });
  const stream = await prisma.stream.create({
    data: { sellerId: seller.id, livekitRoomName: tag, status: "LIVE" },
  });
  const product = await prisma.product.create({
    data: {
      sellerId: seller.id,
      title: "Race test product",
      priceInPaise: 9900,
      availableStock: 1, // the last unit
      streamId: stream.id,
    },
  });

  try {
    console.log("Firing 2 simultaneous Buy Now attempts at 1 unit of stock…");
    const [a, b] = await Promise.allSettled([
      reserveProduct({ productId: product.id, userId: buyerA.id }),
      reserveProduct({ productId: product.id, userId: buyerB.id }),
    ]);

    const outcomes = [a, b];
    const successes = outcomes.filter((o) => o.status === "fulfilled");
    const soldOuts = outcomes.filter(
      (o) =>
        o.status === "rejected" &&
        o.reason instanceof ReserveError &&
        o.reason.code === "SOLD_OUT",
    );
    const otherFailures = outcomes.filter(
      (o) =>
        o.status === "rejected" &&
        !(o.reason instanceof ReserveError && o.reason.code === "SOLD_OUT"),
    );

    if (otherFailures.length > 0) {
      const reason = (otherFailures[0] as PromiseRejectedResult).reason;
      fail(`Unexpected error (not SOLD_OUT): ${reason}`);
    }
    if (successes.length !== 1 || soldOuts.length !== 1) {
      fail(
        `Expected exactly 1 success + 1 SOLD_OUT, got ${successes.length} successes / ${soldOuts.length} sold-outs. ` +
          "Both buyers may have reserved the same last unit — the race guard failed.",
      );
    }

    const finalProduct = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    });
    if (finalProduct.availableStock !== 0) {
      fail(`Stock should be 0, is ${finalProduct.availableStock}`);
    }

    const reservations = await prisma.reservation.findMany({
      where: { productId: product.id },
    });
    if (reservations.length !== 1 || reservations[0].status !== "PENDING") {
      fail(
        `Expected exactly 1 PENDING reservation, found ${reservations.length}`,
      );
    }

    console.log("\n✅ PASS: exactly one buyer got the last unit.");
    console.log(`   winner reservation: ${reservations[0].id}`);
    console.log("   loser got SOLD_OUT, stock is 0, no stock leaked.");
  } finally {
    console.log("Cleaning up test data…");
    await prisma.reservation.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.stream.delete({ where: { id: stream.id } });
    await prisma.user.deleteMany({
      where: { id: { in: [seller.id, buyerA.id, buyerB.id] } },
    });
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
