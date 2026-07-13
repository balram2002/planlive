import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { BroadcasterRoom } from "@/components/live/broadcaster-room";
import { LiveConsole } from "@/components/live/live-console";
import { HapticButton } from "@/components/ui/haptic-button";
import { endStream } from "../actions";

/** Seller studio: broadcast surface + full live console + end-stream. */
export default async function StudioPage({
  params,
}: {
  params: Promise<{ streamId: string }>;
}) {
  const { streamId } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const stream = await prisma.stream.findUnique({ where: { id: streamId } });
  if (!stream || stream.sellerId !== user.id) notFound();
  if (stream.status !== "LIVE") redirect("/dashboard");

  // All of the seller's products, flagged by whether they're in this stream.
  const products = await prisma.product.findMany({
    where: { sellerId: user.id },
    orderBy: { title: "asc" },
  });

  return (
    <div className="animate-page-in space-y-5 lg:grid lg:grid-cols-[minmax(0,420px)_1fr] lg:items-start lg:gap-6 lg:space-y-0">
      <div className="lg:col-span-2">
        <h1 className="text-2xl font-bold tracking-tight">You&apos;re live</h1>
        <p className="text-sm text-muted">
          Buyers can find your stream on the Discover page.
        </p>
      </div>

      <BroadcasterRoom
        streamId={stream.id}
        startedAt={stream.startedAt.toISOString()}
      />

      <div className="space-y-5">
        <LiveConsole
          streamId={stream.id}
          featuredProductId={stream.featuredProductId}
          products={products.map((p) => ({
            id: p.id,
            title: p.title,
            priceInPaise: p.priceInPaise,
            availableStock: p.availableStock,
            inStream: p.streamId === stream.id,
          }))}
        />

        <form action={endStream}>
          <input type="hidden" name="streamId" value={stream.id} />
          <HapticButton type="submit" variant="danger" size="lg" className="w-full">
            End stream
          </HapticButton>
        </form>
      </div>
    </div>
  );
}
