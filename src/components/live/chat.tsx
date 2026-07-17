"use client";

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { SignInButton } from "@clerk/nextjs";
import {
  useDataChannel,
  useLocalParticipant,
  useRoomContext,
} from "@livekit/components-react";
import { RoomEvent, type RemoteParticipant } from "livekit-client";
import { cn } from "@/lib/cn";
import { haptics } from "@/lib/haptics";

/** Spec message shape: chat travels the data channel only, never the DB. */
type ChatPayload = {
  type: "chat";
  id: string;
  text: string;
  userId: string;
  name: string;
};

type ChatMessage = {
  id: string;
  kind: "chat" | "system";
  text: string;
  userId: string;
  name: string;
};

const MAX_MESSAGES = 50;
const MAX_TEXT_LENGTH = 200;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Ephemeral live chat over the LiveKit data channel.
 * - Join notifications appear as muted system rows.
 * - The broadcaster can moderate: delete a message or mute a viewer; clients
 *   honor moderation packets only when they come from the broadcaster's
 *   server-issued identity (spoof-proof — identities are set by our token
 *   route, not the client).
 * - Rows are memoized and the list is capped, so a busy chat can't grow the
 *   DOM unboundedly or re-render the video surface.
 */
export function ChatOverlay({
  className,
  broadcasterIdentity,
  canModerate = false,
  actions,
}: {
  className?: string;
  broadcasterIdentity: string;
  canModerate?: boolean;
  /** Extra buttons rendered at the right end of the input row (bag, heart…). */
  actions?: React.ReactNode;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const mutedRef = useRef<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);
  const counter = useRef(0);
  const { localParticipant } = useLocalParticipant();
  const room = useRoomContext();

  const append = useCallback((msg: ChatMessage) => {
    if (mutedRef.current.has(msg.userId)) return;
    setMessages((prev) => {
      const next = [...prev, msg];
      return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
    });
  }, []);

  // ---- Join notifications (external system → setState in callback). ----
  useEffect(() => {
    const onJoin = (participant: RemoteParticipant) => {
      append({
        id: `sys_${participant.sid}_${Date.now()}`,
        kind: "system",
        text: `${participant.name || "someone"} joined`,
        userId: participant.identity,
        name: "",
      });
    };
    room.on(RoomEvent.ParticipantConnected, onJoin);
    return () => {
      room.off(RoomEvent.ParticipantConnected, onJoin);
    };
  }, [room, append]);

  // ---- Incoming data: chat + moderation. ----
  const onData = useCallback(
    (msg: { payload: Uint8Array; from?: { identity: string; name?: string } }) => {
      try {
        const data = JSON.parse(decoder.decode(msg.payload));
        const fromIdentity = msg.from?.identity;

        // Server-sent packets (no participant) become seller-action notices.
        if (!msg.from) {
          if (data?.type === "featured") {
            append({
              id: `sys_pin_${Date.now()}`,
              kind: "system",
              text: data.productTitle
                ? `📌 pinned ${String(data.productTitle).slice(0, 60)}`
                : "📌 featured product cleared",
              userId: "server",
              name: "",
            });
          } else if (data?.type === "products-changed") {
            append({
              id: `sys_prod_${Date.now()}`,
              kind: "system",
              text: "🛍️ product lineup updated",
              userId: "server",
              name: "",
            });
          }
          return;
        }

        if (data?.type === "chat" && typeof data.text === "string") {
          append({
            id: String(data.id ?? `${fromIdentity}_${Date.now()}`),
            kind: "chat",
            text: String(data.text).slice(0, MAX_TEXT_LENGTH),
            userId: fromIdentity ?? String(data.userId ?? "unknown"),
            // Prefer the server-issued participant name over the payload's.
            name: msg.from?.name || String(data.name ?? "someone"),
          });
          return;
        }

        // Moderation packets are only honored from the broadcaster.
        if (fromIdentity !== broadcasterIdentity) return;

        if (data?.type === "chat-delete" && typeof data.id === "string") {
          setMessages((prev) => prev.filter((m) => m.id !== data.id));
        } else if (
          data?.type === "chat-mute" &&
          typeof data.identity === "string"
        ) {
          mutedRef.current.add(data.identity);
          setMessages((prev) => prev.filter((m) => m.userId !== data.identity));
        }
      } catch {
        // Not JSON / not for us.
      }
    },
    [append, broadcasterIdentity],
  );

  const { send } = useDataChannel(onData);

  // Signed-in users get identity "user_<id>"; guests get "guest_<rand>".
  const canSend = localParticipant.identity.startsWith("user_");
  const displayName = localParticipant.name || "you";

  // Keep the newest message in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim().slice(0, MAX_TEXT_LENGTH);
    if (!text) return;
    setDraft("");
    haptics.tap();

    const payload: ChatPayload = {
      type: "chat",
      id: `${localParticipant.identity}_${counter.current++}_${Date.now()}`,
      text,
      userId: localParticipant.identity,
      name: displayName,
    };
    append({ ...payload, kind: "chat" }); // local echo
    try {
      await send(encoder.encode(JSON.stringify(payload)), { reliable: true });
    } catch {
      // Connection hiccup — the message still shows locally; fine for MVP.
    }
  }

  // ---- Broadcaster moderation actions. ----
  const moderate = useCallback(
    async (packet: Record<string, unknown>) => {
      try {
        await send(encoder.encode(JSON.stringify(packet)), { reliable: true });
      } catch {
        // Best-effort.
      }
    },
    [send],
  );

  const deleteMessage = useCallback(
    (id: string) => {
      haptics.tap();
      setMessages((prev) => prev.filter((m) => m.id !== id));
      void moderate({ type: "chat-delete", id });
    },
    [moderate],
  );

  const muteUser = useCallback(
    (identity: string) => {
      haptics.impact();
      mutedRef.current.add(identity);
      setMessages((prev) => prev.filter((m) => m.userId !== identity));
      void moderate({ type: "chat-mute", identity });
    },
    [moderate],
  );

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      {/* Messages — newest at the bottom, top fades out over the video. */}
      <div
        ref={listRef}
        className="no-scrollbar max-h-40 space-y-1.5 overflow-y-auto [mask-image:linear-gradient(to_bottom,transparent,black_20%)]"
      >
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <ChatRow
              key={msg.id}
              msg={msg}
              canModerate={canModerate && msg.kind === "chat"}
              isOwn={msg.userId === localParticipant.identity}
              onDelete={deleteMessage}
              onMute={muteUser}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Input row — docked at the bottom; action buttons ride on the right. */}
      <div className="flex h-11 items-center gap-2">
        {canSend ? (
          <form onSubmit={submit} className="flex h-full min-w-0 flex-1 items-center gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={MAX_TEXT_LENGTH}
              placeholder="Say something…"
              className="h-full min-w-0 flex-1 rounded-full border border-white/15 bg-black/50 px-4 text-base text-white placeholder:text-white/40 backdrop-blur focus:border-white/40 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              aria-label="Send message"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white transition-all duration-200 active:scale-90 disabled:opacity-40"
            >
              {/* Paper plane pointing right, visually centered. */}
              <svg viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 h-5 w-5" aria-hidden>
                <path d="M3.6 3.9a.7.7 0 0 1 .95-.8l16.2 8.06a.7.7 0 0 1 0 1.26L4.55 20.5a.7.7 0 0 1-.95-.8l1.6-6.4a.7.7 0 0 1 .52-.51l6.4-1.3-6.4-1.3a.7.7 0 0 1-.52-.5l-1.6-6.4Z" />
              </svg>
            </button>
          </form>
        ) : (
          // Contextual gate → modal, so the viewer never loses their spot.
          <SignInButton mode="modal">
            <button className="inline-flex h-full min-w-0 flex-1 items-center justify-start rounded-full border border-white/15 bg-black/50 px-4 text-sm font-medium text-white/60 backdrop-blur transition-all active:scale-[0.99]">
              Sign in to chat…
            </button>
          </SignInButton>
        )}
        {actions}
      </div>
    </div>
  );
}

