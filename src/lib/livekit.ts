// NOTE: no "server-only" guard here — this module is shared with standalone
// scripts (sweeper, race test) that run outside Next.js. Never import it from
// a client component.
import {
  AccessToken,
  DataPacket_Kind,
  RoomServiceClient,
} from "livekit-server-sdk";

const apiKey = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_API_SECRET;

/** wss:// URL the browser connects to. Returned to clients via the token route. */
export const LIVEKIT_URL = process.env.LIVEKIT_URL ?? "";

/** True when all three LiveKit env vars are present. */
export function livekitConfigured(): boolean {
  return Boolean(apiKey && apiSecret && LIVEKIT_URL);
}

/**
 * Mints a room-scoped access token. Publishers (the broadcasting seller) may
 * publish tracks; viewers may only subscribe. Both can send data messages so
 * chat/reactions work over the data channel in a later milestone.
 */
export async function createAccessToken(opts: {
  roomName: string;
  identity: string;
  name?: string;
  canPublish: boolean;
  canPublishData?: boolean;
}): Promise<string> {
  if (!apiKey || !apiSecret) {
    throw new Error("LiveKit API key/secret not configured");
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: opts.identity,
    name: opts.name,
  });

  at.addGrant({
    room: opts.roomName,
    roomJoin: true,
    canPublish: opts.canPublish,
    canPublishData: opts.canPublishData ?? opts.canPublish,
    canSubscribe: true,
  });

  return at.toJwt();
}

/** RoomServiceClient talks to the HTTP(S) API host, not the ws endpoint. */
function getRoomClient(): RoomServiceClient {
  if (!apiKey || !apiSecret || !LIVEKIT_URL) {
    throw new Error("LiveKit not configured");
  }
  const httpUrl = LIVEKIT_URL.replace(/^ws/, "http");
  return new RoomServiceClient(httpUrl, apiKey, apiSecret);
}

/** Best-effort: disconnects everyone by deleting the room when a stream ends. */
export async function deleteRoom(roomName: string): Promise<void> {
  if (!livekitConfigured()) return;
  try {
    await getRoomClient().deleteRoom(roomName);
  } catch {
    // Room may already be gone (auto-closed when empty) — nothing to do.
  }
}

/**
 * Best-effort broadcast of a JSON data message to everyone in a room, e.g.
 * live stock updates ("3 left"). Never throws — a failed broadcast must not
 * break the flow that triggered it (reservation, expiry, payment).
 */
export async function broadcastToRoom(
  roomName: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!livekitConfigured()) return;
  try {
    const data = new TextEncoder().encode(JSON.stringify(payload));
    await getRoomClient().sendData(roomName, data, DataPacket_Kind.RELIABLE, {});
  } catch (err) {
    console.error(`LiveKit broadcast to ${roomName} failed:`, err);
  }
}
