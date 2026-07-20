import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { notifyAddressAdded } from "@/lib/notify";

export const MAX_ADDRESSES = 3;

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** GET /api/addresses — the caller's saved addresses (active first). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return bad("Unauthorized", 401);

  const addresses = await prisma.address.findMany({
    where: { userId: user.id },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ addresses, max: MAX_ADDRESSES });
}

/** POST /api/addresses — add one (max 3; the first becomes active). */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !user.isActive) return bad("Unauthorized", 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON");
  }

  const str = (k: string, max: number) =>
    String(body[k] ?? "")
      .trim()
      .slice(0, max);

  const address = {
    label: str("label", 24) || "Home",
    fullName: str("fullName", 60),
    phone: str("phone", 15),
    line1: str("line1", 120),
    line2: str("line2", 120) || null,
    city: str("city", 60),
    state: str("state", 60),
    pincode: str("pincode", 10),
  };

  if (!address.fullName) return bad("Full name is required.");
  if (!/^[0-9+\-\s]{8,15}$/.test(address.phone))
    return bad("Enter a valid phone number.");
  if (!address.line1) return bad("Address line is required.");
  if (!address.city || !address.state) return bad("City and state are required.");
  if (!/^\d{6}$/.test(address.pincode)) return bad("Enter a valid 6-digit PIN code.");

  const count = await prisma.address.count({ where: { userId: user.id } });
  if (count >= MAX_ADDRESSES) {
    return bad(`You can save up to ${MAX_ADDRESSES} addresses — delete one first.`, 409);
  }

  // Optional pinpoint coordinates from "use my location".
  const lat = Number(body.latitude);
  const lon = Number(body.longitude);
  const hasCoords =
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180;

  const created = await prisma.address.create({
    data: {
      ...address,
      latitude: hasCoords ? lat : null,
      longitude: hasCoords ? lon : null,
      userId: user.id,
      // First address becomes the active one automatically.
      isActive: count === 0,
    },
  });

  notifyAddressAdded({
    user,
    label: created.label,
    fullName: created.fullName,
    phone: created.phone,
    line1: created.line1,
    city: created.city,
    pincode: created.pincode,
  });

  return NextResponse.json({ address: created });
}
