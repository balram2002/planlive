/**
 * One-off backfill: Prisma-on-MongoDB applies schema defaults at WRITE time
 * only — documents created before a field existed simply lack it, so filters
 * like {isActive: true} silently exclude them (reads hydrate the default,
 * which hides the problem). This sets explicit values on every legacy doc.
 *
 * Run: dotenv -e .env.local -- tsx scripts/backfill-defaults.ts
 */
import { prisma } from "../src/lib/prisma";

async function backfill(
  collection: string,
  field: string,
  value: unknown,
): Promise<void> {
  const command = {
    update: collection,
    updates: [
      {
        q: { [field]: { $exists: false } },
        u: { $set: { [field]: value } },
        multi: true,
      },
    ],
  };

  const res = (await prisma.$runCommandRaw(command as never)) as { nModified?: number };
  console.log(`${collection}.${field}: backfilled ${res.nModified ?? 0} docs`);
}

async function main() {
  await backfill("User", "isActive", true);
  await backfill("Category", "isActive", true);
  await backfill("Order", "paymentMethod", "ONLINE");
  // deliveryFeeInPaise is a required Int with a default: unlike the optional
  // fields above, a legacy Order that lacks it fails Prisma's read-time
  // validation outright, so this one is mandatory before deploying.
  await backfill("Order", "deliveryFeeInPaise", 0);
  // Parcel dimensions are required Ints on Product — a legacy doc missing
  // them fails Prisma's read-time validation, so this must run before the
  // shipping integration goes live. Values match the schema defaults.
  await backfill("Product", "weightGrams", 500);
  await backfill("Product", "lengthCm", 25);
  await backfill("Product", "breadthCm", 20);
  await backfill("Product", "heightCm", 5);
  console.log("✅ backfill complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
