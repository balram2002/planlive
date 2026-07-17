/** Compact relative time: "just now", "5m ago", "2h ago", "3d ago". */
export function timeAgo(from: Date, now: number = Date.now()): string {
  const s = Math.max(0, Math.floor((now - from.getTime()) / 1000));
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
