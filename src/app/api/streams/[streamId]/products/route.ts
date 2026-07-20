import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/streams/:id/products — current live product queue + featured pin.
 * Public: viewers refetch this when the seller broadcasts "products-changed".
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ streamId: string }> },
) {
  const { streamId } = await params;

  const stream = await prisma.stream.findUnique({ where: { id: streamId } });
  if (!stream || stream.status !== "LIVE") {
    return NextResponse.json({ error: "Stream not found" }, { status: 404 });
  }

  const products = await prisma.product.findMany({
    where: { streamId: stream.id },
    orderBy: { title: "asc" },
    select: {
      id: true,
      title: true,
      priceInPaise: true,
      availableStock: true,
      imageUrl: true,
    },
  });

  return NextResponse.json({
    products,
    featuredProductId: stream.featuredProductId,
  });
}
