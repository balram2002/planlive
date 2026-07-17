"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { audit } from "@/lib/authz";

export type ProfileFormState = { error?: string; success?: string };

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

/** Only images we hosted ourselves (ImageKit or the local fallback). */
function sanitizeImageUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (/^\/uploads\/[a-z0-9_-]+\.(jpg|png|webp)$/i.test(value)) return value;
  if (/^https:\/\/ik\.imagekit\.io\/[^\s"'<>]+$/i.test(value)) return value;
  return null;
}

export async function updateProfile(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!user.isActive) return { error: "Your account is suspended." };

  // Username is the only mandatory field.
  const username = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase();
  if (!USERNAME_RE.test(username)) {
    return {
      error: "Username must be 3–20 characters: lowercase letters, numbers, _",
    };
  }

  // Uniqueness enforced here (Mongo unique on optional fields is unreliable
  // across nulls).
  const taken = await prisma.user.findFirst({
    where: { username, id: { not: user.id } },
    select: { id: true },
  });
  if (taken) return { error: "That username is already taken." };

  const name = String(formData.get("name") ?? "").trim().slice(0, 60) || null;

  const genderRaw = String(formData.get("gender") ?? "");
  const gender = ["male", "female", "other", "prefer_not_to_say"].includes(genderRaw)
    ? genderRaw
    : null;

  const birthdayRaw = String(formData.get("birthday") ?? "");
  let birthday: Date | null = null;
  if (birthdayRaw) {
    const d = new Date(`${birthdayRaw}T00:00:00Z`);
    const now = new Date();
    if (Number.isNaN(d.getTime()) || d > now || d.getFullYear() < 1900) {
      return { error: "Enter a valid birthday." };
    }
    birthday = d;
  }

  const imageUrl = sanitizeImageUrl(formData.get("imageUrl"));

  await prisma.user.update({
    where: { id: user.id },
    data: { username, name, gender, birthday, imageUrl },
  });

  audit("profile.update", { userId: user.id, username });
  revalidatePath("/profile");
  return { success: "Profile saved." };
}

/** Sellers: save the shop address (with optional pinpoint coordinates). */
export async function updateShopAddress(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!user.isActive) return { error: "Your account is suspended." };
  if (user.role !== "SELLER" && user.role !== "ADMIN") {
    return { error: "Only sellers can set a shop address." };
  }

  const str = (k: string, max: number) =>
    String(formData.get(k) ?? "")
      .trim()
      .slice(0, max);

  const shop = {
    shopName: str("shopName", 60),
    phone: str("phone", 15),
    line1: str("line1", 120),
    line2: str("line2", 120) || null,
    city: str("city", 60),
    state: str("state", 60),
    pincode: str("pincode", 10),
    latitude: null as number | null,
    longitude: null as number | null,
  };

  if (!shop.shopName) return { error: "Shop name is required." };
  if (!shop.line1 || !shop.city || !shop.state) {
    return { error: "Address line, city and state are required." };
  }
  if (!/^\d{6}$/.test(shop.pincode)) {
    return { error: "Enter a valid 6-digit PIN code." };
  }

  const lat = Number(formData.get("latitude"));
  const lon = Number(formData.get("longitude"));
  if (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    (lat !== 0 || lon !== 0)
  ) {
    shop.latitude = lat;
    shop.longitude = lon;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { shopAddressJson: JSON.stringify(shop) },
  });

  audit("profile.shop-address", { userId: user.id, city: shop.city });
  revalidatePath("/profile");
  return { success: "Shop address saved." };
}
