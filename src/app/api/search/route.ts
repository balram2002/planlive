import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { timeAgo } from "@/lib/time";

/**
 * GET /api/search?q= — powers the header typeahead.
 * Partial, case-insensitive matching across sellers (username/name),
 * categories (name/subcategory), and live streams (own title OR a matched
 * seller/category). Compact payloads sized for a dropdown.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 1) {
    return NextResponse.json({ sellers: [], categories: [], streams: [] });
  }

  try {
    const [sellers, categories] = await Promise.all([
      prisma.user.findMany({
        where: {
          role: "SELLER",
          isActive: true,
          OR: [
            { username: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
            // Sellers without a username are shown by their email local-part
            // (@handle) across the app — make them findable by it too.
            { email: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { id: true, username: true, name: true, email: true, imageUrl: true },
        take: 5,
      }),
      prisma.category.findMany({
        where: {
          isActive: true,
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { subcategory: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { id: true, name: true, subcategory: true, imageUrl: true },
        take: 6,
      }),
    ]);

    const liveStreams = await prisma.stream.findMany({
      where: {
        status: "LIVE",
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { sellerId: { in: sellers.map((s) => s.id) } },
          { categoryId: { in: categories.map((c) => c.id) } },
        ],
      },
      orderBy: { startedAt: "desc" },
      take: 5,
    });

    // Stream cards may involve sellers that didn't match by name.
    const extraSellerIds = liveStreams
      .map((s) => s.sellerId)
      .filter((id) => !sellers.some((s) => s.id === id));
    const extraSellers =
      extraSellerIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: extraSellerIds } },
            select: { id: true, username: true, email: true, imageUrl: true },
          })
        : [];
    const sellerById = new Map(
      [...sellers, ...extraSellers].map((s) => [s.id, s]),
    );

    return NextResponse.json({
      sellers: sellers.map((s) => ({
        id: s.id,
        name: s.username ?? s.email.split("@")[0],
        fullName: s.name,
        imageUrl: s.imageUrl,
      })),
      categories,
      streams: liveStreams.map((stream) => {
        const seller = sellerById.get(stream.sellerId);
        return {
          id: stream.id,
          title: stream.title,
          thumbnailUrl: stream.thumbnailUrl,
          sellerName:
            (seller && "username" in seller && seller.username) ||
            seller?.email.split("@")[0] ||
            "seller",
          startedAgo: timeAgo(stream.startedAt),
        };
      }),
    });
  } catch (err) {
    // Degrade gracefully for the typeahead, but never hide the cause.
    console.error("search failed:", err);
    return NextResponse.json(
      { sellers: [], categories: [], streams: [] },
      { status: 200 },
    );
  }
}
