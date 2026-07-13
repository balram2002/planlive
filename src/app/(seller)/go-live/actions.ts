"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { audit, requireSeller } from "@/lib/authz";
import { broadcastToRoom, deleteRoom } from "@/lib/livekit";

export type StartStreamState = { error?: string };

/** Only ever accept thumbnails our own upload endpoint produced. */
function sanitizeThumbnail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^\/uploads\/[a-z0-9_-]+\.(jpg|png|webp)$/i.test(value) ? value : null;
}

/**
 * Starts a live stream: creates the Stream doc with a unique LiveKit room
 * name, pins the selected products to it, and sends the seller to the studio.
 * The LiveKit room itself is created lazily when the first participant joins.
 */
export async function startStream(
  _prev: StartStreamState,
  formData: FormData,
): Promise<StartStreamState> {
  const user = await requireSeller();

  // One live stream per seller at a time.
  const existing = await prisma.stream.findFirst({
    where: { sellerId: user.id, status: "LIVE" },
  });
  if (existing) redirect(`/go-live/${existing.id}`);

  const productIds = formData.getAll("productIds").map(String).filter(Boolean);
  if (productIds.length === 0) {
    return { error: "Pick at least one product to feature in the stream." };
  }

  // Only the seller's own products can be pinned.
  const owned = await prisma.product.findMany({
    where: { id: { in: productIds }, sellerId: user.id },
    select: { id: true },
  });
  if (owned.length === 0) {
    return { error: "No valid products selected." };
  }

  const stream = await prisma.stream.create({
    data: {
      sellerId: user.id,
      livekitRoomName: `stream_${user.id}_${Date.now()}`,
      status: "LIVE",
      thumbnailUrl: sanitizeThumbnail(formData.get("thumbnailUrl")),
    },
  });

  await prisma.product.updateMany({
    where: { id: { in: owned.map((p) => p.id) } },
    data: { streamId: stream.id },
  });

  audit("stream.start", { sellerId: user.id, streamId: stream.id });
  revalidatePath("/discover");
  redirect(`/go-live/${stream.id}`);
}

/** Ends a stream: marks it ENDED, unpins products, and closes the LiveKit room. */
export async function endStream(formData: FormData): Promise<void> {
  const user = await requireSeller();

  const streamId = String(formData.get("streamId") ?? "");
  const stream = await prisma.stream.findUnique({ where: { id: streamId } });
  if (!stream || stream.sellerId !== user.id || stream.status !== "LIVE") {
    redirect("/dashboard");
  }

  await prisma.stream.update({
    where: { id: stream.id },
    data: { status: "ENDED", endedAt: new Date() },
  });
  await prisma.product.updateMany({
    where: { streamId: stream.id },
    data: { streamId: null },
  });

  // Best-effort; the room also auto-closes when everyone leaves.
  await deleteRoom(stream.livekitRoomName);

  audit("stream.end", { sellerId: user.id, streamId: stream.id });
  revalidatePath("/discover");
  redirect("/dashboard");
}

/* ------------------------------------------------------------------ */
/* Live console actions — used mid-stream without leaving the studio.  */
/* Each one revalidates the studio and broadcasts so viewers update    */
/* in real time over the data channel.                                 */
/* ------------------------------------------------------------------ */

/** Loads + authorizes a LIVE stream owned by the caller, or null. */
async function ownedLiveStream(userId: string, streamId: string) {
  const stream = await prisma.stream.findUnique({ where: { id: streamId } });
  if (!stream || stream.sellerId !== userId || stream.status !== "LIVE") {
    return null;
  }
  return stream;
}

/** Add one of the seller's products to the live queue. */
export async function addProductToStream(formData: FormData): Promise<void> {
  const user = await requireSeller();
  const streamId = String(formData.get("streamId") ?? "");
  const productId = String(formData.get("productId") ?? "");

  const stream = await ownedLiveStream(user.id, streamId);
  if (!stream) return;

  const updated = await prisma.product.updateMany({
    // streamId null guard: can't steal a product from another live stream.
    where: { id: productId, sellerId: user.id, streamId: null },
    data: { streamId: stream.id },
  });
  if (updated.count === 0) return;

  await broadcastToRoom(stream.livekitRoomName, { type: "products-changed" });
  revalidatePath(`/go-live/${stream.id}`);
}

/** Remove a product from the live queue (unpins featured if needed). */
export async function removeProductFromStream(formData: FormData): Promise<void> {
  const user = await requireSeller();
  const streamId = String(formData.get("streamId") ?? "");
  const productId = String(formData.get("productId") ?? "");

  const stream = await ownedLiveStream(user.id, streamId);
  if (!stream) return;

  const updated = await prisma.product.updateMany({
    where: { id: productId, sellerId: user.id, streamId: stream.id },
    data: { streamId: null },
  });
  if (updated.count === 0) return;

  if (stream.featuredProductId === productId) {
    await prisma.stream.update({
      where: { id: stream.id },
      data: { featuredProductId: null },
    });
  }

  await broadcastToRoom(stream.livekitRoomName, { type: "products-changed" });
  revalidatePath(`/go-live/${stream.id}`);
}

/** Pin (or unpin) the "currently featured" product viewers see first. */
export async function setFeaturedProduct(formData: FormData): Promise<void> {
  const user = await requireSeller();
  const streamId = String(formData.get("streamId") ?? "");
  const productId = String(formData.get("productId") ?? ""); // empty = unpin

  const stream = await ownedLiveStream(user.id, streamId);
  if (!stream) return;

  let featured: string | null = null;
  if (productId) {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product || product.streamId !== stream.id) return;
    featured = productId;
  }

  await prisma.stream.update({
    where: { id: stream.id },
    data: { featuredProductId: featured },
  });

  await broadcastToRoom(stream.livekitRoomName, {
    type: "featured",
    productId: featured,
  });
  revalidatePath(`/go-live/${stream.id}`);
}

/** Adjust a live product's stock by ±1 without leaving the stream. */
export async function adjustStock(formData: FormData): Promise<void> {
  const user = await requireSeller();
  const streamId = String(formData.get("streamId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const delta = Number(formData.get("delta"));
  if (![1, -1].includes(delta)) return;

  const stream = await ownedLiveStream(user.id, streamId);
  if (!stream) return;

  // Conditional update so stock can never go negative (same atomic pattern
  // as the reservation decrement).
  const updated = await prisma.product.updateMany({
    where: {
      id: productId,
      sellerId: user.id,
      streamId: stream.id,
      ...(delta < 0 ? { availableStock: { gte: 1 } } : {}),
    },
    data: { availableStock: { increment: delta } },
  });
  if (updated.count === 0) return;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { availableStock: true },
  });
  if (product) {
    await broadcastToRoom(stream.livekitRoomName, {
      type: "stock",
      productId,
      availableStock: product.availableStock,
    });
  }
  revalidatePath(`/go-live/${stream.id}`);
}
