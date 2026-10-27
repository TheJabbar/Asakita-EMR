import { getDb, migrate, uid } from "./db.js";
import { hashPassword } from "./auth.js";
migrate();
const db = getDb();
// demo data is opt-out: Docker images set SEED_DEMO=0 (prod); compose/dev/tests keep the demo.
// Tests always get the demo (NODE_ENV=test) regardless of the env.
const DEMO = process.env.NODE_ENV === "test" || process.env.SEED_DEMO !== "0";
const has = (email) => db.prepare("SELECT id FROM users WHERE email=?").get(email);
function addUser(name, email, role, pw = "prototype") {
  if (has(email)) return has(email).id;
  const id = uid("u");
  db.prepare("INSERT INTO users(id,name,email,password_hash,role,created_at) VALUES(?,?,?,?,?,?)")
    .run(id, name, email, hashPassword(pw), role, new Date().toISOString());
  return id;
}
let dokter = null;

if (!DEMO) {
  // ponytail: production = exactly one dokter account, credentials from env (Render secrets)
  const email = process.env.DOKTER_EMAIL, pw = process.env.DOKTER_PASSWORD;
  if (!email || !pw) console.error("SEED_DEMO=0 tanpa DOKTER_EMAIL/DOKTER_PASSWORD — tidak ada akun staff bisa masuk!");
  else {
    const ex = has(email);
    if (ex) db.prepare("UPDATE users SET password_hash=?, role='dokter', status='active' WHERE id=?").run(hashPassword(pw), ex.id);
    else db.prepare("INSERT INTO users(id,name,email,password_hash,role,status,created_at) VALUES(?,?,?,?,?,?,?)")
      .run(uid("u"), "Dokter", email, hashPassword(pw), "dokter", "active", new Date().toISOString());
    console.log("seed prod: akun dokter siap (" + email + ")");
  }
  // demo accounts have a publicly documented password — they must not survive a prod boot
  for (const e of ["dokter@asakita.demo", "terapis@asakita.demo", "admin@asakita.demo", "owner@asakita.demo", "alya@example.com", "budi@example.com", "abdul.jabbar.3794@gmail.com"])
    if (e !== email) db.prepare("UPDATE users SET status='inactive' WHERE email=?").run(e);
}

if (DEMO) {
dokter = addUser("dr. Imelda", "dokter@asakita.demo", "dokter");
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
  const g = (child, d, w, h2) => db.prepare("INSERT INTO growth_records(id,child_id,date,weight_kg,height_cm,recorded_by) VALUES(?,?,?,?,?,?)").run(uid("g"), child, d, w, h2, dokter);
  for (const [k, l, s] of [["kontak_mata", "Kontak mata", "in_progress"], ["instruksi_1", "Instruksi 1 langkah", "achieved"], ["kosakata", "Kosakata ekspresif", "in_progress"]])
    db.prepare("INSERT OR REPLACE INTO milestones(child_id,key,label,status,updated_at) VALUES(?,?,?,?,?)").run(c2, k, l, s, t);
  console.log("seed ok");
}
}
// --- end of demo users + children ---

