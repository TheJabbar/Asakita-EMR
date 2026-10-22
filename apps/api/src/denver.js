// ponytail: Denver II style developmental checklist — 4 domains x 8 age bands.
// Catalog is clinical reference content (generic developmental milestones), stored server-side so
// staff + portal always see the same item list.
import { Hono } from "hono";
import { row, rows, run } from "./db.js";
import { err, need, STAFF, needOwnChild, audit } from "./guard.js";

export const DENVER_DOMAINS = [
  { key: "motor", label: "Motorik Kasar", icon: "🏃" },
  { key: "language", label: "Bahasa", icon: "💬" },
  { key: "social", label: "Personal–Sosial", icon: "🤝" },
  { key: "fine", label: "Motorik Halus–Adaptif", icon: "✋" },
];

// [minMonths, maxMonths, label, { domain: [items…] }]
const RAW = [
  [0, 6, "0–6 bulan", {
    motor: ["Mengangkat kepala ±45° saat tengkurap", "Angkat kepala dan dada dari lantai saat disokong", "Kepala stabil tegak 90°", "Membalik badan sendiri"],
    language: ["Mengocek sederhana (a-a)", "Mengoceh lebih bervariasi (a-a, o-o, baba)", "Mengoceh dengan nada naik-turun", "Menyapa dengan suara atau tangan"],
    social: ["Tersenyum sosial", "Merespons sentuhan dengan senyum", "Tertawa dengan suara", "Melirik orang yang mendekat", "Menyembunyikan muka (malu)"],
    fine: ["Menggenggam benda di tangan", "Memindahkan benda dari satu tangan ke tangan lain", "Menggenggam dua benda bersamaan", "Mengambil benda dengan tangannya"],
  }],
  [6, 12, "6–12 bulan", {
    motor: ["Duduk tanpa sandaran", "Merayap", "Berdiri sambil berpegangan", "Merangkak"],
    language: ["Mengoceh 'ba-ba' atau 'ma-ma'", "Mengucapkan 1–2 kata", "Mengerti namanya dipanggil", "Meniru suara sederhana"],
    social: ["Tersenyum pada orang asing", "Melambaikan tangan", "Bermain 'petak-petak' dengan orang dewasa", "Malu saat digoda"],
    fine: ["Memindahkan benda antar tangan", "Makan sendiri dengan tangan", "Memasukkan benda ke wadah", "Melepaskan benda ke wadah"],
  }],
  [12, 18, "12–18 bulan", {
    motor: ["Berjalan pada 12–15 bulan", "Berjalan mundur", "Berlari kecil", "Naik tangga dengan pegangan"],
    language: ["Mengucapkan 3–5 kata", "Meniru kata", "Mengikuti instruksi sederhana", "Menunjuk benda yang diinginkan"],
    social: ["Menunjuk untuk menunjukkan benda", "Menarik tangan untuk mendapat perhatian", "Melambaikan goodbye", "Makan dengan bantuan sedikit"],
    fine: ["Menumpuk 2 balok", "Memegang krayon atau bolpoin", "Memutar benda beroda", "Menaruh benda di atas benda lain"],
  }],
  [18, 24, "18–24 bulan", {
    motor: ["Berjalan naik tangga berpegangan", "Berjalan turun tangga berpegangan", "Melompat", "Berjalan berdampingan"],
    language: ["Kosakata 10–20 kata", "Menggunakan frasa dua kata ('mama biru')", "Mengikuti perintah dua langkah", "Menunjukkan bagian tubuh"],
    social: ["Makan sendiri dengan sendok", "Menyayap dengan sendok", "Mengedipkan tangan", "Menyebut diri 'aku'"],
    fine: ["Menumpuk 4–6 balok", "Menggambar coretan", "Memutar knop", "Menarik mainan dengan tali"],
  }],
  [24, 36, "2–3 tahun", {
    motor: ["Berlari dengan baik", "Melompat", "Naik tangga satu kaki per langkah", "Berjalan mundur"],
    language: ["Kosakata minimal 50 kata", "Kalimat 3–4 kata", "Menggunakan kata ganti (aku, kamu)", "Menyanyi sederhana"],
    social: ["Melatih toilet", "Dapat berpisah dari orang tua", "Bermain bersama anak lain", "Menunjukkan emosi (senang atau marah)"],
    fine: ["Menggambar lingkaran", "Memotong kertas dengan gunting", "Menyusun puzzle 4–6 keping", "Membuka tutup botol"],
  }],
  [36, 48, "3–4 tahun", {
    motor: ["Bersepeda", "Memanjat", "Berjalan pada balok", "Berlari lalu berhenti"],
    language: ["Kalimat lengkap", "Menggunakan kata tanya (siapa, di mana)", "Menceritakan peristiwa", "Mengulang cerita sederhana"],
    social: ["Bekerja sama dengan teman", "Membagi mainan", "Mengikuti aturan permainan", "Menunggu giliran"],
    fine: ["Menggambar lingkaran dan silang", "Memotong dengan gunting", "Mengikat pita", "Menjumput benda kecil"],
  }],
  [48, 60, "4–5 tahun", {
    motor: ["Melompat dengan satu kaki", "Memanjat tangga", "Bersepeda tanpa roda bantu", "Berjalan lurus tanpa goyang"],
    language: ["Kosakata minimal 1.000 kata", "Menggunakan kata majemuk", "Menceritakan pengalaman", "Mengerti perintah berurutan"],
    social: ["Bekerja sama menyelesaikan tugas", "Mengatasi konflik sederhana", "Menunjukkan rasa sulit (sulit atau mudah)", "Menunggu dengan sabar"],
    fine: ["Menggambar manusia dengan 4 bagian", "Menjahit dengan jarum besar", "Menyalin pola", "Menggunakan gunting tepat"],
  }],
  [60, 72, "5–6 tahun", {
    motor: ["Melompat dengan dua kaki", "Bersepedi dengan mahir", "Berjalan pada garis lurus", "Menari mengikuti irama"],
    language: ["Menggunakan kata 'akan'", "Membaca kata sederhana", "Menyimak dan mengikuti cerita", "Bermain peran"],
    social: ["Bekerja dalam kelompok", "Menghormati aturan bersama", "Menunjukkan empati", "Menyelesaikan tugas tanpa bantuan"],
    fine: ["Menulis namanya sendiri", "Menggunting pola tepat", "Menjahit dengan benang", "Mengecek kesesuaian ukuran"],
  }],
];

