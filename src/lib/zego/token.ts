// NOTE: no "server-only" guard so standalone scripts can verify config, but
// this module holds ZEGO_SERVER_SECRET — never import it from a client
// component.
import { createCipheriv } from "node:crypto";

/**
 * ZEGOCLOUD token04 generation.
 *
 * A faithful port of ZEGO's official Node reference implementation
 * (github.com/ZEGOCLOUD/zego_server_assistant, token/nodejs). The format is
 * theirs, so it is reproduced exactly rather than "improved":
 *
 *   token = "04" + base64( int64 expiry
 *                        | uint16 ivLen | iv
 *                        | uint16 cipherLen | AES-CBC(payload JSON) )
 *
 * The cipher is AES-CBC with PKCS#5 padding, keyed on the 32-byte
 * ServerSecret, with a random 16-char IV. Tokens are minted server-side only:
 * shipping ServerSecret to the browser would let anyone publish to any room.
 */

const APP_ID = Number(process.env.NEXT_PUBLIC_ZEGO_APP_ID ?? 0);
const SERVER_SECRET = process.env.ZEGO_SERVER_SECRET ?? "";

/** Privilege keys, per ZEGO's RtcRoomPayLoad spec. */
const PRIVILEGE_LOGIN = 1;
const PRIVILEGE_PUBLISH = 2;

export function zegoConfigured(): boolean {
  return APP_ID > 0 && SERVER_SECRET.length === 32;
}

/** Human-readable reason the premium backend can't be used, or null. */
export function zegoConfigError(): string | null {
  if (!APP_ID) return "NEXT_PUBLIC_ZEGO_APP_ID is not set.";
  if (!SERVER_SECRET) return "ZEGO_SERVER_SECRET is not set.";
  if (SERVER_SECRET.length !== 32) {
    return "ZEGO_SERVER_SECRET must be exactly 32 characters.";
  }
  return null;
}

/** Random int32, as their reference does. */
function makeNonce(): number {
  return Math.ceil((-2147483648 + 4294967295) * Math.random());
}

/** Random 16-character IV. */
function makeRandomIv(): string {
  const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
  let out = "";
  for (let i = 0; i < 16; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

/** Key length picks the AES variant — 16/24/32 bytes only. */
function algorithmFor(key: string): string {
  switch (Buffer.from(key).length) {
    case 16:
      return "aes-128-cbc";
    case 24:
      return "aes-192-cbc";
    case 32:
      return "aes-256-cbc";
    default:
      throw new Error(`Invalid ZEGO secret length: ${Buffer.from(key).length}`);
  }
}

function aesEncrypt(plainText: string, key: string, iv: string): Buffer {
  const cipher = createCipheriv(algorithmFor(key), key, iv);
  cipher.setAutoPadding(true);
  return Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
}

export type ZegoTokenOptions = {
  userId: string;
  roomId: string;
  /** Broadcasters publish; viewers only subscribe. */
  canPublish: boolean;
  /** Seconds. Kept short-ish — the client re-mints on reconnect. */
  effectiveSeconds?: number;
};

/**
 * Mints a room-scoped token.
 *
 * Viewers get login-only privilege, which is what stops a viewer from
 * publishing video into someone else's shopping stream.
 */
export function generateZegoToken(options: ZegoTokenOptions): string {
  const error = zegoConfigError();
  if (error) throw new Error(error);

  const effectiveSeconds = options.effectiveSeconds ?? 3600;
  const createTime = Math.floor(Date.now() / 1000);

  const payload = JSON.stringify({
    room_id: options.roomId,
    privilege: {
      [PRIVILEGE_LOGIN]: 1,
      [PRIVILEGE_PUBLISH]: options.canPublish ? 1 : 0,
    },
    stream_id_list: null,
  });

  const tokenInfo = {
    app_id: APP_ID,
    user_id: options.userId,
    nonce: makeNonce(),
    ctime: createTime,
    expire: createTime + effectiveSeconds,
    payload,
  };

  const iv = makeRandomIv();
  const encrypted = aesEncrypt(JSON.stringify(tokenInfo), SERVER_SECRET, iv);

  // Big-endian headers, exactly as their reference packs them.
  const expiryBuf = Buffer.alloc(8);
  expiryBuf.writeBigInt64BE(BigInt(tokenInfo.expire), 0);
  const ivLenBuf = Buffer.alloc(2);
  ivLenBuf.writeUInt16BE(iv.length, 0);
  const cipherLenBuf = Buffer.alloc(2);
  cipherLenBuf.writeUInt16BE(encrypted.byteLength, 0);

  const packed = Buffer.concat([
    expiryBuf,
    ivLenBuf,
    Buffer.from(iv),
    cipherLenBuf,
    encrypted,
  ]);

  return "04" + packed.toString("base64");
}

export const ZEGO_APP_ID = APP_ID;
