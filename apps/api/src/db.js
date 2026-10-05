import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
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
export const uid = (p = "id") => `${p}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
export function rows(sql, ...params) { return getDb().prepare(sql).all(...params); }
export function row(sql, ...params) { return getDb().prepare(sql).get(...params); }
export function run(sql, ...params) { return getDb().prepare(sql).run(...params); }

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE, password_hash TEXT, google_sub TEXT, role TEXT, status TEXT DEFAULT 'active', created_at TEXT);
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
CREATE TABLE IF NOT EXISTS articles(id TEXT PRIMARY KEY, slug TEXT UNIQUE, title TEXT, category TEXT, author TEXT, body_md TEXT, age_tag TEXT, published_at TEXT);
CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY, child_id TEXT, period_start TEXT, period_end TEXT, summary TEXT, recommendations TEXT, pdf_url TEXT, created_by TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS home_recommendations(id TEXT PRIMARY KEY, child_id TEXT, therapy_session_id TEXT, title TEXT, detail TEXT, done INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS audit_logs(id TEXT PRIMARY KEY, actor_id TEXT, action TEXT, entity TEXT, entity_id TEXT, at TEXT, meta TEXT);
CREATE TABLE IF NOT EXISTS password_resets(email TEXT, token TEXT, at TEXT);
`;
export function migrate() {
  const db = getDb();
  db.exec(SCHEMA);
  // seed therapy types if empty
  const n = db.prepare("SELECT COUNT(*) c FROM therapy_types").get().c;
  if (!n) for (const t of ["Terapi Wicara", "Terapi Okupasi", "Sensori Integrasi"])
    db.prepare("INSERT INTO therapy_types(id,name) VALUES(?,?)").run(uid("tt"), t);
}
if (!existsSync("./data")) mkdirSync("./data", { recursive: true });
