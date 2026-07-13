import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { createAccessToken, livekitConfigured, LIVEKIT_URL } from "@/lib/livekit";

/**
 * GET /api/livekit-token?streamId=...
 *
 * Returns a LiveKit access token for the requested stream's room plus the
 * server URL to connect to. The broadcasting seller gets publish rights;
 * everyone else joins as a subscribe-only viewer. Viewers may be anonymous
 * (browsing without an account) — they get a guest identity.
 */
export async function GET(req: NextRequest) {
  if (!livekitConfigured()) {
    return NextResponse.json(
      { error: "LiveKit is not configured on the server." },
      { status: 503 },
    );
  }

  const streamId = req.nextUrl.searchParams.get("streamId");
  if (!streamId) {
    return NextResponse.json({ error: "streamId is required" }, { status: 400 });
  }

  const stream = await prisma.stream.findUnique({ where: { id: streamId } });
  if (!stream || stream.status !== "LIVE") {
    return NextResponse.json({ error: "Stream not found" }, { status: 404 });
  }

  const { userId: clerkId } = await auth();
  // Suspended accounts join as read-only guests (can watch, not interact).
  const fetched = clerkId ? await getCurrentUser() : null;
  const user = fetched?.isActive ? fetched : null;

  const isBroadcaster = user !== null && user.id === stream.sellerId;

  // Stable identity per user; random guest identity for anonymous viewers.
  const identity = user
    ? `user_${user.id}`
    : `guest_${crypto.randomUUID().slice(0, 8)}`;

  const name = user ? user.email.split("@")[0] : "guest";

  const token = await createAccessToken({
    roomName: stream.livekitRoomName,
    identity,
    name,
    canPublish: isBroadcaster,
    // Guests are read-only: they can watch but not inject chat/reaction/stock
    // data packets. Signed-in users can chat and react.
    canPublishData: user !== null,
  });

  return NextResponse.json({
    token,
    serverUrl: LIVEKIT_URL,
    isBroadcaster,
  });
}
