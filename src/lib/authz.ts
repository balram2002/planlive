import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { getCurrentUser, isAdmin, isSeller } from "@/lib/current-user";
import { signInPath } from "@/lib/back-to";

/**
 * Central authorization helpers. Every privileged server action and route
 * goes through one of these — UI hiding is never access control. All role
 * checks happen server-side per request.
 */

// `audit` lives in its own module so standalone scripts can log too — this
// file can't be imported outside Next.js because of the redirects below.
export { audit } from "@/lib/audit";

/**
 * The page the caller is on, from the header the proxy stamps.
 *
 * A Server Component can't read its own URL, so this is the only way an
 * auth gate can know where to send someone back to. Falls back to "/" when
 * the header is absent (server actions, or a route the matcher skips).
 */
async function currentPath(): Promise<string> {
  try {
    const store = await headers();
    const pathname = store.get("x-pathname");
    if (!pathname) return "/";
    return `${pathname}${store.get("x-search") ?? ""}`;
  } catch {
    return "/";
  }
}

/** Signed-in, active user or redirect to sign-in — returning here afterwards. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect(signInPath(await currentPath()));
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
