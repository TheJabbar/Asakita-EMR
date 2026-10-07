// ponytail: one-file EMR — hash routes, plain fetch, no router lib; CSS-injected design system (no new deps)
import React, { useEffect, useMemo, useRef, useState } from "react";
// ponytail: same-origin default (Fly serves API+UI on one host); dev uses vite proxy below
const API = (import.meta as any).env?.VITE_API_URL || "";
const j = (r: Response) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); };
const api = {
  get: (p: string) => fetch(API + p, { credentials: "include" }).then(j),
  post: (p: string, b: any) => fetch(API + p, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(j),
  put: (p: string, b: any) => fetch(API + p, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(j),
  patch: (p: string, b: any) => fetch(API + p, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(j),
  del: (p: string) => fetch(API + p, { method: "DELETE", credentials: "include" }).then(j),
};
// ponytail: client helpers only — server remains source of truth for ages/statuses
const initials = (n: string) => (n || "?").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const ageID = (dob: string) => {
  if (!dob) return "-";
  const d = new Date(dob), n = new Date();
  let m = (n.getFullYear() - d.getFullYear()) * 12 + (n.getMonth() - d.getMonth());
  if (m < 0 || isNaN(m)) return "-";
  const y = Math.floor(m / 12); m = m % 12;
  return y > 0 ? `${y} thn ${m} bln` : `${m} bln`;
};
const pill = (s: string) => {
  s = (s || "").toLowerCase();
  if (["selesai", "done", "aktif", "active", "achieved", "tercapai", "confirmed", "konfirmasi"].includes(s)) return "ok";
  if (["berjalan", "in_progress", "proses", "waiting", "menunggu", "scheduled"].includes(s)) return "warn";
  if (["prioritas", "cancelled", "batal", "concern", "danger"].includes(s)) return "bad";
  return "";
};
const NEXT: Record<string, string[]> = { scheduled: ["confirmed", "cancelled"], confirmed: ["waiting", "in_progress", "cancelled"], waiting: ["in_progress", "cancelled"], in_progress: ["done", "cancelled"], done: [], cancelled: ["scheduled"] };

const css = `
:root{--bg:#f4eee1;--paper:#fffdf7;--card:#ffffff;--ink:#1c2f29;--muted:#6d7c74;--line:#e7dac4;--sage:#2c5545;--sage2:#477a61;--sage-soft:#e2efe2;--gold:#c9952f;--gold-soft:#fbf0d3;--peach:#ef9d7c;--danger:#b6493f;--ok:#2e7d4f;--radius:20px;--sh:0 14px 34px rgba(44,85,69,.10);--sh-lg:0 24px 60px rgba(44,85,69,.16)}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;font-family:"Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased}
body:before{content:"";position:fixed;inset:0;pointer-events:none;opacity:.5;background:radial-gradient(900px 400px at 10% 0%,#f7d9a522,transparent),radial-gradient(800px 380px at 95% 15%,#477a6122,transparent),url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='.9'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .04 0'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E")}
h1,h2,.serif{font-family:Fraunces,Georgia,"Times New Roman",serif;letter-spacing:-.02em}
button,input,select,textarea{font:inherit}
:focus-visible{outline:3px solid var(--gold);outline-offset:2px;border-radius:8px}
@keyframes rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes pop{0%{transform:scale(.96);opacity:0}100%{transform:none;opacity:1}}
@keyframes shake{20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
/* ---- login ---- */
.lg{min-height:100vh;display:grid;grid-template-columns:460px 1fr}
.lg-brand{background:linear-gradient(165deg,#24473a 0%,#16291f 70%),radial-gradient(400px 300px at 80% 10%,#c9952f33,transparent);color:#f3efe2;padding:52px 44px;position:relative;overflow:hidden;display:flex;flex-direction:column}
.lg-brand:before{content:"";position:absolute;width:340px;height:340px;border-radius:50%;background:#ffffff0d;top:-120px;right:-120px}
.lg-brand:after{content:"";position:absolute;width:220px;height:220px;border-radius:46% 54% 60% 40%;background:#c9952f26;bottom:-70px;left:-60px;transform:rotate(-18deg)}
.lg-mark{width:92px;height:92px;border:2.5px solid #f3efe2;border-radius:50%;display:grid;place-items:center;font-size:42px;margin:8px auto 14px;position:relative;z-index:1;background:#ffffff12}
.lg-title{text-align:center;letter-spacing:11px;font-size:38px;margin:0;z-index:1}
.lg-sub{text-align:center;opacity:.8;font-size:12.5px;letter-spacing:2.5px;text-transform:uppercase;z-index:1}
.lg-tag{background:#f7e3b022;border:1px solid #f7e3b055;border-radius:18px;padding:16px 18px;text-align:center;margin:26px 0;font-size:14px;line-height:1.5;z-index:1}
.lg-feats{display:grid;gap:14px;margin-top:8px;z-index:1}.lg-feats>div{display:grid;grid-template-columns:40px 1fr;gap:12px;align-items:start;background:#ffffff0e;border:1px solid #ffffff18;border-radius:16px;padding:12px 14px}
.lg-feats i{width:38px;height:38px;border-radius:12px;background:#f7e3b022;display:grid;place-items:center;font-style:normal;font-size:18px}
.lg-feats b{font-size:13.5px}.lg-feats p{margin:3px 0 0;font-size:12.5px;opacity:.75;line-height:1.45}
.lg-quote{margin-top:auto;padding-top:28px;text-align:center;font-family:Fraunces,Georgia,serif;font-style:italic;font-size:19px;opacity:.92;z-index:1}
.lg-hero{display:flex;align-items:center;justify-content:center;padding:48px 32px;position:relative}
.lg-date{position:absolute;top:22px;right:34px;font-size:13px;color:var(--muted)}
.lg-card{width:min(480px,94vw);background:color-mix(in srgb,var(--card) 88%,transparent);backdrop-filter:blur(12px);border:1px solid #fff;border-radius:28px;padding:38px;box-shadow:var(--sh-lg);animation:pop .45s ease}
.lg-card h1{margin:0;font-size:36px}.lg-card h2{margin:4px 0 6px;color:var(--sage);font-size:21px;font-weight:600}
.lg-card>p{color:var(--muted);font-size:13.5px;line-height:1.55}
.lbl{display:block;font-weight:700;font-size:11.5px;letter-spacing:.8px;text-transform:uppercase;color:#43544d;margin:16px 0 7px}
.inp{height:50px;border:1.5px solid #d8d2c2;border-radius:14px;padding:0 15px;width:100%;font-size:14.5px;background:#fff;transition:.18s}
.inp:focus{border-color:var(--sage2);box-shadow:0 0 0 4px #477a6122;outline:none}
textarea.inp{height:auto;min-height:96px;padding:12px 14px;resize:vertical;line-height:1.55}
select.inp{appearance:none;background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%232c5545' stroke-width='2' fill='none'/%3E%3C/svg%3E") no-repeat right 14px center}
.btn{border:0;border-radius:14px;padding:13px 18px;font-weight:800;cursor:pointer;transition:.18s;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-size:14px}
.btn:hover{transform:translateY(-1px);filter:brightness(1.02)}.btn:active{transform:none}
.btn-p{background:linear-gradient(135deg,var(--sage2),var(--sage));color:#fff;box-shadow:0 12px 24px #2c554533;width:100%}
.btn-g{background:#fff;border:1.5px solid #c9cfc4;color:var(--ink);width:100%}
.btn-s{width:auto;padding:9px 14px;font-size:13px;background:#fff;border:1.5px solid var(--line)}
.btn-s:hover{border-color:var(--sage2)}
.btn:disabled{opacity:.6;cursor:wait;transform:none}
.lg-err{background:#fde7e4;border:1px solid #f3b8b1;color:#8c2f28;border-radius:12px;padding:11px 14px;font-size:13px;margin-top:14px;animation:shake .4s}
.lg-ok{background:var(--sage-soft);border:1px solid #bcd8bf;color:#245c3d;border-radius:12px;padding:11px 14px;font-size:13px;margin-top:14px}
.linklike{background:none;border:0;color:var(--sage);font-size:13px;cursor:pointer;text-decoration:underline;padding:0}
/* ---- shell ---- */
.shell{display:grid;grid-template-columns:272px 1fr;min-height:100vh}
.side{background:linear-gradient(180deg,#2c5545,#1d3a2f);color:#eef3ec;padding:26px 16px;position:sticky;top:0;height:100vh;overflow:auto;display:flex;flex-direction:column;gap:4px}
.side-head{display:flex;gap:12px;align-items:center;padding:4px 10px 18px;border-bottom:1px solid #ffffff1e;margin-bottom:14px}
.side-mark{width:50px;height:50px;border:2px solid #f3efe2;border-radius:50%;display:grid;place-items:center;font-size:24px;flex:none;background:#ffffff14}
.side-head strong{letter-spacing:4px;font-family:Fraunces,Georgia,serif;font-size:19px}
.side-head small{opacity:.75;font-size:11px;letter-spacing:1px}
.side-sec{font-size:10.5px;letter-spacing:1.5px;text-transform:uppercase;opacity:.6;padding:12px 12px 5px}
.side a{color:#eef3ec;display:flex;gap:12px;align-items:center;padding:11px 13px;border-radius:13px;text-decoration:none;font-size:14px;font-weight:600;transition:.15s;border:1px solid transparent}
.side a:hover{background:#ffffff14}
.side a.on{background:#fdf8ea;color:var(--sage);box-shadow:0 8px 20px #00000030}
.side a .ic{width:24px;text-align:center}
.side-foot{margin-top:auto;background:#ffffff12;border:1px solid #ffffff20;border-radius:16px;padding:14px;font-size:12px;line-height:1.5}
.main{padding:0;min-width:0}
.topbar{position:sticky;top:0;z-index:20;display:flex;gap:14px;align-items:center;padding:14px 28px;background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
.search{position:relative;flex:1;max-width:560px}
.search input{height:48px;border:0;border-radius:999px;background:#fff;padding:0 20px 0 46px;width:100%;box-shadow:0 8px 22px rgba(44,85,69,.08);font-size:14px}
.search input:focus{outline:3px solid #c9952f66}
.search .mag{position:absolute;left:17px;top:13px;opacity:.55}
.search-drop{position:absolute;top:54px;left:0;right:0;background:#fff;border-radius:18px;box-shadow:var(--sh-lg);overflow:hidden;border:1px solid var(--line)}
.search-drop a{display:flex;justify-content:space-between;padding:11px 16px;text-decoration:none;color:var(--ink);font-size:13.5px}
.search-drop a:hover{background:#f7f3e7}
.profile{margin-left:auto;display:flex;align-items:center;gap:11px;background:#fff;border-radius:999px;padding:6px 8px 6px 6px;box-shadow:0 8px 22px rgba(44,85,69,.08)}
.avatar{width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#f0d49a,#bcd8bf);display:grid;place-items:center;font-weight:800;color:var(--sage);font-size:13px;flex:none}
.page{padding:26px 30px 60px;max-width:1180px}
.page>*{animation:rise .5s both}.page>*:nth-child(2){animation-delay:.05s}.page>*:nth-child(3){animation-delay:.1s}.page>*:nth-child(4){animation-delay:.15s}
.page h2{font-size:32px;margin:0}.sub{color:var(--muted);margin:4px 0 20px;font-size:14px}
.grid{display:grid;gap:16px}.cards{grid-template-columns:repeat(4,minmax(0,1fr))}.two{grid-template-columns:1.25fr .9fr}.three{grid-template-columns:repeat(3,minmax(0,1fr))}
.card{background:var(--card);border:1px solid #fff;border-radius:var(--radius);padding:20px;box-shadow:var(--sh);transition:.18s}
.card.hover:hover{transform:translateY(-3px);box-shadow:var(--sh-lg)}
.stat{display:flex;justify-content:space-between;gap:10px;align-items:start}
.stat small{color:var(--muted);font-weight:700;font-size:11.5px;letter-spacing:.6px;text-transform:uppercase}
.stat .num{font-size:34px;font-weight:800;margin:6px 0 8px;font-family:Fraunces,Georgia,serif}
.stat .emo{width:46px;height:46px;border-radius:15px;display:grid;place-items:center;font-size:22px;background:var(--sage-soft)}
.pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:5px 11px;font-size:11.5px;font-weight:800;background:#edf2ec;color:#3c5a4d;border:1px solid #d3e0d3}
.pill.ok{background:#e2f3e5;color:#256b41;border-color:#bfe0c5}
.pill.warn{background:#fdf0d2;color:#8a5a12;border-color:#f3d68f}
.pill.bad{background:#fbe3e1;color:#a33c33;border-color:#f0b9b4}
.tl{display:grid;gap:10px}.tl .it{display:grid;grid-template-columns:56px 1fr auto;gap:12px;align-items:center;padding:12px 14px;border-radius:15px;background:#faf7ee;border:1px solid #f0e7d2;transition:.15s;text-decoration:none;color:inherit}
.tl .it:hover{background:#fff;border-color:var(--gold);transform:translateX(3px)}
.tl .it b{font-size:14px}
.bars{display:flex;align-items:end;gap:10px;height:150px;padding-top:10px}
.bar{flex:1;border-radius:9px 9px 5px 5px;background:linear-gradient(180deg,var(--sage2),var(--sage));position:relative;min-height:12px;transition:.2s}
.bar:hover{filter:brightness(1.1)}.bar span{position:absolute;bottom:-22px;left:0;right:0;text-align:center;font-size:11px;color:var(--muted);font-weight:700}
.bar.alt{background:linear-gradient(180deg,#e8bd63,#c9952f)}
table.tbl{width:100%;border-collapse:collapse}
.tbl th,.tbl td{text-align:left;padding:12px 10px;border-bottom:1px solid #efe6d3;font-size:13.5px}
.tbl th{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.7px}
.tbl tbody tr{transition:.12s}.tbl tbody tr:hover{background:#fbf6e9}
.hero{background:linear-gradient(120deg,#2c5545,#3d6f58 60%,#c9952f 130%);color:#fff;border-radius:26px;padding:26px;display:grid;grid-template-columns:auto 1fr auto;gap:20px;align-items:center;box-shadow:var(--sh-lg);position:relative;overflow:hidden}
.hero:before{content:"";position:absolute;width:280px;height:280px;border-radius:50%;background:#ffffff12;right:-90px;top:-90px;pointer-events:none}
.hero-photo{width:84px;height:84px;border-radius:26px;background:#ffffff22;border:2px solid #ffffff66;display:grid;place-items:center;font-size:40px}
.tabs{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}
.tab{border:1.5px solid var(--line);background:#fff;border-radius:999px;padding:9px 16px;font-weight:700;font-size:13px;cursor:pointer;transition:.15s}
.tab.on,.tab:hover{background:var(--sage);color:#fff;border-color:var(--sage)}
.fgrid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.soap-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.soap-box{background:#faf7ee;border:1.5px solid #ece1cb;border-radius:16px;padding:14px}
.soap-box:focus-within{border-color:var(--sage2);box-shadow:0 0 0 4px #477a611c}
.soap-box label{font-weight:800;font-size:12px;letter-spacing:.5px}
.char{font-size:11px;color:var(--muted);float:right}
.checks{display:grid;gap:8px;margin:10px 0}.checks label{display:flex;gap:10px;align-items:center;background:#faf7ee;border:1px solid #ece1cb;padding:10px 12px;border-radius:12px;cursor:pointer;font-size:13.5px}
.checks input{width:18px;height:18px;accent-color:var(--sage)}
.growth-svg{width:100%;height:auto;background:#faf7ee;border-radius:16px;border:1px solid #eee2cb}
.print-card{background:#fff;border-radius:22px;padding:28px;box-shadow:var(--sh);border-top:8px solid var(--sage);position:relative}
.print-card:before{content:"";position:absolute;inset:10px;border:1px dashed var(--line);border-radius:14px;pointer-events:none}
.skel{border-radius:12px;background:linear-gradient(90deg,#eee7d3 25%,#f8f2e2 50%,#eee7d3 75%);background-size:200% 100%;animation:sh 1.2s infinite;height:16px}
@keyframes sh{to{background-position:-200% 0}}
.empty{text-align:center;padding:34px 16px;color:var(--muted)}.empty .big{font-size:44px}
.chips{display:flex;gap:8px;flex-wrap:wrap}
.toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px}
.toolbar .inp{width:auto;min-width:220px;height:44px}
.footer{color:var(--muted);font-size:12px;text-align:center;padding:26px}
@media(max-width:1020px){.lg{grid-template-columns:1fr}.lg-brand{display:none}.shell{grid-template-columns:1fr}.side{height:auto;position:static;flex-direction:column}.cards,.two,.three,.fgrid,.soap-grid{grid-template-columns:1fr}.page{padding:18px 16px 80px}.topbar{flex-wrap:wrap;padding:12px 14px}.hero{grid-template-columns:1fr;text-align:center;justify-items:center}}
@media print{.side,.topbar,.no-print{display:none!important}.page{padding:0}.print-card{box-shadow:none}}
`;

function useHash(): string {
  const [h, setH] = useState(location.hash || "#/");
  useEffect(() => { const f = () => setH(location.hash || "#/"); addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []);
  return h;
}

export default function App() {
  const h = useHash();
  const [me, setMe] = useState<any>(null);
  useEffect(() => { const s = document.createElement("style"); s.textContent = css; document.head.append(s); api.get("/api/me").then((r) => setMe((cur: any) => cur || (r.user && r.user.role !== "parent" ? r.user : null))).catch(() => {}); }, []);
  if (!me) return <Login onOk={setMe} />;
  const R = h.replace("#", "");
  const nav = (p: string, ic: string, l: string, sec?: string) => (<>{sec && <div className="side-sec">{sec}</div>}<a href={"#" + p} className={R === p || (p !== "/" && R.startsWith(p)) ? "on" : ""}><span className="ic">{ic}</span>{l}</a></>);
  return <div className="shell">
    <nav className="side" aria-label="Navigasi EMR">
      <div className="side-head"><div className="side-mark">♡</div><div><strong>ASAKITA</strong><small>EMR LITE • {me.name}</small></div></div>
      {nav("/", "⌂", "Dashboard", "Utama")}
      {nav("/patients", "◉", "Data Pasien", "Klinik")}
      {nav("/schedule", "▦", "Jadwal")}
      {/* ponytail: no SOAP nav — notes only make sense inside a visit, opened from Data Pasien → Catatan (route stays for deep links) */}
      {nav("/therapy", "⬢", "Terapi")}
      {nav("/progress", "◭", "Tumbuh Kembang")}
      {nav("/reports", "▤", "Laporan")}
      {["owner", "dokter"].includes(me?.role) ? nav("/users", "⚿", "Role & User", "Sistem") : null}
      <div className="side-foot">Masuk sebagai <b>{me.role}</b><br /><button className="btn btn-s" style={{ marginTop: 10, width: "100%", color: "#fff", background: "#ffffff22", borderColor: "#ffffff33" }} onClick={() => fetch(API + "/api/auth/logout", { method: "POST", credentials: "include" }).then(() => setMe(null))}>Keluar</button></div>
    </nav>
    <main className="main">
      <Topbar me={me} />
      <div className="page">{R === "/" || R === "" ? <Dash /> : R.startsWith("/patients") ? <Patients route={R} me={me} /> : R.startsWith("/schedule") ? <Sched /> : R.startsWith("/soap") ? <Soap route={R} /> : R.startsWith("/therapy") ? <Therapy /> : R.startsWith("/progress") ? <Progress /> : R.startsWith("/reports") ? <Reports /> : R.startsWith("/users") ? <Users /> : <div className="empty"><div className="big">🧭</div>Halaman tidak ditemukan.</div>}</div>
      <div className="footer">Asakita EMR — {new Date().getFullYear()}</div>
    </main>
  </div>;
}

function Topbar({ me }: any) {
  const [q, setQ] = useState(""); const [res, setRes] = useState<any>(null); const box = useRef<any>(null);
  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return; }
    const t = setTimeout(() => api.get("/api/search?q=" + encodeURIComponent(q)).then(setRes).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => { const f = (e: any) => { if (box.current && !box.current.contains(e.target)) setRes(null); }; document.addEventListener("click", f); return () => document.removeEventListener("click", f); }, []);
  return <header className="topbar">
    <div className="search" ref={box}>
      <span className="mag">⌕</span>
      <input placeholder="Cari nama pasien, nomor RM, atau layanan… (min. 2 huruf)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Pencarian" />
      {res && <div className="search-drop">
        {(res.patients || []).map((p: any) => <a key={p.id} href={"#/patients/" + p.id}>👶 <b>{p.full_name}</b> <span style={{ color: "#6d7c74" }}>{p.mr_number}</span></a>)}
        {(res.appointments || []).map((a: any) => <a key={a.id} href="#/schedule">📅 {a.type} <span className="pill">{a.status}</span></a>)}
        {!res.patients?.length && !res.appointments?.length && <div style={{ padding: 14, fontSize: 13, color: "#6d7c74" }}>Tidak ada hasil untuk “{q}”.</div>}
      </div>}
    </div>
    <div className="profile"><div className="avatar">{initials(me.name)}</div><div style={{ paddingRight: 6 }}><b style={{ fontSize: 13 }}>{me.name}</b><br /><small style={{ color: "#6d7c74" }}>{me.role}</small></div></div>
  </header>;
}

function Login({ onOk }: any) {
  const [e, setE] = useState(""), [p, setP] = useState(""), [m, setM] = useState(""), [ok, setOk] = useState(""), [busy, setBusy] = useState(false), [show, setShow] = useState(false);
  const fail = (err: any) => {
    const s = String(err?.message || err);
    if (s.includes("401")) setM("Email / password salah. Coba lagi.");
    else if (s.includes("429")) setM("Terlalu banyak percobaan — tunggu 1 menit.");
    else if (s.includes("Failed to fetch")) setM("Tidak bisa hubungi API di " + API + ". Pastikan `npm run dev:api` / compose berjalan.");
    else setM("Gagal masuk (" + s + ").");
    setBusy(false);
  };
  const go = (body: any, url: string) => { setBusy(true); setM(""); setOk(""); api.post(url, body).then((r) => { if (r.user && r.user.role === "parent") { setBusy(false); setM("Akun ini akun orang tua — buka portal di :5174, bukan EMR."); return; } onOk(r.user); }).catch(fail); };
  // ponytail: real Google button (GIS) only when backend has GOOGLE_CLIENT_ID; client id comes from /api/config (no rebuild)
  const [gcid, setGcid] = useState<string | null>(null);
  useEffect(() => { fetch(API + "/api/config").then((r) => r.json()).then((c) => setGcid(c.googleClientId)).catch(() => {}); }, []);
  useEffect(() => {
    if (!gcid) return;
    const w = window as any;
    const render = () => { w.google.accounts.id.initialize({ client_id: gcid, callback: (r: any) => go({ idToken: r.credential }, "/api/auth/google") }); w.google.accounts.id.renderButton(document.getElementById("gbtn"), { theme: "outline", size: "large" }); };
    if (w.google?.accounts) { render(); return; }
    if (document.getElementById("gsi")) { document.getElementById("gsi")!.addEventListener("load", render); return; }
    const s = document.createElement("script"); s.id = "gsi"; s.src = "https://accounts.google.com/gsi/client"; (s as any).onload = render; document.head.append(s);
  }, [gcid]);
  return <div className="lg">
    <aside className="lg-brand">
      <div className="lg-mark">♡</div>
      <h1 className="lg-title serif">ASAKITA</h1>
      <p className="lg-sub">Child Development & Therapy Center</p>
      <div className="lg-tag">Tumbuh bersama — <b>langkah kecil</b> untuk masa depan yang besar 💛<br /><small style={{ opacity: .75 }}>EMR: pasien • jadwal • SOAP • terapi • laporan</small></div>
      <div className="lg-feats">
        <div><i>♡</i><div><b>Terintegrasi</b><p>Pasien, jadwal, SOAP, terapi & laporan dalam satu alur, bukan menu terpisah.</p></div></div>
        <div><i>◉</i><div><b>Kolaborasi sesuai peran</b><p>Dokter, terapis, admin & owner — hak akses mengikuti peran masing-masing.</p></div></div>
        <div><i>◭</i><div><b>Fokus perkembangan</b><p>Kurva BB/TB, milestone & target terapi terpantau per anak.</p></div></div>
      </div>
      <div className="lg-quote">“Setiap anak berkembang dengan caranya sendiri.”</div>
    </aside>
    <main className="lg-hero">
      <div className="lg-date">{new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
      <section className="lg-card">
        <h1 className="serif">Selamat datang</h1><h2>di Asakita EMR</h2>
        <p>Rekam medis & manajemen terapi klinik tumbuh kembang anak. Masuk untuk melanjutkan shift Anda.</p>
        <label className="lbl" htmlFor="em">Email / username</label>
        <input id="em" className="inp" value={e} onChange={(x) => setE(x.target.value.trim())} placeholder="email@anda.id" autoComplete="username" />
        <label className="lbl" htmlFor="pw">Password</label>
        <div style={{ position: "relative" }}><input id="pw" className="inp" type={show ? "text" : "password"} value={p} onChange={(x) => setP(x.target.value)} onKeyDown={(x) => { if (x.key === "Enter") go({ email: e, password: p }, "/api/auth/login"); }} autoComplete="current-password" />
          <button className="linklike" style={{ position: "absolute", right: 14, top: 15, textDecoration: "none" }} onClick={() => setShow(!show)}>{show ? "🙈" : "👁"}</button></div>
        <div style={{ display: "grid", gap: 10, marginTop: 20 }}>
          <button className="btn btn-p" disabled={busy} onClick={() => go({ email: e, password: p }, "/api/auth/login")}>{busy ? "Memeriksa…" : "Masuk →"}</button>
          {gcid ? <div id="gbtn" style={{ display: "flex", justifyContent: "center" }} /> : null}
        </div>
        {m && <div className="lg-err" role="alert">{m}</div>}
        {!m && <div className="lg-ok">Masuk dengan akun staff yang terdaftar di klinik.</div>}
        <p style={{ textAlign: "right", marginTop: 12 }}><button className="linklike" onClick={() => { api.post("/api/auth/forgot", { email: e }); setOk("Jika email terdaftar, link reset dicatat di server."); }}>Lupa password?</button></p>
        {ok && <div className="lg-ok">{ok}</div>}
      </section>
    </main>
  </div>;
}

function Dash() {
  const [d, setD] = useState<any>(null); const [err, setErr] = useState("");
  const load = () => { setErr(""); api.get("/api/dashboard/summary").then((r) => setD(r)).catch((e) => setErr(String(e?.message || e))); };
  useEffect(() => { load(); }, []);
  const stats = useMemo(() => d ? [
    { l: "Total pasien", v: d.totalPatients, b: "+" + d.monthlyNew + " bulan ini", e: "◉", c: "" },
    { l: "Jadwal hari ini", v: d.todayCount, b: d.waitingCount + " menunggu", e: "▦", c: "warn" },
    { l: "Sesi terapi", v: d.therapyDone, b: "selesai hari ini", e: "⬢", c: "ok" },
    { l: "Perlu follow-up", v: d.followUp, b: "prioritas", e: "✦", c: "bad", href: "#/schedule" },
  ] : [], [d]);
  if (!d) return <div>
    <h2 className="serif">Dashboard</h2><p className="sub">Ringkasan operasional hari ini.</p>
    {err ? <div className="card"><b>⚠ Tidak bisa memuat ringkasan (HTTP {err}).</b><p className="sub">Periksa koneksi lalu coba lagi.</p><button className="btn btn-s" style={{ background: "#2c5545", color: "#fff", borderColor: "#2c5545" }} onClick={load}>Coba lagi ↻</button></div>
      : <div className="grid cards">{[0, 1, 2, 3].map((i) => <div className="card" key={i}><div className="skel" style={{ width: "50%" }} /><div className="skel" style={{ height: 34, marginTop: 10 }} /></div>)}</div>}
  </div>;
  const tl = d.todayTimeline || []; const mc = d.monthlyChart || [0, 0, 0, 0, 0, 0];
  const max = Math.max(...mc, 1);
  return <div>
    <h2 className="serif">Dashboard</h2><p className="sub">Ringkasan operasional hari ini.</p>
    <div className="grid cards">{stats.map((s: any) => {
      const inner = <><div><small>{s.l}</small><div className="num">{s.v}</div><span className={"pill " + s.c}>{s.b}</span></div><div className="emo">{s.e}</div></>;
      return s.href ? <a key={s.l} href={s.href} className="card hover stat" style={{ textDecoration: "none", color: "inherit" }}>{inner}</a> : <div key={s.l} className="card hover stat">{inner}</div>;
    })}</div>
    <div className="grid two" style={{ marginTop: 16 }}>
      <div className="card"><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><h3 style={{ margin: 0 }}>Jadwal hari ini</h3><a href="#/schedule" className="btn btn-s no-print">Lihat jadwal →</a></div>
        <div className="tl">{tl.length ? tl.slice(0, 6).map((a: any) => <a className="it" key={a.id} href="#/schedule"><b>{(a.starts_at || "").slice(11, 16)}</b><div><b>{a.full_name || "—"}</b><br /><small style={{ color: "#6d7c74" }}>{a.type} • {a.room || ""}</small></div><span className={"pill " + pill(a.status)}>{a.status}</span></a>) : <div className="empty"><div className="big">📭</div>Belum ada jadwal hari ini.</div>}</div></div>
      <div className="card"><h3 style={{ marginTop: 0 }}>Pasien bulanan</h3>
        <div className="bars">{(d.monthlyLabels || ["", "", "", "", "", ""]).map((m, i) => <div key={i} className={"bar" + (i === 5 ? " alt" : "")} style={{ height: Math.max(12, ((mc[i] || 0) / max) * 130) }} title={(mc[i] || 0) + " pasien"}><span>{m}</span></div>)}</div>
      </div>
    </div>
    <div className="grid three" style={{ marginTop: 16 }}>
      <div className="card"><h3 style={{ marginTop: 0 }}>🔔 Notifikasi</h3><p style={{ fontSize: 13.5 }}>{d.drafts ? d.drafts + " draf SOAP menunggu difinalkan." : "Semua SOAP sudah final."}</p><p style={{ fontSize: 13.5 }}>{d.followUp} jadwal perlu ditindaklanjuti.</p></div>
      <div className="card"><h3 style={{ marginTop: 0 }}>⚡ Aksi cepat</h3><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><a className="btn btn-s" href="#/patients">+ Tambah pasien</a><a className="btn btn-s" href="#/schedule">+ Buat jadwal</a></div></div>
      <div className="card"><h3 style={{ marginTop: 0 }}>🛡 Status</h3><p><span className="pill ok">Aktif • terhubung</span></p><p className="sub" style={{ margin: 0 }}>Data dimuat dari server.</p></div>
    </div>
  </div>;
}

function Patients({ route, me }: any) {
  const [list, setList] = useState<any[]>([]); const [sel, setSel] = useState<any>(null);
  const [tab, setTab] = useState("Ringkasan"); const [q, setQ] = useState(""); const [sess, setSess] = useState<any[]>([]); const [visits, setVisits] = useState<any[]>([]);
  const id = route.split("/")[2];
  useEffect(() => { api.get("/api/patients").then((r) => setList(r.data)).catch(() => {}); }, []);
  useEffect(() => { if (id) { api.get("/api/patients/" + id).then(setSel).catch(() => {}); api.get("/api/therapy-sessions?childId=" + id).then((r) => setSess(r.data)).catch(() => {}); api.get("/api/visits?childId=" + id).then((r) => setVisits(r.data)).catch(() => {}); } }, [id]);
  const filtered = list.filter((p) => (p.full_name + " " + p.mr_number).toLowerCase().includes(q.toLowerCase()));
  const add = async () => {
    const full_name = prompt("Nama lengkap anak?");
    if (!full_name) return;
    try { const r = await api.post("/api/patients", { full_name }); location.hash = "#/patients/" + r.id; } catch (e: any) { alert("Gagal (" + e.message + ") — hanya dokter/admin/owner."); }
  };
  if (id && sel) {
    const tabs = ["Ringkasan", "Data Pribadi", "Riwayat Medis", "Dokumen", "Billing", "Catatan"];
    return <div><a href="#/patients" style={{ textDecoration: "none" }}>← kembali ke daftar</a>
      <div className="hero" style={{ marginTop: 12 }}><div className="hero-photo">🙂</div>
        <div><h2 className="serif" style={{ margin: 0, color: "#fff" }}>{sel.full_name}</h2><div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}><span className="pill ok">Pasien aktif</span><span className="pill">{sel.mr_number}</span><span className="pill">{ageID(sel.dob)}</span></div>
          <div style={{ display: "flex", gap: 18, marginTop: 12, fontSize: 13, opacity: .92, flexWrap: "wrap" }}><span>No. RM <b>{sel.mr_number}</b></span><span>Lahir <b>{sel.dob || "-"}</b></span><span>JK <b>{sel.gender || "-"}</b></span><span>Gol. <b>{sel.blood_type || "-"}</b></span></div></div>
        {["owner", "dokter"].includes(me?.role)
          ? <button className="btn" style={{ background: "#fdf8ea", color: "#2c5545" }} onClick={async () => { try { const v = await api.post("/api/visits", { child_id: id }); location.hash = "#/soap/" + v.id; } catch (e: any) { alert("Gagal membuat kunjungan (" + e.message + ")"); } }}>+ Buat kunjungan</button>
          : <small style={{ opacity: .8 }}>Hanya dokter/owner yang dapat membuat kunjungan — Anda masuk sebagai <b>{me?.role}</b>.</small>}</div>
      <div className="tabs" role="tablist">{tabs.map((t) => <button key={t} role="tab" className={"tab" + (tab === t ? " on" : "")} onClick={() => setTab(t)}>{t}</button>)}</div>
      <div className="card">
        {tab === "Ringkasan" && <div><div className="grid three"><div><small style={{ color: "#6d7c74" }}>Panggilan / alamat</small><p><b>{sel.nickname || "—"}</b> • {sel.address || "—"}</p></div><div><small style={{ color: "#6d7c74" }}>Sesi terapi tercatat</small><p><b>{sess.length} sesi</b> {sess[0] ? `• terakhir ${sess[0].date}` : ""}</p></div><div><small style={{ color: "#6d7c74" }}>Alergi</small><p><b>{sel.history?.allergies || "—"}</b></p></div></div>{sel.parents?.length ? <p style={{ fontSize: 13, marginBottom: 0 }}>👪 {sel.parents.map((x: any) => `${x.name}${x.relation ? ` (${x.relation})` : ""}`).join(", ")}</p> : <p className="sub" style={{ marginBottom: 0 }}>Belum ada akun ortu tertaut.</p>}{["owner", "dokter", "admin"].includes(me?.role) ? <LinkParent childId={id} /> : null}</div>}
        {tab === "Data Pribadi" && (["owner", "dokter", "admin"].includes(me?.role)
          ? <EditChild key={id} sel={sel} onDone={() => api.get("/api/patients/" + id).then(setSel)} />
          : <table className="tbl"><tbody>{[["Nama lengkap", sel.full_name], ["Panggilan", sel.nickname], ["Lahir", sel.dob], ["Alamat", sel.address], ["Asuransi", sel.insurance]].map(([k, v]) => <tr key={k}><td style={{ color: "#6d7c74" }}>{k}</td><td><b>{v || "—"}</b></td></tr>)}</tbody></table>)}
        {tab === "Riwayat Medis" && <div><p><b>Riwayat kelahiran</b><br />{sel.history?.birth_history || "—"}</p><p><b>Catatan khusus</b><br />{sel.history?.notes || "—"}</p><p>Alergi: <span className="pill">{sel.history?.allergies || "—"}</span></p></div>}
        {tab === "Dokumen" && <div>{(sel.documents || []).map((d: any) => <div key={d.id} style={{ padding: "10px 0", borderBottom: "1px solid #eee" }}>📄 <b>{d.title}</b> <small style={{ color: "#6d7c74" }}>{d.kind} • {d.file_url}</small></div>)}{!sel.documents?.length && <div className="empty"><div className="big">📄</div>Belum ada dokumen. Upload akte / assessment / rujukan (PDF/JPG ≤10MB).</div>}<Upload childId={id} onDone={() => api.get("/api/patients/" + id).then(setSel)} /></div>}
        {tab === "Billing" && <div><p>Asuransi: <b>{sel.insurance || "Pribadi"}</b></p><p className="sub" style={{ margin: 0 }}>Billing read-only di MVP — modul pembayaran penuh non-goal.</p></div>}
        {tab === "Catatan" && <div><h4 style={{ margin: "0 0 6px" }}>Kunjungan & SOAP</h4>{visits.length ? visits.map((v: any) => <div key={v.id} style={{ padding: "10px 0", borderBottom: "1px solid #eee", fontSize: 13.5, display: "flex", gap: 8, alignItems: "center" }}><div style={{ flex: 1, cursor: "pointer" }} onClick={() => (location.hash = "#/soap/" + v.id)}><b>{v.date}</b> • {v.visit_type} <span className={"pill " + (v.status === "final" ? "ok" : "warn")}>{v.status}{v.has_soap ? "" : " • kosong"}</span><br /><small style={{ color: "#2c5545", textDecoration: "underline" }}>{v.has_soap ? "Buka catatan →" : "Isi catatan →"}</small></div>{v.status !== "final" && ["owner", "dokter"].includes(me?.role) && <button className="btn btn-s" title="Hapus draft" onClick={() => { if (confirm("Hapus kunjungan draft ini? Tidak bisa dibatalkan.")) api.del("/api/visits/" + v.id).then(() => api.get("/api/visits?childId=" + id).then((r) => setVisits(r.data))).catch((e) => alert("Gagal (" + e.message + ")")); }}>🗑</button>}</div>) : "Belum ada kunjungan."}
          <h4 style={{ margin: "14px 0 6px" }}>Sesi terapi</h4>{sess.length ? sess.slice(0, 8).map((s: any) => <div key={s.id} style={{ padding: "10px 0", borderBottom: "1px solid #eee", fontSize: 13.5 }}><b>{s.date}</b> • {s.type_name} — {s.target || "—"}<br /><small style={{ color: "#6d7c74" }}>{s.home_recommendation || ""}</small></div>) : "Belum ada sesi terapi."}</div>}
      </div></div>;
  }
  return <div><h2 className="serif">Data pasien</h2><p className="sub">{list.length} anak terdaftar.</p>
    <div className="toolbar"><input className="inp" placeholder="⌕ Saring nama / No. RM…" value={q} onChange={(e) => setQ(e.target.value)} />{me?.role === "terapis" ? <small style={{ color: "#6d7c74" }}>Anda masuk sebagai terapis (read-only di sini).</small> : <button className="btn btn-s" style={{ background: "#2c5545", color: "#fff", borderColor: "#2c5545" }} onClick={add}>+ Tambah pasien</button>}</div>
    <div className="card" style={{ padding: 6 }}><table className="tbl"><thead><tr><th>Anak</th><th>No. RM</th><th>Usia</th><th>Ortu</th><th>Status</th></tr></thead><tbody>{filtered.map((p: any) => <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => (location.hash = "#/patients/" + p.id)}><td><span className="avatar" style={{ display: "inline-grid", width: 32, height: 32, fontSize: 11, verticalAlign: "middle", marginRight: 10 }}>{initials(p.full_name)}</span><b>{p.full_name}</b></td><td>{p.mr_number}</td><td>{ageID(p.dob)}</td><td><small style={{ color: "#2c5545" }}>{p.parent_names || "—"}</small></td><td><span className={"pill " + pill(p.status || "aktif")}>{p.status || "aktif"}</span></td></tr>)}</tbody></table>
      {!filtered.length && <div className="empty"><div className="big">🔍</div>Tidak ada pasien cocok “{q}”.</div>}</div></div>;
}

// ponytail: link a self-registered parent account to this child (portal shows only linked children)
function LinkParent({ childId }: any) {
  const [em, setEm] = useState("");
  const link = async () => {
    if (!em.includes("@")) return alert("Isi email akun ortu (yang dipakai Daftar / Google).");
    const rel = prompt("Hubungan dengan anak? (Ibu/Ayah/Wali)", "Orang tua") || "Orang tua";
    try { await api.post("/api/parent-links", { email: em, child_id: childId, relation: rel }); alert("Terhubung — ortu kini melihat anak ini di portal."); setEm(""); }
    catch (e: any) { alert("Gagal (" + e.message + ") — pastikan ortu sudah Daftar dulu."); }
  };
  return <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}><span className="sub">🔗 Akun ortu:</span><input className="inp" style={{ maxWidth: 260 }} placeholder="email akun ortu…" value={em} onChange={(e) => setEm(e.target.value.trim())} /><button className="btn btn-s" onClick={link}>Hubungkan</button></div>;
}

// ponytail: staff edit child data here (portal stays read-only by design); key={id} at call site remounts per patient. Mirrors server validation — server still enforces.
function EditChild({ sel, onDone }: any) {
  const [f, setF] = useState<any>({ ...sel });
  const [msg, setMsg] = useState("");
  const set = (k: string, v: any) => { setF((p: any) => ({ ...p, [k]: v })); setMsg(""); };
  const save = () => {
    const e: string[] = [];
    if (!String(f.full_name || "").trim()) e.push("Nama lengkap wajib.");
    if (!/^[A-Za-z0-9-]{1,20}$/.test(String(f.mr_number || ""))) e.push("No. RM hanya huruf/angka/-.");
    if (f.dob && !/^\d{4}-\d{2}-\d{2}$/.test(f.dob)) e.push("Tgl lahir format YYYY-MM-DD.");
    if (f.dob && f.dob > new Date().toISOString().slice(0, 10)) e.push("Tgl lahir tidak boleh masa depan.");
    const w = String(f.birth_weight_kg ?? "").replace(",", ".");
    if (w !== "" && (Number.isNaN(Number(w)) || +w < 0.3 || +w > 10)) e.push("BB lahir 0,3–10 kg.");
    const l = String(f.birth_length_cm ?? "").replace(",", ".");
    if (l !== "" && (Number.isNaN(Number(l)) || +l < 20 || +l > 70)) e.push("PB lahir 20–70 cm.");
    if (e.length) { setMsg(e.join(" ")); return; }
    api.put("/api/patients/" + sel.id, { ...f, birth_weight_kg: w === "" ? null : +w, birth_length_cm: l === "" ? null : +l })
      .then(() => { setMsg("✓ Tersimpan."); onDone(); }).catch((er: any) => setMsg("Gagal (" + er.message + ")"));
  };
  const inp = (k: string, label: string, t = "text") => <div><label className="lbl">{label}</label><input className="inp" type={t} value={f[k] ?? ""} onChange={(e) => set(k, e.target.value)} /></div>;
  const sel2 = (k: string, label: string, opts: string[]) => <div><label className="lbl">{label}</label><select className="inp" value={f[k] ?? ""} onChange={(e) => set(k, e.target.value)}><option value="">—</option>{opts.map((o) => <option key={o} value={o}>{o}</option>)}</select></div>;
  return <div><div className="fgrid">{inp("mr_number", "No. RM")}{inp("full_name", "Nama lengkap")}</div>
    <div className="fgrid" style={{ marginTop: 10 }}>{inp("nickname", "Panggilan")}{inp("dob", "Tgl lahir", "date")}</div>
    <div className="fgrid" style={{ marginTop: 10 }}>{sel2("gender", "Jenis kelamin", ["Laki-laki", "Perempuan"])}{sel2("blood_type", "Gol. darah", ["A", "B", "AB", "O"])}</div>
    <div className="fgrid" style={{ marginTop: 10 }}>{inp("birth_weight_kg", "BB lahir (kg)")}{inp("birth_length_cm", "PB lahir (cm)")}</div>
    <div className="fgrid" style={{ marginTop: 10 }}>{inp("address", "Alamat")}{inp("insurance", "Asuransi")}</div>
    <button className="btn btn-s" style={{ marginTop: 12, background: "#2c5545", color: "#fff", borderColor: "#2c5545" }} onClick={save}>Simpan perubahan</button>
    {msg && <span style={{ marginLeft: 10, fontSize: 13 }}>{msg}</span>}</div>;
}

function Upload({ childId, onDone }: any) {
  const up = async (e: any) => {
    const f = e.target.files[0]; if (!f) return;
    const fd = new FormData(); fd.append("file", f); fd.append("title", f.name);
    const r = await fetch(API + `/api/patients/${childId}/documents`, { method: "POST", credentials: "include", body: fd });
    if (!r.ok) alert("Upload ditolak (" + r.status + ") — hanya PDF/JPG/PNG ≤10MB.");
    else onDone?.();
  };
  return <div style={{ marginTop: 12 }}><label className="btn btn-s" style={{ cursor: "pointer" }}>+ Upload dokumen<input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={up} hidden /></label></div>;
}

function Sched() {
  const [list, setList] = useState<any[]>([]); const [kids, setKids] = useState<any[]>([]); const [f, setF] = useState("semua");
  const [form, setForm] = useState<any>({ type: "Konsultasi Dokter", room: "R. Konsultasi" });
  const load = () => api.get("/api/appointments").then((r) => setList(r.data)).catch(() => {});
  useEffect(() => { load(); api.get("/api/patients").then((r) => setKids(r.data)).catch(() => {}); }, []);
  const shown = list.filter((a) => f === "semua" || a.status === f);
  return <div><h2 className="serif">Jadwal pasien</h2>
    <div className="grid">
      <div className="card"><h3 style={{ marginTop: 0 }}>Kalender & antrean</h3>
        <div className="chips" style={{ marginBottom: 12 }}>{["semua", "scheduled", "confirmed", "waiting", "in_progress", "done", "cancelled"].map((s) => <button key={s} className={"tab" + (f === s ? " on" : "")} onClick={() => setF(s)}>{s}</button>)}</div>
        <table className="tbl"><thead><tr><th>Waktu</th><th>Pasien</th><th>Layanan</th><th>Status</th><th /></tr></thead><tbody>{shown.slice(0, 30).map((a: any) => <tr key={a.id}><td style={{ whiteSpace: "nowrap" }}>{(a.starts_at || "").replace("T", " ").slice(0, 16)}</td><td><b>{a.full_name}</b><br /><small style={{ color: "#6d7c74" }}>{a.room}</small></td><td>{a.type}</td><td><span className={"pill " + pill(a.status)}>{a.status}</span></td><td style={{ whiteSpace: "nowrap" }}>{(NEXT[a.status] || []).slice(0, 2).map((n) => <button key={n} className="btn btn-s" onClick={() => api.patch(`/api/appointments/${a.id}/status`, { status: n }).then(load).catch((e) => alert("Transisi ditolak (" + e.message + ")"))}>{n === "done" ? "Selesai ✓" : n}</button>)}</td></tr>)}</tbody></table>
        {!shown.length && <div className="empty"><div className="big">📅</div>Antrian kosong untuk filter ini.</div>}</div>
      <div className="card"><h3 style={{ marginTop: 0 }}>+ Tambah jadwal</h3>
        <label className="lbl">Anak</label><select className="inp" onChange={(e) => setForm({ ...form, child_id: e.target.value })}><option value="">— pilih —</option>{kids.map((k: any) => <option key={k.id} value={k.id}>{k.full_name}</option>)}</select>
        <div className="fgrid"><div><label className="lbl">Mulai</label><input className="inp" type="datetime-local" onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></div><div><label className="lbl">Ruang</label><input className="inp" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} /></div></div>
        <label className="lbl">Layanan</label><select className="inp" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{["Konsultasi Dokter", "Assessment Awal", "Terapi Wicara", "Terapi Okupasi", "Sensori Integrasi", "Kontrol"].map((t) => <option key={t}>{t}</option>)}</select>
        <button className="btn btn-p" style={{ marginTop: 16 }} onClick={() => { if (!form.child_id || !form.starts_at) return alert("Pilih anak + waktu mulai."); api.post("/api/appointments", form).then(() => { load(); setForm({ type: "Konsultasi Dokter", room: "R. Konsultasi" }); }).catch((e) => alert("Gagal (" + e.message + ")")); }}>Simpan jadwal</button></div>
    </div></div>;
}

