import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/current-user";

/**
 * GET /api/geocode?lat=..&lon=..
 *
 * Reverse-geocodes precise coordinates into address fields via OpenStreetMap
 * Nominatim (proxied server-side: proper User-Agent, no browser CORS issues).
 * Signed-in only, to keep the free upstream within its fair-use policy.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lon = Number(req.nextUrl.searchParams.get("lon"));
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  ) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
      {
        headers: {
          "User-Agent": "liveWAB/1.0 (live-shopping app; address autofill)",
          "Accept-Language": "en-IN,en",
        },
        // Nominatim results for a fixed point rarely change.
        next: { revalidate: 86400 },
      },
    );
    if (!res.ok) {
      return NextResponse.json({ error: "Lookup failed" }, { status: 502 });
    }
    const data = await res.json();
    const a = data.address ?? {};

    return NextResponse.json({
      line1: [a.house_number, a.road ?? a.neighbourhood ?? a.hamlet]
        .filter(Boolean)
        .join(", "),
      line2: [a.suburb ?? a.village ?? a.town_area, a.county]
        .filter(Boolean)
        .join(", "),
      city: a.city ?? a.town ?? a.village ?? a.state_district ?? "",
      state: a.state ?? "",
      pincode: a.postcode ?? "",
      displayName: data.display_name ?? "",
      latitude: lat,
      longitude: lon,
    });
  } catch {
    return NextResponse.json({ error: "Lookup failed" }, { status: 502 });
  }
}
