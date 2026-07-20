"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { audit, requireAdmin } from "@/lib/authz";

export type AdminProductState = { error?: string; success?: string };

/** Only images we hosted ourselves (ImageKit or the local fallback). */
function sanitizeImageUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (/^\/uploads\/[a-z0-9_-]+\.(jpg|png|webp)$/i.test(value)) return value;
  if (/^https:\/\/ik\.imagekit\.io\/[^\s"'<>]+$/i.test(value)) return value;
  return null;
}

/**
 * Admin edit of ANY seller's product — same validation rules as the seller's
 * own form, minus the ownership check (that's the whole point of the panel).
 */
export async function adminUpdateProduct(
  _prev: AdminProductState,
  formData: FormData,
): Promise<AdminProductState> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");

  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) return { error: "Product not found." };

  const title = String(formData.get("title") ?? "").trim();
  const priceRupees = Number(formData.get("price"));
  const stock = Number(formData.get("stock"));
  const imageUrl = sanitizeImageUrl(formData.get("imageUrl"));

  if (title.length < 2 || title.length > 100) {
    return { error: "Title must be between 2 and 100 characters." };
  }
  if (!Number.isFinite(priceRupees) || priceRupees < 1) {
    return { error: "Price must be at least ₹1." };
  }
  if (priceRupees > 1_000_000) return { error: "Price is unreasonably high." };
  if (!Number.isInteger(stock) || stock < 0 || stock > 100_000) {
    return { error: "Stock must be a whole number between 0 and 100,000." };
  }
  if (!imageUrl) return { error: "A product photo is required." };

  await prisma.product.update({
    where: { id },
    data: {
      title,
      priceInPaise: Math.round(priceRupees * 100),
      availableStock: stock,
      imageUrl,
    },
  });

  audit("admin.product-update", { by: admin.email, productId: id, title });
  revalidatePath("/admin/products");
  revalidatePath("/dashboard");
  return { success: "Product updated." };
}

/**
 * Admin delete. Products featured in a LIVE stream are protected: buyers may
 * hold pending reservations against them, so the stream must end first —
 * the same rule the seller's own delete enforces.
 */
export async function adminDeleteProduct(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");

  const product = await prisma.product.findUnique({ where: { id } });
  if (!product || product.streamId !== null) return;

  await prisma.product.delete({ where: { id } });
  audit("admin.product-delete", { by: admin.email, productId: id });
  revalidatePath("/admin/products");
  revalidatePath("/dashboard");
}
