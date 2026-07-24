"use server";

import { revalidatePath } from "next/cache";
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { audit, requireAdmin } from "@/lib/authz";
import { deleteRoom } from "@/lib/livekit";
import { notifyAccountStatus, notifySellerReviewed } from "@/lib/notify";
import { Role } from "@prisma/client";

export type AdminActionState = { error?: string; success?: string };

/**
 * Onboard a seller manually. If the email belongs to an existing user they're
 * promoted immediately; otherwise a Clerk invitation email is sent with the
 * seller role pre-assigned (applied by the webhook/lazy sync on first login).
 */
export async function onboardSeller(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter a valid email address." };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  const client = await clerkClient();

  if (existing) {
    if (existing.role === "ADMIN") {
      return { error: "That user is an admin already." };
    }
    await client.users.updateUserMetadata(existing.clerkId, {
      publicMetadata: { role: "seller" },
    });
    await prisma.user.update({
      where: { id: existing.id },
      data: { role: "SELLER" },
    });
    audit("admin.promote-seller", { by: admin.email, target: email });
    revalidatePath("/admin/users");
    return { success: `${email} is now a seller.` };
  }

  try {
    await client.invitations.createInvitation({
      emailAddress: email,
      publicMetadata: { role: "seller" },
      notify: true,
    });
    audit("admin.invite-seller", { by: admin.email, target: email });
    return {
      success: `Invitation sent to ${email} — they'll join as a seller.`,
    };
  } catch (err) {
    console.error("Invitation failed:", err);
    return {
      error:
        "Could not send the invitation (maybe one is already pending for this email).",
    };
  }
}

/** Toggle a user's role between BUYER and SELLER (admins are untouchable). */
export async function setUserRole(formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!["BUYER", "SELLER"].includes(role)) return;

  const target = await prisma.user.findUnique({ where: { id: userId } });
  // Admins can't demote themselves or other admins from this control.
  if (!target || target.role === "ADMIN" || target.id === admin.id) return;

  const client = await clerkClient();
  await client.users.updateUserMetadata(target.clerkId, {
    publicMetadata: { role: role.toLowerCase() },
  });
  await prisma.user.update({
    where: { id: target.id },
    data: { role: role as Role },
  });
  audit("admin.set-role", { by: admin.email, target: target.email, role });
  revalidatePath("/admin/users");
}

/**
 * Promote an existing user to ADMIN. Spec: no self-serve path to ADMIN ever —
 * only an existing admin (or the bootstrap script) can create one.
 */
export async function promoteToAdmin(formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  const userId = String(formData.get("userId") ?? "");
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.role === "ADMIN" || !target.isActive) return;

  const client = await clerkClient();
  await client.users.updateUserMetadata(target.clerkId, {
    publicMetadata: { role: "admin" },
  });
  await prisma.user.update({
    where: { id: target.id },
    data: { role: "ADMIN" },
  });
  audit("admin.promote-admin", { by: admin.email, target: target.email });
  revalidatePath("/admin/users");
}

/** Activate / deactivate an account (suspended users can't buy/sell/stream). */
export async function setUserActive(formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  const userId = String(formData.get("userId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";

  const target = await prisma.user.findUnique({ where: { id: userId } });
  // No self-suspension, no suspending fellow admins.
  if (!target || target.role === "ADMIN" || target.id === admin.id) return;

  await prisma.user.update({
    where: { id: target.id },
    data: { isActive: active },
  });
  audit("admin.set-active", { by: admin.email, target: target.email, active });
  // Being locked out without explanation is the worst version of this — so
  // both suspension and reinstatement are always communicated.
  notifyAccountStatus({ user: target, active });

  // Deactivating a seller mid-broadcast force-ends their stream too.
  if (!active) {
    const live = await prisma.stream.findFirst({
      where: { sellerId: target.id, status: "LIVE" },
    });
    if (live) await forceEndStreamById(live.id);
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin/streams");
}

async function forceEndStreamById(streamId: string): Promise<void> {
  const stream = await prisma.stream.findUnique({ where: { id: streamId } });
  if (!stream || stream.status !== "LIVE") return;

  await prisma.stream.update({
    where: { id: stream.id },
    data: { status: "ENDED", endedAt: new Date() },
  });
  await prisma.product.updateMany({
    where: { streamId: stream.id },
    data: { streamId: null },
  });
  await deleteRoom(stream.livekitRoomName);
}

/** Approve a pending seller application → promotes the user to SELLER. */
export async function approveSellerRequest(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const requestId = String(formData.get("requestId") ?? "");

  const request = await prisma.sellerRequest.findUnique({
    where: { id: requestId },
  });
  if (!request || request.status !== "PENDING") return;

  const target = await prisma.user.findUnique({ where: { id: request.userId } });
  if (!target || !target.isActive || target.role === "ADMIN") return;

  const client = await clerkClient();
  await client.users.updateUserMetadata(target.clerkId, {
    publicMetadata: { role: "seller" },
  });

  await prisma.$transaction([
    prisma.user.update({
      where: { id: target.id },
      data: { role: "SELLER" },
    }),
    prisma.sellerRequest.update({
      where: { id: request.id },
      data: {
        status: "APPROVED",
        reviewedAt: new Date(),
        reviewedBy: admin.email,
      },
    }),
  ]);

  audit("admin.approve-seller-request", {
    by: admin.email,
    target: target.email,
    brand: request.brandName,
  });
  notifySellerReviewed({ user: target, approved: true });
  revalidatePath("/admin/sellers");
  revalidatePath("/admin/users");
}

/** Reject a pending seller application (user may re-apply). */
export async function rejectSellerRequest(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const requestId = String(formData.get("requestId") ?? "");

  const request = await prisma.sellerRequest.findUnique({
    where: { id: requestId },
  });
  if (!request || request.status !== "PENDING") return;

  await prisma.sellerRequest.update({
    where: { id: request.id },
    data: {
      status: "REJECTED",
      reviewedAt: new Date(),
      reviewedBy: admin.email,
    },
  });

  audit("admin.reject-seller-request", { by: admin.email, requestId });

  const applicant = await prisma.user.findUnique({
    where: { id: request.userId },
  });
  if (applicant) {
    notifySellerReviewed({ user: applicant, approved: false });
  }
  revalidatePath("/admin/sellers");
}

/** Force-end any live stream (moderation control). */
export async function forceEndStream(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const streamId = String(formData.get("streamId") ?? "");
  if (streamId) {
    await forceEndStreamById(streamId);
    audit("admin.force-end-stream", { by: admin.email, streamId });
  }
  revalidatePath("/admin/streams");
  revalidatePath("/discover");
}
