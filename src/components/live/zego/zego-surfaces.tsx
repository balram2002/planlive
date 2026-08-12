"use client";

import { useEffect, useRef, useState } from "react";
import type { ZegoExpressEngine } from "zego-express-engine-webrtc";
import { ZEGO_CAPTURE, useZegoRoom } from "./use-zego-room";
import { StreamPlaceholder } from "../stream-placeholder";

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
 *
 * Two things here are load-bearing and easy to get wrong:
 *
 *  1. `resourceMode: 0` (RTC). Their enum is 0=RTC, 1=CDN, 2=L3 — NOT a
 *     "quality" scale. L3 is a separately-provisioned ultra-low-latency
 *     product; asking for it on a standard account yields no stream at all
 *     and the viewer sits on "waiting for the seller's video" forever.
 *
 *  2. Retry. `roomStreamUpdate` only fires on *change*, so a viewer who
 *     joins before the host publishes depends on that event, while one who
 *     joins after depends on the direct attempt. Either can lose a race
 *     (token → login → publish ordering is not guaranteed), so a failed
 *     attempt is retried on a short backoff instead of giving up silently.
 */
export function ZegoViewerSurface({
  streamId,
  waitingLabel,
}: {
  streamId: string;
  waitingLabel: string;
}) {
  const { status, engine, host } = useZegoRoom(streamId);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const playingIdRef = useRef<string | null>(null);
  /**
   * Lets the presence effect below kick off a play attempt without owning the
   * engine plumbing. Populated by the main effect, cleared on its teardown.
   */
  const playNowRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (status.state !== "ready" || !engine) return;
    const { broadcasterStreamId } = status.credentials;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    async function play(id: string) {
      if (cancelled || !engine) return;
      // The container mounts with the component, but guard anyway — a retry
      // could fire during an unmount.
      const container = containerRef.current;
      if (!container) return;
      if (playingIdRef.current === id) return; // Already on it.

      try {
        const remote = await engine.startPlayingStream(id, {
          // RTC. See the note above — this is not a quality knob.
          resourceMode: 0,
        });
        if (cancelled) {
          engine.stopPlayingStream(id);
          return;
        }
        const view = engine.createRemoteStreamView(remote);
        await view.play(container, {
          // Browsers block unmuted autoplay; this lets the SDK show its own
          // "tap to play" affordance rather than failing silently.
          enableAutoplayDialog: true,
          objectFit: "cover",
        });
        if (cancelled) return;
        playingIdRef.current = id;
        setPlaying(true);
        attempts = 0;
      } catch (err) {
        if (cancelled) return;
        // The host may simply not be publishing yet. Back off and retry
        // rather than leaving the viewer on a dead waiting screen.
        attempts += 1;
        const delay = Math.min(1000 * attempts, 5000);
        console.warn(
          `[zego] play attempt ${attempts} for ${id} failed, retrying in ${delay}ms`,
          err,
        );
        retryTimer = setTimeout(() => void play(id), delay);
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
        const gone = streamList.some(
          (s) => s.streamID === playingIdRef.current,
        );
        if (gone && playingIdRef.current) {
          try {
            engine.stopPlayingStream(playingIdRef.current);
          } catch {
            // Already stopped.
          }
          playingIdRef.current = null;
          setPlaying(false);
          // The seller may be flipping their camera, which republishes.
          // Keep trying so the viewer recovers without a refresh.
          attempts = 0;
          retryTimer = setTimeout(() => void play(broadcasterStreamId), 1000);
        }
      }
    };

    engine.on("roomStreamUpdate", onStreamUpdate);

    // The host may already be live when we join — roomStreamUpdate only
    // fires on change, so try the known id straight away too.
    playNowRef.current = () => void play(broadcasterStreamId);
    void play(broadcasterStreamId);

    return () => {
      cancelled = true;
      playNowRef.current = null;
      if (retryTimer) clearTimeout(retryTimer);
      engine.off("roomStreamUpdate", onStreamUpdate);
      if (playingIdRef.current) {
        try {
          engine.stopPlayingStream(playingIdRef.current);
        } catch {
          // Engine already torn down.
        }
        playingIdRef.current = null;
      }
    };
  }, [status, engine]);

  /**
   * The hook attaches its room listeners before loginRoom, so it learns the
   * host is publishing even when that news arrives in the very first
   * roomStreamUpdate — the one this component's own listener, attached a
   * render later, structurally cannot see. Nudge a play attempt off it.
   */
  useEffect(() => {
    if (host.publishing && !playing) playNowRef.current?.();
  }, [host.publishing, playing]);

  if (status.state === "error") {
    return (
      <Stage>
        <span className="text-2xl">⚠️</span>
        <p className="text-sm text-live">{status.message}</p>
      </Stage>
    );
  }

  /**
   * The seller muted their camera mid-stream: the stream is still published
   * and audio still flows, so this is a normal, deliberate pause — not a
   * failure and not a load. It gets its own wording for exactly that reason.
   */
  const cameraOff = host.publishing && !host.cameraOn;

  return (
    <>
      {/* Always mounted, so the ref exists before the effect runs. */}
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      {!playing || cameraOff ? (
        <StreamPlaceholder
          state={
            status.state === "loading"
              ? "connecting"
              : cameraOff
                ? "camera-off"
                : "waiting"
          }
          waitingLabel={waitingLabel}
        />
      ) : null}
    </>
  );
}

