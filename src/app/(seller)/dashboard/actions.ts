"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { audit, requireSeller } from "@/lib/authz";

export type FormState = { error?: string };

/**
 * Promote the current user to SELLER. Updates Clerk publicMetadata (the source
 * of truth synced by the webhook) and the local User doc so the change is
 * effective immediately without waiting for a webhook round-trip.
 */
export async function becomeSeller(): Promise<void> {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // Ensures the local User doc exists (lazily created from the Clerk session)
  // before we update it — a bare update would throw for brand-new users.
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!user.isActive) redirect("/dashboard");

  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, {
    publicMetadata: { role: "seller" },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { role: "SELLER" },
  });

  // Narrow escalation path by design: this action can only ever set SELLER.
  audit("become-seller", { userId: user.id, email: user.email });

  revalidatePath("/dashboard");
}

type ParsedProduct = {
  title: string;
  priceInPaise: number;
  availableStock: number;
};

/** Validates raw form input into product fields, or returns an error message. */
function parseProductForm(
  formData: FormData,
): { data: ParsedProduct } | { error: string } {
  const title = String(formData.get("title") ?? "").trim();
  const priceRupees = Number(formData.get("price"));
  const stock = Number(formData.get("stock"));

  if (title.length < 2 || title.length > 100) {
    return { error: "Title must be between 2 and 100 characters." };
  }
  // Razorpay's minimum chargeable amount is ₹1 (100 paise).
  if (!Number.isFinite(priceRupees) || priceRupees < 1) {
    return { error: "Price must be at least ₹1." };
  }
  if (priceRupees > 1_000_000) {
    return { error: "Price is unreasonably high." };
  }
  if (!Number.isInteger(stock) || stock < 0 || stock > 100_000) {
    return { error: "Stock must be a whole number between 0 and 100,000." };
  }

  return {
    data: {
      title,
      priceInPaise: Math.round(priceRupees * 100),
      availableStock: stock,
    },
  };
}

// Shared server-side gate — see lib/authz.ts.
const requireSellerUser = requireSeller;

export async function createProduct(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireSellerUser();

  const parsed = parseProductForm(formData);
  if ("error" in parsed) return parsed;

  await prisma.product.create({
    data: { ...parsed.data, sellerId: user.id },
  });

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function updateProduct(
  productId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireSellerUser();

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || product.sellerId !== user.id) {
    return { error: "Product not found." };
  }

  const parsed = parseProductForm(formData);
  if ("error" in parsed) return parsed;

  await prisma.product.update({
    where: { id: productId },
    data: parsed.data,
  });

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function deleteProduct(formData: FormData): Promise<void> {
  const user = await requireSellerUser();
  const productId = String(formData.get("id") ?? "");

  const product = await prisma.product.findUnique({ where: { id: productId } });
  // A product featured in an active stream can't be deleted: live buyers may
  // hold pending reservations against it. End the stream first.
  if (product && product.sellerId === user.id && product.streamId === null) {
    await prisma.product.delete({ where: { id: productId } });
    revalidatePath("/dashboard");
  }
}
