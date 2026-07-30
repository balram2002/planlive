"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { audit, requireSeller } from "@/lib/authz";
import { broadcastToRoom, deleteRoom } from "@/lib/livekit";

export type StartStreamState = { error?: string };

/** Only ever accept thumbnails we hosted (ImageKit or the local fallback). */
const sanitizeThumbnail = (value: unknown) => {
  if (typeof value !== "string" || value.length === 0) return null;
  if (/^\/uploads\/[a-z0-9_-]+\.(jpg|png|webp)$/i.test(value)) return value;
  if (/^https:\/\/ik\.imagekit\.io\/[^\s"'<>]+$/i.test(value)) return value;
  return null;
};

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

  // Thumbnail is mandatory — the discover grid is image-first.
  const thumbnailUrl = sanitizeThumbnail(formData.get("thumbnailUrl"));
  if (!thumbnailUrl) {
    return { error: "Add a stream cover image before going live." };
  }

  // Category is mandatory and must be an active one.
  const categoryId = String(formData.get("categoryId") ?? "");
  const category = categoryId
    ? await prisma.category.findUnique({ where: { id: categoryId } })
    : null;
  if (!category || !category.isActive) {
    return { error: "Pick a category for your stream." };
  }

  // Only the seller's own products can be pinned.
  const owned = await prisma.product.findMany({
    where: { id: { in: productIds }, sellerId: user.id },
    select: { id: true },
  });
  if (owned.length === 0) {
    return { error: "No valid products selected." };
  }

  // Optional stream title shown on discover/search cards.
  const title =
    String(formData.get("title") ?? "")
      .trim()
      .slice(0, 80) || null;

  const stream = await prisma.stream.create({
    data: {
      sellerId: user.id,
      livekitRoomName: `stream_${user.id}_${Date.now()}`,
      status: "LIVE",
      title,
      thumbnailUrl,
      categoryId: category.id,
    },
  });

  await prisma.product.updateMany({
    where: { id: { in: owned.map((p) => p.id) } },
    data: { streamId: stream.id },
  });

  // Started from a scheduled plan → consume it.
  const scheduledId = String(formData.get("scheduledId") ?? "");
  if (scheduledId) {
    await prisma.scheduledStream.deleteMany({
      where: { id: scheduledId, sellerId: user.id },
    });
  }

  audit("stream.start", { sellerId: user.id, streamId: stream.id });
  revalidatePath("/discover");
  redirect(`/go-live/${stream.id}`);
}

/** Create a brand-new product mid-stream and add it to the live queue. */
export type LiveProductState = { error?: string; success?: string };

/**
 * Quick-create a product mid-stream and drop it straight into the live queue.
 * A photo is required — the pinned card and product panel are image-first, so
 * a photo-less product renders as a broken-looking placeholder to buyers.
 */
export async function createProductInLive(
  _prev: LiveProductState,
  formData: FormData,
): Promise<LiveProductState> {
  const user = await requireSeller();
  const streamId = String(formData.get("streamId") ?? "");

  const stream = await ownedLiveStream(user.id, streamId);
  if (!stream) return { error: "Your stream isn't live." };

  const title = String(formData.get("title") ?? "").trim().slice(0, 100);
  const priceRupees = Number(formData.get("price"));
  const stock = Number(formData.get("stock"));

  if (title.length < 2) return { error: "Enter a product title." };
  if (!Number.isFinite(priceRupees) || priceRupees < 1 || priceRupees > 1_000_000) {
    return { error: "Enter a valid price (at least ₹1)." };
  }
  if (!Number.isInteger(stock) || stock < 0 || stock > 100_000) {
    return { error: "Enter a valid stock count." };
  }

  // Reuses the same host-only allowlist as stream thumbnails.
  const imageUrl = sanitizeThumbnail(formData.get("imageUrl"));
  if (!imageUrl) return { error: "Add a product photo before adding it." };

  await prisma.product.create({
    data: {
      sellerId: user.id,
      title,
      priceInPaise: Math.round(priceRupees * 100),
      availableStock: stock,
      imageUrl,
      streamId: stream.id,
    },
  });

  await broadcastToRoom(stream.livekitRoomName, { type: "products-changed" });
  revalidatePath(`/go-live/${stream.id}`);
  return { success: `${title} added to your stream.` };
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

/**
 * Add one of the seller's products to the live queue.
 *
 * Returns state rather than void: every failure below used to be a silent
 * `return`, so a button that refused to work looked identical to one that
 * worked. The seller now always gets told why.
 */
export async function addProductToStream(
  _prev: LiveProductState,
  formData: FormData,
): Promise<LiveProductState> {
  const user = await requireSeller();
  const streamId = String(formData.get("streamId") ?? "");
  const productId = String(formData.get("productId") ?? "");

  const stream = await ownedLiveStream(user.id, streamId);
  if (!stream) return { error: "Your stream isn't live any more." };

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return { error: "That product no longer exists." };
  if (product.sellerId !== user.id) {
    return { error: "That product isn't yours." };
  }
  if (product.streamId === stream.id) {
    return { success: `${product.title} is already in this stream.` };
  }

  // A product can carry a streamId belonging to an older stream — ending a
  // stream clears it, but a seller who just closed the tab never ends it, so
  // the row keeps pointing at a stream that is no longer LIVE. The previous
  // `streamId: null` guard rejected exactly those products and said nothing,
  // which is what made "Add" look broken for some items but not others. Only
  // a genuinely *live* other stream is a real conflict.
  if (product.streamId) {
    const holder = await prisma.stream.findUnique({
      where: { id: product.streamId },
      select: { id: true, status: true },
    });
    if (holder && holder.status === "LIVE") {
      return {
        error: `${product.title} is already featured in another live stream.`,
      };
    }
  }

  const updated = await prisma.product.updateMany({
    // Re-assert ownership and the observed streamId so two concurrent adds
    // can't both claim it.
    where: {
      id: productId,
      sellerId: user.id,
      streamId: product.streamId,
    },
    data: { streamId: stream.id },
  });
  if (updated.count === 0) {
    return { error: "Couldn't add it just now — try again." };
  }

  await broadcastToRoom(stream.livekitRoomName, { type: "products-changed" });
  revalidatePath(`/go-live/${stream.id}`);
  return { success: `${product.title} added to your stream.` };
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
  let featuredTitle: string | null = null;
  if (productId) {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product || product.streamId !== stream.id) return;
    featured = productId;
    featuredTitle = product.title;
  }

  await prisma.stream.update({
    where: { id: stream.id },
    data: { featuredProductId: featured },
  });

  await broadcastToRoom(stream.livekitRoomName, {
    type: "featured",
    productId: featured,
    productTitle: featuredTitle,
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
