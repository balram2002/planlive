"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { audit, requireSeller } from "@/lib/authz";
import { notifyPremiumApplied } from "@/lib/notify";

export type PremiumRequestState = { error?: string; success?: string };

/**
 * Seller applies for premium (ZEGO) broadcasting.
 *
 * Upserted on sellerId so re-applying after a rejection reuses the same row
 * and resets it to PENDING — rather than accumulating one request per attempt
 * for admins to wade through.
 */
export async function applyForPremium(
  _prev: PremiumRequestState,
  formData: FormData,
): Promise<PremiumRequestState> {
  const seller = await requireSeller();
  const message = String(formData.get("message") ?? "")
    .trim()
    .slice(0, 500);

  const existing = await prisma.premiumRequest.findUnique({
    where: { sellerId: seller.id },
    select: { status: true },
  });
  if (existing?.status === "APPROVED") {
    return { success: "You already have premium access." };
  }
  if (existing?.status === "PENDING") {
    return { success: "Your application is already being reviewed." };
  }

  await prisma.premiumRequest.upsert({
    where: { sellerId: seller.id },
    create: {
      sellerId: seller.id,
      status: "PENDING",
      message: message || null,
    },
    // Re-applying clears the previous decision so the admin sees a clean
    // pending item rather than a stale rejection note.
    update: {
      status: "PENDING",
      message: message || null,
      reviewNote: null,
      reviewedBy: null,
      reviewedAt: null,
    },
  });

  audit("premium.applied", { sellerId: seller.id });

  // Every admin hears about it, so the review queue is never sitting unseen.
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { email: true, name: true, username: true },
  });
  notifyPremiumApplied({
    admins,
    sellerEmail: seller.email,
    message: message || null,
  });
  revalidatePath("/dashboard/premium");
  revalidatePath("/go-live");
  revalidatePath("/admin/sellers");
  return { success: "Application sent — we'll review it shortly." };
}
