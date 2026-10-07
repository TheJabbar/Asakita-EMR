import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { serve } from "@hono/node-server";
import { mkdirSync, writeFileSync, readFileSync, appendFileSync, existsSync, statSync } from "node:fs";
import { basename, join, extname } from "node:path";
import { getDb, migrate, uid, rows, row, run, dbPath } from "./db.js";
import { hashPassword, verifyPassword, signToken, verifyToken, verifyGoogleIdToken } from "./auth.js";
import { log } from "./log.js";

migrate();
const app = new Hono();
const UP = process.env.UPLOADS_DIR || "./data/uploads";
mkdirSync(UP, { recursive: true });

// ponytail: one-line access log — /api/* at info, pages/assets at debug, 5xx at error. Never logs bodies/tokens.
app.use("*", async (c, next) => {
  const t = Date.now();
  await next();
  const ms = Date.now() - t;
  const line = `${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms`;
  if (c.res.status >= 500) log.error(line);
  else if (c.req.path.startsWith("/api/")) log.info(line);
  else log.debug(line);
});

// --- security headers + CORS (never * with credentials; reflect allowlisted origin) ---
// ponytail: comma-separated allowlist so EMR (:5173) + portal (:5174) both work in dev
const ORIGINS = (process.env.FRONTEND_ORIGINS || process.env.FRONTEND_ORIGIN || "http://localhost:5173,http://localhost:5174").split(",").map((s) => s.trim());
// ponytail: which origins count as "portal" for cookie choice (prod: set PORTAL_ORIGINS=https://portal.asakita.id)
const PORTAL_ORIGINS = (process.env.PORTAL_ORIGINS || "http://localhost:5174").split(",").map((s) => s.trim());
app.use("*", async (c, next) => {
  await next();
  // ponytail: frontends inject all CSS via a JS-created <style> tag + load Google Fonts, so inline styles + font hosts must be allowed (scripts stay 'self'-only)
  c.header("content-security-policy", "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' https://accounts.google.com; frame-src 'self' https://accounts.google.com; connect-src 'self' https://accounts.google.com");
  c.header("x-frame-options", "DENY");
  c.header("x-content-type-options", "nosniff");
  const reqOrigin = c.req.header("origin") || "";
  c.header("Access-Control-Allow-Origin", ORIGINS.includes(reqOrigin) ? reqOrigin : ORIGINS[0]);
  c.header("Access-Control-Allow-Credentials", "true");
  c.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  c.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
});
app.on("OPTIONS", "*", (c) => c.body(null, 204)); // 204 must carry null body or undici throws

// --- helpers ---
const err = (c, code, message, s = 400) => c.json({ error: { code, message } }, s);
const audit = (actor, action, entity, id, meta = {}) =>
  run("INSERT INTO audit_logs(id,actor_id,action,entity,entity_id,at,meta) VALUES(?,?,?,?,?,?,?)",
    uid("au"), actor || "-", action, entity, id || "-", new Date().toISOString(), JSON.stringify(meta));
async function me(c) {
  // ponytail: separate staff vs portal cookies so EMR+portal stay logged in side-by-side (same host, different ports/hosts)
  const staff = getCookie(c, "asakita") || (c.req.header("authorization") || "").replace("Bearer ", "");
  const portal = getCookie(c, "asakita_portal");
  const isPortal = PORTAL_ORIGINS.includes(c.req.header("origin") || "");
  const p = verifyToken(isPortal ? (portal || staff) : (staff || portal));
  if (!p) return null;
  return row("SELECT id,name,email,role,status FROM users WHERE id=?", p.sub) || null;
}
function setSession(c, user) { // cookie follows the calling app (via Origin), never clobbers the other app
  const isPortal = PORTAL_ORIGINS.includes(c.req.header("origin") || "");
  // ponytail: COOKIE_CROSS_SITE=1 for https tunnels (codespaces/vscode forwarding); localhost stays Lax
  const cross = process.env.COOKIE_CROSS_SITE === "1" ? { sameSite: "None", secure: true } : {};
  setCookie(c, isPortal ? "asakita_portal" : "asakita", signToken({ sub: user.id, role: user.role }), { httpOnly: true, path: "/", maxAge: 7 * 86400, ...cross });
}
const need = (...roles) => async (c, next) => {
  const u = await me(c);
  if (!u) return err(c, "unauthorized", "login required", 401);
  if (!roles.includes(u.role)) return err(c, "forbidden", "insufficient role", 403);
  c.set("user", u);
  await next();
};
const STAFF = ["owner", "dokter", "terapis", "admin"];
function parentChildIds(userId) {
  const p = row("SELECT id FROM parents WHERE user_id=?", userId);
  if (!p) return [];
  return rows("SELECT child_id FROM parent_children WHERE parent_id=?", p.id).map((r) => r.child_id);
}
async function needOwnChild(c, next) {
  const u = c.get("user");
  const id = c.req.param("id") || c.req.query("childId");
  if (id && !parentChildIds(u.id).includes(id)) return err(c, "not_found", "not found", 404);
  await next();
}
const bodyLimit = async (c, next) => { // ponytail: 1MB cap, 400 on abuse
  const len = Number(c.req.header("content-length") || 0);
  if (len > 1_000_000) return err(c, "too_large", "body too large", 400);
  await next();
};

