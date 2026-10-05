// ponytail: scrypt stdlib (no bcrypt dep) + HMAC JWT (no jose dep)
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from "node:crypto";
const SECRET = () => process.env.JWT_SECRET || "dev-secret-change-me";

export function hashPassword(pw) {
  const salt = randomBytes(16).toString("hex");
  const h = scryptSync(pw, salt, 32).toString("hex");
  return `scrypt:${salt}:${h}`;
}
export function verifyPassword(pw, stored) {
  try {
    const [, salt, h] = String(stored).split(":");
    const v = scryptSync(pw, salt, 32);
    const e = Buffer.from(h, "hex");
    return v.length === e.length && timingSafeEqual(v, e);
  } catch { return false; }
}
function b64(o) { return Buffer.from(JSON.stringify(o)).toString("base64url"); }
export function signToken(payload, expSec = 7 * 86400) {
  const h = { alg: "HS256", typ: "JWT" };
  const p = { ...payload, exp: Math.floor(Date.now() / 1000) + expSec };
  const data = `${b64(h)}.${b64(p)}`;
  return `${data}.${createHmac("sha256", SECRET()).update(data).digest("base64url")}`;
}
export function verifyToken(tok) {
  const [h, p, s] = String(tok || "").split(".");
  if (!h || !p || !s) return null;
  const data = `${h}.${p}`;
  const good = createHmac("sha256", SECRET()).update(data).digest("base64url");
  const a = Buffer.from(s), b = Buffer.from(good);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const payload = JSON.parse(Buffer.from(p, "base64url").toString());
  if (payload.exp < Date.now() / 1000) return null;
  return payload;
}
export function getUser(c, dbRow) { return dbRow; } // placeholder for Workers swap
