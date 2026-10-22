// ponytail: one-file EMR — hash routes, plain fetch, no router lib; CSS-injected design system (no new deps)
import React, { useEffect, useMemo, useRef, useState } from "react";
import { growthGeometry, formatIDR, BAND_LABEL } from "@asakita/shared";
// ponytail: same-origin default (Fly serves API+UI on one host); dev uses vite proxy below
const API = (import.meta as any).env?.VITE_API_URL || "";
// ponytail: tag every request with the app so the API picks the right session cookie (EMR + portal share one origin in prod)
const H = { "X-Asakita-App": "emr" };
const j = (r: Response) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); };
const api = {
  get: (p: string) => fetch(API + p, { credentials: "include", headers: H }).then(j),
  post: (p: string, b: any) => fetch(API + p, { method: "POST", credentials: "include", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(j),
  put: (p: string, b: any) => fetch(API + p, { method: "PUT", credentials: "include", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(j),
  patch: (p: string, b: any) => fetch(API + p, { method: "PATCH", credentials: "include", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(j),
  del: (p: string) => fetch(API + p, { method: "DELETE", credentials: "include", headers: H }).then(j),
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
/* ---- design tokens (modern refresh, same sage + gold identity) ---- */
:root{--bg:#f4f6f5;--paper:#fff;--card:#fff;--ink:#132019;--muted:#5f6f68;--line:#e2e9e5;--line2:#eef2f0;
 --sage:#1d6b4f;--sage2:#2c8a63;--sage-soft:#e6f3ec;--sage-ink:#123f30;--gold:#b8862f;--gold-soft:#fbf1dc;
 --danger:#b6493f;--danger-soft:#fbe6e4;--ok:#1d6b4f;--warn:#8a5a12;--warn-soft:#fdf1d6;
 --radius:16px;--radius-s:12px;--sh:0 1px 2px rgba(16,40,30,.05),0 8px 20px rgba(16,40,30,.05);--sh-lg:0 2px 6px rgba(16,40,30,.06),0 24px 48px rgba(16,40,30,.10)}
*{box-sizing:border-box}html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;font-family:"Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",sans-serif;font-size:14.5px;line-height:1.55;background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased}
h1,h2,h3,h4,.serif{font-family:Fraunces,Georgia,"Times New Roman",serif;letter-spacing:-.015em;font-weight:600}
button,input,select,textarea{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--sage2);outline-offset:2px;border-radius:8px}
@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes pop{0%{transform:scale(.985);opacity:0}100%{transform:none;opacity:1}}
@keyframes shake{20%,60%{transform:translateX(-5px)}40%,80%{transform:translateX(5px)}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
/* ---- login ---- */
.lg{min-height:100vh;display:grid;grid-template-columns:440px 1fr}
.lg-brand{background:linear-gradient(170deg,#1a4b39,#0f2f24 72%),radial-gradient(420px 300px at 85% 8%,#b8862f2e,transparent);color:#f2f0e6;padding:52px 44px;position:relative;overflow:hidden;display:flex;flex-direction:column}
.lg-brand:before{content:"";position:absolute;width:320px;height:320px;border-radius:50%;background:#ffffff0d;top:-120px;right:-120px}
.lg-brand:after{content:"";position:absolute;width:200px;height:200px;border-radius:48% 52% 60% 40%;background:#b8862f24;bottom:-70px;left:-60px;transform:rotate(-18deg)}
.lg-mark{width:84px;height:84px;border:2px solid #f2f0e6;border-radius:50%;display:grid;place-items:center;font-size:38px;margin:8px auto 14px;position:relative;z-index:1;background:#ffffff10}
.lg-title{text-align:center;letter-spacing:10px;font-size:36px;margin:0;z-index:1}
.lg-sub{text-align:center;opacity:.78;font-size:12px;letter-spacing:2.2px;text-transform:uppercase;z-index:1}
.lg-tag{background:#ffffff10;border:1px solid #ffffff1f;border-radius:14px;padding:14px 16px;text-align:center;margin:24px 0;font-size:13.5px;line-height:1.5;z-index:1}
.lg-feats{display:grid;gap:10px;margin-top:8px;z-index:1}.lg-feats>div{display:grid;grid-template-columns:36px 1fr;gap:12px;align-items:start;background:#ffffff0a;border:1px solid #ffffff14;border-radius:14px;padding:11px 13px}
.lg-feats i{width:34px;height:34px;border-radius:10px;background:#ffffff12;display:grid;place-items:center;font-style:normal;font-size:17px}
.lg-feats b{font-size:13px}.lg-feats p{margin:2px 0 0;font-size:12px;opacity:.72;line-height:1.45}
.lg-quote{margin-top:auto;padding-top:26px;text-align:center;font-family:Fraunces,Georgia,serif;font-style:italic;font-size:18px;opacity:.9;z-index:1}
.lg-hero{display:flex;align-items:center;justify-content:center;padding:48px 32px;position:relative}
.lg-date{position:absolute;top:22px;right:34px;font-size:12.5px;color:var(--muted)}
.lg-card{width:min(460px,94vw);background:var(--card);border:1px solid var(--line);border-radius:24px;padding:34px;box-shadow:var(--sh-lg);animation:pop .4s ease}
.lg-card h1{margin:0;font-size:32px}.lg-card h2{margin:2px 0 6px;color:var(--sage);font-size:19px;font-weight:600}
.lg-card>p{color:var(--muted);font-size:13.5px;line-height:1.55}
.lbl{display:block;font-weight:700;font-size:11px;letter-spacing:.7px;text-transform:uppercase;color:#46564f;margin:15px 0 6px}
.inp{height:44px;border:1px solid #d9e1dc;border-radius:var(--radius-s);padding:0 13px;width:100%;font-size:14px;background:#fff;transition:.15s}
.inp:hover{border-color:#c6d3cb}
.inp:focus{border-color:var(--sage2);box-shadow:0 0 0 3px #2c8a6322;outline:none}
textarea.inp{height:auto;min-height:90px;padding:11px 13px;resize:vertical;line-height:1.55}
select.inp{appearance:none;background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%231d6b4f' stroke-width='2' fill='none'/%3E%3C/svg%3E") no-repeat right 12px center;padding-right:32px}
.btn{border:0;border-radius:var(--radius-s);padding:11px 16px;font-weight:700;cursor:pointer;transition:.15s;display:inline-flex;align-items:center;justify-content:center;gap:7px;font-size:13.5px;background:#fff;color:var(--ink);border:1px solid var(--line)}
.btn:hover{transform:translateY(-1px);border-color:#c6d3cb}.btn:active{transform:none}
.btn-p{background:var(--sage);color:#fff;border-color:var(--sage);width:100%;box-shadow:0 6px 16px #1d6b4f26}
.btn-p:hover{background:var(--sage2);border-color:var(--sage2)}
.btn-g{background:#fff;border:1px solid var(--line);width:100%}
.btn-s{width:auto;padding:8px 12px;font-size:12.5px;background:#fff;border:1px solid var(--line)}
.btn-s:hover{border-color:var(--sage2);color:var(--sage)}
.btn:disabled{opacity:.55;cursor:wait;transform:none}
.lg-err{background:var(--danger-soft);border:1px solid #f0c4bf;color:#8c2f28;border-radius:var(--radius-s);padding:10px 13px;font-size:13px;margin-top:14px;animation:shake .35s}
.lg-ok{background:var(--sage-soft);border:1px solid #bfe0cd;color:#155c3c;border-radius:var(--radius-s);padding:10px 13px;font-size:13px;margin-top:14px}
.linklike{background:none;border:0;color:var(--sage);font-size:13px;cursor:pointer;text-decoration:underline;padding:0}
/* ---- shell ---- */
.shell{display:grid;grid-template-columns:250px 1fr;min-height:100vh}
.side{background:linear-gradient(180deg,#14432f,#0e2b21);color:#e9f0ea;padding:22px 14px;position:sticky;top:0;height:100vh;overflow:auto;display:flex;flex-direction:column;gap:2px}
.side-head{display:flex;gap:11px;align-items:center;padding:2px 8px 16px;border-bottom:1px solid #ffffff17;margin-bottom:12px}
.side-mark{width:44px;height:44px;border:1.5px solid #e9f0ea;border-radius:50%;display:grid;place-items:center;font-size:21px;flex:none;background:#ffffff12}
.side-head strong{letter-spacing:3.5px;font-family:Fraunces,Georgia,serif;font-size:18px}
.side-head small{opacity:.7;font-size:10.5px;letter-spacing:.8px}
.side-sec{font-size:10px;letter-spacing:1.4px;text-transform:uppercase;opacity:.5;padding:12px 10px 4px}
.side a{color:#e9f0ea;display:flex;gap:11px;align-items:center;padding:9px 12px;border-radius:10px;text-decoration:none;font-size:13.5px;font-weight:600;transition:.14s;border:1px solid transparent}
.side a:hover{background:#ffffff12}
.side a.on{background:#f2f6f1;color:var(--sage-ink);box-shadow:0 4px 14px #00000026}
.side a .ic{width:22px;text-align:center;opacity:.9}
.side-foot{margin-top:auto;background:#ffffff0d;border:1px solid #ffffff1a;border-radius:14px;padding:13px;font-size:12px;line-height:1.5}
.main{padding:0;min-width:0}
.topbar{position:sticky;top:0;z-index:20;display:flex;gap:14px;align-items:center;padding:12px 26px;background:#f4f6f5e6;backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
.search{position:relative;flex:1;max-width:520px}
.search input{height:42px;border:1px solid var(--line);border-radius:999px;background:#fff;padding:0 18px 0 42px;width:100%;font-size:13.5px}
.search input:focus{outline:2px solid var(--sage2);outline-offset:1px;border-color:var(--sage2)}
.search .mag{position:absolute;left:16px;top:12px;opacity:.5}
.search-drop{position:absolute;top:50px;left:0;right:0;background:#fff;border-radius:14px;box-shadow:var(--sh-lg);overflow:hidden;border:1px solid var(--line);z-index:30}
.search-drop a{display:flex;justify-content:space-between;padding:10px 14px;text-decoration:none;color:var(--ink);font-size:13px}
.search-drop a:hover{background:#f4f7f5}
.profile{margin-left:auto;display:flex;align-items:center;gap:10px;background:#fff;border:1px solid var(--line);border-radius:999px;padding:5px 12px 5px 5px}
.avatar{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#d8ecdf,#f6e2bd);display:grid;place-items:center;font-weight:800;color:var(--sage);font-size:12px;flex:none}
.page{padding:22px 28px 56px;max-width:1180px}
.page>*{animation:rise .4s both}.page>*:nth-child(2){animation-delay:.04s}.page>*:nth-child(3){animation-delay:.08s}.page>*:nth-child(4){animation-delay:.12s}
.page h2{font-size:27px;margin:0}.sub{color:var(--muted);margin:3px 0 18px;font-size:13.5px}
.grid{display:grid;gap:14px}.cards{grid-template-columns:repeat(4,minmax(0,1fr))}.two{grid-template-columns:1.25fr .9fr}.three{grid-template-columns:repeat(3,minmax(0,1fr))}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:18px;box-shadow:var(--sh);transition:.16s}
.card.hover:hover{transform:translateY(-2px);box-shadow:var(--sh-lg);border-color:#cfdad3}
.stat{display:flex;justify-content:space-between;gap:10px;align-items:start}
.stat small{color:var(--muted);font-weight:700;font-size:11px;letter-spacing:.5px;text-transform:uppercase}
.stat .num{font-size:30px;font-weight:700;margin:4px 0 6px;font-family:Fraunces,Georgia,serif;letter-spacing:-.02em}
.stat .emo{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;font-size:20px;background:var(--sage-soft)}
.pill{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:4px 10px;font-size:11px;font-weight:700;background:#eef2f0;color:#3c5a4d;border:1px solid #dbe4df;white-space:nowrap}
.pill.ok{background:#e4f4ea;color:#15603f;border-color:#bfe0c9}
.pill.warn{background:var(--warn-soft);color:var(--warn);border-color:#f0d8a4}
.pill.bad{background:var(--danger-soft);color:#9c332b;border-color:#f0bdb7}
.tl{display:grid;gap:8px}.tl .it{display:grid;grid-template-columns:52px 1fr auto;gap:12px;align-items:center;padding:11px 13px;border-radius:12px;background:#f7faf8;border:1px solid var(--line2);transition:.14s;text-decoration:none;color:inherit}
.tl .it:hover{background:#fff;border-color:#cfdad3;transform:translateX(2px)}
.tl .it b{font-size:13.5px}
.bars{display:flex;align-items:end;gap:10px;height:140px;padding-top:10px}
.bar{flex:1;border-radius:6px 6px 3px 3px;background:linear-gradient(180deg,var(--sage2),var(--sage));position:relative;min-height:10px;transition:.2s}
.bar:hover{filter:brightness(1.08)}.bar span{position:absolute;bottom:-20px;left:0;right:0;text-align:center;font-size:11px;color:var(--muted);font-weight:700}
.bar.alt{background:linear-gradient(180deg,#e0b661,var(--gold))}
table.tbl{width:100%;border-collapse:collapse}
.tbl th,.tbl td{text-align:left;padding:10px 9px;border-bottom:1px solid var(--line2);font-size:13px}
.tbl th{color:var(--muted);font-size:10.5px;text-transform:uppercase;letter-spacing:.6px;font-weight:700}
.tbl tbody tr:last-child td{border-bottom:0}
.tbl tbody tr{transition:.12s}.tbl tbody tr:hover{background:#f7faf8}
.hero{background:linear-gradient(120deg,#14432f,#20634a 62%,#b8862f 128%);color:#fff;border-radius:20px;padding:22px;display:grid;grid-template-columns:auto 1fr auto;gap:18px;align-items:center;box-shadow:var(--sh-lg);position:relative;overflow:hidden}
.hero:before{content:"";position:absolute;width:260px;height:260px;border-radius:50%;background:#ffffff10;right:-90px;top:-90px;pointer-events:none}
.hero-photo{width:74px;height:74px;border-radius:22px;background:#ffffff1c;border:1.5px solid #ffffff4d;display:grid;place-items:center;font-size:36px}
.tabs{display:flex;gap:7px;flex-wrap:wrap;margin:14px 0}
.tab{border:1px solid var(--line);background:#fff;border-radius:999px;padding:8px 14px;font-weight:600;font-size:12.5px;cursor:pointer;transition:.14s;color:#43544d}
.tab.on,.tab:hover{background:var(--sage);color:#fff;border-color:var(--sage)}
.fgrid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.soap-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.soap-box{background:#f7faf8;border:1px solid var(--line2);border-radius:12px;padding:12px}
.soap-box:focus-within{border-color:var(--sage2);box-shadow:0 0 0 3px #2c8a6318}
.soap-box label{font-weight:700;font-size:11.5px;letter-spacing:.4px}
.char{font-size:10.5px;color:var(--muted);float:right}
.checks{display:grid;gap:6px;margin:8px 0}.checks label{display:flex;gap:9px;align-items:center;background:#f7faf8;border:1px solid var(--line2);padding:9px 11px;border-radius:10px;cursor:pointer;font-size:13px}
.checks input{width:17px;height:17px;accent-color:var(--sage)}
.growth-svg{width:100%;height:auto;background:#fbfdfc;border-radius:12px;border:1px solid var(--line2)}
.legend{display:flex;gap:14px;flex-wrap:wrap;align-items:center;font-size:11.5px;color:var(--muted);margin-top:8px}
.legend span{display:inline-flex;align-items:center;gap:6px}
.legend i{width:12px;height:3px;border-radius:2px;display:inline-block}
.seg{display:inline-flex;background:#fff;border:1px solid var(--line);border-radius:999px;padding:3px;gap:2px}
.seg-b{border:0;background:transparent;border-radius:999px;padding:6px 13px;font-size:12.5px;font-weight:600;cursor:pointer;color:#43544d}
.seg-b.on{background:var(--sage);color:#fff}
.print-card{background:#fff;border-radius:18px;padding:26px;box-shadow:var(--sh);border-top:6px solid var(--sage);position:relative}
.print-card:before{content:"";position:absolute;inset:10px;border:1px dashed var(--line);border-radius:12px;pointer-events:none}
.skel{border-radius:8px;background:linear-gradient(90deg,#e8edea 25%,#f4f8f6 50%,#e8edea 75%);background-size:200% 100%;animation:sh 1.2s infinite;height:14px}
@keyframes sh{to{background-position:-200% 0}}
.empty{text-align:center;padding:30px 14px;color:var(--muted)}.empty .big{font-size:40px}
.chips{display:flex;gap:7px;flex-wrap:wrap}
.toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
.toolbar .inp{width:auto;min-width:180px;height:38px}
.footer{color:var(--muted);font-size:11.5px;text-align:center;padding:22px}
/* ---- new components: denver, recipe, receipt ---- */
.denver-item{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line2);flex-wrap:wrap}
.denver-text{font-size:13.5px;flex:1;min-width:220px}
.denver-ops{display:flex;gap:5px;flex-wrap:wrap}
.chip{border:1px solid var(--line);background:#fff;border-radius:999px;padding:4px 11px;font-size:11.5px;font-weight:600;cursor:pointer;color:#43544d;transition:.14s}
.chip:hover{border-color:var(--sage2)}
.chip.on.pass{background:#e4f4ea;border-color:#8fcfaa;color:#15603f}
.chip.on.not_yet{background:var(--warn-soft);border-color:#e6c684;color:var(--warn)}
.chip.on.no_info{background:#eef2f0;border-color:#cdd8d2;color:#43544d}
.recipe-box{margin-top:14px;padding:13px;background:#f7faf8;border:1px dashed #cbdad2;border-radius:12px}
.recipe-box .lbl{margin-top:0}
.recipe-box .inp{margin-bottom:8px}
.receipt{background:#fff;border:1px solid var(--line);border-radius:14px;padding:22px;margin-top:16px}
.receipt-head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid var(--sage);padding-bottom:12px}
.receipt-logo{letter-spacing:5px;font-weight:800;font-size:17px;color:var(--sage)}
.receipt-head small{color:var(--muted);font-size:11.5px}
.receipt-body{padding-top:12px;font-size:13px}
.receipt-total{display:flex;justify-content:space-between;padding:5px 0;border-top:1px solid var(--line2);font-size:13.5px}
.receipt-total b{font-variant-numeric:tabular-nums}
@media(max-width:1020px){.lg{grid-template-columns:1fr}.lg-brand{display:none}.shell{grid-template-columns:1fr}.side{height:auto;position:static;flex-direction:column}.cards,.two,.three,.fgrid,.soap-grid{grid-template-columns:1fr}.page{padding:16px 14px 70px}.topbar{flex-wrap:wrap;padding:10px 12px}.hero{grid-template-columns:1fr;text-align:center;justify-items:center}}
@media print{
 .side,.topbar,.no-print{display:none!important}.page{padding:0}.print-card{box-shadow:none}
 body.print-receipt *{visibility:hidden!important}
 body.print-receipt #receipt-print,body.print-receipt #receipt-print *{visibility:visible!important}
 #receipt-print{position:absolute;left:0;top:0;width:100%;border:0;box-shadow:none;padding:24px}
}
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
      {/* ponytail: the Denver checklist is a tab inside Tumbuh Kembang, not its own menu item */}
      {nav("/reports", "▤", "Laporan")}
      {["owner", "dokter"].includes(me?.role) ? nav("/users", "⚿", "Role & User", "Sistem") : null}
      <div className="side-foot">Masuk sebagai <b>{me.role}</b><br /><button className="btn btn-s" style={{ marginTop: 10, width: "100%", color: "#fff", background: "#ffffff22", borderColor: "#ffffff33" }} onClick={() => fetch(API + "/api/auth/logout", { method: "POST", credentials: "include", headers: H }).then(() => setMe(null))}>Keluar</button></div>
    </nav>
    <main className="main">
      <Topbar me={me} />
      <div className="page">{R === "/" || R === "" ? <Dash /> : R.startsWith("/patients") ? <Patients route={R} me={me} /> : R.startsWith("/schedule") ? <Sched /> : R.startsWith("/soap") ? <Soap route={R} /> : R.startsWith("/therapy") ? <Therapy me={me} /> : R.startsWith("/progress") ? <Progress /> : R.startsWith("/denver") ? <Progress initial="denver" /> : R.startsWith("/reports") ? <Reports /> : R.startsWith("/users") ? <Users /> : <div className="empty"><div className="big">🧭</div>Halaman tidak ditemukan.</div>}</div>
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
  useEffect(() => { fetch(API + "/api/config", { headers: H }).then((r) => r.json()).then((c) => setGcid(c.googleClientId)).catch(() => {}); }, []);
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
        {tab === "Billing" && <BillingTab childId={id} child={sel} />}
        {tab === "Catatan" && <div><h4 style={{ margin: "0 0 6px" }}>Kunjungan & SOAP</h4>{visits.length ? visits.map((v: any) => <div key={v.id} style={{ padding: "10px 0", borderBottom: "1px solid #eee", fontSize: 13.5, display: "flex", gap: 8, alignItems: "center" }}><div style={{ flex: 1, cursor: "pointer" }} onClick={() => (location.hash = "#/soap/" + v.id)}><b>{v.date}</b> • {v.visit_type} <span className={"pill " + (v.status === "final" ? "ok" : "warn")}>{v.status}{v.has_soap ? "" : " • kosong"}</span><br /><small style={{ color: "#2c5545", textDecoration: "underline" }}>{v.has_soap ? "Buka catatan →" : "Isi catatan →"}</small></div>{v.status !== "final" && ["owner", "dokter"].includes(me?.role) && <button className="btn btn-s" title="Hapus draft" onClick={() => { if (confirm("Hapus kunjungan draft ini? Tidak bisa dibatalkan.")) api.del("/api/visits/" + v.id).then(() => api.get("/api/visits?childId=" + id).then((r) => setVisits(r.data))).catch((e) => alert("Gagal (" + e.message + ")")); }}>🗑</button>}</div>) : "Belum ada kunjungan."}
          <h4 style={{ margin: "14px 0 6px" }}>Sesi terapi</h4>{sess.length ? sess.slice(0, 8).map((s: any) => <div key={s.id} style={{ padding: "10px 0", borderBottom: "1px solid #eee", fontSize: 13.5 }}><b>{s.date}</b> • {s.type_name} — {s.target || "—"}<br /><small style={{ color: "#6d7c74" }}>{s.home_recommendation || ""}</small></div>) : "Belum ada sesi terapi."}</div>}
      </div></div>;
  }
  return <div><h2 className="serif">Data pasien</h2><p className="sub">{list.length} anak terdaftar.</p>
    <div className="toolbar"><input className="inp" placeholder="⌕ Saring nama / No. RM…" value={q} onChange={(e) => setQ(e.target.value)} />{me?.role === "terapis" ? <small style={{ color: "#6d7c74" }}>Anda masuk sebagai terapis (read-only di sini).</small> : <button className="btn btn-s" style={{ background: "#2c5545", color: "#fff", borderColor: "#2c5545" }} onClick={add}>+ Tambah pasien</button>}</div>
    <div className="card" style={{ padding: 6 }}><table className="tbl"><thead><tr><th>Anak</th><th>No. RM</th><th>Usia</th><th>Ortu</th><th>Status</th></tr></thead><tbody>{filtered.map((p: any) => <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => (location.hash = "#/patients/" + p.id)}><td><span className="avatar" style={{ display: "inline-grid", width: 32, height: 32, fontSize: 11, verticalAlign: "middle", marginRight: 10 }}>{initials(p.full_name)}</span><b>{p.full_name}</b></td><td>{p.mr_number}</td><td>{ageID(p.dob)}</td><td><small style={{ color: "#2c5545" }}>{p.parent_names || "—"}</small></td><td><span className={"pill " + pill(p.status || "aktif")}>{p.status || "aktif"}</span></td></tr>)}</tbody></table>
      {!filtered.length && <div className="empty"><div className="big">🔍</div>Tidak ada pasien cocok “{q}”.</div>}</div></div>;
}

// ponytail: billing tab — invoice lines, payment status, printable receipt + PDF
function BillingTab({ childId, child }: any) {
  const [d, setD] = useState<any>(null); const [msg, setMsg] = useState("");
  const [form, setForm] = useState<any>({ description: "", qty: 1, unit_price: "" });
  const [showPrices, setShowPrices] = useState(false);
  const load = () => api.get(`/api/billing?childId=${childId}`).then(setD).catch((e) => setMsg("Gagal (" + e.message + ")"));
  useEffect(() => { load(); }, [childId]);
  const add = () => {
    if (!form.description) return alert("Isi deskripsi item.");
    const body: any = { child_id: childId, description: form.description, qty: Number(form.qty) || 1 };
    if (form.unit_price !== "") body.unit_price = Number(form.unit_price);
    api.post("/api/billing/items", body).then(() => { setForm({ description: "", qty: 1, unit_price: "" }); load(); }).catch((e) => alert("Gagal (" + e.message + ")"));
  };
  const generate = () => api.post("/api/billing/generate", { child_id: childId }).then((r) => { setMsg(r.created ? r.created + " sesi terapi ditagihkan." : "Semua sesi terapi sudah tertagih."); load(); }).catch((e) => alert("Gagal (" + e.message + ")"));
  const printReceipt = () => { document.body.classList.add("print-receipt"); window.print(); setTimeout(() => document.body.classList.remove("print-receipt"), 300); };
  const items = d?.data || []; const t = d?.totals || { total: 0, paid: 0, unpaid: 0 };
  return <div>
    <div className="grid three">
      <div className="card stat"><div><small>Total tagihan</small><div className="num" style={{ fontSize: 24 }}>{formatIDR(t.total)}</div></div></div>
      <div className="card stat"><div><small>Lunas</small><div className="num" style={{ fontSize: 24 }}>{formatIDR(t.paid)}</div></div></div>
      <div className="card stat"><div><small>Tunggakan</small><div className="num" style={{ fontSize: 24 }}>{formatIDR(t.unpaid)}</div><span className={"pill " + (t.unpaid ? "warn" : "ok")}>{t.unpaid ? "Belum dibayar" : "Bersih"}</span></div></div>
    </div>
    <div className="toolbar" style={{ marginTop: 14 }}>
      <button className="btn btn-s" onClick={generate}>⚡ Tagih sesi terapi</button>
      <button className="btn btn-s" onClick={() => window.open(API + `/api/billing/receipt?childId=${childId}`, "_blank")}>⬇ Struk PDF</button>
      <button className="btn btn-s" onClick={printReceipt}>🖨 Cetak struk</button>
      <button className="btn btn-s" onClick={() => setShowPrices(!showPrices)}>⚙ Harga layanan</button>
      {msg && <span className="sub" style={{ margin: 0 }}>{msg}</span>}
    </div>
    {showPrices && <div className="card" style={{ marginBottom: 14 }}>
      <h4 style={{ margin: "0 0 8px" }}>Harga layanan (IDR)</h4>
      {(d?.prices || []).map((p: any) => <div key={p.name} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #f0e7d2" }}>
        <span style={{ flex: 1, fontSize: 13.5 }}>{p.name}</span>
        <input className="inp" style={{ width: 130, height: 38 }} defaultValue={p.price} onBlur={(e) => api.put(`/api/billing/prices/${encodeURIComponent(p.name)}`, { price: Number(e.target.value) }).then(load)} />
      </div>)}
    </div>}
    <div className="card" style={{ padding: 6 }}>
      <table className="tbl"><thead><tr><th>Tanggal</th><th>Keterangan</th><th>Qty</th><th>Harga</th><th>Total</th><th>Status</th><th /></tr></thead>
        <tbody>{items.map((i: any) => <tr key={i.id}>
          <td style={{ whiteSpace: "nowrap" }}>{i.date}</td><td><b>{i.description}</b></td><td>{i.qty}</td><td>{formatIDR(i.unit_price)}</td><td><b>{formatIDR(i.total)}</b></td>
          <td><span className={"pill " + (i.status === "paid" ? "ok" : "warn")}>{i.status === "paid" ? "Lunas" : "Belum"}</span></td>
          <td style={{ whiteSpace: "nowrap" }}>
            <button className="btn btn-s" onClick={() => api.patch(`/api/billing/items/${i.id}`, { status: i.status === "paid" ? "unpaid" : "paid" }).then(load)}>{i.status === "paid" ? "Batalkan" : "Tandai lunas"}</button>
            <button className="btn btn-s" style={{ marginLeft: 6 }} title="Hapus" onClick={() => { if (confirm("Hapus item tagihan ini?")) api.del(`/api/billing/items/${i.id}`).then(load); }}>🗑</button>
          </td>
        </tr>)}{!items.length && <tr><td colSpan={7} style={{ textAlign: "center", color: "#6d7c74", padding: 18 }}>Belum ada tagihan. Klik “Tagih sesi terapi” atau tambah item manual.</td></tr>}</tbody></table>
    </div>
    <div className="card" style={{ marginTop: 14 }}>
      <h4 style={{ margin: "0 0 8px" }}>+ Tambah item manual</h4>
      <div className="fgrid"><input className="inp" placeholder="Deskripsi (cth. Konsultasi Growth)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <div style={{ display: "flex", gap: 8 }}><input className="inp" style={{ width: 90 }} type="number" min={1} value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} title="Qty" />
          <input className="inp" style={{ width: 140 }} type="number" placeholder="Harga" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} /></div></div>
      <button className="btn btn-s" style={{ marginTop: 12, background: "#2c5545", color: "#fff", borderColor: "#2c5545" }} onClick={add}>Simpan item</button>
    </div>
    <div id="receipt-print" className="receipt">
      <div className="receipt-head"><div><div className="receipt-logo">ASAKITA</div><small>Child Development &amp; Therapy Center</small></div><div style={{ textAlign: "right" }}><small>STRUK / TAGIHAN</small><br /><small>{new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</small></div></div>
      <div className="receipt-body">
        <p><b>Pasien:</b> {child?.full_name} ({child?.mr_number || "-"})<br /><b>Asuransi:</b> {child?.insurance || "Pribadi"}</p>
        <table className="tbl"><thead><tr><th>Item</th><th>Qty</th><th>Harga</th><th>Total</th></tr></thead>
          <tbody>{items.map((i: any) => <tr key={i.id}><td>{i.description} <small style={{ color: "#6d7c74" }}>{i.date}</small></td><td>{i.qty}</td><td>{formatIDR(i.unit_price)}</td><td>{formatIDR(i.total)}</td></tr>)}</tbody></table>
        <div className="receipt-total"><span>Total</span><b>{formatIDR(t.total)}</b></div>
        <div className="receipt-total"><span>Lunas</span><b>{formatIDR(t.paid)}</b></div>
        <div className="receipt-total"><span>Tunggakan</span><b>{formatIDR(t.unpaid)}</b></div>
        <p className="sub" style={{ marginTop: 14 }}>Simpan struk ini sebagai bukti pembayaran.</p>
      </div>
    </div>
  </div>;
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
    const r = await fetch(API + `/api/patients/${childId}/documents`, { method: "POST", credentials: "include", headers: H, body: fd });
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
function Therapy({ me }: any) {
  const [list, setList] = useState<any[]>([]); const [types, setTypes] = useState<any[]>([]); const [kids, setKids] = useState<any[]>([]);
  const [progs, setProgs] = useState<any[]>([]);
  const [f, setF] = useState<any>({ date: new Date().toISOString().slice(0, 10), acts: [] as string[], recipe: "", recipe_title: "Latihan di rumah" });
  const load = (child = "") => {
    api.get("/api/therapy-sessions" + (child ? `?childId=${child}` : "")).then((r) => setList(r.data)).catch(() => {});
    if (child) api.get(`/api/home-programs?childId=${child}`).then((r) => setProgs(r.data)).catch(() => setProgs([]));
  };
  useEffect(() => { load(); api.get("/api/therapy-types").then((r) => setTypes(r.data)).catch(() => {}); api.get("/api/patients").then((r) => setKids(r.data)).catch(() => {}); }, []);
  const toggle = (a: string) => setF({ ...f, acts: f.acts.includes(a) ? f.acts.filter((x: string) => x !== a) : [...f.acts, a] });
  const recipeItems = f.recipe.split("\n").map((s) => s.trim()).filter(Boolean);
  const save = () => {
    if (!f.child_id || !f.type_id) return alert("Pilih anak + jenis terapi.");
    const body: any = { ...f, activities: f.acts };
    if (recipeItems.length) body.home_program = { title: f.recipe_title || "Latihan di rumah", items: recipeItems.map((label) => ({ label })) };
    api.post("/api/therapy-sessions", body).then(() => { load(f.child_id); setF({ ...f, acts: [], recipe: "" }); }).catch((e) => alert("Gagal (" + e.message + ")"));
  };
  return <div><h2 className="serif">Catatan terapi</h2><p className="sub">Satu sesi = target + aktivitas + respon + resep latihan rumah.</p>
    <div className="grid two"><div className="card"><h3 style={{ marginTop: 0 }}>Sesi baru</h3>
      <div className="fgrid"><div><label className="lbl">Anak</label><select className="inp" value={f.child_id || ""} onChange={(e) => { setF({ ...f, child_id: e.target.value }); load(e.target.value); }}><option value="">— semua —</option>{kids.map((k: any) => <option key={k.id} value={k.id}>{k.full_name}</option>)}</select></div>
        <div><label className="lbl">Tanggal</label><input className="inp" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div></div>
      <label className="lbl">Jenis terapi</label><select className="inp" value={f.type_id || ""} onChange={(e) => setF({ ...f, type_id: e.target.value })}><option value="">— pilih —</option>{types.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      <label className="lbl">Target terapi</label><input className="inp" placeholder="cth. verbal &amp; respon komunikasi sederhana" value={f.target || ""} onChange={(e) => setF({ ...f, target: e.target.value })} />
      <label className="lbl">Aktivitas dilakukan</label><div className="checks">{ACTS.map((a) => <label key={a}><input type="checkbox" checked={f.acts.includes(a)} onChange={() => toggle(a)} />{a}</label>)}</div>
      <div className="fgrid"><div><label className="lbl">Respon anak</label><input className="inp" placeholder="3/5 instruksi direspon" value={f.response || ""} onChange={(e) => setF({ ...f, response: e.target.value })} /></div><div><label className="lbl">PR rumah</label><input className="inp" placeholder="10 mnt/hari…" value={f.home_recommendation || ""} onChange={(e) => setF({ ...f, home_recommendation: e.target.value })} /></div></div>
      <div className="recipe-box">
        <label className="lbl">Resep latihan di rumah (1 item per baris)</label>
        <input className="inp" placeholder="Judul resep" value={f.recipe_title} onChange={(e) => setF({ ...f, recipe_title: e.target.value })} />
        <textarea className="inp" rows={4} placeholder={"Latihan bicara 10 menit\nSebut nama benda 5x"} value={f.recipe} onChange={(e) => setF({ ...f, recipe: e.target.value })} />
        <small className="sub" style={{ margin: 0 }}>{recipeItems.length ? recipeItems.length + " item akan dikirim ke orang tua untuk dicatat harian." : "Kosongkan bila tidak ada resep."}</small>
      </div>
      <button className="btn btn-p" style={{ marginTop: 16 }} onClick={save}>Simpan progress</button></div>
      <div><h3 style={{ margin: "4px 0 10px" }}>20 sesi terakhir{f.child_id ? " — " + (kids.find((k: any) => k.id === f.child_id)?.full_name || "") : ""}</h3><div className="tl">{list.slice(0, 20).map((s: any) => <div className="it" key={s.id}><b>{(s.date || "").slice(5)}</b><div><b>{s.type_name}</b>{!f.child_id && <small style={{ color: "#6d7c74" }}> • {s.child_name || ""}</small>}<br /><small style={{ color: "#6d7c74" }}>{s.target || "—"}{s.home_recommendation ? " • PR: " + s.home_recommendation : ""}</small></div><span className="pill">{s.response || "—"}</span>{["owner", "dokter"].includes(me?.role) && <button className="btn btn-s" title="Hapus sesi" onClick={() => { if (confirm("Hapus sesi terapi ini beserta resepnya?")) api.del(`/api/therapy-sessions/${s.id}`).then(() => load(f.child_id)).catch((e) => alert("Gagal (" + e.message + ")")); }}>🗑</button>}</div>)}{!list.length && <div className="empty"><div className="big">⬢</div>Belum ada sesi.</div>}</div>
        {f.child_id && <><h3 style={{ margin: "18px 0 8px" }}>Resep latihan di rumah</h3>
          {progs.length ? progs.map((p: any) => <div className="card" key={p.id} style={{ padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b>{p.title}</b><small style={{ color: "#6d7c74" }}>{(p.created_at || "").slice(0, 10)}</small></div>
            {p.instructions ? <p className="sub" style={{ margin: "4px 0" }}>{p.instructions}</p> : null}
            {p.items.map((i: any) => <div key={i.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0", borderBottom: "1px solid #f0e7d2" }}>
              <span>{i.label}</span><span className="pill">{i.doneCount} hari</span></div>)}
          </div>) : <p className="sub">Belum ada resep untuk anak ini — tulis resep pada sesi terapi.</p>}
        </>}
      </div></div></div>;
}

const IND_TABS: [string, string][] = [["weight", "Berat badan"], ["height", "Tinggi badan"], ["head", "Lingkar kepala"]];
const DOT_FILL: Record<string, string> = { very_low: "#b6493f", low: "#c9952f", normal: "#2c5545", high: "#c9952f", very_high: "#b6493f", unknown: "#6d7c74" };
const SD_LABEL = "-2 SD", SD2 = "+2 SD";

// ponytail: growth chart — WHO/CDC reference bands from the API, child's own line on top
function GrowthChart({ curve, w = 560, h = 300 }: any) {
  const geo = useMemo(() => (curve ? growthGeometry(curve, { width: w, height: h }) : null), [curve]);
  if (!geo) return <div className="empty"><div className="big">◭</div>Belum ada data pengukuran.</div>;
  return <div>
    <svg className="growth-svg" viewBox={`0 0 ${geo.w} ${geo.h}`} role="img" aria-label={"Kurva " + (curve.label || "")}>
      <path d={geo.area(-2, 2)} fill="#2c554514" />
      {[-3, -2, 0, 2, 3].map((z) => {
        const l = geo.lines.find((x: any) => x.z === z);
        return l ? <path key={z} d={l.d} fill="none" stroke={z === 0 ? "#2c5545" : "#a9bdb1"} strokeWidth={z === 0 ? 2 : 1.4} strokeDasharray={Math.abs(z) === 3 ? "5 4" : undefined} /> : null;
      })}
      {geo.child && <path d={geo.child} fill="none" stroke="#c9952f" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />}
      {geo.dots.map((p: any, i: number) => <circle key={p.id || i} cx={p.cx} cy={p.cy} r={5.5} fill={DOT_FILL[p.band] || "#2c5545"} stroke="#fff" strokeWidth={2}>
        <title>{p.date} • {p.value} {curve.unit} • z {p.z} • persentil {p.percentile}</title>
      </circle>)}
      {geo.xTicks.map((t: any, i: number) => <text key={i} x={t.x} y={geo.h - 8} fontSize={10} textAnchor="middle" fill="#6d7c74">{t.label}</text>)}
      {geo.yTicks.map((t: any, i: number) => <text key={i} x={6} y={t.y + 3} fontSize={10} fill="#6d7c74">{t.label}</text>)}
    </svg>
    <div className="legend">
      <span><i style={{ background: "#2c5545" }} /> Median</span>
      <span><i style={{ background: "#a9bdb1" }} /> {SD_LABEL} / {SD2}</span>
      <span><i style={{ background: "#c9952f" }} /> Pengukuran anak</span>
      <span className="pill">{curve.standard === "WHO" ? "WHO 0–5 th" : "CDC 2000"}</span>
    </div>
  </div>;
}

function Progress({ initial = "kurva" }: any) {
  const [kids, setKids] = useState<any[]>([]); const [cid, setCid] = useState("");
  const [m, setM] = useState<any[]>([]); const [progs, setProgs] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]); const [pt, setPt] = useState(""); const [pf, setPf] = useState("2x/minggu");
  const [ind, setInd] = useState("weight"); const [curve, setCurve] = useState<any>(null); const [std, setStd] = useState("");
  const [adding, setAdding] = useState(false);
  const [gf, setGf] = useState<any>({ date: new Date().toISOString().slice(0, 10), weight_kg: "", height_cm: "", head_cm: "" });
  const [view, setView] = useState(initial);
  useEffect(() => { api.get("/api/patients").then((r) => { setKids(r.data); if (r.data[0] && !cid) setCid(r.data[0].id); }).catch(() => {}); api.get("/api/therapy-types").then((r) => { setTypes(r.data); if (r.data[0]) setPt(r.data[0].id); }).catch(() => {}); }, []);
  const load = (id: string) => { if (!id) return; api.get("/api/milestones?childId=" + id).then((r) => setM(r.data)).catch(() => {}); api.get("/api/therapy-programs?childId=" + id).then((r) => setProgs(r.data)).catch(() => {}); };
  useEffect(() => { load(cid); }, [cid]);
  useEffect(() => { if (!cid) return setCurve(null); api.get(`/api/growth/curve?childId=${cid}&type=${ind}` + (std ? `&standard=${std}` : "")).then(setCurve).catch(() => setCurve(null)); }, [cid, ind, std]);
  const saveGrowth = () => {
    if (!gf.weight_kg && !gf.height_cm && !gf.head_cm) return alert("Isi minimal satu pengukuran.");
    const body: any = { child_id: cid, date: gf.date };
    if (gf.weight_kg) body.weight_kg = Number(gf.weight_kg);
    if (gf.height_cm) body.height_cm = Number(gf.height_cm);
    if (gf.head_cm) body.head_cm = Number(gf.head_cm);
    api.post("/api/growth", body).then(() => { setAdding(false); setGf({ ...gf, weight_kg: "", height_cm: "", head_cm: "" }); }).catch((e) => alert("Gagal (" + e.message + ")"));
  };
  const pts = curve?.points || [];
  return <div><h2 className="serif">Tumbuh kembang</h2><p className="sub">Kurva pertumbuhan (acuan WHO &amp; CDC), checklist Denver, milestone, dan program terapi.</p>
    <div className="tabs" role="tablist">
      <button role="tab" className={"tab" + (view === "kurva" ? " on" : "")} onClick={() => setView("kurva")}>Kurva &amp; milestone</button>
      <button role="tab" className={"tab" + (view === "denver" ? " on" : "")} onClick={() => setView("denver")}>Checklist Denver</button>
    </div>
    {view === "denver" ? <Denver cid={cid} onChild={setCid} kids={kids} /> : <>
    <div className="toolbar">
      <select className="inp" value={cid} onChange={(e) => setCid(e.target.value)}>{kids.map((k: any) => <option key={k.id} value={k.id}>{k.full_name}</option>)}</select>
      <div className="seg">{IND_TABS.map(([k, l]) => <button key={k} className={"seg-b" + (ind === k ? " on" : "")} onClick={() => setInd(k)}>{l}</button>)}</div>
      <select className="inp" value={std} onChange={(e) => setStd(e.target.value)} title="Acuan">
        <option value="">Acuan otomatis</option><option value="WHO">WHO (0–5 th)</option><option value="CDC">CDC (5–19 th)</option>
      </select>
      <button className="btn btn-s" onClick={() => setAdding(!adding)}>+ Pengukuran</button>
    </div>
    {adding && <div className="card" style={{ marginBottom: 16 }}>
      <div className="fgrid"><div><label className="lbl">Tanggal</label><input className="inp" type="date" value={gf.date} onChange={(e) => setGf({ ...gf, date: e.target.value })} /></div>
        <div><label className="lbl">Berat (kg)</label><input className="inp" type="number" step="0.1" value={gf.weight_kg} onChange={(e) => setGf({ ...gf, weight_kg: e.target.value })} /></div></div>
      <div className="fgrid" style={{ marginTop: 10 }}><div><label className="lbl">Tinggi (cm)</label><input className="inp" type="number" step="0.1" value={gf.height_cm} onChange={(e) => setGf({ ...gf, height_cm: e.target.value })} /></div>
        <div><label className="lbl">Lingkar kepala (cm)</label><input className="inp" type="number" step="0.1" value={gf.head_cm} onChange={(e) => setGf({ ...gf, head_cm: e.target.value })} /></div></div>
      <button className="btn btn-s" style={{ marginTop: 12, background: "#2c5545", color: "#fff", borderColor: "#2c5545" }} onClick={saveGrowth}>Simpan pengukuran</button>
    </div>}
    <div className="grid two">
      <div className="card"><h3 style={{ marginTop: 0 }}>{curve?.label || "Kurva"}{curve?.latest ? <span className={"pill " + (curve.latest.band === "normal" ? "ok" : curve.latest.band === "unknown" ? "" : "warn")}> {curve.latest.value} {curve.unit} • persentil {curve.latest.percentile ?? "—"}</span> : null}</h3>
        <GrowthChart curve={curve} />
        {pts.length > 0 && <table className="tbl" style={{ marginTop: 10 }}><thead><tr><th>Tanggal</th><th>Usia</th><th>Nilai</th><th>z</th><th>Status</th></tr></thead>
          <tbody>{[...pts].reverse().map((p: any) => <tr key={p.id}><td>{p.date}</td><td>{p.ageMonths} bl</td><td><b>{p.value} {curve.unit}</b></td><td>{p.z ?? "—"}</td><td><span className={"pill " + (p.band === "normal" ? "ok" : p.band === "unknown" ? "" : "warn")}>{BAND_LABEL[p.band] || p.band}</span></td></tr>)}</tbody></table>}
      </div>
      <div>
        <div className="card"><h3 style={{ marginTop: 0 }}>Checklist Denver</h3>
          <p className="sub">Centang milestone perkembangan anak per usia (4 domain).</p>
          <button className="btn btn-s" onClick={() => setView("denver")}>Buka checklist →</button>
        </div>
        <div className="card"><h3 style={{ marginTop: 0 }}>Milestone</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{m.map((x: any) => <button key={x.key} className={"tab" + (x.status === "achieved" ? " on" : "")} title={x.status} onClick={() => { const nx = x.status === "achieved" ? "in_progress" : x.status === "in_progress" ? "concern" : "achieved"; api.put("/api/milestones", { child_id: cid, key: x.key, label: x.label, status: nx }).then(() => load(cid)); }}>{x.label} • {x.status === "achieved" ? "✓" : x.status}</button>)}{!m.length && <span className="sub">Belum ada milestone.</span>}</div>
          <button className="btn btn-s" style={{ marginTop: 10 }} onClick={() => { const label = prompt("Milestone baru (cth. Berjalan mandiri)?"); if (!label) return; const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40) || ("m" + Date.now()); api.put("/api/milestones", { child_id: cid, key, label, status: "in_progress" }).then(() => load(cid)); }}>+ Tambah milestone</button>
        </div>
        <div className="card"><h3 style={{ marginTop: 0 }}>Program terapi</h3>
          {progs.map((p: any) => <div key={p.type_id} onClick={() => { const nx = p.status === "aktif" ? "selesai" : p.status === "selesai" ? "nonaktif" : "aktif"; api.put("/api/therapy-programs", { child_id: cid, type_id: p.type_id, frequency: p.frequency, status: nx }).then(() => load(cid)); }} style={{ padding: "10px 0", borderBottom: "1px solid #f0e7d2", fontSize: 13.5, cursor: "pointer" }}><b>{p.type_name || p.type_id}</b> • {p.frequency} <span className={"pill " + pill(p.status)}>{p.status}</span></div>)}{!progs.length && <p className="sub">Belum ada program.</p>}
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}><select className="inp" style={{ minWidth: 170 }} value={pt} onChange={(e) => setPt(e.target.value)}>{types.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select><input className="inp" style={{ width: 130 }} value={pf} onChange={(e) => setPf(e.target.value)} placeholder="2x/minggu" /><button className="btn btn-s" style={{ background: "#2c5545", color: "#fff", borderColor: "#2c5545" }} onClick={() => { if (!cid || !pt) return alert("Pilih anak + jenis terapi."); api.put("/api/therapy-programs", { child_id: cid, type_id: pt, frequency: pf || "1x/minggu", status: "aktif" }).then(() => load(cid)); }}>+ Tambah</button></div>
        </div>
      </div>
    </div>
    </>}
  </div>;
}

// ponytail: Denver II checklist — staff ticks each item (lulus / belum / tidak ada info).
// Lives as a tab inside "Tumbuh kembang"; the child is picked by the parent page.
function Denver({ cid: cidProp = "", onChild, kids: kidsProp }: any) {
  const [kids, setKids] = useState<any[]>(kidsProp || []);
  const [cid, setCid] = useState(cidProp);
  const [d, setD] = useState<any>(null); const [band, setBand] = useState("");
  const pick = (id: string) => { setCid(id); onChild?.(id); };
  useEffect(() => { if (cidProp && cidProp !== cid) setCid(cidProp); }, [cidProp]);
  useEffect(() => {
    if (kidsProp?.length) { setKids(kidsProp); if (!cid && kidsProp[0]) pick(kidsProp[0].id); return; }
    const q = new URLSearchParams((location.hash.split("?")[1] || ""));
    api.get("/api/patients").then((r) => { setKids(r.data); pick(q.get("childId") || r.data[0]?.id || ""); }).catch(() => {});
  }, []);
  const load = (id: string) => { if (!id) return; api.get("/api/denver?childId=" + id).then((r) => { setD(r); setBand((b) => b || r.bands.find((x: any) => x.isCurrent)?.key || r.bands[0]?.key || ""); }).catch(() => setD(null)); };
  useEffect(() => { load(cid); }, [cid]);
  const mark = (itemKey: string, status: string) => api.put("/api/denver", { child_id: cid, item_key: itemKey, status }).then(() => load(cid)).catch((e) => alert("Gagal (" + e.message + ")"));
  const shown = d?.bands?.find((b: any) => b.key === band) || d?.bands?.[0];
  const doms = ["motor", "language", "social", "fine"];
  const DOM_LABEL: Record<string, string> = { motor: "Motorik Kasar", language: "Bahasa", social: "Personal–Sosial", fine: "Motorik Halus–Adaptif" };
  return <div>
    {kids.length > 1 && <div className="toolbar"><select className="inp" value={cid} onChange={(e) => pick(e.target.value)}>{kids.map((k: any) => <option key={k.id} value={k.id}>{k.full_name}</option>)}</select></div>}
    {!d ? <div className="card"><div className="skel" style={{ width: "50%" }} /><div className="skel" style={{ marginTop: 10 }} /></div> : <>
      <div className="grid three">
        <div className="card stat"><div><small>Rentang usia</small><div className="num" style={{ fontSize: 24 }}>{d.score.band}</div></div></div>
        <div className="card stat"><div><small>Kemajuan</small><div className="num" style={{ fontSize: 24 }}>{d.score.progress}%</div><span className="pill">{d.score.checked}/{d.score.total} item dicek</span></div></div>
        <div className="card stat"><div><small>Perlu perhatian</small><div className="num" style={{ fontSize: 24 }}>{d.score.delayed.length}</div><span className={"pill " + (d.score.delayed.length ? "warn" : "ok")}>{d.score.delayed.length ? "item belum logris" : "Wajar"}</span></div></div>
      </div>
      <div className="tabs">{d.bands.map((b: any) => <button key={b.key} className={"tab" + (b.key === band ? " on" : "")} onClick={() => setBand(b.key)}>{b.label}{b.isCurrent ? " •" : ""}</button>)}</div>
      {shown && <div className="card">
        {doms.map((dom) => {
          const items = shown.items.filter((i: any) => i.domain === dom);
          if (!items.length) return null;
          return <div key={dom} style={{ marginBottom: 14 }}>
            <h4 style={{ margin: "0 0 6px", fontSize: 13.5, textTransform: "uppercase", letterSpacing: ".6px", color: "#43544d" }}>{DOM_LABEL[dom]}</h4>
            {items.map((it: any) => <div className="denver-item" key={it.key}>
              <span className="denver-text">{it.text}</span>
              <span className="denver-ops">
                {[["pass", "Lulus"], ["not_yet", "Belum"], ["no_info", "Tidak ada info"]].map(([v, l]) => <button key={v} className={"chip" + (it.status === v ? " on " + v : "")} onClick={() => mark(it.key, v)}>{l}</button>)}
              </span>
            </div>)}
          </div>;
        })}
        {shown.isCurrent ? <p className="sub">Rentang usia saat ini — sentang di sini untuk skoring utama.</p> : <p className="sub">Rentang usia di atas/bawah — gunakan untuk menandai keterlambatan atau kemampuan lebih.</p>}
      </div>}
    </>}
  </div>;
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