// rate-limit login: 20 tries per 60s window → 429 (window decays so users can't lock forever)
const bucket = new Map();
app.use("/api/auth/login", async (c, next) => {
  if (process.env.NODE_ENV === "test" && c.req.header("x-test-nolimit")) return next();
  const ip = c.req.header("x-forwarded-for") || "local";
  const now = Date.now();
  let b = bucket.get(ip);
  if (!b || now > b.reset) b = { n: 0, reset: now + 60000 };
  b.n += 1;
  bucket.set(ip, b);
  if (b.n > 20) return err(c, "rate_limited", "terlalu banyak percobaan, tunggu 1 menit", 429);
  await next();
});

// --- auth ---
app.get("/api/healthz", (c) => c.json({ ok: true }));
app.post("/api/auth/login", bodyLimit, async (c) => {
  const { email, password } = await c.req.json().catch(() => ({}));
  const u = row("SELECT * FROM users WHERE email=?", String(email || "").slice(0, 200));
  if (!u || !verifyPassword(String(password || ""), u.password_hash || "")) return err(c, "invalid", "email/password salah", 401);
  setSession(c, u);
  return c.json({ user: { id: u.id, name: u.name, email: u.email, role: u.role } });
});
app.get("/api/config", (c) => c.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || null })); // frontends read this, no rebuild needed
app.post("/api/auth/google", bodyLimit, async (c) => {
  const { idToken } = await c.req.json().catch(() => ({}));
  if (!idToken) return err(c, "invalid", "idToken wajib", 400);
  const g = await verifyGoogleIdToken(idToken);
  if (!g) return err(c, "invalid", "token Google tidak valid", 401);
  let u = row("SELECT * FROM users WHERE google_sub=?", g.sub) || row("SELECT * FROM users WHERE email=?", g.email);
  if (u && !u.google_sub) run("UPDATE users SET google_sub=? WHERE id=?", g.sub, u.id); // link staff accounts too
  if (!u) { // self-register as parent (portal flow); staff accounts must pre-exist to keep their role
    const id = uid("u");
    run("INSERT INTO users(id,name,email,google_sub,role,created_at) VALUES(?,?,?,?,?,?)", id, g.name || g.email, g.email, g.sub, "parent", new Date().toISOString());
    run("INSERT INTO parents(id,user_id) VALUES(?,?)", uid("p"), id);
    u = row("SELECT * FROM users WHERE id=?", id);
  }
  setSession(c, u);
  return c.json({ user: { id: u.id, name: u.name, email: u.email, role: u.role } });
});
app.post("/api/auth/register-parent", bodyLimit, async (c) => {
  const { name, email, password } = await c.req.json().catch(() => ({}));
  if (!email?.includes("@") || !password || password.length < 6) return err(c, "invalid", "nama/email/password(≥6) wajib", 400);
  if (row("SELECT id FROM users WHERE email=?", email)) return err(c, "exists", "email terdaftar", 409);
  const id = uid("u");
  run("INSERT INTO users(id,name,email,password_hash,role,created_at) VALUES(?,?,?,?,?,?)", id, name || email, email, hashPassword(password), "parent", new Date().toISOString());
  run("INSERT INTO parents(id,user_id) VALUES(?,?)", uid("p"), id);
  return c.json({ ok: true }, 201);
});
app.post("/api/auth/forgot", bodyLimit, async (c) => {
  const { email } = await c.req.json().catch(() => ({})); // never enumerate
  run("INSERT INTO password_resets(email,token,at) VALUES(?,?,?)", email || "-", uid("t"), new Date().toISOString());
  return c.json({ ok: true });
});
app.post("/api/auth/logout", (c) => {
  const origin = c.req.header("origin") || "";
  if (!origin) { deleteCookie(c, "asakita", { path: "/" }); deleteCookie(c, "asakita_portal", { path: "/" }); }
  else deleteCookie(c, PORTAL_ORIGINS.includes(origin) ? "asakita_portal" : "asakita", { path: "/" });
  return c.json({ ok: true });
});
app.get("/api/me", async (c) => { const u = await me(c); return u ? c.json({ user: u }) : err(c, "unauthorized", "login", 401); });

// --- dashboard + search (staff) ---
app.get("/api/dashboard/summary", need(...STAFF), (c) => {
  const t = new Date().toISOString().slice(0, 10);
  const total = row("SELECT COUNT(*) c FROM children").c;
  const today = rows("SELECT a.*,ch.full_name FROM appointments a LEFT JOIN children ch ON ch.id=a.child_id WHERE date(starts_at)=date(?)", t + "T00:00");
  return c.json({
    totalPatients: total, monthlyNew: total, todayCount: today.length,
    waitingCount: today.filter((a) => ["waiting", "scheduled"].includes(a.status)).length,
    therapyDone: row("SELECT COUNT(*) c FROM therapy_sessions WHERE date=?", t)?.c ?? 0,
    drafts: row("SELECT COUNT(*) c FROM visits WHERE status='draft'")?.c ?? 0,
    followUp: row("SELECT COUNT(*) c FROM appointments WHERE date(starts_at)>=date(?) AND status IN ('scheduled','confirmed','waiting')", t + "T00:00")?.c ?? 0,
    todayTimeline: today,
    monthlyChart: [45, 58, 66, 75, 83, 92],
  });
});
app.get("/api/search", need(...STAFF), (c) => {
  const q = `%${(c.req.query("q") || "").slice(0, 50)}%`;
  return c.json({
    patients: rows("SELECT id,mr_number,full_name FROM children WHERE full_name LIKE ? OR mr_number LIKE ? LIMIT 10", q, q),
    appointments: rows("SELECT id,type,status,starts_at FROM appointments WHERE type LIKE ? LIMIT 10", q),
  });
});

