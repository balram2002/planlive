import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import {
  generateZegoToken,
  zegoConfigError,
  ZEGO_APP_ID,
} from "@/lib/zego/token";

/**
 * GET /api/zego-token?streamId=…
 *
 * Mints a room-scoped ZEGO token, mirroring the LiveKit token route's rules:
 * only the stream's owner gets publish privilege, everyone else gets
 * login-only. Guests are allowed to watch, so this does not require auth —
 * but an anonymous identity can never publish.
 */
export async function GET(req: NextRequest) {
  const configError = zegoConfigError();
  if (configError) {
    console.error("[zego] token requested but not configured:", configError);
    return NextResponse.json(
      { error: "Premium streaming isn't configured on the server." },
      { status: 503 },
    );
  }

  const streamId = req.nextUrl.searchParams.get("streamId");
  if (!streamId) {
    return NextResponse.json(
      { error: "streamId is required." },
      { status: 400 },
    );
  }

  const stream = await prisma.stream.findUnique({ where: { id: streamId } });
  if (!stream || stream.status !== "LIVE") {
    return NextResponse.json({ error: "Stream not found." }, { status: 404 });
  }
  if (stream.provider !== "ZEGO") {
    return NextResponse.json(
      { error: "This stream isn't on the premium backend." },
      { status: 409 },
    );
  }

  const viewer = await getCurrentUser().catch(() => null);
  const isBroadcaster = Boolean(viewer && viewer.id === stream.sellerId);

  if (viewer && !viewer.isActive) {
    return NextResponse.json({ error: "Account suspended." }, { status: 403 });
  }

  // Identity must be stable per person: the broadcaster's is derived from
  // their user id so viewers can tell which published stream is the host's,
  // matching how the LiveKit path builds `user_<id>`.
  const userId = viewer
    ? `user_${viewer.id}`
    : `guest_${Math.random().toString(36).slice(2, 12)}`;

  const token = generateZegoToken({
    userId,
    roomId: stream.livekitRoomName,
    canPublish: isBroadcaster,
  });

  return NextResponse.json({
    appId: ZEGO_APP_ID,
    server: process.env.NEXT_PUBLIC_ZEGO_SERVER ?? "",
    token,
    userId,
    userName: viewer?.username ?? viewer?.email?.split("@")[0] ?? "Guest",
    roomId: stream.livekitRoomName,
    // The host's publish id, so viewers know which stream to play.
    broadcasterStreamId: `host_${stream.sellerId}`,
    canPublish: isBroadcaster,
  });
}
