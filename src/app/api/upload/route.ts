import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, isSeller } from "@/lib/current-user";

// Client downscales to ~960px JPEG before upload; 3MB is generous headroom.
const MAX_BYTES = 3 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * POST /api/upload — seller-only image upload (stream thumbnails).
 * Stores to /public/uploads on local disk (persistent on the self-managed
 * VPS this app deploys to). Extension derives from the MIME type, never the
 * client filename; names are random so nothing is guessable/overwritable.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !user.isActive || !isSeller(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const ext = EXT_BY_MIME[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "Only JPEG, PNG, or WebP images are allowed." },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Image too large (max 3MB)." },
      { status: 413 },
    );
  }

  const name = `${randomBytes(12).toString("hex")}.${ext}`;
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));

  return NextResponse.json({ url: `/uploads/${name}` });
}
