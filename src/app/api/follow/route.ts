import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";

/**
 * POST /api/follow { sellerId } — toggle following a seller.
 * Returns { following: boolean }.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !user.isActive) {
    return NextResponse.json({ error: "Sign in to follow." }, { status: 401 });
  }

  let body: { sellerId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const sellerId = typeof body.sellerId === "string" ? body.sellerId : "";
  if (!sellerId || sellerId === user.id) {
    return NextResponse.json({ error: "Invalid seller" }, { status: 400 });
  }

  const seller = await prisma.user.findUnique({ where: { id: sellerId } });
  if (!seller || seller.role === "BUYER") {
    return NextResponse.json({ error: "Seller not found" }, { status: 404 });
  }

  const existing = await prisma.follow.findUnique({
    where: {
      followerId_sellerId: { followerId: user.id, sellerId },
    },
  });

  if (existing) {
    await prisma.follow.delete({ where: { id: existing.id } });
    return NextResponse.json({ following: false });
  }

  try {
    await prisma.follow.create({
      data: { followerId: user.id, sellerId },
    });
  } catch {
    // Unique race (double-tap) — already following.
  }
  return NextResponse.json({ following: true });
}
