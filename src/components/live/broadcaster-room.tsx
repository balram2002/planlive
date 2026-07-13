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
import { ConnectionState, Track } from "livekit-client";
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
      video
      audio
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
