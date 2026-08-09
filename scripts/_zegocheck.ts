import { createDecipheriv } from "node:crypto";

// Round-trip the generator against a known secret to prove the packing is
// byte-correct: decode the envelope, decrypt, and read the payload back.
process.env.NEXT_PUBLIC_ZEGO_APP_ID = "1234567890";
process.env.ZEGO_SERVER_SECRET = "abcdef0123456789abcdef0123456789"; // 32 chars

async function main() {
  const { generateZegoToken } = await import("../src/lib/zego/token");
  const token = generateZegoToken({
    userId: "user_abc",
    roomId: "stream_xyz",
    canPublish: false,
  });

  console.log("prefix:", token.slice(0, 2));
  const raw = Buffer.from(token.slice(2), "base64");
  const expire = raw.readBigInt64BE(0);
  const ivLen = raw.readUInt16BE(8);
  const iv = raw.subarray(10, 10 + ivLen).toString();
  const cipherLen = raw.readUInt16BE(10 + ivLen);
  const cipher = raw.subarray(12 + ivLen, 12 + ivLen + cipherLen);

  console.log("ivLen:", ivLen, "cipherLen:", cipherLen);
  console.log("expire in ~s:", Number(expire) - Math.floor(Date.now() / 1000));

  const d = createDecipheriv("aes-256-cbc", process.env.ZEGO_SERVER_SECRET!, iv);
  const plain = Buffer.concat([d.update(cipher), d.final()]).toString();
  const info = JSON.parse(plain);
  console.log("app_id:", info.app_id, "user_id:", info.user_id);
  console.log("payload:", info.payload);
  const pl = JSON.parse(info.payload);
  console.log("room:", pl.room_id, "login:", pl.privilege["1"], "publish:", pl.privilege["2"]);

  const pub = generateZegoToken({ userId: "u", roomId: "r", canPublish: true });
  const praw = Buffer.from(pub.slice(2), "base64");
  const pivLen = praw.readUInt16BE(8);
  const piv = praw.subarray(10, 10 + pivLen).toString();
  const pclen = praw.readUInt16BE(10 + pivLen);
  const pc = praw.subarray(12 + pivLen, 12 + pivLen + pclen);
  const pd = createDecipheriv("aes-256-cbc", process.env.ZEGO_SERVER_SECRET!, piv);
  const ppl = JSON.parse(JSON.parse(Buffer.concat([pd.update(pc), pd.final()]).toString()).payload);
  console.log("broadcaster publish privilege:", ppl.privilege["2"]);
}
main().catch((e) => { console.error(e); process.exit(1); });
