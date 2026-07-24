"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isSeller } from "@/lib/current-user";
import { audit } from "@/lib/authz";
import { notifySellerApplied } from "@/lib/notify";

export type ApplyState = { error?: string };

/**
 * Buyer → seller application (the only self-serve path toward SELLER).
 * Never changes the role — it files a request that an admin approves or
 * rejects in the admin panel. Re-applying after a rejection is allowed and
 * resets the request to PENDING.
 */
export async function applySeller(
  _prev: ApplyState,
  formData: FormData,
): Promise<ApplyState> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?backTo=%2Fbecome-a-seller");
  if (!user.isActive) return { error: "Your account is suspended." };
  if (isSeller(user)) redirect("/dashboard");

  const brandName = String(formData.get("brandName") ?? "").trim().slice(0, 60);
  const phone = String(formData.get("phone") ?? "").trim().slice(0, 15);
  const category = String(formData.get("category") ?? "").trim().slice(0, 40);
  const about = String(formData.get("about") ?? "").trim().slice(0, 600);

  if (brandName.length < 2) return { error: "Enter your brand or shop name." };
  if (!/^[0-9+\-\s]{8,15}$/.test(phone)) {
    return { error: "Enter a valid phone number." };
  }
  // Options are dynamic (active marketplace categories, with a static
  // fallback list) — validate shape, not membership.
  if (category.length < 2) {
    return { error: "Pick a category." };
  }
  if (about.length < 20) {
    return { error: "Tell us a bit more (at least 20 characters)." };
  }

  const existing = await prisma.sellerRequest.findUnique({
    where: { userId: user.id },
  });
  if (existing?.status === "PENDING") {
    return { error: "Your application is already under review." };
  }
  if (existing?.status === "APPROVED") redirect("/dashboard");

  await prisma.sellerRequest.upsert({
    where: { userId: user.id },
    create: { userId: user.id, brandName, phone, category, about },
    update: {
      brandName,
      phone,
      category,
      about,
      status: "PENDING",
      reviewedAt: null,
      reviewedBy: null,
    },
  });

  audit("seller-request.apply", { userId: user.id, brandName });
  notifySellerApplied({ user, brandName, category });
  revalidatePath("/become-a-seller");
  redirect("/become-a-seller?submitted=1");
}
