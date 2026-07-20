import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, isSeller } from "@/lib/current-user";
import {
  IMAGEKIT_FOLDERS,
  IMAGEKIT_PUBLIC_KEY,
  IMAGEKIT_URL_ENDPOINT,
  imagekitConfigured,
  mintUploadAuth,
  type ImagekitFolderKind,
} from "@/lib/imagekit";

/**
 * GET /api/imagekit-auth?kind=avatar|thumbnail
 *
 * Mints short-lived upload credentials for direct-to-ImageKit client uploads.
 * The server decides the destination folder from `kind` + the caller's
 * identity — the client never chooses paths. Thumbnails are seller-only.
 */
export async function GET(req: NextRequest) {
  if (!imagekitConfigured()) {
    return NextResponse.json(
      { error: "Image uploads are not configured.", configured: false },
      { status: 503 },
    );
  }

  const user = await getCurrentUser();
  if (!user || !user.isActive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const kind = (req.nextUrl.searchParams.get("kind") ?? "") as ImagekitFolderKind;
  if (!(kind in IMAGEKIT_FOLDERS)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }
  if (kind !== "avatar" && !isSeller(user)) {
    return NextResponse.json({ error: "Sellers only" }, { status: 403 });
  }

  const auth = mintUploadAuth();
  return NextResponse.json({
    configured: true,
    ...auth,
    publicKey: IMAGEKIT_PUBLIC_KEY,
    urlEndpoint: IMAGEKIT_URL_ENDPOINT,
    folder: IMAGEKIT_FOLDERS[kind](user.id),
  });
}
