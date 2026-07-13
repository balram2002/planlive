import { Role } from "@prisma/client";

/**
 * Clerk stores a user's app role in publicMetadata.role. New users default to
 * BUYER. Only values matching the Role enum are accepted; anything else falls
 * back to BUYER so a bad metadata value can never crash the sync.
 */
export function parseRole(value: unknown): Role {
  if (typeof value === "string") {
    const upper = value.toUpperCase();
    if (upper in Role) {
      return Role[upper as keyof typeof Role];
    }
  }
  return Role.BUYER;
}
