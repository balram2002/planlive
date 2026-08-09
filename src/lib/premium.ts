import "server-only";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Premium (ZEGO) broadcasting access.
 *
 * Two independent gates, both enforced server-side:
 *  1. an APPROVED PremiumRequest for the seller, and
 *  2. the broadcast passphrase.
 *
 * The passphrase is checked here rather than in the browser on purpose — a
 * client-side check is decoration, since anyone can call the server action
 * directly. It lives in an env var so it can be rotated without a deploy,
 * with the agreed value as the fallback.
 */

const PASSPHRASE =
  process.env.PREMIUM_STREAM_PASSWORD?.trim() || "LiveShop@PlanWAB";

/** Constant-time compare, so the passphrase can't be guessed by timing. */
export function premiumPassphraseMatches(provided: string): boolean {
  const a = Buffer.from(provided ?? "");
  const b = Buffer.from(PASSPHRASE);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** True when this seller has been approved for premium broadcasting. */
export async function hasPremiumAccess(sellerId: string): Promise<boolean> {
  const request = await prisma.premiumRequest.findUnique({
    where: { sellerId },
    select: { status: true },
  });
  return request?.status === "APPROVED";
}

export type PremiumState = {
  approved: boolean;
  status: "NONE" | "PENDING" | "APPROVED" | "REJECTED";
  reviewNote: string | null;
};

/** Everything the seller UI needs to render the premium option's state. */
export async function getPremiumState(sellerId: string): Promise<PremiumState> {
  const request = await prisma.premiumRequest.findUnique({
    where: { sellerId },
    select: { status: true, reviewNote: true },
  });
  if (!request) {
    return { approved: false, status: "NONE", reviewNote: null };
  }
  return {
    approved: request.status === "APPROVED",
    status: request.status,
    reviewNote: request.reviewNote,
  };
}