// --- patients ---
// ponytail: parent names inlined per child (one query, no N+1) — powers the Ortu column
const PARENTS_OF = `(SELECT group_concat(u.name || ' (' || COALESCE(pc.relation,'') || ')', ', ') FROM parent_children pc JOIN parents p ON p.id=pc.parent_id JOIN users u ON u.id=p.user_id WHERE pc.child_id=children.id)`;
app.get("/api/patients", need(...STAFF), (c) =>
  c.json({ data: rows(`SELECT children.*, ${PARENTS_OF} AS parent_names FROM children ORDER BY full_name LIMIT 100`), total: row("SELECT COUNT(*) c FROM children").c }));
app.post("/api/patients", need("owner", "dokter", "admin"), bodyLimit, async (c) => {
  const b = await c.req.json();
  if (!b.full_name) return err(c, "invalid", "full_name wajib", 400);
  const id = uid("c");
  run("INSERT INTO children(id,mr_number,full_name,nickname,dob,gender,blood_type,birth_weight_kg,birth_length_cm,address,insurance) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    id, b.mr_number || ("MR" + Date.now().toString().slice(-6)), b.full_name, b.nickname || "", b.dob || "", b.gender || "", b.blood_type || "", b.birth_weight_kg || null, b.birth_length_cm || null, b.address || "", b.insurance || "Pribadi");
  if (b.birth_history || b.allergies) run("INSERT OR REPLACE INTO medical_history(child_id,birth_history,allergies,notes) VALUES(?,?,?,?)", id, b.birth_history || "", b.allergies || "", b.notes || "");
  audit(c.get("user").id, "create", "child", id);
  return c.json({ id }, 201);
});
app.get("/api/patients/:id", need(...STAFF), (c) => {
  const ch = row("SELECT * FROM children WHERE id=?", c.req.param("id"));
  if (!ch) return err(c, "not_found", "pasien tidak ada", 404);
  return c.json({ ...ch, history: row("SELECT * FROM medical_history WHERE child_id=?", ch.id) || {}, documents: rows("SELECT * FROM documents WHERE child_id=?", ch.id), parents: rows("SELECT u.name, u.email, pc.relation FROM parent_children pc JOIN parents p ON p.id=pc.parent_id JOIN users u ON u.id=p.user_id WHERE pc.child_id=?", ch.id) });
});
const CHILD_FIELDS = ["full_name", "nickname", "dob", "gender", "blood_type", "birth_weight_kg", "birth_length_cm", "address", "insurance", "mr_number"];
const BLOOD_TYPES = ["A", "B", "AB", "O"];
const GENDERS = ["Laki-laki", "Perempuan"];
function childFieldError(f, v) { // ponytail: single validator — server is the trust boundary, form mirrors it
  if (f === "full_name" && !v) return "nama lengkap wajib";
  if (f === "mr_number" && !/^[A-Za-z0-9-]{1,20}$/.test(v || "")) return "No. RM hanya huruf/angka/- (maks 20)";
  if (f === "dob" && v) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "tgl lahir format YYYY-MM-DD";
    const [y, m, d] = v.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return "tgl lahir tidak valid";
    if (v > new Date().toISOString().slice(0, 10)) return "tgl lahir tidak boleh masa depan";
  }
  if (f === "gender" && v && !GENDERS.includes(v)) return "jenis kelamin: Laki-laki/Perempuan";
  if (f === "blood_type" && v && !BLOOD_TYPES.includes(v)) return "gol. darah: A/B/AB/O";
  if ((f === "birth_weight_kg" || f === "birth_length_cm") && v !== null && v !== "") {
    const n = Number(String(v).replace(",", ".")); // tolerate ID decimal comma
    if (Number.isNaN(n)) return (f === "birth_weight_kg" ? "BB" : "PB") + " lahir harus angka";
    if (f === "birth_weight_kg" && (n < 0.3 || n > 10)) return "BB lahir 0,3–10 kg";
    if (f === "birth_length_cm" && (n < 20 || n > 70)) return "PB lahir 20–70 cm";
    return n; // normalized number out (not an error)
  }
  if (f === "nickname" && String(v || "").length > 50) return "panggilan maks 50 karakter";
  if (f === "address" && String(v || "").length > 200) return "alamat maks 200 karakter";
  if (f === "insurance" && String(v || "").length > 50) return "asuransi maks 50 karakter";
  return null;
}
app.put("/api/patients/:id", need("owner", "dokter", "admin"), bodyLimit, async (c) => {
  const b = await c.req.json(); const id = c.req.param("id");
  if (!row("SELECT id FROM children WHERE id=?", id)) return err(c, "not_found", "pasien tidak ada", 404);
  if (b.mr_number && row("SELECT id FROM children WHERE mr_number=? AND id!=?", String(b.mr_number).trim(), id)) return err(c, "exists", "No. RM sudah dipakai", 409);
  const sets = [], vals = []; // ponytail: allowlist-built SET — only provided keys update, no mass assignment
  for (const f of CHILD_FIELDS) {
    if (b[f] === undefined) continue;
    let v = typeof b[f] === "string" ? b[f].trim() : b[f];
    if ((f === "birth_weight_kg" || f === "birth_length_cm") && (v === "" || v === null)) v = null;
    const bad = childFieldError(f, v);
    if (typeof bad === "string") return err(c, "invalid", bad, 400);
    if (typeof bad === "number") v = bad;
    sets.push(`${f}=?`); vals.push(v);
  }
  if (!sets.length) return err(c, "invalid", "tidak ada perubahan", 400);
  vals.push(id);
  run(`UPDATE children SET ${sets.join(",")} WHERE id=?`, ...vals);
  return c.json({ ok: true });
});
// upload: pdf/jpg/png ≤10MB, basename-sanitized
app.post("/api/patients/:id/documents", need("owner", "dokter", "admin"), async (c) => {
  const id = c.req.param("id");
  const fd = await c.req.parseBody();
  const f = fd.file;
  if (!f || typeof f === "string") return err(c, "invalid", "file wajib", 400);
  const name = basename(f.name || "doc").replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!/\.(pdf|jpg|jpeg|png)$/i.test(name)) return err(c, "invalid", "hanya pdf/jpg/png", 400);
  const buf = new Uint8Array(await f.arrayBuffer());
  if (buf.length > 10 * 1024 * 1024) return err(c, "too_large", "maks 10MB", 400);
  const fn = `${Date.now()}_${name}`;
  writeFileSync(join(UP, fn), buf);
  const did = uid("d");
  run("INSERT INTO documents(id,child_id,kind,title,file_url,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?)", did, id, String(fd.kind || "dokumen"), String(fd.title || name), `/uploads/${fn}`, c.get("user").id, new Date().toISOString());
  return c.json({ id: did, file_url: `/uploads/${fn}` }, 201);
});

