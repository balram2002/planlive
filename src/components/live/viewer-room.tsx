"use client";

import { memo, useCallback, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  VideoTrack,
  useConnectionState,
  useDataChannel,
  useTracks,
  type TrackReference,
} from "@livekit/components-react";
import { ConnectionState, Track } from "livekit-client";
import { useLivekitToken } from "./use-livekit-token";
import { ViewerCount } from "./viewer-count";
import { ChatOverlay } from "./chat";
import { FloatingReactions, useReactions } from "./reactions";
import { ProductsPanel } from "./products-panel";
import { ViewerMenu } from "./viewer-menu";
import { Elapsed } from "./elapsed";
import { LiveBadge } from "@/components/ui/badge";
import { haptics } from "@/lib/haptics";

export type PinnedProduct = {
  id: string;
  title: string;
  priceInPaise: number;
  availableStock: number;
};

/**
 * Buyer-side stream surface — modern live-room layout:
 * header (host · LIVE · duration · viewers · menu), floating reactions,
 * double-tap to like, chat docked at the bottom with the input last, and all
 * shopping tucked into a full-height right-side products panel.
 */
export function ViewerRoom({
  streamId,
  sellerName,
  sellerIdentity,
  products,
  featuredProductId,
  startedAt,
}: {
  streamId: string;
  sellerName: string;
  sellerIdentity: string;
  products: PinnedProduct[];
  featuredProductId: string | null;
  startedAt: string;
}) {
  const token = useLivekitToken(streamId);

  if (token.status === "loading") {
    return <StageMessage>Joining stream…</StageMessage>;
  }
  if (token.status === "error") {
    return <StageMessage tone="error">{token.message}</StageMessage>;
  }

  return (
    <LiveKitRoom
      token={token.token}
      serverUrl={token.serverUrl}
      connect
      video={false}
      audio={false}
      className="flex min-h-0 flex-1 flex-col"
    >
      <ViewerStage
        streamId={streamId}
        sellerName={sellerName}
        sellerIdentity={sellerIdentity}
        initialProducts={products}
        initialFeaturedId={featuredProductId}
        startedAt={startedAt}
      />
    </LiveKitRoom>
  );
}

/** Memoized so chat/stock/reaction state changes never re-render the video. */
const VideoSurface = memo(function VideoSurface({
  trackRef,
  waitingLabel,
}: {
  trackRef: TrackReference | undefined;
  waitingLabel: string;
}) {
  if (!trackRef) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <span className="text-2xl">📡</span>
        <p className="text-sm text-white/60">{waitingLabel}</p>
      </div>
    );
  }
  return (
    <VideoTrack
      trackRef={trackRef}
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
});