function Soap({ route }: any) {
  const id = route.split("/")[2];
  const [f, setF] = useState<any>({ subjective: "", objective: "", assessment: "", plan: "", visit_type: "Konsultasi" });
  const [dirty, setDirty] = useState(false); const [msg, setMsg] = useState("");
  const [child, setChild] = useState<any>(null); const [vdate, setVdate] = useState(""); const [locked, setLocked] = useState(false);
  useEffect(() => { if (id) api.get("/api/visits/" + id).then((v) => { setF({ subjective: v.soap?.subjective || "", objective: v.soap?.objective || "", assessment: v.soap?.assessment || "", plan: v.soap?.plan || "", visit_type: v.visit_type || "Konsultasi" }); setVdate(v.date || ""); setLocked(v.status === "final"); if (v.child_id) api.get("/api/patients/" + v.child_id).then(setChild).catch(() => {}); }).catch(() => {}); }, [id]);
  const set = (k: string, v: string) => { if (locked) return; setF({ ...f, [k]: v }); setDirty(true); setMsg(""); };
  const save = (status: string) => api.put(`/api/visits/${id}/soap`, { ...f, status }).then(() => { setDirty(false); setMsg(status === "final" ? "✓ Difinalkan — tercatat di audit log." : "✓ Draft tersimpan " + new Date().toLocaleTimeString("id-ID") + " — masih bisa diubah sampai difinalkan."); if (status === "final") { setLocked(true); location.hash = "#/therapy"; } }).catch((e) => setMsg("Gagal (" + e.message + ") — hanya dokter/owner; final tidak bisa diubah."));
  if (!id) return <div><h2 className="serif">SOAP</h2><div className="card">Pilih pasien → <b>Buat kunjungan</b> untuk membuka lembar SOAP. <a href="#/patients">Ke data pasien →</a></div></div>;
  const fields: [string, string, string][] = [["subjective", "S — Subjective", "Keluhan orang tua, anamnesis…"], ["objective", "O — Objective", "Observasi klinis, tanda vital…"], ["assessment", "A — Assessment", "Diagnosis kerja / suspect…"], ["plan", "P — Plan", "Terapi 2×/minggu, evaluasi 1 bulan…"]];
  return <div><h2 className="serif">Pemeriksaan dokter / SOAP</h2><p className="sub">Pasien <b>{child ? child.full_name + (child.mr_number ? " (" + child.mr_number + ")" : "") : "memuat…"}</b>{vdate ? " • " + vdate : ""} {locked ? <span className="pill ok">FINAL — terkunci</span> : <span className="pill warn">DRAFT — bisa diubah</span>} {dirty ? "• belum tersimpan" : ""} {msg}</p>
    {locked && <div className="card" style={{ background: "#e2f3e5", borderColor: "#bfe0c5" }}><b>🔒 Catatan ini sudah final</b> — terkunci dan tercatat di audit log. Untuk catatan lanjutan, buat kunjungan baru dari halaman pasien.</div>}
    <div className="card"><label className="lbl">Jenis kunjungan</label><select className="inp" value={f.visit_type} disabled={locked} onChange={(e) => set("visit_type", e.target.value)}><option>Konsultasi</option><option>Konsultasi Tumbuh Kembang</option><option>Assessment Awal</option><option>Kontrol</option></select>
      <div className="soap-grid" style={{ marginTop: 14 }}>{fields.map(([k, l, ph]) => <div className="soap-box" key={k}><label>{l} <span className="char">{(f[k] || "").length} kar</span></label><textarea className="inp" style={{ border: 0, background: "transparent", padding: "8px 0 0" }} rows={4} placeholder={ph} value={f[k] || ""} disabled={locked} onChange={(e) => set(k, e.target.value)} /></div>)}</div>
      {!locked && <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }} className="no-print"><button className="btn btn-s" onClick={() => save("draft")}>Simpan draft (bisa diubah)</button><button className="btn btn-p" style={{ width: "auto" }} onClick={() => { if (confirm("Finalkan? Setelah final, catatan terkunci dan tidak bisa diubah.")) save("final"); }}>Finalkan & lanjut ke terapi →</button></div>}</div></div>;
}