// --- appointments ---
app.get("/api/appointments", need(...STAFF), (c) => {
  const { from, to, childId } = c.req.query();
  let sql = "SELECT a.*,ch.full_name FROM appointments a LEFT JOIN children ch ON ch.id=a.child_id WHERE 1=1";
  const p = [];
  if (from) { sql += " AND date(starts_at)>=date(?)"; p.push(from); }
  if (to) { sql += " AND date(starts_at)<=date(?)"; p.push(to); }
  if (childId) { sql += " AND child_id=?"; p.push(childId); }
  return c.json({ data: rows(sql + " ORDER BY starts_at", ...p) });
});
app.post("/api/appointments", need("owner", "dokter", "admin", "terapis"), bodyLimit, async (c) => {
  const b = await c.req.json();
  if (!b.child_id || !b.starts_at) return err(c, "invalid", "child_id + starts_at wajib", 400);
  const id = uid("a");
  run("INSERT INTO appointments(id,child_id,type,room,staff_id,starts_at,ends_at,status) VALUES(?,?,?,?,?,?,?,?)",
    id, b.child_id, b.type || "Konsultasi", b.room || "-", c.get("user").id, b.starts_at, b.ends_at || b.starts_at, "scheduled");
  return c.json({ id }, 201);
});
app.patch("/api/appointments/:id/status", need(...STAFF), bodyLimit, async (c) => {
  const { status } = await c.req.json();
  const cur = row("SELECT status FROM appointments WHERE id=?", c.req.param("id"));
  if (!cur) return err(c, "not_found", "jadwal tidak ada", 404);
  const NEXT = { scheduled: ["confirmed", "cancelled"], confirmed: ["waiting", "in_progress", "cancelled"], waiting: ["in_progress", "cancelled"], in_progress: ["done", "cancelled"], done: [], cancelled: [] };
  if (NEXT[cur.status] && !NEXT[cur.status].includes(status)) return err(c, "invalid", `transisi ${cur.status}→${status} ditolak`, 400);
  run("UPDATE appointments SET status=? WHERE id=?", status, c.req.param("id"));
  return c.json({ ok: true });
});

// --- visits + SOAP (terapis read-only, admin blocked from write) ---
app.get("/api/visits", need(...STAFF), (c) => {
  const { childId } = c.req.query();
  let sql = "SELECT v.*, CASE WHEN s.visit_id IS NULL THEN 0 ELSE 1 END has_soap FROM visits v LEFT JOIN soap_notes s ON s.visit_id=v.id WHERE 1=1";
  const p = [];
  if (childId) { sql += " AND v.child_id=?"; p.push(childId); }
  return c.json({ data: rows(sql + " ORDER BY v.date DESC LIMIT 50", ...p) });
});app.post("/api/visits", need("owner", "dokter"), bodyLimit, async (c) => {
  const b = await c.req.json();
  const id = uid("v");
  run("INSERT INTO visits(id,child_id,appointment_id,date,visit_type,status) VALUES(?,?,?,?,?,?)", id, b.child_id, b.appointment_id || null, b.date || new Date().toISOString().slice(0, 10), b.visit_type || "Konsultasi", "draft");
  return c.json({ id }, 201);
});
app.put("/api/visits/:id/soap", need("owner", "dokter"), bodyLimit, async (c) => {  const v = row("SELECT * FROM visits WHERE id=?", c.req.param("id"));
  if (!v) return err(c, "not_found", "visit tidak ada", 404);
  if (v.status === "final") return err(c, "locked", "SOAP final tidak bisa diubah", 409);
  const b = await c.req.json();
  run("INSERT OR REPLACE INTO soap_notes(visit_id,subjective,objective,assessment,plan,created_by,updated_at) VALUES(?,?,?,?,?,?,?)",
    v.id, b.subjective || "", b.objective || "", b.assessment || "", b.plan || "", c.get("user").id, new Date().toISOString());
  if (b.status === "final") run("UPDATE visits SET status='final' WHERE id=?", v.id);
  audit(c.get("user").id, b.status === "final" ? "soap_finalize" : "soap_draft", "visit", v.id);
  return c.json({ ok: true });
});
app.get("/api/visits/:id", need(...STAFF), (c) => {
  const v = row("SELECT * FROM visits WHERE id=?", c.req.param("id"));
  if (!v) return err(c, "not_found", "visit tidak ada", 404);
  return c.json({ ...v, soap: row("SELECT * FROM soap_notes WHERE visit_id=?", v.id) || {} });
});
// ponytail: drafts deletable, finals immutable (same rule as editing — audit trail stays intact)
app.delete("/api/visits/:id", need("owner", "dokter"), async (c) => {
  const v = row("SELECT * FROM visits WHERE id=?", c.req.param("id"));
  if (!v) return err(c, "not_found", "visit tidak ada", 404);
  if (v.status === "final") return err(c, "locked", "SOAP final tidak bisa dihapus", 409);
  run("DELETE FROM soap_notes WHERE visit_id=?", v.id);
  run("DELETE FROM visits WHERE id=?", v.id);
  audit(c.get("user").id, "visit_delete", "visit", v.id, { child_id: v.child_id });
  return c.json({ ok: true });
});

