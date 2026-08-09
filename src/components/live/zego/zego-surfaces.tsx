"use client";

import { useEffect, useRef, useState } from "react";
import type { ZegoExpressEngine } from "zego-express-engine-webrtc";
import { ZEGO_CAPTURE, useZegoRoom } from "./use-zego-room";

/**
 * The SDK's local-stream class isn't re-exported from the package root, so
 * derive it from the method that produces it rather than deep-importing an
 * internal path that their next release could move.
 */
type ZegoLocalStream = Awaited<
  ReturnType<ZegoExpressEngine["createZegoStream"]>
>;

/**
 * ZEGOCLOUD media surfaces for the premium tier.
 *
 * ARCHITECTURE — worth reading before changing anything here.
 *
 * A premium stream uses TWO transports, deliberately:
 *   • ZEGO carries audio/video (the premium promise: 1080p, their edge).
 *   • LiveKit stays as the realtime DATA plane — chat, reactions, stock
 *     updates, order celebrations, broadcaster-verified moderation.
 *
 * That split is what lets the premium room be the *same* room. Viewers
 * already join LiveKit with `video={false} audio={false}` — they were always
 * data-only — so nothing about the shopping UI changes; only the element
 * showing video does. Rewriting chat/reactions/moderation against a second
 * SDK would have meant two divergent implementations of the same features,
 * and the LiveKit path had to stay untouched.
 *
 * The cost is one extra websocket per participant, which carries no media on
 * the premium path and is cheap next to the video itself.
 */

/** Shared empty/waiting state, matching the LiveKit surface's wording. */
function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      {children}
    </div>
  );
}

/**
 * Viewer-side premium video: joins the ZEGO room and plays the host's stream.
 */
export function ZegoViewerSurface({
  streamId,
  waitingLabel,
}: {
  streamId: string;
  waitingLabel: string;
}) {
  const { status, engine } = useZegoRoom(streamId);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const playingIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (status.state !== "ready" || !engine) return;
    const { broadcasterStreamId, roomId } = status.credentials;
    let cancelled = false;

    /** Attaches the host's stream to our container. */
    async function play(id: string) {
      if (cancelled || !engine || !containerRef.current) return;
      try {
        // resourceMode 2 = live-streaming (CDN-assisted), the mode ZEGO
        // documents for one-to-many broadcast rather than a call.
        const remote = await engine.startPlayingStream(id, {
          resourceMode: 2,
        });
        if (cancelled) {
          engine.stopPlayingStream(id);
          return;
        }
        const view = engine.createRemoteStreamView(remote);
        await view.play(containerRef.current, {
          enableAutoplayDialog: true,
          objectFit: "cover",
        });
        playingIdRef.current = id;
        setPlaying(true);
      } catch (err) {
        console.error("[zego] play failed:", err);
      }
    }

    const onStreamUpdate = (
      _roomId: string,
      updateType: string,
      streamList: Array<{ streamID: string }>,
    ) => {
      if (updateType === "ADD") {
        const host = streamList.find((s) => s.streamID === broadcasterStreamId);
        if (host) void play(host.streamID);
      } else if (updateType === "DELETE") {
        const gone = streamList.some((s) => s.streamID === playingIdRef.current);
        if (gone && playingIdRef.current) {
          engine.stopPlayingStream(playingIdRef.current);
          playingIdRef.current = null;
          setPlaying(false);
        }
      }
    };

    engine.on("roomStreamUpdate", onStreamUpdate);

    // The host may already be live when we join — roomStreamUpdate only
    // fires on change, so try the known id straight away.
    void play(broadcasterStreamId);

    return () => {
      cancelled = true;
      engine.off("roomStreamUpdate", onStreamUpdate);
      if (playingIdRef.current) {
        try {
          engine.stopPlayingStream(playingIdRef.current);
        } catch {
          // Engine already torn down.
        }
        playingIdRef.current = null;
      }
      void roomId;
    };
  }, [status, engine]);

  if (status.state === "error") {
    return (
      <Stage>
        <span className="text-2xl">⚠️</span>
        <p className="text-sm text-live">{status.message}</p>
      </Stage>
    );
  }

  return (
    <>
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      {!playing ? (
        <Stage>
          <span className="text-2xl">📡</span>
          <p className="text-sm text-white/60">
            {status.state === "loading" ? "Connecting…" : waitingLabel}
          </p>
        </Stage>
      ) : null}
    </>
  );
}

