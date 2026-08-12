import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/current-user";

/**
 * GET /api/parse-maps-url?url=...
 *
 * Extracts latitude/longitude from a Google Maps link, so a seller can paste
 * a share link instead of pinning the map by hand. Runs server-side for two
 * reasons: short links (goo.gl/maps.app.goo.gl) only reveal coordinates
 * after their redirect resolves, and a browser `fetch` to a cross-origin
 * Google URL would be blocked by CORS anyway.
 *
 * Only Google's own domains are ever fetched — the input is a user-supplied
 * URL, and without an allowlist this endpoint would be an open SSRF proxy.
 */

const ALLOWED_HOST_RE = /^([a-z0-9-]+\.)*(google\.[a-z.]{2,8}|goo\.gl)$/i;

function isAllowedMapsUrl(value: string): URL | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!ALLOWED_HOST_RE.test(url.hostname)) return null;
  return url;
}

/**
 * Google Maps encodes a point's coordinates in several different URL shapes
 * depending on how the link was generated. Tried in order of how common
 * each shape is in real "Share" links.
 */
function extractLatLng(url: string): { lat: number; lon: number } | null {
  const patterns = [
    /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/, // .../@28.6139,77.2090,15z
    /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/, // .../data=...!3d28.6139!4d77.2090
    /[?&]q=(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/, // ...?q=28.6139,77.2090
    /[?&]ll=(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/, // ...?ll=28.6139,77.2090
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) {
      const lat = Number(m[1]);
      const lon = Number(m[2]);
      if (
        Number.isFinite(lat) &&
        Number.isFinite(lon) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lon) <= 180
      ) {
        return { lat, lon };
      }
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = req.nextUrl.searchParams.get("url") ?? "";
  const url = isAllowedMapsUrl(raw);
  if (!url) {
    return NextResponse.json(
      { error: "Paste a Google Maps link (google.com/maps or a goo.gl share link)." },
      { status: 400 },
    );
  }

  // A direct (non-shortened) link already carries its coordinates — no need
  // to hit the network at all.
  const direct = extractLatLng(url.toString());
  if (direct) {
    return NextResponse.json({ latitude: direct.lat, longitude: direct.lon });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    // GET, not HEAD: short links resolve through an interstitial that only
    // reveals the destination (and its embedded coordinates) once fetched.
    const res = await fetch(url.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (liveWAB address lookup)" },
    });
    clearTimeout(timeout);

    const resolved = extractLatLng(res.url);
    if (resolved) {
      return NextResponse.json({
        latitude: resolved.lat,
        longitude: resolved.lon,
      });
    }

    // Coordinates can also be embedded in the page body rather than the
    // final URL (e.g. some place-page redirects). Bounded read — this is
    // only ever a few hundred KB of HTML, never the full response.
    const reader = res.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder();
      let text = "";
      const MAX_BYTES = 500_000;
      let read = 0;
      while (read < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        read += value.byteLength;
        text += decoder.decode(value, { stream: true });
        const found = extractLatLng(text);
        if (found) {
          await reader.cancel().catch(() => {});
          return NextResponse.json({
            latitude: found.lat,
            longitude: found.lon,
          });
        }
      }
      await reader.cancel().catch(() => {});
    }

    return NextResponse.json(
      {
        error:
          "Couldn't find coordinates in that link — try pinning the location on the map instead.",
      },
      { status: 422 },
    );
  } catch {
    return NextResponse.json(
      { error: "Couldn't open that link — check it and try again." },
      { status: 502 },
    );
  }
}