// --- therapy / growth / milestones / screening ---
app.get("/api/therapy-sessions", need(...STAFF), (c) => {
  const { childId, typeId } = c.req.query();
  let sql = "SELECT s.*,t.name type_name,ch.full_name child_name FROM therapy_sessions s LEFT JOIN therapy_types t ON t.id=s.type_id LEFT JOIN children ch ON ch.id=s.child_id WHERE 1=1"; const p = [];
  if (childId) { sql += " AND child_id=?"; p.push(childId); }
  if (typeId) { sql += " AND type_id=?"; p.push(typeId); }
  return c.json({ data: rows(sql + " ORDER BY date DESC", ...p) });
});
app.post("/api/therapy-sessions", need("owner", "dokter", "terapis"), bodyLimit, async (c) => {
  const b = await c.req.json();
  if (!b.child_id || !b.type_id) return err(c, "invalid", "child_id + type_id wajib", 400);
  const id = uid("s");
  run("INSERT INTO therapy_sessions(id,child_id,type_id,date,target,activities,response,therapist_id,home_recommendation) VALUES(?,?,?,?,?,?,?,?,?)",
    id, b.child_id, b.type_id, b.date || new Date().toISOString().slice(0, 10), b.target || "", JSON.stringify(b.activities || []), b.response || "", c.get("user").id, b.home_recommendation || "");
  audit(c.get("user").id, "therapy_create", "session", id);
  return c.json({ id }, 201);
});
app.get("/api/growth", need(...STAFF), (c) => c.json({ data: rows("SELECT * FROM growth_records WHERE child_id=? ORDER BY date", c.req.query("childId") || "-") }));
app.post("/api/growth", need("owner", "dokter", "terapis"), bodyLimit, async (c) => {
  const b = await c.req.json(); const id = uid("g");
  run("INSERT INTO growth_records(id,child_id,date,weight_kg,height_cm,head_cm,recorded_by) VALUES(?,?,?,?,?,?,?)",
    id, b.child_id, b.date || new Date().toISOString().slice(0, 10), b.weight_kg, b.height_cm, b.head_cm || null, c.get("user").id);
  return c.json({ id }, 201);
});
app.get("/api/milestones", need(...STAFF), (c) => c.json({ data: rows("SELECT * FROM milestones WHERE child_id=?", c.req.query("childId") || "-") }));
app.put("/api/milestones", need("owner", "dokter", "terapis"), bodyLimit, async (c) => {
  const b = await c.req.json();
  run("INSERT OR REPLACE INTO milestones(child_id,key,label,status,updated_at) VALUES(?,?,?,?,?)", b.child_id, b.key, b.label || b.key, b.status, new Date().toISOString());
  return c.json({ ok: true });
});
app.get("/api/screenings", need(...STAFF), (c) => c.json({ data: rows("SELECT * FROM screenings WHERE child_id=? ORDER BY date DESC", c.req.query("childId") || "-") }));
app.post("/api/screenings", need("owner", "dokter", "terapis"), bodyLimit, async (c) => {
  const b = await c.req.json(); const id = uid("sc");
  run("INSERT INTO screenings(id,child_id,date,domain,result,note) VALUES(?,?,?,?,?,?)", id, b.child_id, b.date || new Date().toISOString().slice(0, 10), b.domain, b.result || "", b.note || "");
  return c.json({ id }, 201);
});
app.get("/api/therapy-programs", need(...STAFF), (c) => c.json({ data: rows("SELECT p.*,t.name type_name FROM therapy_programs p LEFT JOIN therapy_types t ON t.id=p.type_id WHERE child_id=?", c.req.query("childId") || "-") }));
app.put("/api/therapy-programs", need("owner", "dokter"), bodyLimit, async (c) => {
  const b = await c.req.json();
  run("INSERT OR REPLACE INTO therapy_programs(child_id,type_id,frequency,status) VALUES(?,?,?,?)", b.child_id, b.type_id, b.frequency || "1x/minggu", b.status || "aktif");
  return c.json({ ok: true });
});
app.get("/api/therapy-types", async (c) => c.json({ data: rows("SELECT * FROM therapy_types") }));

