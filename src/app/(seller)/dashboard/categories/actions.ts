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

/** Delete — admin only (streams referencing it just lose their chip). */
export async function deleteCategory(formData: FormData): Promise<void> {
  const user = await requireSeller();
  if (!isAdmin(user)) return;
  const id = String(formData.get("id") ?? "");
  await prisma.category.deleteMany({ where: { id } });
  audit("category.delete", { by: user.email, id });
  revalidateCategoryViews();
}
