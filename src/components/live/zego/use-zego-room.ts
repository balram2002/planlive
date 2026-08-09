"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ZegoExpressEngine } from "zego-express-engine-webrtc";

/**
 * ZEGOCLOUD room lifecycle for the premium tier.
 *
 * The SDK is imported dynamically because it touches `window` at module
 * scope, which would break the server render of the live page. It is also
 * heavy — keeping it behind a dynamic import means standard (LiveKit)
 * streams never pay for it.
 *
 * Everything LiveKit gives us declaratively (a React context, hooks per
 * track) is imperative here, so this hook is the single place that owns the
 * engine, the login, and teardown. Both the premium broadcaster and the
 * premium viewer build on it, which is what keeps the two rooms behaving
 * identically.
 */

export type ZegoCredentials = {
  appId: number;
  server: string;
  token: string;
  userId: string;
  userName: string;
  roomId: string;
  broadcasterStreamId: string;
  canPublish: boolean;
};

export type ZegoStatus =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; credentials: ZegoCredentials };

/** Fetches credentials, then boots the engine and logs in. */
export function useZegoRoom(streamId: string) {
  const [status, setStatus] = useState<ZegoStatus>({ state: "loading" });
  const [engine, setEngine] = useState<ZegoExpressEngine | null>(null);
  const engineRef = useRef<ZegoExpressEngine | null>(null);
  const roomRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/zego-token?streamId=${streamId}`);
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setStatus({
            state: "error",
            message: body.error ?? "Couldn't join the premium stream.",
          });
          return;
        }

        const credentials = body as ZegoCredentials;
        if (!credentials.server) {
          setStatus({
            state: "error",
            message:
              "Premium streaming isn't fully configured (missing server URL).",
          });
          return;
        }

        const { ZegoExpressEngine: Engine } = await import(
          "zego-express-engine-webrtc"
        );
        if (cancelled) return;

        const zg = new Engine(credentials.appId, credentials.server);
        // Warnings only — the SDK is chatty at info level and this runs on
        // every viewer's device.
        zg.setLogConfig({ logLevel: "warn", remoteLogLevel: "disable" });

        const loggedIn = await zg.loginRoom(
          credentials.roomId,
          credentials.token,
          { userID: credentials.userId, userName: credentials.userName },
          { userUpdate: true },
        );
        if (cancelled) {
          zg.destroyEngine();
          return;
        }
        if (!loggedIn) {
          setStatus({ state: "error", message: "Couldn't join the room." });
          zg.destroyEngine();
          return;
        }

        engineRef.current = zg;
        roomRef.current = credentials.roomId;
        setEngine(zg);
        setStatus({ state: "ready", credentials });
      } catch (err) {
        if (cancelled) return;
        console.error("[zego] room setup failed:", err);
        setStatus({
          state: "error",
          message: "Couldn't start the premium stream.",
        });
      }
    })();

    return () => {
      cancelled = true;
      // Teardown must be ordered: leave the room, then tear down the engine.
      // Destroying first leaves a ghost participant in the room for ~30s.
      const zg = engineRef.current;
      const room = roomRef.current;
      engineRef.current = null;
      roomRef.current = null;
      if (zg) {
        try {
          if (room) zg.logoutRoom(room);
        } catch {
          // Already gone.
        }
        try {
          zg.destroyEngine();
        } catch {
          // Already destroyed.
        }
      }
    };
  }, [streamId]);

  return { status, engine };
}

/**
 * Broadcast-quality capture config.
 *
 * 1080p30 at 3 Mbps: the resolution the premium tier promises, at a bitrate
 * H.264 can actually hold through motion. ZEGO's own docs use 2.5 Mbps for
 * 1080p; the extra headroom is for the same reason the LiveKit path got it —
 * a seller turning a garment over is high-entropy video, and a tight budget
 * shows up as blur exactly when the product is on screen.
 */
export const ZEGO_CAPTURE = {
  camera: {
    video: {
      width: 1920,
      height: 1080,
      frameRate: 30,
      bitrate: 3000,
    },
    audio: {
      // Match the LiveKit path: the browser's call-tuned processing chain
      // ducks and gates exactly the product sounds a shopping stream needs.
      channelCount: 2,
      bitrate: 128,
      AGC: false,
      AEC: false,
      ANS: false,
    },
  },
} as const;

/** Stable publish id for a stream's host, mirrored by the token route. */
export function hostStreamId(sellerId: string): string {
  return `host_${sellerId}`;
}

/** Convenience: run `fn` only while the engine is alive. */
export function useSafeEngine(engine: ZegoExpressEngine | null) {
  return useCallback(
    <T,>(fn: (zg: ZegoExpressEngine) => T): T | undefined => {
      if (!engine) return undefined;
      try {
        return fn(engine);
      } catch (err) {
        console.error("[zego] engine call failed:", err);
        return undefined;
      }
    },
    [engine],
  );
}