// --- reports + articles ---
function pdfBytes(title, lines) {
  const txt = [`BT /F1 16 Tf 50 750 Td (${title}) Tj ET`, ...lines.slice(0, 20).map((l, i) => `BT /F1 10 Tf 50 ${720 - i * 18} Td (${String(l).slice(0, 90).replace(/[()]/g, "")}) Tj ET`)].join("\n");
  const objs = [`1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj`, `2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj`, `3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj`, `4 0 obj << /Length ${txt.length} >> stream\n${txt}\nendstream endobj`, `5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj`];
  let out = "%PDF-1.4\n", off = [0]; let pos = out.length;
  for (const o of objs) { off.push(pos); out += o + "\n"; pos = out.length; }
  const xref = pos; out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n `).join("\n") + `\ntrailer << /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out);
}
app.get("/api/reports/preview", need(...STAFF), (c) => {
  const { childId, from = "2026-07-01", to = "2026-09-30" } = c.req.query();
  const child = row("SELECT * FROM children WHERE id=?", childId);
  const sessions = rows("SELECT * FROM therapy_sessions WHERE child_id=? AND date BETWEEN ? AND ?", childId, from, to);
  const growth = rows("SELECT * FROM growth_records WHERE child_id=? ORDER BY date", childId);
  return c.json({ childName: child?.full_name, period: `${from} – ${to}`, sessions: sessions.length, lastWeight: growth.at(-1)?.weight_kg ?? null, summary: `Perkembangan dari ${sessions.length} sesi.`, recommendations: ["Lanjut terapi", "Stimulasi 10 mnt/hari", "Evaluasi 4 minggu"] });
});
app.post("/api/reports", need("owner", "dokter"), bodyLimit, async (c) => {
  const b = await c.req.json(); const id = uid("r");
  run("INSERT INTO reports(id,child_id,period_start,period_end,summary,recommendations,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)",
    id, b.child_id, b.from || "", b.to || "", b.summary || "Ringkasan otomatis.", JSON.stringify(b.recommendations || []), c.get("user").id, new Date().toISOString());
  audit(c.get("user").id, "report_create", "report", id);
  return c.json({ id }, 201);
});
app.get("/api/reports/:id/pdf", need(...STAFF), (c) => {
  const r = row("SELECT r.*,ch.full_name FROM reports r LEFT JOIN children ch ON ch.id=r.child_id WHERE r.id=?", c.req.param("id"));
  if (!r) return err(c, "not_found", "laporan tidak ada", 404);
  c.header("content-type", "application/pdf");
  return c.body(pdfBytes(`Laporan ${r.full_name || ""}`, [r.summary, (r.period_start || "") + " - " + (r.period_end || "")]));
});
app.post("/api/reports/:id/email", need(...STAFF), bodyLimit, async (c) => {
  const { to } = await c.req.json();
  appendFileSync("./data/outbox.json", JSON.stringify({ to, report: c.req.param("id"), at: new Date().toISOString() }) + "\n");
  return c.json({ ok: true });
});
app.get("/api/articles", async (c) => {
  const { category, q } = c.req.query(); let sql = "SELECT * FROM articles WHERE 1=1"; const p = [];
  if (category) { sql += " AND category=?"; p.push(category); }
  if (q) { sql += " AND title LIKE ?"; p.push(`%${q.slice(0, 50)}%`); }
  return c.json({ data: rows(sql + " ORDER BY published_at DESC", ...p) });
});
app.get("/api/articles/:slug", async (c) => {
  const a = row("SELECT * FROM articles WHERE slug=?", c.req.param("slug"));
  return a ? c.json(a) : err(c, "not_found", "artikel tidak ada", 404);
});
app.get("/api/users", need("owner", "dokter"), (c) => c.json({ data: rows("SELECT id,name,email,role,status FROM users") }));
app.post("/api/users", need("owner", "dokter"), bodyLimit, async (c) => {
  const b = await c.req.json();
  if (!b.email?.includes("@")) return err(c, "invalid", "email wajib", 400);
  const id = uid("u");
  run("INSERT INTO users(id,name,email,password_hash,role,created_at) VALUES(?,?,?,?,?,?)", id, b.name || b.email, b.email, hashPassword(b.password || "prototype"), b.role || "admin", new Date().toISOString());
  return c.json({ id }, 201);
});
// ponytail: link self-registered parent (Google/Daftar) to an existing child — the only write path to parent_children besides seed/import
app.post("/api/parent-links", need("owner", "dokter", "admin"), bodyLimit, async (c) => {
  const { email, child_id, relation } = await c.req.json().catch(() => ({}));
  if (!email?.includes("@") || !child_id) return err(c, "invalid", "email + child_id wajib", 400);
  const u = row("SELECT id FROM users WHERE email=?", email);
  if (!u) return err(c, "not_found", "akun ortu tidak ada — minta ortu Daftar / Masuk Google dulu", 404);
  if (!row("SELECT id FROM children WHERE id=?", child_id)) return err(c, "not_found", "pasien tidak ada", 404);
  let p = row("SELECT id FROM parents WHERE user_id=?", u.id);
  if (!p) { const pid = uid("p"); run("INSERT INTO parents(id,user_id) VALUES(?,?)", pid, u.id); p = { id: pid }; }
  run("INSERT OR IGNORE INTO parent_children(parent_id,child_id,relation) VALUES(?,?,?)", p.id, child_id, relation || "Orang tua");
  audit(c.get("user").id, "parent_link", "child", child_id, { parent: email });
  return c.json({ ok: true });
});

