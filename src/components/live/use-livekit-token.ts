"use client";

import { useEffect, useState } from "react";

type TokenState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; token: string; serverUrl: string; isBroadcaster: boolean };

/** Fetches a LiveKit access token for a stream from /api/livekit-token. */
export function useLivekitToken(streamId: string): TokenState {
  const [state, setState] = useState<TokenState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function fetchToken() {
      try {
        const res = await fetch(
          `/api/livekit-token?streamId=${encodeURIComponent(streamId)}`,
        );
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setState({
            status: "error",
            message: body.error ?? "Could not join the stream.",
          });
          return;
        }
        setState({
          status: "ready",
          token: body.token,
          serverUrl: body.serverUrl,
          isBroadcaster: body.isBroadcaster,
        });
      } catch {
        if (!cancelled) {
          setState({ status: "error", message: "Network error joining stream." });
        }
      }
    }

    fetchToken();
    return () => {
      cancelled = true;
    };
  }, [streamId]);

  return state;
}
