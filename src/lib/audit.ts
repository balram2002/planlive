// NOTE: no "server-only" guard — this module is shared with standalone
// scripts (sweeper, reconciliation) that run outside Next.js. It holds no
// secrets and touches no request context, so it is safe anywhere on the
// server. Deliberately split out of lib/authz.ts, which uses next/navigation
// redirects and therefore cannot be imported by a plain Node script.

/** Structured audit line for privileged mutations (grep "[audit]" in logs). */
export function audit(action: string, detail: Record<string, unknown>): void {
  console.log(
    `[audit] ${new Date().toISOString()} ${action} ${JSON.stringify(detail)}`,
  );
}