/**
 * Broadcaster-side premium video: captures at 1080p and publishes.
 *
 * Camera/mic/flip are driven by the parent so the studio's control bar is the
 * same one the LiveKit path uses.
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
  const [ready, setReady] = useState(false);

  // Cameras, enumerated once the stream exists (labels are only populated
  // after permission has been granted).
  const camerasRef = useRef<Array<{ deviceID: string; deviceName: string }>>(
    [],
  );
  const cameraIndexRef = useRef(0);
  // The facingMode the parent last asked for, so the flip effect can tell a
  // genuine change from its own first run.
  const appliedFacingRef = useRef<"user" | "environment">(facingMode);

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
          ...ZEGO_CAPTURE,
          camera: {
            ...ZEGO_CAPTURE.camera,
            // facingMode is a ZegoCaptureCamera field — it belongs inside
            // `video`, not beside it. See the shape note on ZEGO_CAPTURE.
            video: { ...ZEGO_CAPTURE.camera.video, facingMode },
          },
        });
        if (cancelled) {
          engine.destroyStream(local);
          return;
        }
        localRef.current = local;
        if (containerRef.current) {
          local.playVideo(containerRef.current, {
            objectFit: "cover",
            mirror: true,
          });
        }
        engine.startPublishingStream(broadcasterStreamId, local);
        publishIdRef.current = broadcasterStreamId;
        setReady(true);
        onPublishingChange?.(true);

        // Device labels/ids are only meaningful post-permission, which we now
        // have. Cached so a flip doesn't re-enumerate mid-broadcast.
        try {
          const devices = await engine.enumDevices();
          if (!cancelled) camerasRef.current = devices.cameras ?? [];
        } catch {
          // Flip will fall back to re-creating the stream.
        }
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
      setReady(false);
      try {
        if (id) engine.stopPublishingStream(id);
        if (local) engine.destroyStream(local);
      } catch {
        // Engine already gone.
      }
      onPublishingChange?.(false);
    };
    // facingMode is deliberately NOT a dependency: flipping is handled by the
    // dedicated effect below, which swaps the device in place. Re-running this
    // one would tear the published stream down and back up, which viewers see
    // as the stream dropping.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, engine]);

  /**
   * Camera flip.
   *
   * This previously did nothing — the publish effect excluded `facingMode`
   * with a comment claiming it was "handled below", but nothing below handled
   * it. ZEGO switches by *device id*, not by facingMode, so the front/rear
   * intent has to be resolved to a device:
   *
   *  - Multi-camera device (phone): step to the next enumerated camera.
   *  - Otherwise: fall back to re-creating the stream with the requested
   *    facingMode, which is the only lever a single-entry device list gives
   *    us. That briefly republishes, and the viewer's DELETE→retry path picks
   *    it back up.
   */
  useEffect(() => {
    if (!ready || !engine) return;
    if (appliedFacingRef.current === facingMode) return;
    const local = localRef.current;
    if (!local) return;

    appliedFacingRef.current = facingMode;
    let cancelled = false;

    (async () => {
      const cameras = camerasRef.current;
      try {
        if (cameras.length > 1) {
          cameraIndexRef.current =
            (cameraIndexRef.current + 1) % cameras.length;
          const next = cameras[cameraIndexRef.current];
          await engine.useVideoDevice(local, next.deviceID);
          return;
        }

        // Single (or unknown) camera list — rebuild the capture instead.
        const id = publishIdRef.current;
        const fresh = await engine.createZegoStream({
          ...ZEGO_CAPTURE,
          camera: {
            ...ZEGO_CAPTURE.camera,
            // facingMode is a ZegoCaptureCamera field — it belongs inside
            // `video`, not beside it. See the shape note on ZEGO_CAPTURE.
            video: { ...ZEGO_CAPTURE.camera.video, facingMode },
          },
        });
        if (cancelled) {
          engine.destroyStream(fresh);
          return;
        }
        if (id) engine.stopPublishingStream(id);
        engine.destroyStream(local);
        localRef.current = fresh;
        if (containerRef.current) {
          fresh.playVideo(containerRef.current, {
            objectFit: "cover",
            mirror: facingMode === "user",
          });
        }
        if (id) engine.startPublishingStream(id, fresh);
      } catch (err) {
        console.error("[zego] camera flip failed:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [facingMode, ready, engine]);

  // Mute in place rather than republishing or cycling the hardware. ZEGO's
  // own docs recommend mutePublishStream* over enableVideoCaptureDevice:
  // it responds immediately and leaves capture running, so toggling the
  // camera off and on doesn't drop the published stream.
  useEffect(() => {
    const local = localRef.current;
    if (!local || !engine || !ready) return;
    try {
      engine.mutePublishStreamVideo(local, !cameraOn);
    } catch (err) {
      console.error("[zego] camera toggle failed:", err);
    }
  }, [cameraOn, engine, ready]);

  useEffect(() => {
    const local = localRef.current;
    if (!local || !engine || !ready) return;
    try {
      engine.mutePublishStreamAudio(local, !micOn);
    } catch (err) {
      console.error("[zego] mic toggle failed:", err);
    }
  }, [micOn, engine, ready]);

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
      {!ready ? (
        <Stage>
          <span className="text-2xl">🎥</span>
          <p className="text-sm text-white/60">Starting premium stream…</p>
        </Stage>
      ) : null}
    </>
  );
}
