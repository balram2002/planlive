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

/** What the room knows about the host's stream, independent of playback. */
export type HostPresence = {
  /** The host is publishing a stream into this room right now. */
  publishing: boolean;
  /**
   * The host's camera is sending video.
   *
   * Muting with `mutePublishStreamVideo` keeps the stream published, so
   * "publishing" stays true while this goes false. Viewers need the
   * difference: one means "hasn't started", the other means "camera off".
   */
  cameraOn: boolean;
};

/** Fetches credentials, then boots the engine and logs in. */
export function useZegoRoom(streamId: string) {
  const [status, setStatus] = useState<ZegoStatus>({ state: "loading" });
  const [engine, setEngine] = useState<ZegoExpressEngine | null>(null);
  const [host, setHost] = useState<HostPresence>({
    publishing: false,
    cameraOn: true,
  });
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

        const { ZegoExpressEngine: Engine } =
          await import("zego-express-engine-webrtc");
        if (cancelled) return;

        const zg = new Engine(credentials.appId, credentials.server);
        // Warnings only — the SDK is chatty at info level and this runs on
        // every viewer's device.
        zg.setLogConfig({ logLevel: "warn", remoteLogLevel: "disable" });

        /**
         * Listeners go on BEFORE loginRoom — this ordering is load-bearing.
         *
         * ZEGO emits `roomStreamUpdate` with the room's existing streams
         * immediately after login resolves. Attaching afterwards (which is
         * what happens if a consumer waits for the engine to arrive via
         * state) misses that first event entirely, so a viewer joining a
         * stream that was ALREADY live never learned the host was publishing
         * and sat on "waiting for the seller's video" indefinitely.
         */
        const hostStreamId = credentials.broadcasterStreamId;

        zg.on(
          "roomStreamUpdate",
          (
            _roomId: string,
            updateType: string,
            streamList: Array<{ streamID: string }>,
          ) => {
            if (cancelled) return;
            const involvesHost = streamList.some(
              (s) => s.streamID === hostStreamId,
            );
            if (!involvesHost) return;
            if (updateType === "ADD") {
              // A fresh publish always starts with the camera live; a mute
              // arrives separately as remoteCameraStatusUpdate.
              setHost({ publishing: true, cameraOn: true });
            } else if (updateType === "DELETE") {
              setHost((prev) => ({ ...prev, publishing: false }));
            }
          },
        );

        // Fires when the publisher mutes/unmutes their camera. "OPEN"/"MUTE"
        // are ZEGO's own words for it.
        zg.on(
          "remoteCameraStatusUpdate",
          (streamID: string, cameraStatus: string) => {
            if (cancelled || streamID !== hostStreamId) return;
            setHost((prev) => ({
              ...prev,
              cameraOn: cameraStatus === "OPEN",
            }));
          },
        );

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

  return { status, engine, host };
}

/**
 * Broadcast-quality capture config for `createZegoStream`.
 *
 * SHAPE — verified, not assumed. ZEGO's docs show this config in two forms
 * across SDK generations (a flat `camera: { videoQuality, width, ... }` and a
 * nested `camera: { video, audio }`), and their docs site renders
 * client-side so the published page can't be read directly. The installed
 * v3.12 type contract resolves it: `camera` accepts ONLY `video` and `audio`,
 * `ZegoCaptureCamera` has no `bitrate`, and the bitrates live at the config
 * ROOT as `videoBitrate`/`audioBitrate`. `facingMode` belongs inside `video`.
 *
 * Worth stating because getting it wrong is silent — extra keys are accepted
 * without complaint and the stream just publishes at the SDK default instead
 * of the 1080p the premium tier promises.
 *
 * `quality: 4` means "use my numbers"; 1/2/3 are fixed presets that ignore
 * width/height/frameRate entirely, which is the other silent way to end up
 * at the default.
 *
 * 1080p30 at 3 Mbps: the resolution premium promises, at a bitrate H.264 can
 * hold through motion. AGC/AEC/ANS are off for the same reason as the LiveKit
 * path — the browser's call-tuned chain ducks and gates exactly the product
 * sounds a shopping stream exists to convey.
 */
export const ZEGO_CAPTURE = {
  // Root-level, siblings of `camera` — the only place the SDK reads them.
  videoBitrate: 3000,
  audioBitrate: 128,
  camera: {
    video: { quality: 4 as const, width: 1920, height: 1080, frameRate: 30 },
    audio: { channelCount: 2 as const, AGC: false, AEC: false, ANS: false },
  },
} as const;

/** Stable publish id for a stream's host, mirrored by the token route. */
export function hostStreamId(sellerId: string): string {
  return `host_${sellerId}`;
}

/** Convenience: run `fn` only while the engine is alive. */
export function useSafeEngine(engine: ZegoExpressEngine | null) {
  return useCallback(
    <T>(fn: (zg: ZegoExpressEngine) => T): T | undefined => {
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