export const DENVER_BANDS = RAW.map(([minMonths, maxMonths, label, doms], bi) => ({
  key: `b${bi + 1}`, minMonths, maxMonths, label,
  items: Object.entries(doms).flatMap(([domain, texts]) =>
    texts.map((text, i) => ({ key: `b${bi + 1}-${domain}-${i + 1}`, domain, text }))),
}));

export const DENVER_STATUSES = ["pass", "not_yet", "no_info"];
export const STATUS_LABEL = { pass: "Lulus", not_yet: "Belum", no_info: "Tidak ada info" };

export function bandForAge(ageMonths) {
  if (ageMonths === null || ageMonths === undefined) return null;
  return DENVER_BANDS.find((b) => ageMonths >= b.minMonths && ageMonths < b.maxMonths) || DENVER_BANDS.at(-1);
}

// ponytail: simplified Denver-style scoring — per-domain progress in the current age band,
// plus delayed (failed item in a lower band) and advanced (passed item in a higher band) flags.
export function scoreDenver(bands, results, ageMonths) {
  const current = bandForAge(ageMonths);
  const statusOf = (key) => results[key]?.status || null;
  const perDomain = {};
  const delayed = [];
  const advanced = [];
  for (const d of DENVER_DOMAINS) perDomain[d.key] = { key: d.key, label: d.label, passed: 0, total: 0, checked: 0, notYet: 0 };
  for (const band of bands) {
    const isCurrent = current && band.key === current.key;
    const isLower = current && band.maxMonths <= current.minMonths;
    const isHigher = current && band.minMonths > current.maxMonths;
    for (const item of band.items) {
      const st = statusOf(item.key);
      const bucket = perDomain[item.domain];
      if (isCurrent) {
        bucket.total++;
        if (st) bucket.checked++;
        if (st === "pass") bucket.passed++;
        if (st === "not_yet") bucket.notYet++;
      }
      if (st === "not_yet" && isLower) delayed.push({ ...item, band: band.label });
      if (st === "pass" && isHigher) advanced.push({ ...item, band: band.label });
    }
  }
  for (const k of Object.keys(perDomain)) {
    const b = perDomain[k];
    b.progress = b.total ? Math.round((b.passed / b.total) * 100) : 0;
  }
  const totals = Object.values(perDomain).reduce((a, b) => ({ total: a.total + b.total, passed: a.passed + b.passed, checked: a.checked + b.checked }), { total: 0, passed: 0, checked: 0 });
  return {
    band: current ? current.label : "-",
    domains: DENVER_DOMAINS.map((d) => perDomain[d.key]),
    progress: totals.total ? Math.round((totals.passed / totals.total) * 100) : 0,
    checked: totals.checked, total: totals.total,
    delayed: delayed.map((d) => d.key), advanced: advanced.map((d) => d.key),
  };
}

