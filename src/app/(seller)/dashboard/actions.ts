"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSeller } from "@/lib/authz";

export type FormState = { error?: string };

// NOTE: there is deliberately no self-serve role promotion here. Becoming a
// seller goes through the /become-a-seller application, reviewed in the admin
// panel (see (shop)/become-a-seller/actions.ts + (admin)/admin/actions.ts).

type ParsedProduct = {
  title: string;
  priceInPaise: number;
  availableStock: number;
  imageUrl: string;
  weightGrams: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
};

/** Parcel dimension bounds — beyond these no courier will accept the box. */
const DIMENSION_LIMITS = {
  weightGrams: { min: 1, max: 50_000, label: "Weight" },
  lengthCm: { min: 1, max: 200, label: "Length" },
  breadthCm: { min: 1, max: 200, label: "Breadth" },
  heightCm: { min: 1, max: 200, label: "Height" },
} as const;

/** Only images we hosted ourselves (ImageKit or the local fallback). */
function sanitizeImageUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (/^\/uploads\/[a-z0-9_-]+\.(jpg|png|webp)$/i.test(value)) return value;
  if (/^https:\/\/ik\.imagekit\.io\/[^\s"'<>]+$/i.test(value)) return value;
  return null;
}

/** Validates raw form input into product fields, or returns an error message. */
function parseProductForm(
  formData: FormData,
): { data: ParsedProduct } | { error: string } {
  const title = String(formData.get("title") ?? "").trim();
  const priceRupees = Number(formData.get("price"));
  const stock = Number(formData.get("stock"));
  const imageUrl = sanitizeImageUrl(formData.get("imageUrl"));

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
  // Buyers shop from the photo — a listing without one isn't sellable.
  if (!imageUrl) {
    return { error: "Upload a product photo before saving." };
  }

  // Parcel dimensions: the courier books from these, so they must be sane.
  const parcel: Record<keyof typeof DIMENSION_LIMITS, number> = {
    weightGrams: 0,
    lengthCm: 0,
    breadthCm: 0,
    heightCm: 0,
  };
  for (const [field, limit] of Object.entries(DIMENSION_LIMITS) as [
    keyof typeof DIMENSION_LIMITS,
    (typeof DIMENSION_LIMITS)[keyof typeof DIMENSION_LIMITS],
  ][]) {
    const value = Number(formData.get(field));
    if (!Number.isInteger(value) || value < limit.min || value > limit.max) {
      return {
        error: `${limit.label} must be a whole number between ${limit.min} and ${limit.max}.`,
      };
    }
    parcel[field] = value;
  }

  return {
    data: {
      title,
      priceInPaise: Math.round(priceRupees * 100),
      availableStock: stock,
      imageUrl,
      ...parcel,
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
