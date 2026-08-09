"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { audit, requireAdmin } from "@/lib/authz";
import { notifyPremiumDecision } from "@/lib/notify";

export type PremiumReviewState = { error?: string; success?: string };

/**
 * Admin decision on a premium broadcasting application.
 *
 * The decision is recorded on the request itself (status + who + when +
 * note), so `hasPremiumAccess` reads one row and there is no second flag
 * anywhere that could drift out of sync with the review trail.
 */
export async function reviewPremiumRequest(
  _prev: PremiumReviewState,
  formData: FormData,
): Promise<PremiumReviewState> {
  const admin = await requireAdmin();

  const requestId = String(formData.get("requestId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const reviewNote = String(formData.get("reviewNote") ?? "")
    .trim()
    .slice(0, 300);

  if (decision !== "APPROVED" && decision !== "REJECTED") {
    return { error: "Pick approve or reject." };
  }

  const request = await prisma.premiumRequest.findUnique({
    where: { id: requestId },
  });
  if (!request) return { error: "Application not found." };

  await prisma.premiumRequest.update({
    where: { id: request.id },
    data: {
      status: decision,
      reviewNote: reviewNote || null,
      reviewedBy: admin.id,
      reviewedAt: new Date(),
    },
  });

  audit("premium.reviewed", {
    by: admin.email,
    sellerId: request.sellerId,
    decision,
  });

  // Tell the seller either way — an application that silently changes state
  // is one they'll email support about.
  const seller = await prisma.user.findUnique({
    where: { id: request.sellerId },
  });
  if (seller) {
    notifyPremiumDecision({
      seller,
      approved: decision === "APPROVED",
      note: reviewNote || null,
    });
  }

  revalidatePath("/admin/sellers");
  revalidatePath("/dashboard/premium");
  revalidatePath("/go-live");

  return {
    success:
      decision === "APPROVED"
        ? "Premium access granted."
        : "Application rejected.",
  };
}

/** Revokes access from a previously approved seller. */
export async function revokePremiumAccess(
  _prev: PremiumReviewState,
  formData: FormData,
): Promise<PremiumReviewState> {
  const admin = await requireAdmin();
  const requestId = String(formData.get("requestId") ?? "");

  const request = await prisma.premiumRequest.findUnique({
    where: { id: requestId },
  });
  if (!request) return { error: "Application not found." };

  await prisma.premiumRequest.update({
    where: { id: request.id },
    data: {
      status: "REJECTED",
      reviewNote: "Access revoked by an administrator.",
      reviewedBy: admin.id,
      reviewedAt: new Date(),
    },
  });

  audit("premium.revoked", { by: admin.email, sellerId: request.sellerId });

  const revokedSeller = await prisma.user.findUnique({
    where: { id: request.sellerId },
  });
  if (revokedSeller) {
    notifyPremiumDecision({
      seller: revokedSeller,
      approved: false,
      note: "Premium access was revoked by an administrator.",
    });
  }
  revalidatePath("/admin/sellers");
  revalidatePath("/go-live");
  // A stream already running keeps running; only the next go-live is gated.
  return { success: "Premium access revoked." };
}