/** One chat/system row — memoized so a new message never re-renders old ones. */
const ChatRow = memo(function ChatRow({
  msg,
  canModerate,
  isOwn,
  onDelete,
  onMute,
}: {
  msg: ChatMessage;
  canModerate: boolean;
  isOwn: boolean;
  onDelete: (id: string) => void;
  onMute: (identity: string) => void;
}) {
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      className="group flex items-start gap-1.5"
    >
      {msg.kind === "system" ? (
        <p className="text-[11px] italic leading-snug text-white/50 [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">
          {msg.text}
        </p>
      ) : (
        <>
          <p className="min-w-0 text-[13px] leading-snug text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">
            <span className="mr-1.5 font-semibold text-white/60">{msg.name}</span>
            {msg.text}
          </p>
          {canModerate && !isOwn ? (
            <span className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                onClick={() => onDelete(msg.id)}
                aria-label="Delete message"
                className="rounded-full bg-black/50 px-1.5 text-[10px] text-white/70 hover:text-white"
              >
                ✕
              </button>
              <button
                type="button"
                onClick={() => onMute(msg.userId)}
                aria-label={`Mute ${msg.name}`}
                className="rounded-full bg-black/50 px-1.5 text-[10px] text-white/70 hover:text-live"
              >
                🚫
              </button>
            </span>
          ) : null}
        </>
      )}
    </motion.div>
  );
});
