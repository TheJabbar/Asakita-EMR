// ponytail: CSV-only bulk import (no xlsx dep) — Excel users Save As CSV. Handles "," or ";" (ID-locale Excel), quotes, BOM.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate, uid, row, run } from "./db.js";
import { hashPassword } from "./auth.js";

export function parseCsv(text) {
  text = String(text).replace(/^\uFEFF/, ""); // Excel BOM
  const firstLine = text.slice(0, text.indexOf("\n") === -1 ? text.length : text.indexOf("\n"));
  const d = firstLine.includes(";") && !firstLine.includes(",") ? ";" : ","; // ID-locale Excel uses ;
  const rows = [];
  let r = [], cur = "", q = false;
  const push = () => { r.push(cur); cur = ""; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    }
    else if (ch === '"') q = true;
    else if (ch === d) push();
    else if (ch === "\r") { /* skip */ }
    else if (ch === "\n") { push(); if (!(r.length === 1 && r[0] === "")) rows.push(r); r = []; }
    else cur += ch;
  }
  push(); if (!(r.length === 1 && r[0] === "")) rows.push(r);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells, i) => ({ __line: i + 2, ...Object.fromEntries(head.map((h, j) => [h, (cells[j] ?? "").trim()])) }));
}

const nul = (v) => { v = String(v ?? "").trim(); return v === "" ? null : v; };
const num = (v, commaDec) => { // commaDec: ID-locale "3,1" → 3.1
  v = String(v ?? "").trim();
  if (v === "") return null;
  if (commaDec) v = v.replace(",", ".");
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

export function importCsv(file) {
  migrate();
  const text = String(readFileSync(file, "utf8")).replace(/^\uFEFF/, "");
  const firstLine = text.split("\n")[0];
  const commaDec = firstLine.includes(";") && !firstLine.includes(",");
  const data = parseCsv(text);
  let imported = 0, skipped = 0;
  const errors = [];
  for (const b of data) {
    try {
      const mr = (b.mr_number || "").trim();
      if (!mr) throw new Error("mr_number wajib");
      if (!(b.child_full_name || "").trim()) throw new Error("child_full_name wajib");
      if (row("SELECT id FROM children WHERE mr_number=?", mr)) { skipped++; continue; } // re-run safe
      const email = (b.parent_email || "").trim();
      let parentId = null;
      if (email) {
        if (!email.includes("@")) throw new Error("parent_email tidak valid");
        let u = row("SELECT id FROM users WHERE email=?", email);
        if (!u) {
          const id = uid("u");
          run("INSERT INTO users(id,name,email,password_hash,role,created_at) VALUES(?,?,?,?,?,?)",
            id, b.parent_name || email, email, hashPassword(b.parent_password || "prototype"), "parent", new Date().toISOString());
          parentId = uid("p");
          run("INSERT INTO parents(id,user_id,phone,address) VALUES(?,?,?,?)", parentId, id, b.parent_phone || "", b.parent_address || "");
          u = { id };
        } else {
          parentId = row("SELECT id FROM parents WHERE user_id=?", u.id)?.id || null;
          if (!parentId) { parentId = uid("p"); run("INSERT INTO parents(id,user_id,phone,address) VALUES(?,?,?,?)", parentId, u.id, b.parent_phone || "", b.parent_address || ""); }
          else { // refresh contact on re-import
            if ((b.parent_phone || "").trim()) run("UPDATE parents SET phone=? WHERE id=?", b.parent_phone.trim(), parentId);
            if ((b.parent_address || "").trim()) run("UPDATE parents SET address=? WHERE id=?", b.parent_address.trim(), parentId);
          }
        }
      }
      const cid = uid("c");
      run("INSERT INTO children(id,mr_number,full_name,nickname,dob,gender,blood_type,birth_weight_kg,birth_length_cm,address,insurance) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        cid, mr, b.child_full_name.trim(), b.child_nickname || "", b.dob || "", b.gender || "", b.blood_type || "",
        num(b.birth_weight_kg, commaDec), num(b.birth_length_cm, commaDec), b.child_address || "", b.insurance || "Pribadi");
      if ((b.birth_history || "") + (b.allergies || "") + (b.notes || "") !== "")
        run("INSERT OR REPLACE INTO medical_history(child_id,birth_history,allergies,notes) VALUES(?,?,?,?)",
          cid, b.birth_history || "", b.allergies || "", b.notes || "");
      if (parentId) run("INSERT INTO parent_children(parent_id,child_id,relation) VALUES(?,?,?)", parentId, cid, b.relation || "Orang tua");
      imported++;
    } catch (e) { errors.push({ line: b.__line, message: e.message }); }
  }
  return { imported, skipped, errors };
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) { console.error("pakai: node ./src/import-csv.js <file.csv>  (lihat import-template.csv)"); process.exit(2); }
  let out;
  try { out = importCsv(file); }
  catch (e) { console.error("gagal baca file:", e.message); process.exit(2); }
  console.log(`import ok: ${out.imported} anak baru, ${out.skipped} dilewati (duplikat mr_number)`);
  for (const e of out.errors) console.error(`baris ${e.line}: ${e.message}`);
  process.exit(out.errors.length ? 1 : 0);
}
