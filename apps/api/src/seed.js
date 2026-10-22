import { getDb, migrate, uid } from "./db.js";
import { hashPassword } from "./auth.js";
migrate();
const db = getDb();
const has = (email) => db.prepare("SELECT id FROM users WHERE email=?").get(email);
function addUser(name, email, role, pw = "prototype") {
  if (has(email)) return has(email).id;
  const id = uid("u");
  db.prepare("INSERT INTO users(id,name,email,password_hash,role,created_at) VALUES(?,?,?,?,?,?)")
    .run(id, name, email, hashPassword(pw), role, new Date().toISOString());
  return id;
}
const dokter = addUser("dr. Imelda", "dokter@asakita.demo", "dokter");
addUser("Terapis Wicara", "terapis@asakita.demo", "terapis");
addUser("Admin Front Office", "admin@asakita.demo", "admin");
addUser("Owner", "owner@asakita.demo", "owner");
const pid = addUser("Bunda Alya", "alya@example.com", "parent");
const pid2 = addUser("Budi", "budi@example.com", "parent");
if (!db.prepare("SELECT id FROM parents WHERE user_id=?").get(pid)) {
  const p1 = uid("p"); db.prepare("INSERT INTO parents(id,user_id,phone) VALUES(?,?,?)").run(p1, pid, "+62 823-xxxx-xxxx");
  const p2 = uid("p"); db.prepare("INSERT INTO parents(id,user_id,phone) VALUES(?,?,?)").run(p2, pid2, "+62 800-0000");
  const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString(); // stagger demo rows so the monthly chart has buckets
  const c1 = uid("c");
  db.prepare("INSERT INTO children(id,mr_number,full_name,nickname,dob,gender,blood_type,birth_weight_kg,birth_length_cm,address,insurance,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(c1, "0001248", "Ananda Putra", "Ananda", "2024-04-12", "Laki-laki", "O", 3.1, 49, "Sorowako, Luwu Timur", "Pribadi", daysAgo(65));
  const c2 = uid("c");
  db.prepare("INSERT INTO children(id,mr_number,full_name,nickname,dob,gender,blood_type,birth_weight_kg,birth_length_cm,address,insurance,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(c2, "0001301", "Arslan Shah Malik", "Arslan", "2023-11-07", "Laki-laki", "A", 2.87, 46, "Makassar", "Pribadi", daysAgo(35));
  const c3 = uid("c");
  db.prepare("INSERT INTO children(id,mr_number,full_name,nickname,dob,gender,blood_type,address,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
    .run(c3, "0001400", "Budi Jr", "Budi Jr", "2022-01-01", "Laki-laki", "B", "Makassar", daysAgo(5));
  db.prepare("INSERT INTO parent_children(parent_id,child_id,relation) VALUES(?,?,?)").run(p1, c2, "Ibu");
  db.prepare("INSERT INTO parent_children(parent_id,child_id,relation) VALUES(?,?,?)").run(p2, c3, "Ayah");
  db.prepare("INSERT OR REPLACE INTO medical_history(child_id,birth_history,allergies,notes) VALUES(?,?,?,?)")
    .run(c1, "Lahir cukup bulan, BB 3.1 kg, PB 49 cm.", "-", "Pemantauan bahasa dan interaksi sosial.");
  db.prepare("INSERT OR REPLACE INTO medical_history(child_id,birth_history,allergies,notes) VALUES(?,?,?,?)")
    .run(c2, "Lahir 36 minggu, BB 2.87 kg, PB 46 cm. Rawat NICU 5 hari.", "Susu sapi", "Fokus stimulasi bahasa dan motorik halus.");
  const t = new Date().toISOString().slice(0, 10);
  const ap = (child, type, room, status, h) => db.prepare("INSERT INTO appointments(id,child_id,type,room,staff_id,starts_at,ends_at,status) VALUES(?,?,?,?,?,?,?,?)")
    .run(uid("a"), child, type, room, dokter, `${t}T0${h}:00`, `${t}T0${h}:30`, status);
  ap(c1, "Konsultasi Dokter", "R. Konsultasi", "done", 8); ap(c2, "Terapi Okupasi", "R. Terapi 1", "in_progress", 9);
  const arts = [
    ["panduan-asi", "Panduan ASI Eksklusif 0–6 Bulan", "ASI", "dr. Imelda Hady, Sp.A", "Berikan ASI eksklusif...", "0-6"],
    ["mpasi-pertama", "MPASI Pertama Usia 6 Bulan", "MPASI", "Tim Asakita", "Tekstur, porsi, tips...", "6-12"],
    ["menu-mpasi", "Menu MPASI Mingguan", "MPASI", "Tim Asakita", "Ide menu 6–12 bln...", "6-12"],
    ["stimulasi-bicara", "Cara Stimulasi Bicara di Rumah", "stimulasi", "Kak Dini", "Sebut nama benda...", "2-3"],
    ["sensorik", "Aktivitas Sensorik Sederhana", "stimulasi", "Tim Asakita", "Main puzzle, balok...", "1-2"],
    ["pompa-asi", "Pompa ASI untuk Ibu Bekerja", "ASI", "Konselor Laktasi", "Jadwal pompa, simpan ASI...", "0-6"],
    ["jadwal-makan", "Jadwal Makan Bayi 6–9 Bulan", "MPASI", "Tim Asakita", "3x makan + 2x selingan...", "6-12"],
    ["snack-sehat", "Snack Sehat Anak 1–2 Tahun", "MPASI", "Tim Asakita", "Buah, yoghurt, biskuit...", "1-2"],
    ["main-balok", "Main Balok untuk Motorik Halus", "stimulasi", "Kak Dini", "Susun, bongkar, ulang...", "1-2"],
    ["dongeng", "Dongeng 10 Menit Sehari", "stimulasi", "Tim Asakita", "Kosakata + bonding...", "2-3"],
    ["tantrum", "Mengatasi Tantrum dengan Tenang", "perilaku", "Psikolog Anak", "Akui emosi, alihkan...", "2-3"],
    ["toilet-training", "Toilet Training Tanpa Drama", "perilaku", "Tim Asakita", "Tanda siap, rutinitas...", "2-3"],
    ["screen-time", "Batasan Screen Time Usia Dini", "perilaku", "dr. Imelda Hady, Sp.A", "Maks 1 jam, dampingi...", "2-3"],
  ];
  for (const [slug, title, cat, au, body, age] of arts)
    db.prepare("INSERT OR IGNORE INTO articles(id,slug,title,category,author,body_md,age_tag,published_at) VALUES(?,?,?,?,?,?,?,?)")
      .run(uid("ar"), slug, title, cat, au, body, age, t);
  const g = (child, d, w, h2) => db.prepare("INSERT INTO growth_records(id,child_id,date,weight_kg,height_cm,recorded_by) VALUES(?,?,?,?,?,?)").run(uid("g"), child, d, w, h2, dokter);
  for (const [k, l, s] of [["kontak_mata", "Kontak mata", "in_progress"], ["instruksi_1", "Instruksi 1 langkah", "achieved"], ["kosakata", "Kosakata ekspresif", "in_progress"]])
    db.prepare("INSERT OR REPLACE INTO milestones(child_id,key,label,status,updated_at) VALUES(?,?,?,?,?)").run(c2, k, l, s, t);
  console.log("seed ok");
}

// ponytail: demo growth measurements (BB / TB / LK) for every demo child — idempotent, so an
// already-seeded DB (production) also gets them. Values follow the WHO boy median ± ~0.3 SD.
// [tanggal, berat kg, tinggi cm, lingkar kepala cm]
const DEMO_GROWTH = {
  "0001248": [["2025-04-12", 9.8, 76.0, 46.5], ["2025-10-12", 11.2, 83.0, 47.5], ["2026-04-12", 12.8, 88.0, 48.1], ["2026-10-01", 13.9, 92.0, 48.4]],
  "0001301": [["2024-11-07", 9.4, 75.0, 46.0], ["2025-05-07", 10.9, 82.0, 47.2], ["2025-11-07", 12.0, 87.0, 47.8], ["2026-07-01", 12.8, 90.5, 48.1], ["2026-09-01", 13.5, 92.0, 48.4]],
  "0001400": [["2023-01-01", 9.9, 77.0, 46.8], ["2024-01-01", 12.5, 88.0, 48.0], ["2025-01-01", 14.6, 96.0, 49.0], ["2026-01-01", 16.4, 102.0, 49.6], ["2026-10-01", 17.6, 106.0, 50.0]],
};
for (const [mr, rows] of Object.entries(DEMO_GROWTH)) {
  const kid = db.prepare("SELECT id FROM children WHERE mr_number=?").get(mr);
  if (!kid) continue;
  for (const [date, w, h2, hc] of rows) {
    const existing = db.prepare("SELECT id FROM growth_records WHERE child_id=? AND date=?").get(kid.id, date);
    if (existing) { // keep the id, refresh the values (older rows had no head circumference)
      db.prepare("UPDATE growth_records SET weight_kg=?, height_cm=?, head_cm=? WHERE id=?").run(w, h2, hc, existing.id);
      continue;
    }
    db.prepare("INSERT INTO growth_records(id,child_id,date,weight_kg,height_cm,head_cm,recorded_by) VALUES(?,?,?,?,?,?,?)")
      .run(uid("g"), kid.id, date, w, h2, hc, dokter);
  }
}
console.log("seed growth ok");

// ponytail: demo rows for the newer features run on every boot and are idempotent —
// an already-seeded DB (e.g. production) still gets them after a deploy.
const demoKid = db.prepare("SELECT id FROM children WHERE mr_number='0001301'").get();
if (demoKid) {
  const kid = demoKid.id;
  const t = new Date().toISOString().slice(0, 10);
  if (!db.prepare("SELECT id FROM home_programs WHERE child_id=? AND title=?").get(kid, "Latihan bicara harian")) {
    const hp = uid("hp");
    db.prepare("INSERT INTO home_programs(id,child_id,session_id,title,instructions,created_at,created_by) VALUES(?,?,?,?,?,?,?)")
      .run(hp, kid, null, "Latihan bicara harian", "Sebut nama benda saat bermain, 10 menit per hari.", t, null);
    for (const [label, note] of [["Sebut nama benda 5x", "target 1x/hari"], ["Baca buku bergambar 10 menit", "sebelum tidur"]])
      db.prepare("INSERT INTO home_program_items(id,program_id,label,target_per_day,note,done_dates) VALUES(?,?,?,?,?,?)")
        .run(uid("hpi"), hp, label, 1, note, "[]");
  }
  for (const [k, s] of [["b5-motor-1", "pass"], ["b5-language-1", "pass"], ["b5-social-2", "not_yet"]])
    if (db.prepare("SELECT id FROM denver_items WHERE id=?").get(k)) // only seed checks for items that still exist
      db.prepare("INSERT OR IGNORE INTO denver_results(child_id,item_key,status,note,checked_at,checked_by) VALUES(?,?,?,?,?,?)")
        .run(kid, k, s, "", t, null);
  // demo: program terapi + sesi (2 sudah tertagih, 1 belum → tombol "Tagih sesi terapi" masih ada yang bisa ditagih)
  const wicara = db.prepare("SELECT id FROM therapy_types WHERE name='Terapi Wicara'").get();
  if (wicara) {
    db.prepare("INSERT OR REPLACE INTO therapy_programs(child_id,type_id,frequency,status) VALUES(?,?,?,?)")
      .run(kid, wicara.id, "2x/minggu", "aktif");
    const sessions = [];
    for (const [d, target, res] of [["2026-06-18", "Imitasi suara & kontak mata", "3/5 instruksi direspon"], ["2026-08-06", "Kosakata 2 kata", "4/5"], ["2026-09-24", "Instruksi 2 langkah", "3/5"]]) {
      const ex = db.prepare("SELECT id FROM therapy_sessions WHERE child_id=? AND date=?").get(kid, d);
      const sid = ex ? ex.id : uid("s");
      if (!ex)
        db.prepare("INSERT INTO therapy_sessions(id,child_id,type_id,date,target,activities,response,therapist_id,home_recommendation) VALUES(?,?,?,?,?,?,?,?,?)")
          .run(sid, kid, wicara.id, d, target, JSON.stringify(["Imitasi suara", "Kontak mata"]), res, dokter, "Latihan bicara 10 mnt/hari");
      sessions.push({ id: sid, date: d });
    }
    for (const [i, status] of [[0, "paid"], [1, "unpaid"]])
      if (!db.prepare("SELECT id FROM billing_items WHERE session_id=?").get(sessions[i].id))
        db.prepare("INSERT INTO billing_items(id,child_id,date,description,qty,unit_price,session_id,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
          .run(uid("bi"), kid, sessions[i].date, "Terapi Wicara", 1, 120000, sessions[i].id, status, t);
  }
  console.log("seed features ok");
}
