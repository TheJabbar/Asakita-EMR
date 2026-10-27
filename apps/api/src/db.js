import { mkdirSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { DEFAULT_PRICES } from "./constants.js";
import { DENVER_BANDS } from "./denver-catalog.js";
// vite can't statically resolve this (intentional) — Node runtime can
const _spec = "node:" + "sqlite";
const { DatabaseSync } = await import(_spec);

let _db = null;
export function dbPath() {
  const u = process.env.DATABASE_URL || "file:./data/asakita.db";
  return u.startsWith("file:") ? u.slice(5) : u;
}
export function getDb() {
  if (_db) return _db;
  const p = dbPath();
  if (p !== ":memory:") mkdirSync(dirname(p), { recursive: true });
  _db = new DatabaseSync(p);
  _db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  return _db;
}
export function resetDb() { _db = null; }
// ponytail: crypto UUIDs — Date.now+Math.random ids were guessable and collision-prone
export const uid = (p = "id") => `${p}_${randomUUID()}`;
export function rows(sql, ...params) { return getDb().prepare(sql).all(...params); }
export function row(sql, ...params) { return getDb().prepare(sql).get(...params); }
export function run(sql, ...params) { return getDb().prepare(sql).run(...params); }
// multi-write steps succeed or fail together (SQLite allows no nesting — don't call tx inside tx)
export function tx(fn) {
  const db = getDb();
  db.exec("BEGIN");
  try { const r = fn(); db.exec("COMMIT"); return r; }
  catch (e) { db.exec("ROLLBACK"); throw e; }
}

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE, password_hash TEXT, google_sub TEXT, role TEXT, status TEXT DEFAULT 'active', created_at TEXT, token_after TEXT);
CREATE TABLE IF NOT EXISTS parents(id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), phone TEXT, address TEXT);
CREATE TABLE IF NOT EXISTS children(id TEXT PRIMARY KEY, mr_number TEXT UNIQUE, full_name TEXT, nickname TEXT, dob TEXT, gender TEXT, blood_type TEXT, birth_weight_kg REAL, birth_length_cm REAL, address TEXT, insurance TEXT, status TEXT DEFAULT 'active', photo_url TEXT);
CREATE TABLE IF NOT EXISTS parent_children(parent_id TEXT, child_id TEXT, relation TEXT, PRIMARY KEY(parent_id,child_id));
CREATE TABLE IF NOT EXISTS medical_history(child_id TEXT PRIMARY KEY, birth_history TEXT, allergies TEXT, notes TEXT);
CREATE TABLE IF NOT EXISTS appointments(id TEXT PRIMARY KEY, child_id TEXT, type TEXT, room TEXT, staff_id TEXT, starts_at TEXT, ends_at TEXT, status TEXT);
CREATE TABLE IF NOT EXISTS visits(id TEXT PRIMARY KEY, child_id TEXT, appointment_id TEXT, date TEXT, visit_type TEXT, status TEXT DEFAULT 'draft');
CREATE TABLE IF NOT EXISTS soap_notes(visit_id TEXT PRIMARY KEY, subjective TEXT, objective TEXT, assessment TEXT, plan TEXT, created_by TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS therapy_types(id TEXT PRIMARY KEY, name TEXT UNIQUE);
CREATE TABLE IF NOT EXISTS therapy_sessions(id TEXT PRIMARY KEY, child_id TEXT, type_id TEXT, date TEXT, target TEXT, activities TEXT, response TEXT, therapist_id TEXT, home_recommendation TEXT);
CREATE TABLE IF NOT EXISTS growth_records(id TEXT PRIMARY KEY, child_id TEXT, date TEXT, weight_kg REAL, height_cm REAL, head_cm REAL, recorded_by TEXT);
CREATE TABLE IF NOT EXISTS milestones(child_id TEXT, key TEXT, label TEXT, status TEXT, updated_at TEXT, PRIMARY KEY(child_id,key));
CREATE TABLE IF NOT EXISTS therapy_programs(child_id TEXT, type_id TEXT, frequency TEXT, status TEXT, PRIMARY KEY(child_id,type_id));
CREATE TABLE IF NOT EXISTS screenings(id TEXT PRIMARY KEY, child_id TEXT, date TEXT, domain TEXT, result TEXT, note TEXT);
CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY, child_id TEXT, kind TEXT, title TEXT, file_url TEXT, uploaded_by TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS articles(id TEXT PRIMARY KEY, slug TEXT UNIQUE, title TEXT, category TEXT, author TEXT, body_md TEXT, age_tag TEXT, published_at TEXT, source_name TEXT, source_url TEXT);
CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY, child_id TEXT, period_start TEXT, period_end TEXT, summary TEXT, recommendations TEXT, pdf_url TEXT, created_by TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS home_recommendations(id TEXT PRIMARY KEY, child_id TEXT, therapy_session_id TEXT, title TEXT, detail TEXT, done INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS audit_logs(id TEXT PRIMARY KEY, actor_id TEXT, action TEXT, entity TEXT, entity_id TEXT, at TEXT, meta TEXT);
CREATE TABLE IF NOT EXISTS password_resets(email TEXT, token TEXT, at TEXT);
CREATE TABLE IF NOT EXISTS denver_results(child_id TEXT, item_key TEXT, status TEXT, note TEXT, checked_at TEXT, checked_by TEXT, PRIMARY KEY(child_id,item_key));
CREATE TABLE IF NOT EXISTS denver_items(id TEXT PRIMARY KEY, band_key TEXT, domain TEXT, text TEXT, sort INTEGER DEFAULT 0, created_at TEXT);
CREATE TABLE IF NOT EXISTS denver_bands(id TEXT PRIMARY KEY, label TEXT, min_months INTEGER, max_months INTEGER, sort INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS home_programs(id TEXT PRIMARY KEY, child_id TEXT, session_id TEXT, title TEXT, instructions TEXT, created_at TEXT, created_by TEXT);
CREATE TABLE IF NOT EXISTS home_program_items(id TEXT PRIMARY KEY, program_id TEXT, label TEXT, target_per_day REAL DEFAULT 1, note TEXT, done_dates TEXT DEFAULT '[]');
CREATE TABLE IF NOT EXISTS service_prices(name TEXT PRIMARY KEY, price INTEGER);
CREATE TABLE IF NOT EXISTS billing_items(id TEXT PRIMARY KEY, child_id TEXT, date TEXT, description TEXT, qty REAL DEFAULT 1, unit_price INTEGER, session_id TEXT, status TEXT DEFAULT 'unpaid', created_at TEXT);
`;
export function migrate() {
  const db = getDb();
  db.exec(SCHEMA);
  if (!db.prepare("PRAGMA table_info(children)").all().some((c) => c.name === "created_at"))
    db.exec("ALTER TABLE children ADD COLUMN created_at TEXT"); // DBs created before this column; old rows stay NULL (excluded from monthly counts)
  // ponytail: token_after powers session revocation on password change — old DBs get it here
  if (!db.prepare("PRAGMA table_info(users)").all().some((c) => c.name === "token_after"))
    db.exec("ALTER TABLE users ADD COLUMN token_after TEXT");
  // ponytail: education articles gained a source link; older DBs get the columns here
  const articleCols = db.prepare("PRAGMA table_info(articles)").all().map((c) => c.name);
  if (!articleCols.includes("source_name")) db.exec("ALTER TABLE articles ADD COLUMN source_name TEXT");
  if (!articleCols.includes("source_url")) db.exec("ALTER TABLE articles ADD COLUMN source_url TEXT");
  // seed therapy types if empty
  const n = db.prepare("SELECT COUNT(*) c FROM therapy_types").get().c;
  if (!n) for (const t of ["Terapi Wicara", "Terapi Okupasi", "Sensori Integrasi"])
    db.prepare("INSERT INTO therapy_types(id,name) VALUES(?,?)").run(uid("tt"), t);
  // seed service prices (billing) — editable later from the Billing tab
  const np = db.prepare("SELECT COUNT(*) c FROM service_prices").get().c;
  if (!np) for (const [name, price] of Object.entries(DEFAULT_PRICES))
    db.prepare("INSERT OR IGNORE INTO service_prices(name,price) VALUES(?,?)").run(name, price);
  // materialise the Denver checklist (age bands + items) once — after this the DB is the source
  // of truth (clinicians can add/edit/remove bands and items; deletions must survive reboots
  // → no re-seed)
  const nb = db.prepare("SELECT COUNT(*) c FROM denver_bands").get().c;
  if (!nb) {
    const insBand = db.prepare("INSERT INTO denver_bands(id,label,min_months,max_months,sort) VALUES(?,?,?,?,?)");
    DENVER_BANDS.forEach((b, i) => insBand.run(b.key, b.label, b.minMonths, b.maxMonths, i + 1));
  }
  const ni = db.prepare("SELECT COUNT(*) c FROM denver_items").get().c;
  if (!ni) {
    const ins = db.prepare("INSERT INTO denver_items(id,band_key,domain,text,sort,created_at) VALUES(?,?,?,?,?,?)");
    const now = new Date().toISOString();
    for (const band of DENVER_BANDS)
      band.items.forEach((it, i) => ins.run(it.key, band.key, it.domain, it.text, i + 1, now));
  }
}
if (!existsSync("./data")) mkdirSync("./data", { recursive: true });