function ViewerStage({
  streamId,
  sellerName,
  sellerIdentity,
  initialProducts,
  initialFeaturedId,
  startedAt,
}: {
  streamId: string;
  sellerName: string;
  sellerIdentity: string;
  initialProducts: PinnedProduct[];
  initialFeaturedId: string | null;
  startedAt: string;
}) {
  const connectionState = useConnectionState();

  const [products, setProducts] = useState<PinnedProduct[]>(initialProducts);
  const [featuredId, setFeaturedId] = useState<string | null>(initialFeaturedId);
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoHidden, setVideoHidden] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const { floats, remove, react } = useReactions();

  /** Re-sync the queue when the seller changes it mid-stream. */
  const refreshProducts = useCallback(async () => {
    try {
      const res = await fetch(`/api/streams/${streamId}/products`);
      if (!res.ok) return;
      const json = await res.json();
      setProducts(json.products);
      setFeaturedId(json.featuredProductId ?? null);
    } catch {
      // Transient — next broadcast will retry.
    }
  }, [streamId]);

  const onData = useCallback(
    (msg: { payload: Uint8Array; from?: unknown }) => {
      // Security: state-changing packets (stock, queue, featured) are only
      // ever sent by our server via the RoomService API, which arrives with
      // no `from` participant. Anything with a sender is participant-crafted.
      if (msg.from) return;
      try {
        const data = JSON.parse(new TextDecoder().decode(msg.payload));
        if (data?.type === "stock" && typeof data.productId === "string") {
          setProducts((prev) =>
            prev.map((p) =>
              p.id === data.productId
                ? { ...p, availableStock: Number(data.availableStock) }
                : p,
            ),
          );
        } else if (data?.type === "products-changed") {
          void refreshProducts();
        } else if (data?.type === "featured") {
          setFeaturedId(
            typeof data.productId === "string" ? data.productId : null,
          );
        }
      } catch {
        // Ignore malformed messages.
      }
    },
    [refreshProducts],
  );
  useDataChannel(onData);

  // The broadcaster's camera feed (remote participants only).
  const remoteCamera = useTracks([Track.Source.Camera]).find(
    (t) => !t.participant.isLocal,
  );

  // Double-tap anywhere on the video = ❤️ (Instagram-style).
  const lastTap = useRef(0);
  function onStageTap() {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      react("❤️");
      lastTap.current = 0;
      return;
    }
    lastTap.current = now;
  }

  // Room deleted (seller ended the stream) → we drop to Disconnected. The
  // room also STARTS in Disconnected before connecting, so only a
  // connected -> disconnected transition counts as "ended". Latched via
  // render-phase state adjustment (react.dev "adjusting state during render").
  const [wasConnected, setWasConnected] = useState(false);
  if (connectionState === ConnectionState.Connected && !wasConnected) {
    setWasConnected(true);
  }
  const streamOver =
    wasConnected && connectionState === ConnectionState.Disconnected;

  if (streamOver) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-black px-6 text-center">
        <span className="text-3xl">🌙</span>
        <h2 className="text-lg font-semibold text-white">Stream ended</h2>
        <p className="text-sm text-white/60">
          Thanks for watching — find more sellers on Discover.
        </p>
        <Link
          href="/discover"
          className="mt-1 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-white transition-all active:scale-[0.97]"
        >
          Browse live streams
        </Link>
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
      {/* Video (tap layer for double-tap likes) */}
      <div className="absolute inset-0" onClick={onStageTap}>
        {videoHidden ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <span className="text-2xl">📵</span>
            <p className="text-sm text-white/60">
              Video hidden to save data — audio keeps playing.
            </p>
          </div>
        ) : (
          <VideoSurface
            trackRef={remoteCamera}
            waitingLabel={
              connectionState === ConnectionState.Connected
                ? "Waiting for the seller's video…"
                : "Connecting…"
            }
          />
        )}
      </div>

      {/* Audio: unmounting stops playback entirely (drawer "Mute audio"). */}
      {!audioMuted ? <RoomAudioRenderer /> : null}

      {/* ---------- Header ---------- */}
      <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 via-black/30 to-transparent p-3 pb-10">
        <div className="pointer-events-auto flex items-center justify-between gap-2">
          {/* Host chip */}
          <div className="flex min-w-0 items-center gap-2 rounded-full bg-black/50 py-1 pl-1 pr-3 backdrop-blur">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold uppercase text-white">
              {sellerName.slice(0, 1)}
            </span>
            <span className="min-w-0">
              <span className="block max-w-[110px] truncate text-xs font-semibold leading-tight text-white">
                @{sellerName}
              </span>
              <span className="block text-[10px] leading-tight text-white/60">
                Host
              </span>
            </span>
            <LiveBadge className="ml-1" />
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <Elapsed startedAt={startedAt} />
            <ViewerCount />
            <ViewerMenu
              audioMuted={audioMuted}
              onToggleAudio={() => setAudioMuted((v) => !v)}
              videoHidden={videoHidden}
              onToggleVideo={() => setVideoHidden((v) => !v)}
              shareTitle={`@${sellerName} is live on LiveShop`}
            />
          </div>
        </div>
      </div>

      {/* Browser autoplay policies may block audio until a tap. */}
      <StartAudio
        label="Tap for sound"
        className="absolute left-1/2 top-16 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white backdrop-blur"
      />

      {/* Floating reactions rise from just above the dock. */}
      <FloatingReactions floats={floats} onDone={remove} />

      {/* ---------- Bottom dock: chat list + input row + actions ---------- */}
      <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-12">
        <ChatOverlay
          broadcasterIdentity={sellerIdentity}
          className="w-full"
          actions={
            <>
              {/* Products */}
              <button
                type="button"
                onClick={() => {
                  haptics.tap();
                  setPanelOpen(true);
                }}
                aria-label={`See products (${products.length})`}
                className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white backdrop-blur transition-all duration-200 active:scale-90"
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
                  <path
                    d="M5 8h14l-1 11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 8Zm4 0a3 3 0 0 1 6 0"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </svg>
                {products.length > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
                    {products.length}
                  </span>
                ) : null}
              </button>

              {/* Heart */}
              <motion.button
                type="button"
                onClick={() => react("❤️")}
                aria-label="Send a heart"
                whileTap={{ scale: 0.7 }}
                transition={{ type: "spring", stiffness: 500, damping: 22 }}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/50 text-lg backdrop-blur"
              >
                ❤️
              </motion.button>
            </>
          }
        />
      </div>

      {/* ---------- Products side panel ---------- */}
      <ProductsPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        products={products}
        featuredId={featuredId}
      />
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
    <div className="flex min-h-0 flex-1 items-center justify-center bg-surface px-6 text-center">
      <p className={tone === "error" ? "text-sm text-live" : "text-sm text-muted"}>
        {children}
      </p>
    </div>
  );
}
