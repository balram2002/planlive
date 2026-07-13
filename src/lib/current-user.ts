import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseRole } from "@/lib/roles";

/**
 * Returns the local User doc for the signed-in Clerk user, creating it lazily
 * from the Clerk profile if it doesn't exist yet. This keeps the app working
 * even before the Clerk webhook is wired up (e.g. local dev without a public
 * URL). Returns null when nobody is signed in.
 */
export async function getCurrentUser(): Promise<User | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const existing = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (existing) return existing;

  const cu = await currentUser();
  if (!cu) return null;

  const email =
    cu.primaryEmailAddress?.emailAddress ??
    cu.emailAddresses[0]?.emailAddress;
  if (!email) return null;

  // upsert (not create) to avoid a race with the webhook creating the same doc.
  return prisma.user.upsert({
    where: { clerkId: userId },
    create: { clerkId: userId, email, role: parseRole(cu.publicMetadata?.role) },
    update: {},
  });
}

export function isSeller(user: Pick<User, "role"> | null): boolean {
  return user?.role === "SELLER" || user?.role === "ADMIN";
}

export function isAdmin(user: Pick<User, "role"> | null): boolean {
  return user?.role === "ADMIN";
}

/** Deactivated accounts can browse but not buy, sell, or broadcast. */
export function isSuspended(user: Pick<User, "isActive"> | null): boolean {
  return user !== null && !user.isActive;
}
