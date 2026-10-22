// ponytail: shared auth guards + helpers — one copy, used by index.js and the feature routers
import { getCookie } from "hono/cookie";
import { row, rows, run, uid } from "./db.js";
import { verifyToken } from "./auth.js";

export const err = (c, code, message, s = 400) => c.json({ error: { code, message } }, s);

export const audit = (actor, action, entity, id, meta = {}) =>
  run("INSERT INTO audit_logs(id,actor_id,action,entity,entity_id,at,meta) VALUES(?,?,?,?,?,?,?)",
    uid("au"), actor || "-", action, entity, id || "-", new Date().toISOString(), JSON.stringify(meta));

// ponytail: staff vs portal cookies so EMR+portal stay logged in side-by-side (same host, different ports/hosts)
export const PORTAL_ORIGINS = (process.env.PORTAL_ORIGINS || "http://localhost:5174").split(",").map((s) => s.trim());

// ponytail: which app is calling? EMR and portal share one origin in production (same host, two paths),
// so the cookie must be picked by an explicit header — the Origin header can't tell them apart there.
export function appKind(c) {
  const h = (c.req.header("x-asakita-app") || "").toLowerCase();
  if (h === "portal" || h === "emr") return h;
  return PORTAL_ORIGINS.includes(c.req.header("origin") || "") ? "portal" : "emr";
}

export async function me(c) {
  const staff = getCookie(c, "asakita") || (c.req.header("authorization") || "").replace("Bearer ", "");
  const portal = getCookie(c, "asakita_portal");
  const p = verifyToken(appKind(c) === "portal" ? (portal || staff) : (staff || portal));
  if (!p) return null;
  return row("SELECT id,name,email,role,status FROM users WHERE id=?", p.sub) || null;
}

export const need = (...roles) => async (c, next) => {
  const u = await me(c);
  if (!u) return err(c, "unauthorized", "login required", 401);
  if (!roles.includes(u.role)) return err(c, "forbidden", "insufficient role", 403);
  c.set("user", u);
  await next();
};

export const STAFF = ["owner", "dokter", "terapis", "admin"];

export function parentChildIds(userId) {
  const p = row("SELECT id FROM parents WHERE user_id=?", userId);
  if (!p) return [];
  return rows("SELECT child_id FROM parent_children WHERE parent_id=?", p.id).map((r) => r.child_id);
}

export async function needOwnChild(c, next) {
  const u = c.get("user");
  const id = c.req.param("id") || c.req.query("childId");
  if (id && !parentChildIds(u.id).includes(id)) return err(c, "not_found", "not found", 404);
  await next();
}
