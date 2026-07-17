/**
 * One-off: collapse duplicate User docs sharing a clerkId (created before the
 * unique index could ever be built), re-pointing all references to the kept
 * (oldest) doc. Run: dotenv -e .env.local -- tsx scripts/dedupe-users.ts
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  const byClerk = new Map<string, typeof users>();
  for (const u of users) {
    const list = byClerk.get(u.clerkId) ?? [];
    list.push(u);
    byClerk.set(u.clerkId, list);
  }

  for (const [clerkId, list] of byClerk) {
    if (list.length < 2) continue;
    const keep = list[0];
    const dupIds = list.slice(1).map((u) => u.id);
    console.log(`clerkId ${clerkId}: keeping ${keep.id}, merging ${dupIds.join(", ")}`);

    await prisma.product.updateMany({
      where: { sellerId: { in: dupIds } },
      data: { sellerId: keep.id },
    });
    await prisma.stream.updateMany({
      where: { sellerId: { in: dupIds } },
      data: { sellerId: keep.id },
    });
    await prisma.reservation.updateMany({
      where: { userId: { in: dupIds } },
      data: { userId: keep.id },
    });
    await prisma.address.updateMany({
      where: { userId: { in: dupIds } },
      data: { userId: keep.id },
    });
    await prisma.follow.deleteMany({
      where: { OR: [{ followerId: { in: dupIds } }, { sellerId: { in: dupIds } }] },
    });
    await prisma.sellerRequest.deleteMany({ where: { userId: { in: dupIds } } });
    await prisma.scheduledStream.updateMany({
      where: { sellerId: { in: dupIds } },
      data: { sellerId: keep.id },
    });
    // Promote role/flags if a duplicate had higher privileges.
    const bestRole = list.some((u) => u.role === "ADMIN")
      ? "ADMIN"
      : list.some((u) => u.role === "SELLER")
        ? "SELLER"
        : keep.role;
    await prisma.user.update({
      where: { id: keep.id },
      data: { role: bestRole },
    });
    await prisma.user.deleteMany({ where: { id: { in: dupIds } } });
  }

  console.log("✅ dedupe complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
