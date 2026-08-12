"use client";

/**
 * What a viewer sees in place of video, for both transports.
 *
 * The three states below used to be collapsed into one "Waiting for the
 * seller's video…" message, which was wrong in two directions at once: it
 * read like a stalled loading spinner when the seller had simply and
 * deliberately switched their camera off, and it kept reading like an error
 * long after nothing was actually loading. A shopper seeing that assumes the
 * app is broken and leaves.
 *
 * So each state gets its own voice:
 *   • connecting  — the only place loading language is allowed.
 *   • waiting     — connected fine; the seller hasn't gone on camera yet.
 *   • camera-off  — the seller turned their camera off on purpose. Calm and
 *                   deliberate: nothing is wrong, audio carries on.
 *
 * Shared by the LiveKit and ZEGO surfaces so the premium tier never speaks in
 * a different voice from the standard one.
 */

export type PlaceholderState = "connecting" | "waiting" | "camera-off";

export function StreamPlaceholder({
  state,
  waitingLabel,
}: {
  state: PlaceholderState;
  /** Caller's wording for "not on camera yet" — varies by surface. */
  waitingLabel?: string;
}) {
  const content =
    state === "connecting"
      ? {
          icon: <Spinner />,
          title: "Connecting…",
          body: "Getting you into the stream.",
        }
      : state === "camera-off"
        ? {
            icon: <span className="text-3xl">🎥</span>,
            title: "Camera off",
            body: "The seller has turned their camera off for a moment. Audio and chat are still live.",
          }
        : {
            icon: <span className="text-3xl">📡</span>,
            title: waitingLabel ?? "Starting soon",
            body: "The seller hasn't gone on camera yet. Hang tight — the stream will appear here.",
          };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      {content.icon}
      <div className="space-y-1">
        <p className="text-sm font-medium text-white">{content.title}</p>
        <p className="max-w-xs text-xs leading-relaxed text-white/55">
          {content.body}
        </p>
      </div>
    </div>
  );
}

/** Motion is the signal that something is genuinely in progress. */
function Spinner() {
  return (
    <span
      aria-hidden
      className="size-7 animate-spin rounded-full border-2 border-white/25 border-t-white/80"
    />
  );
}
