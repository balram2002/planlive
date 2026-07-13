import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { getCurrentUser, isAdmin, isSeller } from "@/lib/current-user";

/**
 * Central authorization helpers. Every privileged server action and route
 * goes through one of these — UI hiding is never access control. All role
 * checks happen server-side per request.
 */

/** Structured audit line for privileged mutations (grep "[audit]" in logs). */
export function audit(action: string, detail: Record<string, unknown>): void {
  console.log(
    `[audit] ${new Date().toISOString()} ${action} ${JSON.stringify(detail)}`,
  );
}

/** Signed-in, active user or redirect to sign-in. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!user.isActive) redirect("/dashboard"); // dashboard renders the suspended notice
  return user;
}

/** Active SELLER (or ADMIN) or redirect. */
export async function requireSeller(): Promise<User> {
  const user = await requireUser();
  if (!isSeller(user)) redirect("/dashboard");
  return user;
}

/** Active ADMIN or redirect home. */
export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user) || !user.isActive) redirect("/");
  return user;
}
