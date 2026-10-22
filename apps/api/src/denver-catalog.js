// ponytail: the Denver II style checklist catalog — baseline content, seeded into denver_items once.
// After that the database is the source of truth, so clinicians can add / edit / remove items.
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
