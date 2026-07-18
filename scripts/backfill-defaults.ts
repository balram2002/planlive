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
  const res = (await prisma.$runCommandRaw({
    update: collection,
    updates: [
      {
        q: { [field]: { $exists: false } },
        u: { $set: { [field]: value } },
        multi: true,
      },
    ],
  })) as { nModified?: number };
  console.log(`${collection}.${field}: backfilled ${res.nModified ?? 0} docs`);
}

async function main() {
  await backfill("User", "isActive", true);
  await backfill("Category", "isActive", true);
  await backfill("Order", "paymentMethod", "ONLINE");
  console.log("✅ backfill complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
