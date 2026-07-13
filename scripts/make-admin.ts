/**
 * Promotes a user to ADMIN by email (bootstrap for the first admin).
 * The user must have signed in at least once so the local User doc exists.
 *
 * Run: npm run make-admin -- you@example.com
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npm run make-admin -- <email>");
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(
      `No user with email ${email}. They must sign in to the app once first.`,
    );
    process.exitCode = 1;
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { role: "ADMIN", isActive: true },
  });
  console.log(`✅ ${email} is now an ADMIN.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
