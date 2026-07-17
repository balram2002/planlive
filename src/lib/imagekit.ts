// NOTE: no "server-only" guard — importable from route handlers and actions.
// Never import from a client component (private key).
import crypto from "node:crypto";

const PRIVATE_KEY = process.env.IMAGEKIT_PRIVATE_KEY;

export const IMAGEKIT_PUBLIC_KEY = process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY ?? "";
export const IMAGEKIT_URL_ENDPOINT =
  process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT ?? "";

export function imagekitConfigured(): boolean {
  return Boolean(PRIVATE_KEY && IMAGEKIT_PUBLIC_KEY && IMAGEKIT_URL_ENDPOINT);
}

/**
 * Client-side ImageKit uploads authenticate with a short-lived signature the
 * server mints: signature = HMAC-SHA1(privateKey, token + expire).
 */
export function mintUploadAuth(): {
  token: string;
  expire: number;
  signature: string;
} {
  if (!PRIVATE_KEY) throw new Error("ImageKit is not configured");
  const token = crypto.randomUUID();
  const expire = Math.floor(Date.now() / 1000) + 10 * 60; // must be < now + 1h
  const signature = crypto
    .createHmac("sha1", PRIVATE_KEY)
    .update(token + expire)
    .digest("hex");
  return { token, expire, signature };
}

/** Allowed upload folders — the server dictates structure, never the client. */
export const IMAGEKIT_FOLDERS = {
  avatar: (userId: string) => `/liveshop/avatars/${userId}`,
  thumbnail: (sellerId: string) => `/liveshop/thumbnails/${sellerId}`,
  category: () => `/liveshop/categories`,
} as const;

export type ImagekitFolderKind = keyof typeof IMAGEKIT_FOLDERS;