// ponytail: education articles — real Indonesian sources (title/author stay curated, body is our
// summary + a link to the source). Idempotent: stub-era rows (no source_url) get backfilled once,
// after that an editor's changes in the EMR win.
const ARTICLES = [
  ["panduan-asi", "Panduan ASI Eksklusif 0–6 Bulan", "ASI", "dr. Imelda Hady, Sp.A", "0-6",
    "ASI eksklusif diberikan sejak lahir sampai usia 6 bulan: hanya ASI, tanpa tambahan makanan atau minuman lain kecuali obat. WHO dan IDAI menyebut ASI saja sudah mencukupi kebutuhan gizi bayi pada periode ini sekaligus menunjang daya tahan tubuh. Pengganti ASI hanya diberikan bila ada kondisi medis tertentu atau atas anjuran dokter.",
    "Kompas Health", "https://health.kompas.com/read/24C07180000868/apakah-asi-eksklusif-harus-6-bulan-ini-penjelasannya-"],
  ["mpasi-pertama", "MPASI Pertama Usia 6 Bulan", "MPASI", "Tim Asakita", "6-12",
    "IDAI menjelaskan MPASI mulai diberikan ketika ASI saja tidak lagi mencukupi kebutuhan bayi, yaitu sekitar usia 6 bulan. Mulailah dari tekstur lumat dengan porsi kecil, lalu tingkatkan tekstur dan jumlahnya sesuai kemampuan anak. Panduan resmi MPASI dari Unit Kerja Koordinasi Nutrisi IDAI bisa dipakai orang tua sebagai acuan di rumah.",
    "IDAI", "https://www.idai.or.id/artikel/klinik/asi/pemberian-makanan-pendamping-air-susu-ibu-mpasi"],
  ["menu-mpasi", "Menu MPASI Mingguan", "MPASI", "Tim Asakita", "6-12",
    "Buku resep Kemenkes (2023) memberi acuan bayi 6–8 bulan: bubur kental 2–3 kali sehari ditambah 1–2 kali selingan, mulai 2–3 sendok makan lalu naik bertahap sampai setengah mangkuk (125 ml). Protein hewani seperti ikan, ayam, telur, dan daging sebaiknya ada di setiap menu; contohnya bubur soto ayam santan atau bubur singkong isi ikan. Pada usia 9–11 bulan teksturnya naik menjadi cincang halus dengan frekuensi 3–4 kali sehari.",
    "Kompas Food", "https://www.kompas.com/food/read/2025/04/08/070000475/mpasi-6-bulan-pertama-menurut-buku-panduan-kemenkes-bayi-makan-apa-dan"],
  ["stimulasi-bicara", "Cara Stimulasi Bicara di Rumah", "stimulasi", "Kak Dini", "2-3",
    "Perkembangan bicara dibagi menjadi bahasa reseptif (memahami) dan ekspresif (mengucapkan). Stimulasi paling efektif lewat bermain sesuai usia: ci-luk-ba dan lagu untuk bayi, buku bergambar, sampai lempar-tangkap bola sambil menyebut kata seperti “tangkap”, “lempar”, dan “bola”. Bila anak belum mengucapkan satu kata jelas pada usia 18 bulan, sebaiknya segera berkonsultasi dengan dokter.",
    "RS Universitas Indonesia", "https://rs.ui.ac.id/umum/berita-artikel/artikel-populer/stimulasi-anak-untuk-bicara-di-rumah"],
  ["sensorik", "Aktivitas Sensorik Sederhana", "stimulasi", "Tim Asakita", "1-2",
    "Sensory play tidak perlu mainan mahal: pasta mie rebus, agar-agar, beras, potongan buah, tepung, dan sereal bisa dipakai untuk mengeksplorasi tekstur, bentuk, dan sensasi berbeda. Kegiatan ini melatih kekuatan jari, koordinasi tangan-mata, ketelitian, serta kreativitas anak. Tetap dampingi anak dan pilih bahan yang aman untuk usianya.",
    "RRI Banda Aceh", "https://rri.co.id/banda-aceh/iptek/2047835/ide-sensory-play-anak-dari-bahan-sehari-hari"],
  ["pompa-asi", "Pompa ASI untuk Ibu Bekerja", "ASI", "Konselor Laktasi", "0-6",
    "IDAI merangkum cara sukses menyusui saat kembali bekerja: pompa ASI secara rutin mengikuti jadwal menyusui, simpan ASI perah di wadah bersih berlabel tanggal, dan atur suhu penyimpanan. ASI perah di lemari es sekitar 4°C dapat bertahan sampai 5 hari, sedangkan di freezer bisa lebih lama tergantung jenis freezer-nya. Hangatkan dengan air hangat, jangan direbus atau dibekukan ulang.",
    "IDAI", "https://www.idai.or.id/artikel/klinik/asi/sukses-menyusui-saat-bekerja-2"],
  ["jadwal-makan", "Jadwal Makan Bayi 6–9 Bulan", "MPASI", "Tim Asakita", "6-12",
    "Mulai MPASI dengan frekuensi 2–3 kali sehari: beri satu kali makan lebih dulu, lalu tambah bertahap sambil melihat respons bayi. Porsi awal kira-kira sebesar bola pingpong dan dinaikkan sesuai nafsu makan; hentikan bila bayi menolak, menutup mulut, atau mengalihkan pandangan. Variasikan menu dan jaga kebersihan alat makan, serta ingat bahwa ASI tetap diberikan sampai usia 2 tahun atau lebih.",
    "Antara News", "https://www.antaranews.com/berita/4506489/penuhi-kebutuhan-nutrisi-si-kecil-dengan-jadwal-mpasi-yang-tepat"],
  ["snack-sehat", "Snack Sehat Anak 1–2 Tahun", "MPASI", "Tim Asakita", "1-2",
    "Camilan menyumbang energi dan gizi yang tidak didapat anak dari makan utama, jadi berikan 2–3 kali sehari di antara waktu makan. Pilih yang padat nutrisi: yoghurt dan susu, tahu-tempe, telur rebus, buah bertekstur lembut, sandwich selai kacang tanpa gula tambahan, atau smoothie buah. Batasi camilan manis kemasan yang tinggi gula dan garam.",
    "RSUD Meuraxa Banda Aceh", "https://rsum.bandaacehkota.go.id/pilihan-cemilan-anak-1-tahun-yang-sehat-dan-padat-nutrisi/"],
  ["main-balok", "Main Balok untuk Motorik Halus", "stimulasi", "Kak Dini", "1-2",
    "Menyusun balok melatih motorik halus (jari dan pergelangan tangan) sekaligus motorik kasar saat anak merangkak dan meraih. Permainan ini juga mempertajam nalar spasial, koordinasi mata-tangan, dan kemampuan memecahkan masalah lewat trial and error. Karena anak bisa lama fokus membangun menara, rentang perhatiannya ikut terlatih.",
    "Universitas Medan Area (BARAKA)", "https://baraka.uma.ac.id/manfaat-permainan-balok-untuk-tumbuh-kembang-anak/"],
  ["dongeng", "Dongeng 10 Menit Sehari", "stimulasi", "Tim Asakita", "2-3",
    "Mendongeng mempererat ikatan orang tua dan anak, sekaligus melatih kognitif, daya ingat, dan kemampuan verbal. Cerita juga menumbuhkan empati serta membantu anak memahami nilai seperti kejujuran dan persahabatan. Cukup 10 menit sehari sebelum tidur, dilakukan konsisten.",
    "Alodokter", "https://www.alodokter.com/manfaat-dongeng-bagi-pertumbuhan-si-kecil"],
  ["tantrum", "Mengatasi Tantrum dengan Tenang", "perilaku", "Psikolog Anak", "2-3",
    "Tantrum adalah luapan emosi yang wajar pada anak usia dini, misalnya menangis, berteriak, atau menendang ketika keinginannya tidak terpenuhi. Orang tua perlu tetap tenang, memberi ruang yang aman, dan membantu anak mengenali emosinya dengan kalimat pendek. Menuruti semua tuntutan hanya agar tantrum berhenti justru membuat pola ini berulang.",
    "Kementerian Kesehatan RI", "https://keslan.kemkes.go.id/view_artikel/3995/tantrum-pada-anak-dan-ketahui-apa-saja-penyebabnya"],
  ["toilet-training", "Toilet Training Tanpa Drama", "perilaku", "Tim Asakita", "2-3",
    "Kesiapan toilet training berbeda pada setiap anak; umumnya tanda siap muncul antara usia 18 bulan dan 2,5 tahun. Yang perlu dilihat: anak bisa duduk sendiri, popok kering saat bangun tidur, paham instruksi sederhana, dan menunjukkan ketertarikan pada toilet. Lakukan bertahap dengan rutinitas dan pujian, tanpa memaksa atau menghukum saat anak “kecolongan”.",
    "IDAI", "https://www.idai.or.id/artikel/klinik/pengasuhan-anak/toilet-training"],
  ["screen-time", "Batasan Screen Time Usia Dini", "perilaku", "dr. Imelda Hady, Sp.A", "2-3",
    "IDAI dan American Academy of Pediatrics menyarankan anak di bawah 2 tahun menghindari layar, kecuali video call dengan keluarga. Untuk anak di atas 2 tahun, screen time sebaiknya tidak lebih dari 2 jam sehari, itu pun untuk konten berkualitas dan didampingi orang tua. Ganti waktu layar dengan membaca buku, bermain aktif, dan interaksi langsung.",
    "IDAI", "https://www.idai.or.id/artikel/seputar-kesehatan-anak/keamanan-menggunakan-internet-bagi-anak"],
];
{
  const today = new Date().toISOString().slice(0, 10);
  for (const [slug, title, cat, au, age, body, srcName, srcUrl] of ARTICLES) {
    const existing = db.prepare("SELECT id, source_url FROM articles WHERE slug=?").get(slug);
    if (!existing)
      db.prepare("INSERT INTO articles(id,slug,title,category,author,body_md,age_tag,published_at,source_name,source_url) VALUES(?,?,?,?,?,?,?,?,?,?)")
        .run(uid("ar"), slug, title, cat, au, body, age, today, srcName, srcUrl);
    else if (!existing.source_url) // stub-era row → fill it once; later edits from the EMR are kept
      db.prepare("UPDATE articles SET body_md=?, source_name=?, source_url=? WHERE id=?").run(body, srcName, srcUrl, existing.id);
  }
}