const ACTS = ["Imitasi suara", "Kontak mata", "Instruksi sederhana", "Kosakata dasar", "Motorik halus"];
function Therapy() {
  const [list, setList] = useState<any[]>([]); const [types, setTypes] = useState<any[]>([]); const [kids, setKids] = useState<any[]>([]);
  const [f, setF] = useState<any>({ date: new Date().toISOString().slice(0, 10), acts: [] as string[] });
  const load = (child = "") => api.get("/api/therapy-sessions" + (child ? `?childId=${child}` : "")).then((r) => setList(r.data)).catch(() => {});
  useEffect(() => { load(); api.get("/api/therapy-types").then((r) => setTypes(r.data)).catch(() => {}); api.get("/api/patients").then((r) => setKids(r.data)).catch(() => {}); }, []);
  const toggle = (a: string) => setF({ ...f, acts: f.acts.includes(a) ? f.acts.filter((x: string) => x !== a) : [...f.acts, a] });
  return <div><h2 className="serif">Catatan terapi</h2><p className="sub">Satu sesi = target + aktivitas + respon + PR rumah. Tersimpan per terapis.</p>
    <div className="grid two"><div className="card"><h3 style={{ marginTop: 0 }}>Sesi baru</h3>
      <div className="fgrid"><div><label className="lbl">Anak</label><select className="inp" value={f.child_id || ""} onChange={(e) => { setF({ ...f, child_id: e.target.value }); load(e.target.value); }}><option value="">— semua —</option>{kids.map((k: any) => <option key={k.id} value={k.id}>{k.full_name}</option>)}</select></div>
        <div><label className="lbl">Tanggal</label><input className="inp" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div></div>
      <label className="lbl">Jenis terapi</label><select className="inp" onChange={(e) => setF({ ...f, type_id: e.target.value })}><option value="">— pilih —</option>{types.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      <label className="lbl">Target terapi</label><input className="inp" placeholder="cth. verbal & respon komunikasi sederhana" onChange={(e) => setF({ ...f, target: e.target.value })} />
      <label className="lbl">Aktivitas dilakukan</label><div className="checks">{ACTS.map((a) => <label key={a}><input type="checkbox" checked={f.acts.includes(a)} onChange={() => toggle(a)} />{a}</label>)}</div>
      <div className="fgrid"><div><label className="lbl">Respon anak</label><input className="inp" placeholder="3/5 instruksi direspon" onChange={(e) => setF({ ...f, response: e.target.value })} /></div><div><label className="lbl">PR rumah</label><input className="inp" placeholder="10 mnt/hari…" onChange={(e) => setF({ ...f, home_recommendation: e.target.value })} /></div></div>
      <button className="btn btn-p" style={{ marginTop: 16 }} onClick={() => { if (!f.child_id || !f.type_id) return alert("Pilih anak + jenis terapi."); api.post("/api/therapy-sessions", { ...f, activities: f.acts }).then(() => load(f.child_id)).catch((e) => alert("Gagal (" + e.message + ")")); }}>Simpan progress</button></div>
      <div><h3 style={{ margin: "4px 0 10px" }}>20 sesi terakhir{f.child_id ? " — " + (kids.find((k: any) => k.id === f.child_id)?.full_name || "") : ""}</h3><div className="tl">{list.slice(0, 20).map((s: any) => <div className="it" key={s.id}><b>{(s.date || "").slice(5)}</b><div><b>{s.type_name}</b>{!f.child_id && <small style={{ color: "#6d7c74" }}> • {s.child_name || ""}</small>}<br /><small style={{ color: "#6d7c74" }}>{s.target || "—"}{s.home_recommendation ? " • PR: " + s.home_recommendation : ""}</small></div><span className="pill">{s.response || "—"}</span></div>)}{!list.length && <div className="empty"><div className="big">⬢</div>Belum ada sesi.</div>}</div></div></div></div>;
}

function Progress() {
  const [kids, setKids] = useState<any[]>([]); const [cid, setCid] = useState("");
  const [g, setG] = useState<any[]>([]); const [m, setM] = useState<any[]>([]); const [progs, setProgs] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]); const [pt, setPt] = useState(""); const [pf, setPf] = useState("2x/minggu");
  useEffect(() => { api.get("/api/patients").then((r) => { setKids(r.data); if (r.data[0] && !cid) setCid(r.data[0].id); }).catch(() => {}); api.get("/api/therapy-types").then((r) => { setTypes(r.data); if (r.data[0]) setPt(r.data[0].id); }).catch(() => {}); }, []);
  const load = (id: string) => { if (!id) return; api.get("/api/growth?childId=" + id).then((r) => setG(r.data)).catch(() => {}); api.get("/api/milestones?childId=" + id).then((r) => setM(r.data)).catch(() => {}); api.get("/api/therapy-programs?childId=" + id).then((r) => setProgs(r.data)).catch(() => {}); };
  useEffect(() => { load(cid); }, [cid]);
  const W = 520, H = 190, P = 34;
  const pts = g.filter((x) => x.weight_kg).map((x) => Number(x.weight_kg));
  const path = pts.length > 1 ? pts.map((v, i) => { const x = P + (i / (pts.length - 1)) * (W - P * 2); const min = Math.min(...pts), mx = Math.max(...pts); const y = H - P - ((v - min) / Math.max(0.1, mx - min)) * (H - P * 2); return `${i ? "L" : "M"}${x.toFixed(0)} ${y.toFixed(0)}`; }).join(" ") : "";
  return <div><h2 className="serif">Tumbuh kembang</h2><p className="sub">Kurva tumbuh kembang anak.</p>
    <div className="toolbar"><select className="inp" value={cid} onChange={(e) => setCid(e.target.value)}>{kids.map((k: any) => <option key={k.id} value={k.id}>{k.full_name}</option>)}</select>
      <button className="btn btn-s" onClick={() => { const w = prompt("Berat (kg)?"); if (!w) return; const h2 = prompt("Tinggi (cm)?") || null; api.post("/api/growth", { child_id: cid, weight_kg: Number(w), height_cm: h2 ? Number(h2) : null }).then(() => load(cid)); }}>+ BB/TB</button></div>
    <div className="grid two"><div className="card"><h3 style={{ marginTop: 0 }}>Kurva berat badan {g.length ? <span className="pill ok">{g[g.length - 1].weight_kg} kg terakhir</span> : null}</h3>
      {path ? <svg className="growth-svg" viewBox={`0 0 ${W} ${H}`}><line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#ddd" /><line x1={P} y1={P} x2={P} y2={H - P} stroke="#ddd" /><path d={path} fill="none" stroke="#2c5545" strokeWidth={4} strokeLinecap="round" /></svg>
        : <div className="empty"><div className="big">◭</div>Belum ada data BB — tambah di atas.</div>}
      <div style={{ marginTop: 10 }}>{g.slice(-6).map((x: any) => <div key={x.id} style={{ fontSize: 13, padding: "6px 0", borderBottom: "1px solid #f0e7d2" }}>{x.date}: <b>{x.weight_kg} kg</b> / {x.height_cm ?? "—"} cm</div>)}</div></div>
      <div className="card"><h3 style={{ marginTop: 0 }}>Milestone</h3><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{m.map((x: any) => <button key={x.key} className={"tab" + (x.status === "achieved" ? " on" : "")} title={x.status} onClick={() => { const nx = x.status === "achieved" ? "in_progress" : x.status === "in_progress" ? "concern" : "achieved"; api.put("/api/milestones", { child_id: cid, key: x.key, label: x.label, status: nx }).then(() => load(cid)); }}>{x.label} • {x.status === "achieved" ? "✓" : x.status}</button>)}{!m.length && <span className="sub">Belum ada milestone.</span>}</div>
        <button className="btn btn-s" style={{ marginTop: 10 }} onClick={() => { const label = prompt("Milestone baru (cth. Berjalan mandiri)?"); if (!label) return; const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40) || ("m" + Date.now()); api.put("/api/milestones", { child_id: cid, key, label, status: "in_progress" }).then(() => load(cid)); }}>+ Tambah milestone</button>
        <h3>Program terapi</h3>{progs.map((p: any) => <div key={p.type_id} onClick={() => { const nx = p.status === "aktif" ? "selesai" : p.status === "selesai" ? "nonaktif" : "aktif"; api.put("/api/therapy-programs", { child_id: cid, type_id: p.type_id, frequency: p.frequency, status: nx }).then(() => load(cid)); }} style={{ padding: "10px 0", borderBottom: "1px solid #f0e7d2", fontSize: 13.5, cursor: "pointer" }}><b>{p.type_name || p.type_id}</b> • {p.frequency} <span className={"pill " + pill(p.status)}>{p.status}</span></div>)}{!progs.length && <p className="sub">Belum ada program.</p>}
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}><select className="inp" style={{ minWidth: 170 }} value={pt} onChange={(e) => setPt(e.target.value)}>{types.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select><input className="inp" style={{ width: 130 }} value={pf} onChange={(e) => setPf(e.target.value)} placeholder="2x/minggu" /><button className="btn btn-s" style={{ background: "#2c5545", color: "#fff", borderColor: "#2c5545" }} onClick={() => { if (!cid || !pt) return alert("Pilih anak + jenis terapi."); api.put("/api/therapy-programs", { child_id: cid, type_id: pt, frequency: pf || "1x/minggu", status: "aktif" }).then(() => load(cid)); }}>+ Tambah</button></div></div></div></div>;
}

