"use client";

import { useEffect, useState } from "react";

function format(since: number): string {
  const total = Math.max(0, Math.floor((Date.now() - since) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** "12:34" live-duration ticker shown in the stream header. */
export function Elapsed({ startedAt }: { startedAt: string }) {
  const since = Date.parse(startedAt);
  const [label, setLabel] = useState(() => format(since));

  useEffect(() => {
    const timer = setInterval(() => setLabel(format(since)), 1000);
    return () => clearInterval(timer);
  }, [since]);

  // Inline, not a chip: it sits inside the host card's LIVE line, where a
  // second pill would just add clutter to an already-tight header.
  return (
    <span className="tabular-nums text-white/70">· {label}</span>
  );
}