// --- routes ---
export const denverRouter = new Hono();

function childAgeMonths(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  return Math.round(((Date.now() - d.getTime()) / 864e5 / 30.4375) * 10) / 10;
}
function resultsOf(childId) {
  const out = {};
  for (const r of rows("SELECT item_key,status,note,checked_at FROM denver_results WHERE child_id=?", childId))
    out[r.item_key] = r;
  return out;
}
denverRouter.get("/api/denver", need(...STAFF), (c) => {
  const childId = c.req.query("childId");
  const child = row("SELECT id,dob,full_name FROM children WHERE id=?", childId || "-");
  if (!child) return err(c, "not_found", "pasien tidak ada", 404);
  const age = childAgeMonths(child.dob);
  const results = resultsOf(child.id);
  const current = bandForAge(age);
  const bands = DENVER_BANDS.map((b) => ({
    key: b.key, label: b.label, minMonths: b.minMonths, maxMonths: b.maxMonths,
    isCurrent: current ? b.key === current.key : false,
    items: b.items.map((it) => ({ ...it, status: results[it.key]?.status || null, note: results[it.key]?.note || "" })),
  }));
  return c.json({ childId: child.id, childName: child.full_name, ageMonths: age, bands, score: scoreDenver(DENVER_BANDS, results, age) });
});
denverRouter.put("/api/denver", need("owner", "dokter", "terapis"), async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!b.child_id || !b.item_key) return err(c, "invalid", "child_id + item_key wajib", 400);
  if (!DENVER_STATUSES.includes(b.status)) return err(c, "invalid", "status tidak dikenal", 400);
  if (!DENVER_BANDS.some((band) => band.items.some((it) => it.key === b.item_key))) return err(c, "not_found", "item tidak dikenal", 404);
  run("INSERT OR REPLACE INTO denver_results(child_id,item_key,status,note,checked_at,checked_by) VALUES(?,?,?,?,?,?)",
    b.child_id, b.item_key, b.status, b.note || "", new Date().toISOString(), c.get("user").id);
  audit(c.get("user").id, "denver_check", "child", b.child_id, { item: b.item_key, status: b.status });
  return c.json({ ok: true });
});
// ponytail: portal sees the score and the checklist of the current age band — never clinician notes
denverRouter.get("/api/portal/denver/:id", need("parent"), needOwnChild, (c) => {
  const child = row("SELECT id,dob FROM children WHERE id=?", c.req.param("id"));
  if (!child) return err(c, "not_found", "not found", 404);
  const age = childAgeMonths(child.dob);
  const results = resultsOf(child.id);
  const score = scoreDenver(DENVER_BANDS, results, age);
  const band = DENVER_BANDS.find((b) => b.label === score.band);
  const itemsByDomain = {};
  for (const d of DENVER_DOMAINS) itemsByDomain[d.key] = [];
  for (const it of band?.items || []) {
    itemsByDomain[it.domain]?.push({ text: it.text, status: results[it.key]?.status || null });
  }
  return c.json({
    band: score.band, progress: score.progress, checked: score.checked, total: score.total,
    domains: score.domains.map((d) => ({
      key: d.key, label: d.label, passed: d.passed, total: d.total, progress: d.progress,
      items: itemsByDomain[d.key] || [],
    })),
    flags: { delayed: score.delayed.length, advanced: score.advanced.length },
  });
});