// ponytail: third demo family (Abdul Jr.) so the parent portal can be demoed with a fuller profile
if (DEMO) {
const abdulUser = addUser("Abdul Jabbar", "abdul.jabbar.3794@gmail.com", "parent");
let abdulParent = db.prepare("SELECT id FROM parents WHERE user_id=?").get(abdulUser);
if (!abdulParent) {
  abdulParent = { id: uid("p") };
  db.prepare("INSERT INTO parents(id,user_id,phone) VALUES(?,?,?)").run(abdulParent.id, abdulUser, "+62 812-3456-7890");
}
let abdulKid = db.prepare("SELECT id FROM children WHERE mr_number='0001455'").get();
if (!abdulKid) {
  abdulKid = { id: uid("c") };
  db.prepare("INSERT INTO children(id,mr_number,full_name,nickname,dob,gender,blood_type,birth_weight_kg,birth_length_cm,address,insurance,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(abdulKid.id, "0001455", "Abdul Jr.", "Abdul Jr.", "2023-08-20", "Laki-laki", "A", 3.0, 48, "Makassar", "Pribadi", new Date(Date.now() - 120 * 864e5).toISOString());
}
db.prepare("INSERT OR IGNORE INTO parent_children(parent_id,child_id,relation) VALUES(?,?,?)").run(abdulParent.id, abdulKid.id, "Ayah");
db.prepare("INSERT OR REPLACE INTO medical_history(child_id,birth_history,allergies,notes) VALUES(?,?,?,?)")
  .run(abdulKid.id, "Lahir cukup bulan, BB 3.0 kg, PB 48 cm.", "-", "Pemantauan bicara; kontrol rutin tiap 6 bulan.");

// ponytail: demo growth measurements (BB / TB / LK) for every demo child — idempotent, so an
// already-seeded DB (production) also gets them. Values follow the WHO boy median ± ~0.3 SD.
// [tanggal, berat kg, tinggi cm, lingkar kepala cm]
const DEMO_GROWTH = {
  "0001248": [["2025-04-12", 9.8, 76.0, 46.5], ["2025-10-12", 11.2, 83.0, 47.5], ["2026-04-12", 12.8, 88.0, 48.1], ["2026-10-01", 13.9, 92.0, 48.4]],
  "0001301": [["2024-11-07", 9.4, 75.0, 46.0], ["2025-05-07", 10.9, 82.0, 47.2], ["2025-11-07", 12.0, 87.0, 47.8], ["2026-07-01", 12.8, 90.5, 48.1], ["2026-09-01", 13.5, 92.0, 48.4]],
  "0001400": [["2023-01-01", 9.9, 77.0, 46.8], ["2024-01-01", 12.5, 88.0, 48.0], ["2025-01-01", 14.6, 96.0, 49.0], ["2026-01-01", 16.4, 102.0, 49.6], ["2026-10-01", 17.6, 106.0, 50.0]],
  "0001455": [["2024-02-20", 7.9, 67.6, 43.3], ["2024-08-20", 9.6, 75.7, 46.1], ["2025-08-20", 12.2, 87.1, 48.3], ["2026-09-20", 14.2, 96.5, 49.2]],
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

// ponytail: Abdul Jr.'s screening / milestones / Denver checks (36–48 month band) — idempotent
if (abdulKid) {
  const t = new Date().toISOString().slice(0, 10);
  for (const [domain, result, note] of [
    ["motorik_kasar", "Sesuai usia", "Berlari, melompat, naik tangga bergantian."],
    ["motorik_halus", "Sesuai usia", "Menyusun balok, memegang krayon."],
    ["bahasa", "Dalam proses", "Kalimat 3 kata; kosakata terus bertambah."],
    ["sosial_emosional", "Sesuai usia", "Bermain bersama teman, mulai bergiliran."],
    ["kognitif", "Sesuai usia", "Mengenal warna dan bentuk."],
  ])
    if (!db.prepare("SELECT id FROM screenings WHERE child_id=? AND domain=?").get(abdulKid.id, domain))
      db.prepare("INSERT INTO screenings(id,child_id,date,domain,result,note) VALUES(?,?,?,?,?,?)")
        .run(uid("sc"), abdulKid.id, t, domain, result, note);
  for (const [k, l, s] of [["kalimat_3_kata", "Kalimat 3 kata", "in_progress"], ["makan_sendiri", "Makan sendiri", "achieved"], ["toilet", "Mulai toilet training", "in_progress"]])
    db.prepare("INSERT OR REPLACE INTO milestones(child_id,key,label,status,updated_at) VALUES(?,?,?,?,?)").run(abdulKid.id, k, l, s, t);
  for (const [k, s] of [["b6-motor-1", "pass"], ["b6-language-1", "not_yet"], ["b6-social-1", "pass"]])
    if (db.prepare("SELECT id FROM denver_items WHERE id=?").get(k))
      db.prepare("INSERT OR IGNORE INTO denver_results(child_id,item_key,status,note,checked_at,checked_by) VALUES(?,?,?,?,?,?)")
        .run(abdulKid.id, k, s, "", t, null);
  console.log("seed abdul ok");
}

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
}
// --- end of demo data ---
