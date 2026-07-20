"use client";

import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useConnectionState,
  useDataChannel,
  useLocalParticipant,
  useRoomContext,
  useTrackToggle,
  useTracks,
} from "@livekit/components-react";
import {
  ConnectionState,
  RoomEvent,
  Track,
  VideoPresets,
  type LocalVideoTrack,
  type RemoteParticipant,
  type RoomOptions,
  type TrackPublishDefaults,
  type VideoCaptureOptions,
} from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { useLivekitToken } from "./use-livekit-token";
import { ViewerCount } from "./viewer-count";
import { ChatOverlay } from "./chat";
import { FloatingReactions, useReactions } from "./reactions";
import { LiveNotices, useLiveNotices } from "./live-notices";
import { OrderCelebration, type Celebration } from "./order-celebration";
import { Elapsed } from "./elapsed";
import { LiveBadge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { haptics } from "@/lib/haptics";

/**
 * Broadcast quality: hard 720p floor, up to 4K ceiling.
 *
 * How LiveKit actually builds simulcast (verified in livekit-client's
 * computeVideoEncodings): WebRTC allows exactly three layers — rids
 * ['q','h','f'] — and the library assembles them as
 *
 *     [ videoSimulcastLayers[0], videoSimulcastLayers[1], ORIGINAL_CAPTURE ]
 *
 * Only the first two entries we pass are used; the top layer is ALWAYS the
 * real capture resolution. That gives us exactly the ladder we want:
 *
 *     q = 720p   (1280x720  @ 1.7 Mbps)  <- the floor; nothing lower exists
 *     h = 1080p  (1920x1080 @ 3.0 Mbps)  <- the everyday sweet spot
 *     f = camera native, up to 4K        <- 1440p/2160p when the seller's
 *                                           camera and uplink allow
 *
 * Because no encoding below 720p is ever produced, no viewer on any network
 * can be served worse than 720p — the floor is structural, not a preference.
 *
 * Capture asks for 4K as an `ideal` constraint (plain numeric values are
 * "ideal" per the MediaTrackConstraints spec), so a 1080p webcam simply
 * delivers 1080p instead of failing — the top layer then equals 1080p.
 *
 * Codec is H.264: hardware-encoded on virtually every phone and laptop,
 * which is what makes 4K capture viable on mobile, and its simulcast path is
 * the battle-tested one. VP9/AV1 are deliberately avoided here — LiveKit
 * treats them as SVC codecs, and SVC's spatial ladder (2160/1080/540) would
 * put the bottom layer at 540p and break the 720p floor.
 */
const CAPTURE_OPTIONS: VideoCaptureOptions = {
  // `ideal` 4K — degrades gracefully to whatever the camera supports.
  resolution: VideoPresets.h2160.resolution,
  facingMode: "user",
};

const PUBLISH_DEFAULTS: TrackPublishDefaults = {
  simulcast: true,
  // Bottom two rungs only; the third rung is the native capture (see above).
  videoSimulcastLayers: [VideoPresets.h720, VideoPresets.h1080],
  videoEncoding: {
    // Budget for the TOP layer. LiveKit builds `original` from this value,
    // so it must be a 4K-grade bitrate or a 4K capture would be starved.
    maxBitrate: VideoPresets.h2160.encoding.maxBitrate, // 8 Mbps
    maxFramerate: 30,
    priority: "high",
  },
  // Under congestion drop frame rate, never resolution.
  degradationPreference: "maintain-resolution",
  videoCodec: "h264",
  // Audio resilience (RED) + bandwidth saving on silence (DTX).
  red: true,
  dtx: true,
};

const ROOM_OPTIONS: RoomOptions = {
  // Dynacast pauses layers nobody is watching — with a 4K top layer this is
  // what keeps the seller's uplink and CPU sane. adaptiveStream stays OFF so
  // the publisher's own small preview never downgrades what we send.
  dynacast: true,
  videoCaptureDefaults: CAPTURE_OPTIONS,
  publishDefaults: PUBLISH_DEFAULTS,
};

/**
 * Seller-side studio surface: local preview with a centered, properly-aligned
 * control bar (camera/mic as circular toggles with clear on/off states),
 * host header with duration + viewers, incoming reactions, and moderatable
 * chat docked at the bottom.
 */
export function BroadcasterRoom({
  streamId,
  startedAt,
}: {
  streamId: string;
  startedAt: string;
}) {
  const token = useLivekitToken(streamId);

  if (token.status === "loading") {
    return <StageMessage>Connecting to your stream…</StageMessage>;
  }
  if (token.status === "error") {
    return <StageMessage tone="error">{token.message}</StageMessage>;
  }
  if (!token.isBroadcaster) {
    return (
      <StageMessage tone="error">
        Only the stream owner can broadcast here.
      </StageMessage>
    );
  }

  return (
    <LiveKitRoom
      token={token.token}
      serverUrl={token.serverUrl}
      connect
      video={CAPTURE_OPTIONS}
      audio
      options={ROOM_OPTIONS}
      className="block"
    >
      <BroadcasterStage startedAt={startedAt} />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

/** Circular device toggle: white when live, red with a slash when off. */
function DeviceToggle({
  source,
  onIcon,
  offIcon,
  label,
}: {
  source: Track.Source.Camera | Track.Source.Microphone;
  onIcon: React.ReactNode;
  offIcon: React.ReactNode;
  label: string;
}) {
  const { toggle, enabled, pending } = useTrackToggle({ source });

  return (
    <div className="flex flex-col items-center gap-1">
      <motion.button
        type="button"
        onClick={() => {
          haptics.tap();
          void toggle();
        }}
        disabled={pending}
        aria-label={`${enabled ? "Turn off" : "Turn on"} ${label}`}
        aria-pressed={enabled}
        whileTap={{ scale: 0.88 }}
        transition={{ type: "spring", stiffness: 500, damping: 26 }}
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full backdrop-blur transition-colors duration-200 disabled:opacity-50",
          enabled
            ? "bg-white text-black"
            : "bg-live text-white shadow-[0_0_16px_rgb(220_38_38/0.5)]",
        )}
      >
        {enabled ? onIcon : offIcon}
      </motion.button>
      <span className="text-[10px] font-medium text-white/70">{label}</span>
    </div>
  );
}

/** Front ↔ rear camera switch with a Y-axis flip animation. */
function FlipCameraButton() {
  const { localParticipant } = useLocalParticipant();
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [busy, setBusy] = useState(false);

  async function flip() {
    haptics.tap();
    const track = localParticipant.getTrackPublication(Track.Source.Camera)
      ?.track as LocalVideoTrack | undefined;
    if (!track || busy) return;
    setBusy(true);
    const next = facing === "user" ? "environment" : "user";
    try {
      // Re-assert the 1080p constraint — restartTrack without it would fall
      // back to the browser's default (often 480p) capture size.
      await track.restartTrack({
        ...CAPTURE_OPTIONS,
        facingMode: next,
      });
      setFacing(next);
    } catch {
      // Device may have a single camera — keep current facing.
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <motion.button
        type="button"
        onClick={flip}
        disabled={busy}
        aria-label={`Switch to ${facing === "user" ? "rear" : "front"} camera`}
        whileTap={{ scale: 0.88 }}
        animate={{ rotateY: facing === "user" ? 0 : 180 }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition-colors duration-200 hover:bg-white/25 disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
          <path
            d="M4 9a8 8 0 0 1 14-3.5M20 15a8 8 0 0 1-14 3.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path d="M18 2v4h-4M6 22v-4h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </motion.button>
      <span className="text-[10px] font-medium text-white/70">Flip</span>
    </div>
  );
}

function BroadcasterStage({ startedAt }: { startedAt: string }) {
  const connectionState = useConnectionState();
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const { floats, remove } = useReactions();
  const { notices, push: pushNotice } = useLiveNotices();
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const celebrationId = useRef(0);
  const lastLikeAt = useRef<Map<string, number>>(new Map());

  // The seller sees the same activity ticker their viewers do — joins are
  // the signal they're actually reaching an audience.
  useEffect(() => {
    const onJoin = (participant: RemoteParticipant) => {
      pushNotice("join", participant.name || "someone");
    };
    room.on(RoomEvent.ParticipantConnected, onJoin);
    return () => {
      room.off(RoomEvent.ParticipantConnected, onJoin);
    };
  }, [room, pushNotice]);

  const onData = useCallback(
    (msg: {
      payload: Uint8Array;
      from?: { identity: string; name?: string };
    }) => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(new TextDecoder().decode(msg.payload));
      } catch {
        return;
      }

      if (msg.from) {
        const who = msg.from.name || "someone";
        if (data?.type === "reaction") {
          const now = Date.now();
          const previous = lastLikeAt.current.get(msg.from.identity) ?? 0;
          if (now - previous > 8000) {
            lastLikeAt.current.set(msg.from.identity, now);
            pushNotice("like", who);
          }
        } else if (data?.type === "share") {
          pushNotice("share", who);
        }
        return;
      }

      // Server-sent: a sale just landed. This is the moment the seller
      // is actually here for, so it gets the full celebration.
      if (data?.type === "order-celebration") {
        setCelebration({
          id: ++celebrationId.current,
          buyerName: String(data.buyerName ?? "Someone"),
          productTitle: String(data.productTitle ?? "an item"),
          productImageUrl:
            typeof data.productImageUrl === "string"
              ? data.productImageUrl
              : null,
          quantity: Number(data.quantity) || 1,
        });
      }
    },
    [pushNotice],
  );
  useDataChannel(onData);

  const clearCelebration = useCallback(() => setCelebration(null), []);

  // Local camera preview.
  const cameraTracks = useTracks([Track.Source.Camera]).filter(
    (t) => t.participant.isLocal,
  );
  const preview = cameraTracks[0];

  return (
    <div className="relative aspect-[9/14] w-full overflow-hidden rounded-2xl border border-border bg-black">
      {preview ? (
        <VideoTrack trackRef={preview} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-white/60">
          {connectionState === ConnectionState.Connected
            ? "Starting camera…"
            : "Connecting…"}
        </div>
      )}

      {/* Header — mirrors the viewer layout. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 via-black/30 to-transparent p-3 pb-10">
        <div className="pointer-events-auto flex items-center justify-between gap-2">
          <LiveBadge />
          <div className="flex items-center gap-1.5">
            <Elapsed startedAt={startedAt} />
            <ViewerCount />
          </div>
        </div>
      </div>

      {/* Incoming reactions from viewers. */}
      <FloatingReactions floats={floats} onDone={remove} />

      {/* Activity ticker + the sale celebration. */}
      <LiveNotices notices={notices} />
      <OrderCelebration celebration={celebration} onDone={clearCelebration} />

      {/* Viewer chat with moderation (delete/mute), input docked at bottom. */}
      <ChatOverlay
        broadcasterIdentity={localParticipant.identity}
        canModerate
        className="absolute inset-x-3 bottom-24 z-10"
      />

      {/* Control bar — perfectly centered circular toggles. */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-6 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-12">
        <DeviceToggle
          source={Track.Source.Camera}
          label="Camera"
          onIcon={
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
              <rect x="3" y="7" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
              <path d="m15 10 6-3v10l-6-3" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
          }
          offIcon={
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
              <rect x="3" y="7" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
              <path d="m15 10 6-3v10l-6-3" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          }
        />
        <FlipCameraButton />
        <DeviceToggle
          source={Track.Source.Microphone}
          label="Mic"
          onIcon={
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
              <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          }
          offIcon={
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
              <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          }
        />
      </div>
    </div>
  );
}

function StageMessage({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "error";
}) {
  return (
    <div className="flex aspect-[9/14] w-full items-center justify-center rounded-2xl border border-border bg-surface px-6 text-center">
      <p className={tone === "error" ? "text-sm text-live" : "text-sm text-muted"}>
        {children}
      </p>
    </div>
  );
}