/**
 * Broadcaster-side premium video: captures at 1080p and publishes.
 *
 * Camera/mic toggles are driven by the parent so the studio's control bar is
 * the same one the LiveKit path uses.
 */
export function ZegoBroadcastSurface({
  streamId,
  cameraOn,
  micOn,
  facingMode,
  onPublishingChange,
}: {
  streamId: string;
  cameraOn: boolean;
  micOn: boolean;
  facingMode: "user" | "environment";
  onPublishingChange?: (publishing: boolean) => void;
}) {
  const { status, engine } = useZegoRoom(streamId);
  const containerRef = useRef<HTMLDivElement>(null);
  const localRef = useRef<ZegoLocalStream | null>(null);
  const publishIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Publish once the room is joined.
  useEffect(() => {
    if (status.state !== "ready" || !engine) return;
    const { broadcasterStreamId, canPublish } = status.credentials;
    // Not permitted to publish — rendered from `notOwner` below rather than
    // set here, since it's derivable from status and needs no state.
    if (!canPublish) return;
    let cancelled = false;

    (async () => {
      try {
        const local = await engine.createZegoStream({
          camera: {
            ...ZEGO_CAPTURE.camera,
            videoInput: undefined,
            facingMode,
          },
        } as Parameters<ZegoExpressEngine["createZegoStream"]>[0]);
        if (cancelled) {
          engine.destroyStream(local);
          return;
        }
        localRef.current = local;
        if (containerRef.current) {
          local.playVideo(containerRef.current, { objectFit: "cover", mirror: true });
        }
        engine.startPublishingStream(broadcasterStreamId, local);
        publishIdRef.current = broadcasterStreamId;
        onPublishingChange?.(true);
      } catch (err) {
        console.error("[zego] publish failed:", err);
        if (!cancelled) {
          setError("Couldn't start your camera. Check browser permissions.");
        }
      }
    })();

    return () => {
      cancelled = true;
      const id = publishIdRef.current;
      const local = localRef.current;
      publishIdRef.current = null;
      localRef.current = null;
      try {
        if (id) engine.stopPublishingStream(id);
        if (local) engine.destroyStream(local);
      } catch {
        // Engine already gone.
      }
      onPublishingChange?.(false);
    };
    // facingMode intentionally excluded — flipping is handled below, so it
    // must not tear down and re-publish the whole stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, engine]);

  // Mute in place rather than republishing or cycling the hardware. ZEGO's
  // own docs recommend mutePublishStream* over enableVideoCaptureDevice:
  // it responds immediately and leaves capture running, so toggling the
  // camera off and on doesn't drop the published stream.
  useEffect(() => {
    const local = localRef.current;
    if (!local || !engine) return;
    try {
      engine.mutePublishStreamVideo(local, !cameraOn);
    } catch {
      // Track not ready yet; the next toggle re-applies.
    }
  }, [cameraOn, engine, status]);

  useEffect(() => {
    const local = localRef.current;
    if (!local || !engine) return;
    try {
      engine.mutePublishStreamAudio(local, !micOn);
    } catch {
      // As above.
    }
  }, [micOn, engine, status]);

  // The server already refuses a publish token to anyone but the owner; this
  // just explains it rather than showing an endless "starting…".
  const notOwner =
    status.state === "ready" && !status.credentials.canPublish
      ? "This account can't publish to this stream."
      : null;
  const failure =
    error ?? notOwner ?? (status.state === "error" ? status.message : null);

  if (failure) {
    return (
      <Stage>
        <span className="text-2xl">⚠️</span>
        <p className="text-sm text-live">{failure}</p>
      </Stage>
    );
  }

  return (
    <>
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      {status.state === "loading" ? (
        <Stage>
          <span className="text-2xl">🎥</span>
          <p className="text-sm text-white/60">Starting premium stream…</p>
        </Stage>
      ) : null}
    </>
  );
}
