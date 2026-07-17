"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { audit, requireSeller } from "@/lib/authz";

export type ScheduleState = { error?: string };

const sanitizeThumbnail = (value: unknown) => {
  if (typeof value !== "string" || value.length === 0) return null;
  if (/^\/uploads\/[a-z0-9_-]+\.(jpg|png|webp)$/i.test(value)) return value;
  if (/^https:\/\/ik\.imagekit\.io\/[^\s"'<>]+$/i.test(value)) return value;
  return null;
};

/** Plan a future live stream (title, when, lineup, cover). */
export async function createSchedule(
  _prev: ScheduleState,
  formData: FormData,
): Promise<ScheduleState> {
  const user = await requireSeller();

  const title = String(formData.get("title") ?? "").trim().slice(0, 80);
  if (title.length < 3) return { error: "Give your stream a title." };

  const whenRaw = String(formData.get("scheduledFor") ?? "");
  const scheduledFor = new Date(whenRaw);
  if (Number.isNaN(scheduledFor.getTime())) {
    return { error: "Pick a date and time." };
  }
  if (scheduledFor.getTime() < Date.now() + 5 * 60 * 1000) {
    return { error: "Schedule at least 5 minutes ahead." };
  }

  const productIds = formData.getAll("productIds").map(String).filter(Boolean);
  const owned = await prisma.product.findMany({
    where: { id: { in: productIds }, sellerId: user.id },
    select: { id: true },
  });

  const count = await prisma.scheduledStream.count({
    where: { sellerId: user.id },
  });
  if (count >= 10) {
    return { error: "You already have 10 planned streams — delete one first." };
  }

  await prisma.scheduledStream.create({
    data: {
      sellerId: user.id,
      title,
      scheduledFor,
      thumbnailUrl: sanitizeThumbnail(formData.get("thumbnailUrl")),
      productIds: owned.map((p) => p.id),
    },
  });

  audit("schedule.create", { sellerId: user.id, title });
  revalidatePath("/dashboard/schedule");
  return {};
}

export async function deleteSchedule(formData: FormData): Promise<void> {
  const user = await requireSeller();
  const id = String(formData.get("id") ?? "");
  await prisma.scheduledStream.deleteMany({
    where: { id, sellerId: user.id },
  });
  revalidatePath("/dashboard/schedule");
}
