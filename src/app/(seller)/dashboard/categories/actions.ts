"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { audit, requireSeller } from "@/lib/authz";
import { isAdmin } from "@/lib/current-user";

export type CategoryState = { error?: string };

const sanitizeImage = (value: unknown) => {
  if (typeof value !== "string" || value.length === 0) return null;
  if (/^\/uploads\/[a-z0-9_-]+\.(jpg|png|webp)$/i.test(value)) return value;
  if (/^https:\/\/ik\.imagekit\.io\/[^\s"'<>]+$/i.test(value)) return value;
  return null;
};

function revalidateCategoryViews() {
  revalidatePath("/dashboard/categories");
  revalidatePath("/admin/categories");
  revalidatePath("/discover");
  revalidatePath("/");
}

/** Sellers and admins can add categories (active by default). */
export async function createCategory(
  _prev: CategoryState,
  formData: FormData,
): Promise<CategoryState> {
  const user = await requireSeller();

  const name = String(formData.get("name") ?? "").trim().slice(0, 40);
  const subcategory =
    String(formData.get("subcategory") ?? "").trim().slice(0, 40) || null;
  if (name.length < 2) return { error: "Category name is too short." };

  // Image is mandatory — the buyer homepage carousel is image-first, so a
  // category without artwork would leave a hole in it.
  const imageUrl = sanitizeImage(formData.get("imageUrl"));
  if (!imageUrl) {
    return { error: "Upload a category image before creating it." };
  }

  const duplicate = await prisma.category.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, subcategory },
  });
  if (duplicate) return { error: "That category already exists." };

  await prisma.category.create({
    data: {
      name,
      subcategory,
      imageUrl,
      createdBy: user.id,
      isActive: true,
    },
  });

  audit("category.create", { by: user.email, name, subcategory });
  revalidateCategoryViews();
  return {};
}

/**
 * Edit a category's name, subcategory and artwork.
 * Admins can edit any category; sellers only the ones they created.
 */
export async function updateCategory(
  _prev: CategoryState,
  formData: FormData,
): Promise<CategoryState> {
  const user = await requireSeller();
  const id = String(formData.get("id") ?? "");

  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) return { error: "Category not found." };
  if (!isAdmin(user) && category.createdBy !== user.id) {
    return { error: "You can only edit categories you created." };
  }

  const name = String(formData.get("name") ?? "").trim().slice(0, 40);
  const subcategory =
    String(formData.get("subcategory") ?? "").trim().slice(0, 40) || null;
  if (name.length < 2) return { error: "Category name is too short." };

  const imageUrl = sanitizeImage(formData.get("imageUrl"));
  if (!imageUrl) return { error: "A category image is required." };

  // Same uniqueness rule as create, excluding this row.
  const duplicate = await prisma.category.findFirst({
    where: {
      id: { not: id },
      name: { equals: name, mode: "insensitive" },
      subcategory,
    },
  });
  if (duplicate) return { error: "Another category already uses that name." };

  await prisma.category.update({
    where: { id },
    data: { name, subcategory, imageUrl },
  });

  audit("category.update", { by: user.email, id, name });
  revalidateCategoryViews();
  return {};
}

/** Toggle visibility — admins anywhere, sellers only on their own entries. */
export async function toggleCategory(formData: FormData): Promise<void> {
  const user = await requireSeller();
  const id = String(formData.get("id") ?? "");

  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) return;
  if (!isAdmin(user) && category.createdBy !== user.id) return;

  await prisma.category.update({
    where: { id },
    data: { isActive: !category.isActive },
  });
  audit("category.toggle", { by: user.email, id, active: !category.isActive });
  revalidateCategoryViews();
}

/**
 * Delete — admins anywhere, sellers only their own entries (streams that
 * referenced it just lose their category chip).
 */
export async function deleteCategory(formData: FormData): Promise<void> {
  const user = await requireSeller();
  const id = String(formData.get("id") ?? "");

  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) return;
  if (!isAdmin(user) && category.createdBy !== user.id) return;

  await prisma.category.delete({ where: { id } });
  // Streams pointing at it would otherwise render a dangling chip.
  await prisma.stream.updateMany({
    where: { categoryId: id },
    data: { categoryId: null },
  });

  audit("category.delete", { by: user.email, id });
  revalidateCategoryViews();
}