function Reports() {
  const [kids, setKids] = useState<any[]>([]); const [cid, setCid] = useState("");
  const [pv, setPv] = useState<any>(null); const [msg, setMsg] = useState("");
  useEffect(() => { api.get("/api/patients").then((r) => { setKids(r.data); if (r.data[0]) setCid(r.data[0].id); }).catch(() => {}); }, []);
  const preview = () => api.get(`/api/reports/preview?childId=${cid}`).then(setPv).catch((e) => setMsg("Gagal (" + e.message + ")"));
  const dl = async () => {
    if (!pv) await preview();
    const r = await api.post("/api/reports", { child_id: cid, summary: pv?.summary || "Ringkasan otomatis." });
    window.open(API + `/api/reports/${r.id}/pdf`, "_blank");
    auditNote("PDF dibuat.");
  };
  const auditNote = (s: string) => setMsg(s + " " + new Date().toLocaleTimeString("id-ID"));
  return <div><h2 className="serif">Laporan & dokumen</h2><p className="sub">Preview kurasi → PDF / email / cetak. {msg}</p>
    <div className="toolbar"><select className="inp" value={cid} onChange={(e) => setCid(e.target.value)}>{kids.map((k: any) => <option key={k.id} value={k.id}>{k.full_name}</option>)}</select><button className="btn btn-s" onClick={preview}>Muat preview</button></div>
    <div className="grid two"><div className="print-card"><div style={{ textAlign: "center" }}><div style={{ letterSpacing: 5, color: "#2c5545", fontWeight: 800 }}>ASAKITA</div><small style={{ color: "#6d7c74" }}>Child Development & Therapy Center</small><h3 className="serif" style={{ margin: "10px 0" }}>Resume Perkembangan Anak</h3></div><hr style={{ border: 0, borderTop: "1px solid #eee2cb" }} />
      {pv ? <div style={{ fontSize: 14, lineHeight: 1.6 }}><p><b>Pasien:</b> {pv.childName}</p><p><b>Periode:</b> {pv.period}</p><p><b>Sesi:</b> {pv.sessions} • <b>BB terakhir:</b> {pv.lastWeight ?? "—"} kg</p><p><b>Ringkasan:</b> {pv.summary}</p><p><b>Rekomendasi:</b></p><ul>{pv.recommendations.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul></div>
        : <div className="empty"><div className="big">▤</div>Pilih anak → muat preview.</div>}</div>
      <div className="card no-print"><h3 style={{ marginTop: 0 }}>Aksi dokumen</h3><div style={{ display: "grid", gap: 10 }}><button className="btn btn-p" onClick={dl}>⬇ Download PDF</button><button className="btn btn-g" onClick={async () => { const r = await api.post("/api/reports", { child_id: cid, summary: pv?.summary || "Ringkasan." }); const to = prompt("Kirim ke email orang tua?"); if (to) api.post(`/api/reports/${r.id}/email`, { to }).then(() => auditNote("Email dicatat ke outbox.")); }}>✉ Kirim ke email ortu</button><button className="btn btn-g" onClick={() => window.print()}>🖨 Cetak</button></div></div></div></div>;
}

function Users() {
  const [list, setList] = useState<any[]>([]); const [err, setErr] = useState("");
  const [f, setF] = useState<any>({ role: "admin" });
  const load = () => api.get("/api/users").then((r) => { setList(r.data); setErr(""); }).catch(() => setErr("Hanya owner/dokter yang boleh melihat halaman ini (403)."));
  useEffect(() => { load(); }, []);
  return <div><h2 className="serif">Role & akses user</h2><p className="sub">Kelola akun staff dan hak akses.</p>
    {err ? <div className="card">{err}</div> : <><div className="card" style={{ padding: 6 }}><table className="tbl"><thead><tr><th>Nama</th><th>Email</th><th>Role</th><th>Status</th></tr></thead><tbody>{list.map((u: any) => <tr key={u.id}><td><span className="avatar" style={{ display: "inline-grid", width: 30, height: 30, fontSize: 10, marginRight: 8, verticalAlign: "middle" }}>{initials(u.name)}</span><b>{u.name}</b></td><td>{u.email}</td><td><span className={"pill " + (u.role === "owner" || u.role === "dokter" ? "ok" : "")}>{u.role}</span></td><td>{u.status}</td></tr>)}</tbody></table></div>
      <div className="card" style={{ marginTop: 14 }}><h3 style={{ marginTop: 0 }}>+ Tambah user</h3><div className="fgrid"><input className="inp" placeholder="Nama" onChange={(e) => setF({ ...f, name: e.target.value })} /><input className="inp" placeholder="email@…" onChange={(e) => setF({ ...f, email: e.target.value })} /></div><div className="fgrid" style={{ marginTop: 10 }}><select className="inp" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{["admin", "terapis", "dokter", "owner"].map((r) => <option key={r}>{r}</option>)}</select><input className="inp" placeholder="password (default prototype)" onChange={(e) => setF({ ...f, password: e.target.value })} /></div><button className="btn btn-s" style={{ marginTop: 12, background: "#2c5545", color: "#fff", borderColor: "#2c5545" }} onClick={() => api.post("/api/users", f).then(load).catch((e) => alert("Gagal (" + e.message + ")"))}>Simpan user</button></div></>}</div>;
}
