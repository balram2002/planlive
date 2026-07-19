"use client";

import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useConnectionState,
  useLocalParticipant,
  useTrackToggle,
  useTracks,
} from "@livekit/components-react";
import {
  ConnectionState,
  Track,
  VideoPresets,
  type LocalVideoTrack,
  type RoomOptions,
  type TrackPublishDefaults,
  type VideoCaptureOptions,
} from "livekit-client";
import { useState } from "react";
import { motion } from "motion/react";
import { useLivekitToken } from "./use-livekit-token";
import { ViewerCount } from "./viewer-count";
import { ChatOverlay } from "./chat";
import { FloatingReactions, useReactions } from "./reactions";
import { Elapsed } from "./elapsed";
import { LiveBadge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { haptics } from "@/lib/haptics";

/**
 * HD broadcast configuration — the reason viewers used to get 360p.
 *
 * LiveKit's defaults capture 720p but publish simulcast layers at 180p/360p
 * as well, and the SFU will happily serve those lower layers. Here we:
 *  - capture at 1080p30 (h1080 preset),
 *  - define ONLY two simulcast layers, 720p and 1080p, so no sub-720p
 *    encoding exists for any viewer to receive,
 *  - set explicit bitrates (3 Mbps for 1080p, 1.7 Mbps for 720p),
 *  - use "maintain-resolution" degradation so congestion drops frame rate
 *    instead of collapsing resolution,
 *  - keep dynacast on (pauses layers nobody watches — saves upstream CPU
 *    and bandwidth without ever lowering the quality that IS watched).
 */
const CAPTURE_OPTIONS: VideoCaptureOptions = {
  resolution: VideoPresets.h1080.resolution,
  facingMode: "user",
};

const PUBLISH_DEFAULTS: TrackPublishDefaults = {
  simulcast: true,
  // Only HD layers — 720p is the floor by construction.
  videoSimulcastLayers: [VideoPresets.h720, VideoPresets.h1080],
  videoEncoding: {
    maxBitrate: 3_000_000,
    maxFramerate: 30,
    priority: "high",
  },
  degradationPreference: "maintain-resolution",
  videoCodec: "vp9",
  backupCodec: { codec: "vp8" },
  red: true,
  dtx: true,
};

const ROOM_OPTIONS: RoomOptions = {
  // Dynacast pauses unwatched layers; adaptiveStream stays OFF for the
  // publisher's own preview so the local view is never downgraded.
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
  const { localParticipant } = useLocalParticipant();
  const { floats, remove } = useReactions();

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
