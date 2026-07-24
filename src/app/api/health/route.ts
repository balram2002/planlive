import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Never cached: a cached health check tells you nothing.
export const dynamic = "force-dynamic";

/**
 * GET /api/health — liveness + database readiness.
 *
 * Used by the Docker HEALTHCHECK and by any external uptime monitor. It pings
 * MongoDB, because a container that is running but can't reach Atlas is not
 * actually serving: every page in this app is dynamic and DB-backed.
 *
 * Deliberately returns no version, dependency or environment detail — this
 * endpoint is public, and a health check shouldn't be a recon tool.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    // Cheapest possible round-trip that proves the connection works.
    await prisma.$runCommandRaw({ ping: 1 });
    return NextResponse.json(
      { status: "ok", dbLatencyMs: Date.now() - startedAt },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[health] database ping failed:", err);
    return NextResponse.json(
      { status: "degraded" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
