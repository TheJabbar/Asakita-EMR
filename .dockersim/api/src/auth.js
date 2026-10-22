// ponytail: scrypt stdlib (no bcrypt dep) + HMAC JWT (no jose dep) + Google RS256 verify (no oauth dep)
import { scryptSync, randomBytes, timingSafeEqual, createHmac, createVerify, createPublicKey } from "node:crypto";
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

let _gcerts = null, _gcertsAt = 0;
export async function verifyGoogleIdToken(idToken) { // real Google verification, stdlib only; null = reject
  const cid = process.env.GOOGLE_CLIENT_ID;
  if (!cid) return null; // fail closed — set GOOGLE_CLIENT_ID to enable
  try {
    const [h, p, s] = String(idToken || "").split(".");
    if (!h || !p || !s) return null;
    const { kid } = JSON.parse(Buffer.from(h, "base64url").toString());
    if (!kid) return null;
    if (!_gcerts || Date.now() - _gcertsAt > 3600e3) {
      const r = await fetch("https://www.googleapis.com/oauth2/v3/certs");
      if (!r.ok) return null;
      _gcerts = await r.json(); _gcertsAt = Date.now();
    }
    const jwk = (_gcerts.keys || []).find((k) => k.kid === kid);
    if (!jwk) { _gcerts = null; return null; } // unknown kid (key rotated) → refetch next time
    const sigOk = createVerify("RSA-SHA256").update(`${h}.${p}`)
      .verify(createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(s, "base64url"));
    if (!sigOk) return null;
    const g = JSON.parse(Buffer.from(p, "base64url").toString());
    if (g.iss !== "accounts.google.com" && g.iss !== "https://accounts.google.com") return null;
    if (g.aud !== cid || (g.exp || 0) * 1000 < Date.now() || !g.email || g.email_verified === false) return null;
    return g; // {sub, email, name}
  } catch { return null; }
}
