// NOTE: no "server-only" guard — this module is shared with standalone
// scripts (webhook registration, tracking reconciliation) that run outside
// Next.js. Never import it from a client component: it holds API secrets.

/**
 * Eshopbox API client: authentication + a typed fetch wrapper.
 *
 * Auth model (per Eshopbox docs): a long-lived refresh token is exchanged at
 * `auth.myeshopbox.com/api/v1/generateToken` for an access token valid for
 * 86 400 s (24 h). We cache that token in module memory and refresh it a few
 * minutes early — minting one per API call would be both slow and rude.
 */

const AUTH_URL = "https://auth.myeshopbox.com/api/v1/generateToken";
const WMS_BASE = "https://wms.eshopbox.com";

/** Refresh this long before actual expiry, so no request races the deadline. */
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

const clientId = process.env.ESHOPBOX_CLIENT_ID;
const clientSecret = process.env.ESHOPBOX_CLIENT_SECRET;
const refreshToken = process.env.ESHOPBOX_REFRESH_TOKEN;

/** Sales channel the shipments belong to (from the Sales Channel tab). */
export const ESHOPBOX_CHANNEL_ID = process.env.ESHOPBOX_CHANNEL_ID ?? "";
/** Workspace slug, used for the account-scoped webhook registration host. */
export const ESHOPBOX_ACCOUNT_SLUG = process.env.ESHOPBOX_ACCOUNT_SLUG ?? "";
/** Default warehouse code; sellers may override it on their profile. */
export const ESHOPBOX_PICKUP_LOCATION_CODE =
  process.env.ESHOPBOX_PICKUP_LOCATION_CODE ?? "";

export function eshopboxConfigured(): boolean {
  return Boolean(clientId && clientSecret && refreshToken);
}

/** Thrown for any non-2xx Eshopbox response, with their message surfaced. */
export class EshopboxError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "EshopboxError";
  }
}

type CachedToken = { accessToken: string; expiresAt: number };

let cached: CachedToken | null = null;
/**
 * In-flight refresh, shared by concurrent callers. Without this, a burst of
 * requests on a cold cache would each mint a separate token.
 */
let inFlight: Promise<string> | null = null;

async function mintToken(): Promise<string> {
  if (!clientId || !clientSecret || !refreshToken) {
    throw new EshopboxError("Eshopbox is not configured on the server.", 503);
  }

  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    // Credentials must never be served from a cache layer.
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new EshopboxError(
      `Eshopbox authentication failed (${res.status}).`,
      res.status,
      detail,
    );
  }

  const body = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!body.access_token) {
    throw new EshopboxError("Eshopbox returned no access token.", 502, body);
  }

  const ttlMs = (body.expires_in ?? 86_400) * 1000;
  cached = {
    accessToken: body.access_token,
    expiresAt: Date.now() + ttlMs - EXPIRY_MARGIN_MS,
  };
  return cached.accessToken;
}

/** Returns a valid access token, minting or refreshing it only when needed. */
export async function getAccessToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt) return cached.accessToken;
  if (inFlight) return inFlight;

  inFlight = mintToken().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Drops the cached token so the next call re-authenticates. */
export function invalidateToken(): void {
  cached = null;
}

type RequestOptions = {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  /** Absolute base override (webhook registration uses the account host). */
  baseUrl?: string;
  headers?: Record<string, string>;
};

/**
 * Authenticated Eshopbox request.
 *
 * Retries exactly once on a 401: an access token can be revoked server-side
 * before our cached expiry, and re-minting is the documented recovery. Any
 * other failure throws an EshopboxError carrying their message, which the
 * callers surface to sellers verbatim ("pincode not serviceable" is far more
 * useful than "booking failed").
 */
export async function eshopboxRequest<T>(options: RequestOptions): Promise<T> {
  const base = options.baseUrl ?? WMS_BASE;
  const url = new URL(options.path, base);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(key, value);
  }

  const send = async (token: string) =>
    fetch(url, {
      method: options.method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
    });

  let res = await send(await getAccessToken());

  if (res.status === 401) {
    invalidateToken();
    res = await send(await getAccessToken());
  }

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!res.ok) {
    throw new EshopboxError(extractMessage(parsed, res.status), res.status, parsed);
  }
  return parsed as T;
}

/** Pulls the human-readable message out of Eshopbox's error envelope. */
function extractMessage(body: unknown, status: number): string {
  if (body && typeof body === "object" && "error" in body) {
    const error = (body as { error?: { message?: string } }).error;
    if (error?.message) return error.message;
  }
  if (typeof body === "string" && body.trim()) return body.slice(0, 300);
  return `Eshopbox request failed (${status}).`;
}