// --- portal (parent-only, own children, curated: never raw SOAP) ---
const P = need("parent");
app.get("/api/portal/children", P, (c) => {
  const ids = parentChildIds(c.get("user").id);
  if (!ids.length) return c.json({ data: [] });
  return c.json({ data: rows(`SELECT id,mr_number,full_name,nickname,dob,gender,blood_type,photo_url FROM children WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids) });
});
app.get("/api/portal/children/:id", P, needOwnChild, (c) => {
  const ch = row("SELECT id,full_name,nickname,dob,gender,blood_type,birth_weight_kg,birth_length_cm,address FROM children WHERE id=?", c.req.param("id"));
  return ch ? c.json(ch) : err(c, "not_found", "not found", 404);
});
// ponytail: curated history (birth/allergy notes — own child only, never raw SOAP)
app.get("/api/portal/children/:id/history", P, needOwnChild, (c) =>
  c.json(row("SELECT birth_history,allergies,notes FROM medical_history WHERE child_id=?", c.req.param("id")) || { birth_history: "", allergies: "", notes: "" }));
// ponytail: own documents list + file bytes (uploads never exposed directly)
app.get("/api/portal/documents", P, needOwnChild, (c) => {
  const cid = c.req.query("childId");
  if (!cid) return err(c, "invalid", "childId wajib", 400);
  return c.json({ data: rows("SELECT id,kind,title,created_at FROM documents WHERE child_id=? ORDER BY created_at DESC", cid) });
});
app.get("/api/portal/documents/:id/file", P, async (c) => {
  const d = row("SELECT * FROM documents WHERE id=?", c.req.param("id"));
  if (!d || !parentChildIds(c.get("user").id).includes(d.child_id)) return err(c, "not_found", "not found", 404);
  const fp = join(UP, basename(d.file_url || ""));
  if (!existsSync(fp)) return err(c, "not_found", "file hilang", 404);
  c.header("content-type", /\.pdf$/i.test(fp) ? "application/pdf" : /\.png$/i.test(fp) ? "image/png" : "image/jpeg");
  return c.body(new Uint8Array(readFileSync(fp)));
});
// ponytail: own parent profile powers the Account page (name/email/phone/address)
app.get("/api/portal/profile", P, (c) => {
  const u = c.get("user");
  const p = row("SELECT phone,address FROM parents WHERE user_id=?", u.id) || {};
  return c.json({ name: u.name, email: u.email, phone: p.phone || "", address: p.address || "" });
});
// ponytail: self-service password change (google-linked accounts have no hash → 400)
app.post("/api/portal/change-password", P, bodyLimit, async (c) => {
  const u = c.get("user");
  const { current, next } = await c.req.json().catch(() => ({}));
  const full = row("SELECT password_hash FROM users WHERE id=?", u.id);
  if (!full?.password_hash) return err(c, "invalid", "akun Google — atur password via Google", 400);
  if (!verifyPassword(String(current || ""), full.password_hash)) return err(c, "invalid", "password lama salah", 401);
  if (!next || String(next).length < 6) return err(c, "invalid", "password baru ≥6 karakter", 400);
  run("UPDATE users SET password_hash=? WHERE id=?", hashPassword(String(next)), u.id);
  return c.json({ ok: true });
});
app.get("/api/portal/appointments", P, (c) => {
  const ids = parentChildIds(c.get("user").id);
  if (!ids.length) return c.json({ data: [] });
  const scope = c.req.query("scope") || "upcoming";
  const today = new Date().toISOString().slice(0, 10);
  const op = scope === "history" ? "<" : ">=";
  return c.json({ data: rows(`SELECT * FROM appointments WHERE child_id IN (${ids.map(() => "?").join(",")}) AND date(starts_at) ${op} date(?) ORDER BY starts_at`, ...ids, today) });
});
app.post("/api/portal/appointment-requests", P, bodyLimit, async (c) => {
  const b = await c.req.json();
  if (!parentChildIds(c.get("user").id).includes(b.child_id)) return err(c, "not_found", "not found", 404);
  const id = uid("a");
  run("INSERT INTO appointments(id,child_id,type,room,staff_id,starts_at,ends_at,status) VALUES(?,?,?,?,?,?,?,?)", id, b.child_id, b.type || "Konsultasi", "-", null, b.starts_at, b.starts_at, "scheduled");
  return c.json({ id }, 201);
});
app.get("/api/portal/growth/:id", P, needOwnChild, (c) =>
  c.json({ data: rows("SELECT date,weight_kg,height_cm,head_cm FROM growth_records WHERE child_id=? ORDER BY date", c.req.param("id")) }));
app.get("/api/portal/screening/:id", P, needOwnChild, (c) => {
  const all = rows("SELECT domain,result,date,note FROM screenings WHERE child_id=? ORDER BY date DESC", c.req.param("id"));
  const seen = new Map(); for (const r of all) if (!seen.has(r.domain)) seen.set(r.domain, r);
  return c.json({ data: [...seen.values()] });
});
app.get("/api/portal/therapy/:id", P, needOwnChild, (c) => {
  const id = c.req.param("id");
  const types = rows("SELECT * FROM therapy_types");
  return c.json({
    data: types.map((t) => {
      const n = row("SELECT COUNT(*) c FROM therapy_sessions WHERE child_id=? AND type_id=?", id, t.id).c;
      return { type: t.name, type_id: t.id, sessions: n, progress: Math.min(100, Math.round((n / 12) * 100)) };
    }),
  });
});
app.get("/api/portal/sessions/:id", P, (c) => {
  const s = row("SELECT s.id,s.date,s.target,s.response,s.home_recommendation,t.name type_name,s.child_id FROM therapy_sessions s LEFT JOIN therapy_types t ON t.id=s.type_id WHERE s.id=?", c.req.param("id"));
  if (!s || !parentChildIds(c.get("user").id).includes(s.child_id)) return err(c, "not_found", "not found", 404);
  const { child_id, ...curated } = s; // strip internal link, never expose soap
  return c.json(curated);
});
// ponytail: curated session list so portal Therapy page can link to detail (no soap keys)
app.get("/api/portal/sessions", P, needOwnChild, (c) => {
  const cid = c.req.query("childId");
  if (!cid) return err(c, "invalid", "childId wajib", 400);
  return c.json({ data: rows("SELECT s.id,s.date,s.target,s.response,s.home_recommendation,t.name type_name FROM therapy_sessions s LEFT JOIN therapy_types t ON t.id=s.type_id WHERE s.child_id=? ORDER BY s.date DESC", cid) });
});
app.get("/api/portal/stimulation", P, (c) => {
  const age = c.req.query("age") || "2-3";
  const map = { "0-6": ["Kontak mata", "Tummy time"], "6-12": ["Bermain tekstur", "MPASI mandiri"], "1-2": ["Susun balok", "Kosakata harian"], "2-3": ["Stimulasi bicara", "Motorik halus", "Sensorik", "Sosial & emosional"] };
  return c.json({ data: (map[age] || map["2-3"]).map((t) => ({ title: t, age })) });
});
app.get("/api/portal/reports", P, (c) => {
  const ids = parentChildIds(c.get("user").id);
  if (!ids.length) return c.json({ data: [] });
  return c.json({ data: rows(`SELECT id,period_start,period_end,summary,created_at FROM reports WHERE child_id IN (${ids.map(() => "?").join(",")}) ORDER BY created_at DESC`, ...ids) });
});
// ponytail: parent-scoped PDF/email so portal Download button hits real bytes, not an alert()
function ownReport(c, id) {
  const r = row("SELECT r.*,ch.full_name FROM reports r LEFT JOIN children ch ON ch.id=r.child_id WHERE r.id=?", id);
  if (!r || !parentChildIds(c.get("user").id).includes(r.child_id)) return null;
  return r;
}
app.get("/api/portal/reports/:id/pdf", P, (c) => {
  const r = ownReport(c, c.req.param("id"));
  if (!r) return err(c, "not_found", "not found", 404);
  c.header("content-type", "application/pdf");
  return c.body(pdfBytes(`Laporan ${r.full_name || ""}`, [r.summary, (r.period_start || "") + " - " + (r.period_end || "")]));
});
app.post("/api/portal/reports/:id/email", P, bodyLimit, async (c) => {
  const r = ownReport(c, c.req.param("id"));
  if (!r) return err(c, "not_found", "not found", 404);
  const { to } = await c.req.json().catch(() => ({}));
  appendFileSync("./data/outbox.json", JSON.stringify({ to: to || c.get("user").email, report: r.id, at: new Date().toISOString() }) + "\n");
  return c.json({ ok: true });
});

// --- static frontends + uploads (Fly single-image; ponytail: manual fs serve, no new dep) ---
const DIST_EMR = existsSync("./public/emr") ? "./public/emr" : "./apps/emr/dist";
const DIST_PORTAL = existsSync("./public/portal") ? "./public/portal" : "./apps/portal/dist";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2" };
function sendFile(c, base, rel) {
  const fp = join(base, (rel || "index.html").replace(/^\/+/, ""));
  const idx = join(base, "index.html");
  let target = idx; // ponytail: directories (e.g. "/emr/") fall through to index.html
  try { if (statSync(fp).isFile()) target = fp; } catch {}
  if (!existsSync(target)) return c.notFound();
  c.header("content-type", MIME[extname(target).toLowerCase()] || "application/octet-stream");
  return c.body(new Uint8Array(readFileSync(target)));
}
app.get("/", (c) => c.redirect("/emr/"));
app.get("/emr", (c) => c.redirect("/emr/"));
app.get("/emr/*", (c) => sendFile(c, DIST_EMR, c.req.path.slice(4) || "/index.html"));
app.get("/portal", (c) => c.redirect("/portal/"));
app.get("/portal/*", (c) => sendFile(c, DIST_PORTAL, c.req.path.slice(7) || "/index.html"));
app.get("/uploads/:fn", (c) => {
  const fp = join(UP, basename(c.req.param("fn")));
  if (!existsSync(fp)) return c.notFound();
  c.header("content-type", /\.pdf$/i.test(fp) ? "application/pdf" : /\.png$/i.test(fp) ? "image/png" : "image/jpeg");
  return c.body(new Uint8Array(readFileSync(fp)));
});

const port = Number(process.env.PORT || 8787);
if (process.env.NODE_ENV !== "test") {
  serve({ fetch: app.fetch, port }, () => log.info("api listening", {
    port, db: dbPath(), uploads: UP, emr: DIST_EMR, portal: DIST_PORTAL, google: !!process.env.GOOGLE_CLIENT_ID,
  }));
}
export default app;
