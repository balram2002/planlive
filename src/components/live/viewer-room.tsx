"use client";

import { memo, useCallback, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useClerk } from "@clerk/nextjs";
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
import { BuyDrawer, type BuyFlow } from "./buy-drawer";
import { ViewerMenu } from "./viewer-menu";
import { Elapsed } from "./elapsed";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { haptics } from "@/lib/haptics";

export type PinnedProduct = {
  id: string;
  title: string;
  priceInPaise: number;
  availableStock: number;
};

/**
 * Fullscreen buyer-side live room:
 * header (host + follow · LIVE · duration · viewers · menu · close),
 * double-tap to like, chat + notices docked bottom-left, a dynamic pinned
 * product card on the right, and all shopping via the products panel + the
 * address → payment → success buy funnel.
 */
export function ViewerRoom({
  streamId,
  sellerId,
  sellerName,
  sellerAvatar,
  sellerIdentity,
  initiallyFollowing,
  products,
  featuredProductId,
  startedAt,
}: {
  streamId: string;
  sellerId: string;
  sellerName: string;
  sellerAvatar: string | null;
  sellerIdentity: string;
  initiallyFollowing: boolean;
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
        sellerId={sellerId}
        sellerName={sellerName}
        sellerAvatar={sellerAvatar}
        sellerIdentity={sellerIdentity}
        initiallyFollowing={initiallyFollowing}
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
  sellerId,
  sellerName,
  sellerAvatar,
  sellerIdentity,
  initiallyFollowing,
  initialProducts,
  initialFeaturedId,
  startedAt,
}: {
  streamId: string;
  sellerId: string;
  sellerName: string;
  sellerAvatar: string | null;
  sellerIdentity: string;
  initiallyFollowing: boolean;
  initialProducts: PinnedProduct[];
  initialFeaturedId: string | null;
  startedAt: string;
}) {
  const connectionState = useConnectionState();
  const { openSignIn } = useClerk();
  const { toast } = useToast();

  const [products, setProducts] = useState<PinnedProduct[]>(initialProducts);
  const [featuredId, setFeaturedId] = useState<string | null>(initialFeaturedId);
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoHidden, setVideoHidden] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [following, setFollowing] = useState(initiallyFollowing);
  const [followBusy, setFollowBusy] = useState(false);
  const [buyFlow, setBuyFlow] = useState<BuyFlow | null>(null);
  const [buyingId, setBuyingId] = useState<string | null>(null);

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
      // Trust only server packets (RoomService API → no `from` participant).
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

  const remoteCamera = useTracks([Track.Source.Camera]).find(
    (t) => !t.participant.isLocal,
  );

  // Double-tap anywhere on the video = ❤️.
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

  async function toggleFollow() {
    haptics.tap();
    setFollowBusy(true);
    try {
      const res = await fetch("/api/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sellerId }),
      });
      if (res.status === 401) {
        openSignIn();
        return;
      }
      const body = await res.json();
      if (res.ok) {
        setFollowing(body.following);
        if (body.following) {
          toast({ title: `Following @${sellerName}`, variant: "success" });
        }
      }
    } catch {
      toast({ title: "Network error", variant: "error" });
    } finally {
      setFollowBusy(false);
    }
  }

  /** Central Buy Now: reserve the stock, then open the checkout funnel. */
  async function startBuy(product: PinnedProduct) {
    haptics.tap();
    setBuyingId(product.id);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id }),
      });
      if (res.status === 401) {
        openSignIn();
        return;
      }
      const body = await res.json();
      if (!res.ok) {
        toast({
          title: "Couldn't reserve",
          description: body.error ?? "Please try again.",
          variant: "error",
        });
        return;
      }
      setPanelOpen(false);
      setBuyFlow({
        product,
        reservationId: body.reservationId,
        expiresAt: body.expiresAt,
      });
      toast({
        title: "Reserved for you ⚡",
        description: "Complete checkout within 10 minutes.",
        variant: "success",
      });
    } catch {
      toast({ title: "Network error", variant: "error" });
    } finally {
      setBuyingId(null);
    }
  }

  // Ended-state latch (see render-phase adjustment note in react.dev docs).
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

  const featuredProduct = featuredId
    ? (products.find((p) => p.id === featuredId) ?? null)
    : null;

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

      {!audioMuted ? <RoomAudioRenderer /> : null}

      {/* ---------- Header ---------- */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/70 via-black/30 to-transparent p-3 pb-10">
        <div className="pointer-events-auto flex items-center gap-1.5">
          {/* Host chip + follow */}
          <div className="flex min-w-0 items-center gap-1.5 rounded-full bg-black/50 py-1 pl-1 pr-1.5 backdrop-blur">
            <span className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full bg-primary">
              {sellerAvatar ? (
                <Image
                  src={sellerAvatar}
                  alt={sellerName}
                  fill
                  sizes="28px"
                  className="object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-xs font-bold uppercase text-white">
                  {sellerName.slice(0, 1)}
                </span>
              )}
            </span>
            <span className="min-w-0">
              <span className="block max-w-[92px] truncate text-xs font-semibold leading-tight text-white">
                @{sellerName}
              </span>
              <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide leading-tight text-live">
                <span className="h-1 w-1 rounded-full bg-live animate-live-pulse" />
                Live
              </span>
            </span>
            <motion.button
              type="button"
              disabled={followBusy}
              onClick={toggleFollow}
              whileTap={{ scale: 0.92 }}
              className={cn(
                "ml-1 shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors duration-300",
                following
                  ? "bg-white/15 text-white/80"
                  : "bg-primary text-white",
              )}
            >
              {following ? "Following" : "Follow"}
            </motion.button>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <Elapsed startedAt={startedAt} />
            <ViewerCount />
            <ViewerMenu
              audioMuted={audioMuted}
              onToggleAudio={() => setAudioMuted((v) => !v)}
              videoHidden={videoHidden}
              onToggleVideo={() => setVideoHidden((v) => !v)}
              shareTitle={`@${sellerName} is live on LiveShop`}
            />
            {/* Close */}
            <Link
              href="/discover"
              aria-label="Leave stream"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-all duration-200 active:scale-90"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
                <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </Link>
          </div>
        </div>
      </div>

      <StartAudio
        label="Tap for sound"
        className="absolute left-1/2 top-16 z-10 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white backdrop-blur"
      />

      <FloatingReactions floats={floats} onDone={remove} />

      {/* ---------- Pinned product card — just above the dock, right corner ---------- */}
      <AnimatePresence>
        {featuredProduct ? (
          <motion.div
            key={featuredProduct.id}
            initial={{ opacity: 0, x: 60, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
            className="absolute bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] right-3 z-30 w-32"
          >
            <div className="overflow-hidden rounded-2xl border border-white/15 bg-black/70 backdrop-blur">
              <div className="flex h-20 items-center justify-center bg-white/5 text-3xl">
                🏷️
              </div>
              <div className="p-2.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/25 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary-foreground">
                  📌 Pinned
                </span>
                <p className="mt-1 line-clamp-2 text-xs font-medium leading-snug text-white">
                  {featuredProduct.title}
                </p>
                <p className="mt-0.5 text-xs font-bold text-white">
                  {formatPrice(featuredProduct.priceInPaise)}
                </p>
                <p className="text-[10px] text-white/60">
                  {featuredProduct.availableStock > 0
                    ? `${featuredProduct.availableStock} left`
                    : "Sold out"}
                </p>
                <motion.button
                  type="button"
                  disabled={
                    featuredProduct.availableStock <= 0 ||
                    buyingId === featuredProduct.id
                  }
                  onClick={() => startBuy(featuredProduct)}
                  whileTap={{ scale: 0.95 }}
                  className="mt-1.5 w-full rounded-full bg-primary py-1.5 text-[11px] font-bold text-white transition-colors disabled:bg-white/10 disabled:text-white/40"
                >
                  {featuredProduct.availableStock <= 0
                    ? "Sold out"
                    : buyingId === featuredProduct.id
                      ? "Reserving…"
                      : "Buy Now"}
                </motion.button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ---------- Bottom dock: full-width fixed input row ----------
          The gradient shell is pointer-events-none so the pinned card and
          double-tap layer stay clickable through its transparent top area;
          chat content re-enables its own pointer events. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-12">
        <ChatOverlay
          broadcasterIdentity={sellerIdentity}
          className="pointer-events-auto w-full"
          listClassName={featuredProduct ? "mr-32" : undefined}
          actions={
            <>
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

      {/* ---------- Overlays ---------- */}
      <ProductsPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        products={products}
        featuredId={featuredId}
        onBuy={startBuy}
        buyingId={buyingId}
      />
      <BuyDrawer flow={buyFlow} onClose={() => setBuyFlow(null)} />
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
