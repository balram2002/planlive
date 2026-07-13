import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Badge, LiveBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { forceEndStream } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminStreamsPage() {
  const [live, recent] = await Promise.all([
    prisma.stream.findMany({
      where: { status: "LIVE" },
      orderBy: { startedAt: "desc" },
    }),
    prisma.stream.findMany({
      where: { status: "ENDED" },
      orderBy: { startedAt: "desc" },
      take: 20,
    }),
  ]);

  const sellerIds = [...new Set([...live, ...recent].map((s) => s.sellerId))];
  const sellers = await prisma.user.findMany({
    where: { id: { in: sellerIds } },
    select: { id: true, email: true },
  });
  const sellerById = new Map(sellers.map((s) => [s.id, s.email]));

  const liveProductCounts = new Map<string, number>();
  for (const stream of live) {
    liveProductCounts.set(
      stream.id,
      await prisma.product.count({ where: { streamId: stream.id } }),
    );
  }

  return (
    <div className="animate-page-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Streams</h1>
        <p className="text-sm text-muted">
          Everything broadcasting now, with moderation controls.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">
          Live now ({live.length})
        </h2>
        {live.length === 0 ? (
          <EmptyState icon="📡" title="Nobody is live" description="Live streams appear here the moment a seller starts broadcasting." />
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {live.map((stream) => (
              <li key={stream.id}>
                <Card className="flex items-center gap-3 p-4">
                  <LiveBadge />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {sellerById.get(stream.sellerId) ?? "Unknown seller"}
                    </p>
                    <p className="text-xs text-muted">
                      Started{" "}
                      {stream.startedAt.toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · {liveProductCounts.get(stream.id) ?? 0} products
                    </p>
                  </div>
                  <Link
                    href={`/live/${stream.id}`}
                    className="rounded-full px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                  >
                    Watch
                  </Link>
                  <form action={forceEndStream}>
                    <input type="hidden" name="streamId" value={stream.id} />
                    <button
                      type="submit"
                      className="rounded-full bg-live/10 px-3 py-1.5 text-xs font-medium text-live transition-colors hover:bg-live/20"
                    >
                      Force end
                    </button>
                  </form>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">
          Recently ended
        </h2>
        {recent.length === 0 ? (
          <p className="px-1 text-sm text-faint">No past streams yet.</p>
        ) : (
          <Card className="divide-y divide-border/60">
            {recent.map((stream) => (
              <div key={stream.id} className="flex items-center gap-3 p-3.5">
                <Badge>Ended</Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {sellerById.get(stream.sellerId) ?? "Unknown seller"}
                  </p>
                </div>
                <p className="text-xs text-muted">
                  {stream.startedAt.toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                  })}
                  {stream.endedAt
                    ? ` · ${Math.max(1, Math.round((stream.endedAt.getTime() - stream.startedAt.getTime()) / 60000))} min`
                    : ""}
                </p>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
