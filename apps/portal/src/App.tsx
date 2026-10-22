// ponytail: one-file portal — mobile cards, bottom nav, plain fetch; curated endpoints only, never raw SOAP
import React, { useEffect, useMemo, useState } from "react";
import { growthGeometry, formatIDR, formatDMY, BAND_LABEL } from "@asakita/shared";
// ponytail: same-origin default (Fly serves API+UI on one host); dev uses vite proxy below
const API = (import.meta as any).env?.VITE_API_URL || "";
// ponytail: tag every request with the app so the API picks the right session cookie (EMR + portal share one origin in prod)
const H = { "X-Asakita-App": "portal" };
const j = (r: Response) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); };
const api = {
  get: (p: string) => fetch(API + p, { credentials: "include", headers: H }).then(j),
  post: (p: string, b: any) => fetch(API + p, { method: "POST", credentials: "include", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(j),
};
// ponytail: tiny client helpers; clinical truth stays server-side
const ageID = (dob: string) => {
  if (!dob) return "";
  const d = new Date(dob); let m = (Date.now() - d.getTime()) / 3.15576e10 * 12;
  if (isNaN(m) || m < 0) return "";
  const y = Math.floor(m / 12); m = Math.floor(m % 12);
  return y > 0 ? `${y} thn ${m} bln` : `${m} bln`;
};
const dID = (s: string) => { try { return new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }); } catch { return s || ""; } };
const tHM = (s: string) => (s || "").slice(11, 16);

const css = `
/* ---- design tokens (modern refresh, same sage + gold identity) ---- */
:root{--green:#1d6b4f;--green2:#2c8a63;--sage:#e6f3ec;--cream:#f4f6f5;--card:#fff;--ink:#132019;--muted:#5f6f68;--line:#e2e9e5;--line2:#eef2f0;
 --yellow:#f2c14e;--gold:#b8862f;--peach:#ffe9d6;--blue:#e8f1fd;--pink:#fdeaf0;--radius:16px;--radius-s:12px;
 --sh:0 1px 2px rgba(16,40,30,.05),0 8px 20px rgba(16,40,30,.05);--sh-lg:0 2px 6px rgba(16,40,30,.06),0 20px 40px rgba(16,40,30,.09)}
*{box-sizing:border-box}html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;font-family:"Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",sans-serif;font-size:14.5px;line-height:1.55;background:var(--cream);color:var(--ink);min-height:100vh;-webkit-font-smoothing:antialiased}
h1,h2,h3,h4,.serif{font-family:Fraunces,Georgia,serif;letter-spacing:-.015em;font-weight:600}
button,input,select{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--green2);outline-offset:2px;border-radius:8px}
@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes pop{0%{transform:scale(.985);opacity:0}100%{transform:none;opacity:1}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
.phone{max-width:440px;margin:0 auto;min-height:100vh;background:#fbfdfc;border-left:1px solid var(--line);border-right:1px solid var(--line);position:relative}
@media(min-width:500px){.phone{margin:22px auto;border:1px solid var(--line);border-radius:28px;overflow:hidden;min-height:min(900px,94vh);box-shadow:var(--sh-lg)}body{padding:0 12px;background:radial-gradient(600px 300px at 12% 0%,#e6f3ec,transparent),radial-gradient(700px 340px at 92% 8%,#fbf1dc,transparent),var(--cream)}}
.pad{padding:16px 14px 96px}.pad>*{animation:rise .4s both}.pad>*:nth-child(2){animation-delay:.04s}.pad>*:nth-child(3){animation-delay:.08s}.pad>*:nth-child(4){animation-delay:.12s}
.topbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.topbar h1{font-size:20px;margin:0}.topbar .sub{font-size:12px;color:var(--muted)}
.icon-btn{width:42px;height:42px;border-radius:13px;border:1px solid var(--line);background:#fff;display:grid;place-items:center;font-size:18px;cursor:pointer;transition:.15s}
.icon-btn:hover{border-color:var(--green2)}
.back-title{display:flex;align-items:center;gap:10px;margin-bottom:12px}.back-title h1{font-size:18px;margin:0}.back-title p{margin:2px 0 0;color:var(--muted);font-size:12px}
.back{border:1px solid var(--line);background:#fff;width:40px;height:40px;border-radius:13px;font-size:19px;cursor:pointer}
.hello{display:flex;gap:12px;align-items:center;margin-bottom:12px}
.avatar{width:52px;height:52px;border-radius:17px;background:linear-gradient(135deg,#dcefdf,#f7e4c2);display:grid;place-items:center;font-size:26px;flex:none}
.hello h2{font-size:20px;margin:0}.hello p{margin:2px 0 0;color:var(--muted);font-size:12.5px}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:14px;margin:10px 0;box-shadow:var(--sh);transition:.16s}
.card.tap{cursor:pointer}.card.tap:hover{border-color:var(--green2)}
.child-card{display:flex;align-items:center;gap:13px;cursor:pointer;background:linear-gradient(120deg,#fff,#f3f9f5);border:1px solid var(--line)}
.child-photo{width:60px;height:60px;border-radius:18px;background:linear-gradient(135deg,#dcefdf,#ffe6c9);display:grid;place-items:center;font-size:30px;flex:none}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}
.tile{border-radius:14px;padding:13px;min-height:104px;cursor:pointer;display:flex;flex-direction:column;justify-content:space-between;border:1px solid #0000000d;transition:.16s;box-shadow:var(--sh)}
.tile:hover{transform:translateY(-2px)}.tile .emoji{font-size:24px}.tile h4{margin:7px 0 3px;font-size:13px}.tile p{font-size:11.5px;color:#43544d;margin:0;line-height:1.4}.tile small{font-weight:800;font-size:11px}
.tile.green{background:linear-gradient(150deg,#e9f5ec,#d6ebd9)}.tile.yellow{background:linear-gradient(150deg,#fdf6e2,#f9e8bd)}.tile.blue{background:linear-gradient(150deg,#eaf2fd,#d5e6fb)}.tile.pink{background:linear-gradient(150deg,#fdecf1,#fbdfE6)}
.sec{display:flex;align-items:center;justify-content:space-between;margin:14px 2px 7px}.sec h3{font-size:14px;margin:0}.sec span{font-size:12px;color:var(--green);font-weight:800;cursor:pointer}
.row{display:flex;gap:11px;align-items:center;background:#fff;border:1px solid var(--line);border-radius:14px;padding:11px;margin-bottom:8px;box-shadow:var(--sh);cursor:pointer;transition:.15s}
.row:hover{border-color:var(--green2)}
.thumb{width:52px;height:52px;border-radius:15px;background:linear-gradient(135deg,#f6d899,#c9e2cd);display:grid;place-items:center;font-size:24px;flex:none}
.row h4{margin:0;font-size:13.5px}.row p{font-size:12px;color:var(--muted);margin:2px 0 0}
.pill{display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:800;border:1px solid transparent;margin:2px;white-space:nowrap}
.pill.green{background:#e4f4ea;color:#15603f;border-color:#bfe0c9}.pill.orange{background:#fdf1d6;color:#8a5a12;border-color:#f0d8a4}.pill.blue{background:#e8f1fd;color:#2563a6;border-color:#c6e2ff}.pill.red{background:#fbe6e4;color:#b42318;border-color:#f3bcbc}
.tabs{display:flex;gap:6px;margin:10px 0;overflow-x:auto;padding-bottom:4px;scrollbar-width:none}
.tab{border:1px solid var(--line);border-radius:999px;padding:8px 14px;background:#fff;color:#43544d;font-weight:700;font-size:12.5px;white-space:nowrap;cursor:pointer;transition:.14s}
.tab.on{background:var(--green);color:#fff;border-color:var(--green)}
.info{background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden;margin-bottom:12px;box-shadow:var(--sh)}
.info .tr{display:flex;justify-content:space-between;gap:10px;padding:12px 14px;border-bottom:1px solid var(--line2);font-size:13px}.info .tr:last-child{border:0}.info .lab{color:var(--muted)}.info .val{font-weight:800;text-align:right}
input.inp,select.inp{border:1px solid #d9e1dc;border-radius:var(--radius-s);padding:12px 13px;width:100%;margin:5px 0;background:#fff;font-size:14px}
input.inp:focus,select.inp:focus{border-color:var(--green2);outline:none;box-shadow:0 0 0 3px #2c8a631f}
.lbl{font-size:11px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;color:#46564f;margin:12px 0 2px;display:block}
.btn{width:100%;border:1px solid var(--line);border-radius:var(--radius-s);padding:14px;font-weight:700;font-size:14.5px;cursor:pointer;transition:.15s;display:flex;align-items:center;justify-content:center;gap:8px;background:#fff;color:var(--ink)}
.btn:hover{transform:translateY(-1px)}.btn:active{transform:none}
.btn-p{background:var(--green);color:#fff;border-color:var(--green);box-shadow:0 6px 16px #1d6b4f26}
.btn-p:hover{background:var(--green2);border-color:var(--green2)}
.btn-o{background:#fff;color:var(--green);border-color:var(--line)}
.btn-soft{background:var(--sage);color:var(--green);border-color:#cfe3d6}
.btn-d{background:#fbe6e4;color:#b42318;border-color:#f3bcbc}
.btn-a{width:auto;padding:9px 13px;font-size:12.5px}
.appt{display:flex;gap:11px;align-items:center}
.appt-date{width:60px;border-radius:14px;background:#fff0e2;color:#b25a1e;text-align:center;padding:8px 4px;font-weight:800;flex:none;border:1px solid #f2d3ac}.appt-date b{font-size:20px;display:block;line-height:1}
.cal{background:#fff;border:1px solid var(--line);border-radius:14px;padding:13px;box-shadow:var(--sh);margin-top:12px}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;text-align:center;font-size:12px;color:#6b7280;margin-top:9px}
.cal-grid div{padding:7px 0;border-radius:10px}.cal-grid .hit{background:var(--green);color:#fff;font-weight:800}.cal-grid .wk{font-weight:800;color:#3c4a43}
.chart{background:var(--sage);border-radius:14px;padding:14px;margin-bottom:12px;text-align:center}
.chart b.big{font-size:28px;color:var(--green);font-family:Fraunces,Georgia,serif}
.chart-svg{width:100%;height:auto;background:#fbfdfc;border:1px solid var(--line2);border-radius:12px;margin-top:10px}
.legend{display:flex;gap:12px;flex-wrap:wrap;align-items:center;font-size:11px;color:var(--muted);margin-top:8px}
.legend span{display:inline-flex;align-items:center;gap:5px}.legend i{width:11px;height:3px;border-radius:2px;display:inline-block}
.note{font-size:12px;color:#43544d;background:#fdf7e8;padding:11px 13px;border-radius:12px;line-height:1.5;border:1px solid #f0e0b8;margin-top:8px}
.scr{display:flex;gap:11px;align-items:center;background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px;margin-bottom:8px;box-shadow:var(--sh)}
.scr .ico{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;font-size:21px;background:#eaf2fd;flex:none}
.bar{height:9px;background:#e9edeA;border-radius:999px;overflow:hidden;margin-top:6px}
.bar i{display:block;height:100%;background:linear-gradient(90deg,var(--green2),var(--green));border-radius:999px;transition:width .7s ease}
.task{display:flex;gap:10px;align-items:center;width:100%;text-align:left;background:#f7faf8;border:1px solid var(--line2);border-radius:11px;padding:10px 11px;margin-top:7px;font-size:13px;cursor:pointer;transition:.14s}
.task:hover{border-color:var(--green2)}
.task .tick{width:22px;height:22px;border-radius:7px;border:1.5px solid var(--line);background:#fff;display:grid;place-items:center;font-size:13px;color:#fff;flex:none}
.task.on{background:var(--sage);border-color:#cfe3d6}
.task.on .tick{background:var(--green);border-color:var(--green)}
.task small{color:var(--muted);font-size:11px}
.hero-login{padding:24px 16px 22px;background:linear-gradient(#fbfdfc,#f3f9f5);display:flex;flex-direction:column;gap:13px;min-height:92vh}
.brand{display:flex;align-items:center;gap:12px}
.logo{width:58px;height:58px;border-radius:19px;background:linear-gradient(150deg,#eaf5ea,#fdf1da);border:1px solid var(--line);display:grid;place-items:center;font-size:28px;color:var(--green)}
.brand-t{font-size:22px;letter-spacing:3.5px;font-weight:800;color:var(--green)}.brand-s{font-size:11.5px;color:#43544d}
.visual{border-radius:20px;background:linear-gradient(135deg,#f9ecd3,#e9f4ea);padding:22px;box-shadow:var(--sh);position:relative;overflow:hidden;border:1px solid #fff}
.visual:before{content:"";position:absolute;right:-50px;bottom:-60px;width:180px;height:180px;border-radius:50%;background:#2c8a6317;pointer-events:none}
.tagline{font-size:25px;line-height:1.2;font-weight:800;color:#123f30}
.illus{height:140px;border-radius:20px;margin:14px 0;background:linear-gradient(135deg,#ffe4c9,#dcefdd);display:grid;place-items:center;font-size:70px;border:1px solid #ffffff90}
.quote{font-family:Fraunces,Georgia,serif;font-style:italic;color:#5f6f68;text-align:center;font-size:13.5px}
.cover{background:#fff;border:1px solid var(--line);border-radius:16px;padding:20px;box-shadow:var(--sh);text-align:center;margin-bottom:12px}
.cover-logo{font-size:38px;color:var(--green)}
.mini-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:14px 0}.mini-grid div{background:var(--sage);border-radius:12px;padding:9px 4px;font-size:10px;color:var(--green);font-weight:800}
.nav{position:sticky;bottom:12px;margin:12px 12px 0;background:#fffffff2;backdrop-filter:blur(12px);border:1px solid var(--line);border-radius:20px;display:grid;grid-template-columns:repeat(5,1fr);padding:7px;gap:3px;box-shadow:var(--sh-lg)}
.nav a{text-align:center;font-size:10.5px;color:#6b7671;text-decoration:none;border-radius:14px;padding:7px 2px;font-weight:800;transition:.14s}
.nav a.on{background:var(--sage);color:var(--green)}
.nav a span{font-size:18px;display:block}
.empty{text-align:center;padding:26px 12px;color:var(--muted)}.empty .big{font-size:38px}
.skel{border-radius:8px;background:linear-gradient(90deg,#e8edea 25%,#f4f8f6 50%,#e8edea 75%);background-size:200% 100%;animation:sh 1.2s infinite;height:14px}
@keyframes sh{to{background-position:-200% 0}}
.art-body{font-size:12.5px;color:#43544d;line-height:1.55;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sheet{background:#fff;border:1px solid var(--line);border-radius:16px;padding:14px;margin-top:12px}
`;

function useHash(): string {
  const [h, setH] = useState(location.hash || "#/");
  useEffect(() => { const f = () => { setH(location.hash || "#/"); window.scrollTo(0, 0); }; addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []);
  return h;
}
function Nav({ r }: any) {
  const it = (p: string, e: string, l: string) => <a href={"#" + p} className={r === p || (p === "/" && (r === "" || r === "/")) ? "on" : ""}><span>{e}</span>{l}</a>;
  return <nav className="nav">{it("/", "🏠", "Beranda")}{it("/appointments", "📅", "Jadwal")}{it("/screening", "🧩", "Perkembangan")}{it("/education", "📚", "Edukasi")}{it("/account", "👤", "Profil")}</nav>;
}

export default function App() {
  const h = useHash();
  const [me, setMe] = useState<any>(null);
  useEffect(() => { const s = document.createElement("style"); s.textContent = css; document.head.append(s); api.get("/api/me").then((r) => setMe((cur: any) => cur || (r.user?.role === "parent" ? r.user : null))).catch(() => {}); }, []);
  const R = h.replace("#", "");
  if (R.startsWith("/welcome") || (!me && !R.startsWith("/education"))) return <Welcome onOk={setMe} />;
  return <div className="phone"><div className="pad">
    {R === "/" || R === "" ? <Home me={me} /> : R.startsWith("/child") ? <Child route={R} /> : R.startsWith("/appointments") ? <Appts /> : R.startsWith("/growth") ? <Growth route={R} /> : R.startsWith("/resep") ? <Resep route={R} /> : R.startsWith("/tagihan") ? <Tagihan route={R} /> : R.startsWith("/screening") ? <Screen route={R} /> : R.startsWith("/therapy") ? <Therapy route={R} /> : R.startsWith("/sessions") ? <Session route={R} /> : R.startsWith("/education") ? <Edu /> : R.startsWith("/reports") ? <Rep /> : R.startsWith("/stimulation") ? <Stim /> : R.startsWith("/account") ? <Acct me={me} setMe={setMe} /> : <Home me={me} />}
    <Nav r={R} /></div></div>;
}

function Welcome({ onOk }: any) {
  const [e, setE] = useState(""), [p, setP] = useState(""), [n, setN] = useState(""), [m, setM] = useState(""), [mode, setMode] = useState<"in" | "up">("in");
  const go = (url: string, body: any) => api.post(url, body).then((r) => {
    if (r.user && r.user.role !== "parent") { setM("Akun ini terdaftar sebagai staff (" + r.user.role + ") — portal ini khusus orang tua. Keluar dari EMR dulu atau pakai browser lain."); return; }
    onOk(r.user || { role: "parent", name: n });
  }).catch(() => setM("Gagal — periksa email/password atau koneksi API."));
  // ponytail: real Google button (GIS) only when backend has GOOGLE_CLIENT_ID; client id comes from /api/config (no rebuild)
  const [gcid, setGcid] = useState<string | null>(null);
  useEffect(() => { fetch(API + "/api/config", { headers: H }).then((r) => r.json()).then((c) => setGcid(c.googleClientId)).catch(() => {}); }, []);
  useEffect(() => {
    if (!gcid) return;
    const w = window as any;
    const render = () => { w.google.accounts.id.initialize({ client_id: gcid, callback: (r: any) => go("/api/auth/google", { idToken: r.credential }) }); w.google.accounts.id.renderButton(document.getElementById("gbtn"), { theme: "outline", size: "large" }); };
    if (w.google?.accounts) { render(); return; }
    if (document.getElementById("gsi")) { document.getElementById("gsi")!.addEventListener("load", render); return; }
    const s = document.createElement("script"); s.id = "gsi"; s.src = "https://accounts.google.com/gsi/client"; (s as any).onload = render; document.head.append(s);
  }, [gcid]);
  return <div className="phone"><div className="hero-login">
    <div className="brand"><div className="logo">♡</div><div><div className="brand-t serif">ASAKITA</div><div className="brand-s">Child Health Center<br />by dr. Imelda Hady, Sp.A</div></div></div>
    <div className="visual"><div className="tagline serif">Tumbuh bersama,<br />menuju generasi hebat.</div>
      <p style={{ color: "#5f6d64", fontSize: 13, lineHeight: 1.55 }}>Pantau tumbuh kembang, jadwal terapi, edukasi ASI/MPASI & stimulasi harian — khusus data anak Anda.</p>
      <div className="illus">👩‍🍼</div>
      <div className="tabs" style={{ margin: "4px 0 8px" }}><button className={"tab" + (mode === "in" ? " on" : "")} onClick={() => setMode("in")}>Masuk</button><button className={"tab" + (mode === "up" ? " on" : "")} onClick={() => setMode("up")}>Daftar</button></div>
      <label className="lbl">Email</label><input className="inp" value={e} onChange={(x) => setE(x.target.value.trim())} placeholder="email@anda.id" />
      {mode === "up" && <><label className="lbl">Nama panggilan</label><input className="inp" value={n} onChange={(x) => setN(x.target.value)} placeholder="Nama panggilan Anda" /></>}
      <label className="lbl">Password</label><input className="inp" type="password" value={p} onChange={(x) => setP(x.target.value)} onKeyDown={(x) => { if (x.key === "Enter") go(mode === "in" ? "/api/auth/login" : "/api/auth/register-parent", mode === "in" ? { email: e, password: p } : { email: e, password: p, name: n }); }} />
      {m && <p style={{ color: "#b42318", fontSize: 13 }}>{m}</p>}
      {mode === "in"
        ? <><button className="btn btn-p" style={{ marginTop: 12 }} onClick={() => go("/api/auth/login", { email: e, password: p })}>Masuk →</button>
          {gcid ? <div id="gbtn" style={{ display: "flex", justifyContent: "center", marginTop: 8 }} /> : null}</>
        : <button className="btn btn-p" style={{ marginTop: 12 }} onClick={() => go("/api/auth/register-parent", { email: e, password: p, name: n }).then(() => go("/api/auth/login", { email: e, password: p }))}>Daftar akun →</button>}
      <button className="btn btn-soft" style={{ marginTop: 8 }} onClick={() => (location.hash = "#/education")}>Lanjut sebagai tamu</button>
    </div>
    <div className="quote">“Setiap anak berkembang dengan caranya sendiri.”</div>
  </div></div>;
}

function useKids() {
  const [k, setK] = useState<any[] | null>(null);
  useEffect(() => { api.get("/api/portal/children").then((r) => setK(r.data)).catch(() => setK([])); }, []);
  return k;
}

function Home({ me }: any) {
  const kids = useKids();
  const [arts, setArts] = useState<any[]>([]); const [next, setNext] = useState<any>(null);
  useEffect(() => { api.get("/api/articles").then((r) => setArts(r.data.slice(0, 2))).catch(() => {}); api.get("/api/portal/appointments?scope=upcoming").then((r) => setNext(r.data[0] || null)).catch(() => {}); }, []);
  const k = (kids || [])[0];
  return <div>
    <div className="topbar"><div><h1 className="serif">Beranda</h1><div className="sub">Asakita Child Health Center</div></div><button className="icon-btn" onClick={() => (location.hash = "#/account")} aria-label="Akun">👤</button></div>
    <div className="hello"><div className="avatar">👩</div><div><h2 className="serif">Halo, {me?.name?.split(" ")[0] || "Bunda"} 👋</h2><p>{kids === null ? "Memuat data anak…" : k ? `Ringkasan ${k.full_name?.split(" ")[0]} hari ini.` : "Akun belum tertaut ke data anak."}</p></div></div>
    {!kids ? <div className="card"><div className="skel" style={{ width: "60%" }} /><div className="skel" style={{ marginTop: 8 }} /></div>
      : !k ? <div className="card"><b>Belum ada data anak tertaut.</b><p style={{ fontSize: 13, color: "#5f6d64" }}>Akun baru perlu ditautkan ke data anak oleh front office — hubungi klinik dengan membawa No. RM.</p></div>
      : <div className="card child-card tap" onClick={() => (location.hash = "#/child/" + k.id)}><div className="child-photo">👶</div><div style={{ flex: 1 }}><h3 style={{ margin: 0, fontSize: 16 }}>{k.full_name}</h3><p style={{ margin: "4px 0 0", color: "#6f7d75", fontSize: 12 }}>{ageID(k.dob)} • Lihat profil anak</p><span className="pill green">Pasien aktif</span></div><span style={{ fontSize: 22, color: "#275844" }}>›</span></div>}
    <div className="grid-2">
      <div className="tile pink" onClick={() => (location.hash = "#/appointments")}><div className="emoji">📅</div><div><h4>Jadwal</h4><p>{next ? `${dID(next.starts_at)} • ${next.type}` : "Belum ada jadwal"}</p><small>{next ? tHM(next.starts_at) + " →" : "Buat janji →"}</small></div></div>
      <div className="tile green" onClick={() => k && (location.hash = "#/growth/" + k.id)}><div className="emoji">📈</div><div><h4>Pertumbuhan</h4><p>BB/TB/LK sesuai usia</p><small>Lihat grafik →</small></div></div>
      <div className="tile blue" onClick={() => (location.hash = "#/screening" + (k ? "/" + k.id : ""))}><div className="emoji">🧩</div><div><h4>Perkembangan</h4><p>5 domain skrining</p><small>Cek status →</small></div></div>
      <div className="tile yellow" onClick={() => (location.hash = "#/stimulation")}><div className="emoji">💡</div><div><h4>Stimulasi hari ini</h4><p>Motorik & bicara 10 mnt</p><small>Mulai →</small></div></div>
      <div className="tile blue" onClick={() => (location.hash = "#/resep")}><div className="emoji">📝</div><div><h4>Resep latihan</h4><p>Centik latihan harian</p><small>Isi checklist →</small></div></div>
      <div className="tile green" onClick={() => (location.hash = "#/tagihan")}><div className="emoji">🧾</div><div><h4>Tagihan</h4><p>Rincian biaya layanan</p><small>Lihat →</small></div></div>
    </div>
    <div className="sec"><h3>Artikel pilihan</h3><span onClick={() => (location.hash = "#/education")}>Lihat semua →</span></div>
    {arts.map((a: any) => <div className="row" key={a.id} onClick={() => (location.hash = "#/education")}><div className="thumb">{a.category === "ASI" ? "🤱" : a.category === "MPASI" ? "🥣" : "🗣️"}</div><div><h4>{a.title}</h4><p>{a.author} • {a.category}</p><p className="art-body">{a.body_md}</p></div></div>)}
  </div>;
}

function Child({ route }: any) {
  const id = route.split("/")[2]; const [c, setC] = useState<any>(null); const [tab, setTab] = useState("Data Dasar");
  const [hist, setHist] = useState<any>(null); const [docs, setDocs] = useState<any[]>([]);
  useEffect(() => { api.get("/api/portal/children/" + id).then(setC).catch(() => {}); api.get(`/api/portal/children/${id}/history`).then(setHist).catch(() => {}); api.get(`/api/portal/documents?childId=${id}`).then((r) => setDocs(r.data)).catch(() => {}); }, [id]);
  const dlDoc = async (did: string, title: string) => {
    const r = await fetch(API + `/api/portal/documents/${did}/file`, { credentials: "include", headers: H });
    if (!r.ok) return alert("File belum tersedia — minta ke front office.");
    const url = URL.createObjectURL(new Blob([await r.arrayBuffer()]));
    const a = document.createElement("a"); a.href = url; a.download = title; a.click(); URL.revokeObjectURL(url);
  };
  if (!c) return <div className="card"><div className="skel" /><div className="skel" style={{ marginTop: 8 }} /></div>;
  return <div>
    <div className="back-title"><button className="back" onClick={() => (location.hash = "#/")}>‹</button><div><h1>Profil anak</h1><p>Data dasar & kontak — read-only</p></div></div>
    <div className="card child-card"><div className="child-photo">👶</div><div style={{ flex: 1 }}><h3 style={{ margin: 0 }}>{c.full_name}</h3><p style={{ color: "#6f7d75", fontSize: 12, margin: "4px 0" }}>{c.gender} • {ageID(c.dob)}</p><span className="pill green">Pasien aktif</span></div></div>
    <div className="tabs">{["Data Dasar", "Riwayat", "Kontak", "Dokumen"].map((t) => <button key={t} className={"tab" + (tab === t ? " on" : "")} onClick={() => setTab(t)}>{t}</button>)}</div>
    {tab === "Data Dasar" && <div className="info">{[["Nama lengkap", c.full_name], ["Panggilan", c.nickname || "—"], ["Tanggal lahir", dID(c.dob)], ["Gol. darah", c.blood_type || "—"], ["BB lahir", c.birth_weight_kg ? c.birth_weight_kg + " kg" : "—"], ["PB lahir", c.birth_length_cm ? c.birth_length_cm + " cm" : "—"]].map(([k, v]) => <div className="tr" key={k}><span className="lab">{k}</span><span className="val">{v}</span></div>)}</div>}
    {tab === "Riwayat" && <div className="card">{hist && (hist.birth_history || hist.allergies || hist.notes) ? <div style={{ fontSize: 13.5, lineHeight: 1.6 }}><p><b>Riwayat kelahiran</b><br />{hist.birth_history || "—"}</p><p><b>Catatan khusus</b><br />{hist.notes || "—"}</p><p>Alergi: <span className="pill orange">{hist.allergies || "—"}</span></p></div> : "Belum ada riwayat tercatat — tanyakan ke dokter saat kontrol."}</div>}
    {tab === "Kontak" && <div className="info"><div className="tr"><span className="lab">Alamat</span><span className="val">{c.address || "—"}</span></div><div className="tr"><span className="lab">Kontak darurat</span><span className="val">Front office Asakita</span></div></div>}
    {tab === "Dokumen" && <div className="card">{docs.length ? docs.map((d: any) => <div key={d.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f0e8d4" }}><div style={{ flex: 1, fontSize: 13.5 }}>📄 <b>{d.title}</b><br /><small style={{ color: "#6f7d75" }}>{d.kind}</small></div><button className="btn btn-soft btn-a" onClick={() => dlDoc(d.id, d.title)}>Unduh</button></div>) : <div>Belum ada dokumen. Minta salinan (akte/assessment) via front office, atau unduh resume via <b onClick={() => (location.hash = "#/reports")} style={{ color: "#275844", textDecoration: "underline" }}>Laporan →</b></div>}</div>}
    <button className="btn btn-o" onClick={() => alert("Perubahan data via front office — demi keamanan data anak.")}>Minta edit data</button>
  </div>;
}

function Appts() {
  const [tab, setTab] = useState("upcoming"); const [list, setList] = useState<any[]>([]); const [kids, setKids] = useState<any[]>([]);
  const [show, setShow] = useState(false); const [f, setF] = useState<any>({ type: "Konsultasi Dokter" });
  const load = (s = tab) => api.get(`/api/portal/appointments?scope=${s}`).then((r) => setList(r.data)).catch(() => {});
  useEffect(() => { load(); api.get("/api/portal/children").then((r) => { setKids(r.data); if (r.data[0]) setF((x: any) => ({ ...x, child_id: r.data[0].id })); }).catch(() => {}); }, []);
  useEffect(() => { load(tab); }, [tab]);
  const days = useMemo(() => { const out: any[] = []; const n = new Date(); for (let i = 0; i < 14; i++) { const d = new Date(n); d.setDate(n.getDate() + i); out.push(d); } return out; }, []);
  const hasAppt = (d: Date) => list.some((a) => (a.starts_at || "").slice(0, 10) === d.toISOString().slice(0, 10));
  return <div>
    <div className="back-title"><button className="back" onClick={() => (location.hash = "#/")}>‹</button><div><h1>Jadwal kunjungan</h1><p>Konsultasi & terapi anak</p></div></div>
    <div className="tabs"><button className={"tab" + (tab === "upcoming" ? " on" : "")} onClick={() => setTab("upcoming")}>Akan datang ({tab === "upcoming" ? list.length : "…"})</button><button className={"tab" + (tab === "history" ? " on" : "")} onClick={() => setTab("history")}>Riwayat</button></div>
    {!list.length ? <div className="empty"><div className="big">📭</div>{tab === "upcoming" ? "Belum ada jadwal. Yuk buat janji pertama." : "Belum ada riwayat kunjungan."}</div>
      : list.map((a: any) => { const d = new Date(a.starts_at); return <div className="card appt" key={a.id}><div className="appt-date"><b>{d.getDate()}</b>{d.toLocaleDateString("id-ID", { month: "short" })}<br />{d.getFullYear()}</div><div style={{ flex: 1 }}><h4 style={{ margin: 0, fontSize: 14 }}>{a.type}</h4><p style={{ fontSize: 12, color: "#6f7d75", margin: "3px 0 0" }}>{tHM(a.starts_at)} • {a.room || "Ruang info H-1"}</p></div><span className={"pill " + (a.status === "confirmed" ? "green" : a.status === "done" ? "blue" : "orange")}>{a.status}</span></div>; })}
    <button className="btn btn-p" style={{ marginTop: 6 }} onClick={() => setShow(!show)}>+ Buat janji kunjungan</button>
    {show && <div className="sheet"><label className="lbl">Anak</label><select className="inp" value={f.child_id || ""} onChange={(e) => setF({ ...f, child_id: e.target.value })}>{kids.map((k: any) => <option key={k.id} value={k.id}>{k.full_name}</option>)}</select>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><div><label className="lbl">Tanggal</label><input className="inp" type="date" onChange={(e) => setF({ ...f, date: e.target.value })} /></div><div><label className="lbl">Jam</label><input className="inp" type="time" value={f.time || "09:00"} onChange={(e) => setF({ ...f, time: e.target.value })} /></div></div>
      <label className="lbl">Layanan</label><select className="inp" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{["Konsultasi Dokter", "Terapi Wicara", "Terapi Okupasi", "Sensori Integrasi"].map((t) => <option key={t}>{t}</option>)}</select>
      <button className="btn btn-p" style={{ marginTop: 10 }} onClick={() => { if (!f.child_id || !f.date) return alert("Pilih anak + tanggal."); api.post("/api/portal/appointment-requests", { child_id: f.child_id, type: f.type, starts_at: `${f.date}T${f.time || "09:00"}` }).then(() => { setShow(false); load("upcoming"); setTab("upcoming"); }); }}>Kirim permintaan ✓</button></div>}
    <div className="cal"><div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800 }}><span>‹</span><span>{new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric" })}</span><span>›</span></div>
      <div className="cal-grid">{["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map((d) => <b key={d} className="wk">{d}</b>)}{days.map((d, i) => <div key={i} className={hasAppt(d) ? "hit" : ""}>{d.getDate()}</div>)}</div></div>
  </div>;
}

const DOT: Record<string, string> = { very_low: "#b6493f", low: "#b8862f", normal: "#1d6b4f", high: "#b8862f", very_high: "#b6493f", unknown: "#6f7d75" };

// ponytail: parent-side growth chart — same geometry helper as the EMR, smaller canvas
function PortalChart({ curve, w = 340, h = 230 }: any) {
  const geo = useMemo(() => (curve ? growthGeometry(curve, { width: w, height: h }) : null), [curve]);
  if (!geo) return <div className="empty"><div className="big">📈</div>Belum ada pengukuran.</div>;
  return <div>
    <svg className="chart-svg" viewBox={"0 0 " + geo.w + " " + geo.h} role="img" aria-label={"Kurva " + (curve.label || "")}>
      <path d={geo.area(-2, 2)} fill="#2c8a6318" />
      {[-2, 0, 2].map((z) => {
        const l = geo.lines.find((x: any) => x.z === z);
        return l ? <path key={z} d={l.d} fill="none" stroke={z === 0 ? "#1d6b4f" : "#a9bdb1"} strokeWidth={z === 0 ? 2 : 1.3} /> : null;
      })}
      {geo.child && <path d={geo.child} fill="none" stroke="#b8862f" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />}
      {geo.dots.map((p: any, i: number) => <circle key={p.id || i} cx={p.cx} cy={p.cy} r={4.5} fill={DOT[p.band] || "#1d6b4f"} stroke="#fff" strokeWidth={1.8}>
        <title>{formatDMY(p.date)} • {p.value} {curve.unit} • z {p.z} • persentil {p.percentile}</title>
      </circle>)}
      {geo.xTicks.map((t: any, i: number) => <text key={i} x={t.x} y={geo.h - 6} fontSize={8.5} textAnchor="middle" fill="#6f7d75">{t.label}</text>)}
      {geo.yTicks.map((t: any, i: number) => <text key={i} x={4} y={t.y + 3} fontSize={8.5} fill="#6f7d75">{t.label}</text>)}
    </svg>
    <div className="legend"><span><i style={{ background: "#1d6b4f" }} /> Median</span><span><i style={{ background: "#a9bdb1" }} /> ±2 SD</span><span><i style={{ background: "#b8862f" }} /> Anak</span></div>
  </div>;
}

function Growth({ route }: any) {
  const id = route.split("/")[2]; const [tab, setTab] = useState<"weight" | "height" | "head">("weight");
  const [d, setD] = useState<any[]>([]); const [kid, setKid] = useState(""); const [curve, setCurve] = useState<any>(null);
  useEffect(() => {
    const cid = id;
    if (!cid) api.get("/api/portal/children").then((r) => { const k = r.data[0]; if (k) { setKid(k.id); api.get(`/api/portal/growth/${k.id}`).then((x) => setD(x.data)); } });
    else api.get(`/api/portal/growth/${cid}`).then((r) => setD(r.data)).catch(() => {});
  }, [id]);
  useEffect(() => {
    const cid = id || kid;
    if (!cid) return;
    api.get(`/api/portal/growth/${cid}/curve?type=${tab}`).then(setCurve).catch(() => setCurve(null));
  }, [id, kid, tab]);
  const key = tab === "weight" ? "weight_kg" : tab === "height" ? "height_cm" : "head_cm";
  const unit = tab === "weight" ? "kg" : "cm";
  const label = tab === "weight" ? "Berat badan" : tab === "height" ? "Tinggi badan" : "Lingkar kepala";
  const last = curve?.latest;
  return <div>
    <div className="back-title"><button className="back" onClick={() => (location.hash = "#/")}>‹</button><div><h1>Grafik pertumbuhan</h1><p>BB / TB / LK dengan acuan WHO &amp; CDC</p></div></div>
    <div className="tabs">{[["weight", "Berat badan"], ["height", "Tinggi badan"], ["head", "Lingkar kepala"]].map(([k, l]) => <button key={k} className={"tab" + (tab === k ? " on" : "")} onClick={() => setTab(k as any)}>{l}</button>)}</div>
    <div className="card">
      <div className="chart"><div style={{ fontSize: 12, color: "#1d6b4f" }}>{label} saat ini</div><b className="big">{last ? `${last.value} ${unit}` : "—"}</b>
        <div style={{ fontSize: 12, color: "#1d6b4f" }}>{last ? (last.band === "normal" ? `✓ sesuai (${last.percentile} persentil)` : `${BAND_LABEL[last.band] || last.band} (${last.percentile} persentil)`) : "Belum ada data"}</div></div>
      <PortalChart curve={curve} />
      <div style={{ fontSize: 11.5, color: "#6f7d75", marginTop: 6 }}>{curve?.note}</div>
      {d.slice(-4).reverse().map((x: any, i: number) => <div key={i} style={{ fontSize: 12.5, padding: "7px 0", borderBottom: "1px solid #eef2f0", display: "flex", justifyContent: "space-between" }}><span>{formatDMY(x.date)}</span><b>{x[key] ?? "—"} {x[key] ? unit : ""}</b></div>)}
      <div className="note" style={{ marginTop: 10 }}>Acuan kurva mengikuti standar WHO (0–5 tahun) atau CDC (5–19 tahun). Tanggal ditulis <b>DD-MM-YYYY</b>. Bawa buku KIA saat kontrol.</div>
    </div>
    <button className="btn btn-soft" onClick={() => (location.hash = "#/reports")}>Lihat laporan pertumbuhan →</button>
    <button className="btn btn-o" style={{ marginTop: 8 }} onClick={() => (location.hash = "#/screening")}>Lihat checklist perkembangan →</button>
  </div>;
}

// ponytail: resep (home program) — parent ticks each item for the day
function Resep({ route }: any) {
  const cid = route.split("/")[2] || "";
  const [kids, setKids] = useState<any[]>([]); const [child, setChild] = useState(cid); const [progs, setProgs] = useState<any[]>([]);
  useEffect(() => { api.get("/api/portal/children").then((r) => { setKids(r.data); if (!cid && r.data[0]) setChild(r.data[0].id); }).catch(() => {}); }, [cid]);
  const load = (c: string) => { if (!c) return; api.get(`/api/portal/home-programs?childId=${c}`).then((r) => setProgs(r.data)).catch(() => setProgs([])); };
  useEffect(() => { load(child); }, [child]);
  const toggle = (id: string) => api.post(`/api/portal/home-programs/items/${id}/toggle`).then(() => load(child)).catch(() => {});
  return <div>
    <div className="back-title"><button className="back" onClick={() => (location.hash = "#/")}>‹</button><div><h1>Resep latihan</h1><p>Program dari terapis — centik tiap hari</p></div></div>
    {kids.length > 1 && <select className="inp" value={child} onChange={(e) => setChild(e.target.value)}>{kids.map((k: any) => <option key={k.id} value={k.id}>{k.full_name}</option>)}</select>}
    {!progs.length ? <div className="note">Belum ada resep dari terapis. Resep dibuat setelah sesi terapi.</div>
      : progs.map((p: any) => <div className="card" key={p.id}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h4 style={{ margin: 0 }}>{p.title}</h4><small style={{ color: "#6f7d75" }}>{dID((p.created_at || "").slice(0, 10))}</small></div>
        {p.instructions ? <p style={{ fontSize: 12.5, color: "#4c5a52" }}>{p.instructions}</p> : null}
        {p.items.map((i: any) => <button key={i.id} className={"task" + (i.doneToday ? " on" : "")} onClick={() => toggle(i.id)}>
          <span className="tick">{i.doneToday ? "✓" : ""}</span><span style={{ flex: 1, textAlign: "left" }}>{i.label}</span><small>{i.doneCount} hari</small>
        </button>)}
      </div>)}
    <div className="note">Centang setiap item yang sudah dikerjakan hari ini. Terapeutis melihat catatan ini di klinik.</div>
  </div>;
}

// ponytail: tagihan — parent sees their own child's invoice summary (no payments online)
function Tagihan({ route }: any) {
  const cid = route.split("/")[2] || "";
  const [kids, setKids] = useState<any[]>([]); const [child, setChild] = useState(cid); const [d, setD] = useState<any>(null);
  useEffect(() => { api.get("/api/portal/children").then((r) => { setKids(r.data); if (!cid && r.data[0]) setChild(r.data[0].id); }).catch(() => {}); }, [cid]);
  useEffect(() => { if (child) api.get(`/api/portal/billing?childId=${child}`).then(setD).catch(() => setD(null)); }, [child]);
  const items = d?.data || []; const t = d?.totals || { total: 0, paid: 0, unpaid: 0 };
  return <div>
    <div className="back-title"><button className="back" onClick={() => (location.hash = "#/")}>‹</button><div><h1>Tagihan</h1><p>Rincian biaya layanan</p></div></div>
    {kids.length > 1 && <select className="inp" value={child} onChange={(e) => setChild(e.target.value)}>{kids.map((k: any) => <option key={k.id} value={k.id}>{k.full_name}</option>)}</select>}
    <div className="card">
      <div className="grid-2" style={{ margin: 0 }}>
        <div><small style={{ color: "#6f7d75", fontSize: 11.5 }}>Total tagihan</small><b className="big" style={{ display: "block", fontSize: 22 }}>{formatIDR(t.total)}</b></div>
        <div><small style={{ color: "#6f7d75", fontSize: 11.5 }}>Tunggakan</small><b className="big" style={{ display: "block", fontSize: 22, color: t.unpaid ? "#b6493f" : "#1d6b4f" }}>{formatIDR(t.unpaid)}</b></div>
      </div>
    </div>
    {items.length ? items.map((i: any) => <div className="row" key={i.id} style={{ cursor: "default" }}>
      <div className="thumb" style={{ fontSize: 20 }}>🧾</div>
      <div style={{ flex: 1 }}><h4>{i.description}</h4><p>{dID(i.date)} • {i.qty} × {formatIDR(i.unit_price)}</p></div>
      <div style={{ textAlign: "right" }}><b style={{ fontSize: 13.5 }}>{formatIDR(i.total)}</b><br /><span className={"pill " + (i.status === "paid" ? "green" : "orange")}>{i.status === "paid" ? "Lunas" : "Belum"}</span></div>
    </div>) : <div className="note">Belum ada tagihan untuk anak ini.</div>}
    <div className="note">Pembayaran dilakukan di front office klinik. Simpan struk yang dicetak sebagai bukti.</div>
  </div>;
}

function Screen({ route }: any) {
  const id = route.split("/")[2] || "";
  const [d, setD] = useState<any[]>([]); const [kid, setKid] = useState(""); const [child, setChild] = useState<any>(null); const [ready, setReady] = useState(false);
  const [dnv, setDnv] = useState<any>(null);
  const [ms, setMs] = useState<any[]>([]); const [progs, setProgs] = useState<any[]>([]);
  useEffect(() => {
    const load = (cid: string) => {
      setKid(cid);
      api.get(`/api/portal/screening/${cid}`).then((x) => setD(x.data)).catch(() => {});
      api.get(`/api/portal/denver/${cid}`).then(setDnv).catch(() => {});
      api.get(`/api/portal/milestones?childId=${cid}`).then((x) => setMs(x.data)).catch(() => {});
      api.get(`/api/portal/programs?childId=${cid}`).then((x) => setProgs(x.data)).catch(() => {});
    };
    // ponytail: a parent with no linked child must see an empty state — never a made-up age or status
    api.get("/api/portal/children").then((r) => {
      const k = id ? r.data.find((x: any) => x.id === id) : r.data[0];
      if (k) { setChild(k); load(k.id); }
      setReady(true);
    }).catch(() => setReady(true));
  }, [id]);
  const DOMS: [string, string, string, string][] = [["motorik_kasar", "Motorik kasar", "🏃", "Berjalan, berlari, melompat"], ["motorik_halus", "Motorik halus", "✍️", "Menggenggam, menyusun, menjumput"], ["bahasa", "Bahasa", "💬", "Memahami & ekspresi kata"], ["sosial_emosional", "Sosial & emosional", "🤝", "Interaksi, bermain, mandiri"], ["kognitif", "Kognitif", "🧠", "Fokus & pemecahan masalah"]];
  return <div>
    <div className="back-title"><button className="back" onClick={() => (location.hash = "#/")}>‹</button><div><h1>Perkembangan anak</h1><p>Skrining 5 domain, checklist Denver, milestone, program terapi</p></div></div>
    {!ready ? null : !kid ? <div className="card"><b>Belum ada data anak tertaut.</b><p style={{ fontSize: 13, color: "#5f6d64" }}>Akun baru perlu ditautkan ke data anak oleh front office — hubungi klinik dengan membawa No. RM.</p></div> : <>
    <div className="card" style={{ background: "#fff4de" }}><b>Perkembangan{ageID(child?.dob) ? " · usia " + ageID(child.dob) : ""}</b><p style={{ margin: "6px 0 0", color: "#5f6d64", fontSize: 12.5 }}>Detail klinis mentah hanya di EMR internal — ini ringkasan aman untuk ortu.</p></div>
    {DOMS.map(([k, l, e, s]) => { const f = d.find((x) => x.domain === k); const ok = (f?.result || "").toLowerCase().includes("sesuai") || (f?.result || "").toLowerCase().includes("capai"); return <div className="scr" key={k}><div className="ico">{e}</div><div style={{ flex: 1 }}><h4 style={{ margin: 0, fontSize: 14 }}>{l}</h4><p style={{ fontSize: 12, color: "#6f7d75", margin: "3px 0 0" }}>{f?.note || s}</p></div>{f ? <span className={"pill " + (ok ? "green" : "orange")}>{f.result}</span> : <span className="pill">Belum diskrining</span>}</div>; })}
    </>}
    {dnv && <div className="card"><h4 style={{ margin: "0 0 4px" }}>Checklist Denver</h4>
      <p style={{ fontSize: 12.5, color: "#6f7d75", margin: "0 0 10px" }}>Rentang usia {dnv.band} · {dnv.checked}/{dnv.total} item diperiksa · kemajuan {dnv.progress}%</p>
      {dnv.domains.map((x: any) => <div key={x.label} style={{ marginBottom: 9 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}><span>{x.label}</span><span>{x.passed}/{x.total}</span></div>
        <div className="bar"><i style={{ width: x.progress + "%" }} /></div>
        {(x.items || []).map((it: any, i: number) => <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: "5px 0", borderBottom: "1px solid #eef2f0", fontSize: 12.5 }}>
          <span style={{ width: 18, height: 18, borderRadius: 6, display: "grid", placeItems: "center", flex: "none", fontSize: 11, color: "#fff", background: it.status === "pass" ? "#1d6b4f" : it.status === "not_yet" ? "#b8862f" : "#cfd8d3" }}>{it.status === "pass" ? "✓" : it.status === "not_yet" ? "•" : ""}</span>
          <span style={{ flex: 1 }}>{it.text}</span>
          <span className={"pill " + (it.status === "pass" ? "green" : it.status === "not_yet" ? "orange" : "")}>{it.status === "pass" ? "Lulus" : it.status === "not_yet" ? "Belum" : "Belum dicek"}</span>
        </div>)}
      </div>)}
      {dnv.flags?.advanced ? <p style={{ fontSize: 12, color: "#1d6b4f", margin: "6px 0 0" }}>Some items sudah dikuasai lebih cepat dari usianya.</p> : null}
      {dnv.flags?.delayed ? <p style={{ fontSize: 12, color: "#b8862f", margin: "6px 0 0" }}>Ada item yang perlu ditindaklanjuti bersama terapis.</p> : null}
    </div>}
    {ms.length > 0 && <div className="card"><h4 style={{ margin: "0 0 8px" }}>Milestone perkembangan</h4>
      <div className="chips">{ms.map((m: any) => <span key={m.key} className={"pill " + (m.status === "achieved" ? "green" : m.status === "concern" ? "orange" : "blue")}>{m.label} · {m.status === "achieved" ? "Tercapai" : m.status === "concern" ? "Perlu perhatian" : "Berjalan"}</span>)}</div>
    </div>}
    {progs.length > 0 && <div className="card"><h4 style={{ margin: "0 0 8px" }}>Program terapi</h4>
      {progs.map((p: any) => <div key={p.type_id} style={{ padding: "8px 0", borderBottom: "1px solid #eef2f0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><b>{p.type_name || p.type_id}</b><span className="pill">{p.frequency}</span></div>
        <div className="bar"><i style={{ width: p.progress + "%" }} /></div>
        <div style={{ fontSize: 11.5, color: "#6f7d75", marginTop: 4 }}>{p.sessions} sesi · {p.progress}% · {p.status}</div>
      </div>)}
    </div>}
    {kid && <button className="btn btn-p" onClick={() => (location.hash = "#/therapy/" + kid)}>Lihat catatan terapi →</button>}
  </div>;
}

function Therapy({ route }: any) {
  const id = route.split("/")[2]; const [d, setD] = useState<any[]>([]); const [sess, setSess] = useState<any[]>([]);
  const [kids, setKids] = useState<any[]>([]); const cid = id || kids[0]?.id;
  useEffect(() => { api.get("/api/portal/children").then((r) => setKids(r.data)).catch(() => {}); }, []);
  useEffect(() => { const c = id || kids[0]?.id; if (c) { api.get(`/api/portal/therapy/${c}`).then((r) => setD(r.data)).catch(() => {}); api.get(`/api/portal/sessions?childId=${c}`).then((r) => setSess(r.data)).catch(() => {}); } }, [id, kids]);
  return <div>
    <div className="back-title"><button className="back" onClick={() => (location.hash = "#/screening" + (cid ? "/" + cid : ""))}>‹</button><div><h1>Catatan terapi</h1><p>Ringkasan progress per jenis</p></div></div>
    <div className="tabs"><button className="tab on">Ringkasan</button><button className="tab" onClick={() => sess[0] && (location.hash = "#/sessions/" + sess[0]?.id)}>Detail sesi</button></div>
    {!d.length ? <div className="card"><div className="skel" /><div className="skel" style={{ marginTop: 8 }} /></div>
      : d.map((t: any) => <div className="card" key={t.type_id}><h4 style={{ display: "flex", justifyContent: "space-between", margin: "0 0 4px" }}>{t.type} <span>{t.progress}%</span></h4><div className="bar"><i style={{ width: t.progress + "%" }} /></div><p style={{ color: "#5f6d64", fontSize: 12, margin: "8px 0 0" }}>{t.sessions} sesi • target bertahap per evaluasi terapis</p></div>)}
    <div className="sec"><h3>Sesi terakhir</h3></div>
    {!sess.length ? <div className="note">Belum ada sesi tercatat — tanyakan jadwal ke front office.</div>
      : sess.slice(0, 5).map((s: any) => <div className="row" key={s.id} onClick={() => (location.hash = "#/sessions/" + s.id)}><div className="thumb">👩‍⚕️</div><div style={{ flex: 1 }}><h4>{s.type_name || "Terapi"} • {dID(s.date)}</h4><p>{s.target || "—"}</p></div><span style={{ fontSize: 20, color: "#275844" }}>›</span></div>)}
    <div className="sec"><h3>Rekomendasi di rumah</h3><span onClick={() => (location.hash = "#/resep")}>Buka resep →</span></div>
    <div className="row" onClick={() => (location.hash = "#/resep")}><div className="thumb">📝</div><div><h4>Resep latihan dari terapis</h4><p>Centik yang sudah dikerjakan hari ini</p></div><span style={{ fontSize: 20, color: "#1d6b4f" }}>›</span></div>
  </div>;
}

function Session({ route }: any) {
  const id = route.split("/")[2]; const [s, setS] = useState<any>(null);
  useEffect(() => { api.get(`/api/portal/sessions/${id}`).then(setS).catch(() => {}); }, [id]);
  if (!s) return <div className="card"><div className="skel" /></div>;
  return <div>
    <div className="back-title"><button className="back" onClick={() => history.back()}>‹</button><div><h1>Detail sesi terapi</h1><p>Catatan terakhir terapis</p></div></div>
    <div className="row"><div className="thumb">👩‍⚕️</div><div><h4>{s.type_name}</h4><p>{dID(s.date)} • terapis Asakita</p></div></div>
    <div className="card"><h4 style={{ margin: "0 0 8px" }}>Target</h4><p style={{ fontSize: 13, color: "#4c5a52", lineHeight: 1.6, margin: 0 }}>{s.target || "—"}</p></div>
    <div className="card"><h4 style={{ margin: "0 0 8px" }}>Respon anak</h4><p style={{ margin: 0, fontSize: 13 }}>{s.response || "—"}</p><div style={{ fontSize: 26, marginTop: 6 }}>😊 🙂 😐</div></div>
    <div className="card"><h4 style={{ margin: "0 0 8px" }}>PR di rumah 🏠</h4><ul style={{ fontSize: 13, color: "#4c5a52", lineHeight: 1.6, paddingLeft: 18, margin: 0 }}><li>{s.home_recommendation || "Ikuti anjuran terapis trained."}</li><li>Baca buku bergambar 10 mnt/hari</li></ul></div>
  </div>;
}

function Edu() {
  const [cat, setCat] = useState(""); const [q, setQ] = useState(""); const [list, setList] = useState<any[]>([]); const [open, setOpen] = useState("");
  useEffect(() => { api.get("/api/articles" + (cat ? `?category=${cat}` : "")).then((r) => setList(r.data)).catch(() => {}); }, [cat]);
  const shown = list.filter((a) => (a.title + " " + a.body_md).toLowerCase().includes(q.toLowerCase()));
  const emo = (c: string) => c === "ASI" ? "🤱" : c === "MPASI" ? "🥣" : c === "stimulasi" ? "🗣️" : "🧸";
  return <div>
    <div className="back-title"><button className="back" onClick={() => (location.hash = "#/")}>‹</button><div><h1>Edukasi</h1><p>ASI • MPASI • stimulasi • perilaku</p></div></div>
    <input className="inp" placeholder="⌕ Cari artikel…" value={q} onChange={(e) => setQ(e.target.value)} />
    <div className="tabs">{["", "ASI", "MPASI", "stimulasi", "perilaku"].map((c) => <button key={c} className={"tab" + (cat === c ? " on" : "")} onClick={() => setCat(c)}>{c || "Semua"}</button>)}</div>
    {!shown.length ? <div className="empty"><div className="big">📚</div>Tidak ada artikel cocok.</div>
      : shown.map((a: any) => <div className="row" key={a.id} onClick={() => setOpen(open === a.id ? "" : a.id)}><div className="thumb">{emo(a.category)}</div><div style={{ flex: 1 }}><h4>{a.title}</h4><p>{a.author} • <span className="pill green">{a.category}</span></p>{open === a.id ? <><p style={{ fontSize: 13, color: "#1d2b25", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{a.body_md}</p>{a.source_url && <a href={a.source_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ fontSize: 12, fontWeight: 700, color: "#275844" }}>Sumber: {a.source_name || "tautan asli"} ↗</a>}</> : <p className="art-body">{a.body_md}</p>}</div><span style={{ color: "#275844", fontWeight: 800 }}>{open === a.id ? "▾" : "▸"}</span></div>)}
  </div>;
}

function Rep() {
  const [list, setList] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  useEffect(() => { api.get("/api/portal/reports").then((r) => setList(r.data)).catch(() => {}); }, []);
  const dl = async (id: string) => {
    const r = await fetch(API + `/api/portal/reports/${id}/pdf`, { credentials: "include", headers: H });
    if (!r.ok) return setMsg("Gagal unduh PDF.");
    const url = URL.createObjectURL(new Blob([await r.arrayBuffer()], { type: "application/pdf" }));
    open(url, "_blank");
    setMsg("PDF dibuka di tab baru.");
  };
  const mail = async (id: string) => {
    const to = prompt("Kirim ke email mana?", "");
    if (!to) return;
    await api.post(`/api/portal/reports/${id}/email`, { to });
    setMsg("Tautan email dicatat — cek inbox Anda.");
  };
  return <div>
    <div className="back-title"><button className="back" onClick={() => (location.hash = "#/")}>‹</button><div><h1>Laporan perkembangan</h1><p>Resume dokter</p></div></div>
    <div className="cover"><div className="cover-logo">♡</div><h2 style={{ color: "#275844", margin: "4px 0" }} className="serif">ASAKITA</h2><p style={{ margin: 0, color: "#6f7d75", fontSize: 12 }}>Child Health Center</p><hr style={{ border: 0, borderTop: "1px solid #eee0cb", margin: "16px 0" }} /><h3>Laporan perkembangan anak</h3><div className="child-photo" style={{ margin: "10px auto" }}>👶</div><div className="mini-grid"><div>Pertumbuhan</div><div>Perkembangan</div><div>Terapi</div><div>Rekomendasi</div></div></div>
    {list.length ? list.slice(0, 3).map((r: any) => <div className="card" key={r.id}><b>{dID(r.created_at)}</b> • {r.period_start}–{r.period_end}<p style={{ fontSize: 13, color: "#4c5a52" }}>{r.summary}</p><div style={{ display: "flex", gap: 8 }}><button className="btn btn-soft btn-a" onClick={() => dl(r.id)}>Download PDF</button><button className="btn btn-o btn-a" onClick={() => mail(r.id)}>Kirim ke email</button></div></div>)
      : <div className="note">Laporan terbit per periode evaluasi. Minta ke front office bila butuh PDF untuk sekolah — versi portal selalu ringkasan kurasi, bukan rekam mentah.</div>}
    {msg && <div className="note" style={{ marginTop: 8 }}>{msg}</div>}
  </div>;
}

function Stim() {
  const [age, setAge] = useState("2-3"); const [list, setList] = useState<any[]>([]);
  useEffect(() => { api.get(`/api/portal/stimulation?age=${age}`).then((r) => setList(r.data)).catch(() => {}); }, [age]);
  const emo = (t: string) => t.toLowerCase().includes("bicara") ? "🗣️" : t.toLowerCase().includes("motorik") ? "🧱" : t.toLowerCase().includes("sensorik") ? "🎨" : t.toLowerCase().includes("sosial") ? "🤝" : "🧸";
  return <div>
    <div className="back-title"><button className="back" onClick={() => (location.hash = "#/")}>‹</button><div><h1>Menu stimulasi</h1><p>Aktivitas harian per usia</p></div></div>
    <div className="tabs">{["0-6", "6-12", "1-2", "2-3"].map((a) => <button key={a} className={"tab" + (age === a ? " on" : "")} onClick={() => setAge(a)}>{a === "0-6" ? "0–6 bln" : a === "6-12" ? "6–12 bln" : a + " th"}</button>)}</div>
    {list.map((x: any, i: number) => <div className="row" key={i}><div className="thumb">{emo(x.title)}</div><div><h4>{x.title}</h4><p>Usia {x.age} • 10 mnt/hari • checklist selesai ✓</p></div></div>)}
    <div className="note">Lakukan saat anak tenang & kenyang. Hentikan bila rewel — konsistensi &gt; durasi.</div>
  </div>;
}

function Acct({ me, setMe }: any) {
  const [prof, setProf] = useState<any>(null); const [view, setView] = useState("");
  useEffect(() => { api.get("/api/portal/profile").then(setProf).catch(() => {}); }, []);
  useEffect(() => { document.documentElement.style.fontSize = localStorage.getItem("ak-font") === "big" ? "18px" : ""; }, [view]);
  const rows: [string, string, string][] = [["👶", "Anak saya", "#/"], ["🔔", "Notifikasi", "notif"], ["🔐", "Keamanan akun", "aman"], ["⚙️", "Pengaturan", "atur"], ["❔", "Bantuan", "bantu"], ["ℹ️", "Tentang Asakita", "tentang"]];
  if (view) return <div>
    <div className="back-title"><button className="back" onClick={() => setView("")}>‹</button><div><h1>{{ notif: "Notifikasi", aman: "Keamanan akun", atur: "Pengaturan", bantu: "Bantuan", tentang: "Tentang Asakita" }[view]}</h1><p>Akun orang tua</p></div></div>
    {view === "notif" && <Notif />}{view === "aman" && <Pass />}{view === "atur" && <Sett />}
    {view === "bantu" && <div className="card" style={{ fontSize: 13.5, lineHeight: 1.7 }}><b>Butuh bantuan?</b><p>Hubungi front office Asakita untuk: ubah data anak, minta salinan dokumen, jadwal ulang, atau laporan untuk sekolah.</p><p>Jam layanan: Senin–Sabtu, 08.00–17.00 WITA.</p></div>}
    {view === "tentang" && <div className="card" style={{ fontSize: 13.5, lineHeight: 1.7 }}><div className="cover-logo">♡</div><b>Asakita Child Health Center</b><p>Klinik tumbuh kembang anak — dr. Imelda Hady, Sp.A. Portal v0.1: data yang tampil hanya milik anak tertaut di akun ini.</p></div>}
  </div>;
  return <div>
    <div className="back-title"><button className="back" onClick={() => (location.hash = "#/")}>‹</button><div><h1>Akun orang tua</h1><p>Profil & pengaturan</p></div></div>
    <div className="card child-card"><div className="avatar">👩</div><div><h3 style={{ margin: 0 }}>{me?.name || "Orang tua"}</h3><p style={{ color: "#6f7d75", fontSize: 12, margin: "4px 0 0" }}>{me?.email || ""}</p></div></div>
    <div className="info"><div className="tr"><span className="lab">No. HP</span><span className="val">{prof?.phone || "—"}</span></div><div className="tr"><span className="lab">Alamat</span><span className="val">{prof?.address || "—"}</span></div><div className="tr"><span className="lab">Ubah data</span><span className="val" style={{ fontWeight: 400, fontSize: 12 }}>Via front office</span></div></div>
    <div className="info">{rows.map(([e, l, h]) => <div className="tr" key={l} style={{ cursor: "pointer" }} onClick={() => h.startsWith("#/") ? (location.hash = h) : setView(h)}><span>{e} {l}</span><span>›</span></div>)}</div>
    <button className="btn btn-d" onClick={() => fetch(API + "/api/auth/logout", { method: "POST", credentials: "include", headers: H }).then(() => { setMe(null); location.hash = "#/welcome"; })}>Keluar</button>
    <p className="quote">Asakita v0.1 • data anak hanya untuk akun tertaut</p>
  </div>;
}

function Notif() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    Promise.all([api.get("/api/portal/appointments?scope=upcoming").catch(() => ({ data: [] })), api.get("/api/portal/reports").catch(() => ({ data: [] }))]).then(([a, r]) => {
      const ap = (a.data || []).slice(0, 3).map((x: any) => ({ e: "📅", t: `${x.type} — ${x.starts_at?.slice(0, 16).replace("T", " ")}`, s: x.status }));
      const rp = (r.data || []).slice(0, 2).map((x: any) => ({ e: "📄", t: `Laporan ${x.period_start}–${x.period_end} terbit`, s: "baru" }));
      setItems([...ap, ...rp]);
    });
  }, []);
  if (!items.length) return <div className="empty"><div className="big">🔔</div>Belum ada notifikasi.</div>;
  return <div>{items.map((n, i) => <div className="row" key={i}><div className="thumb">{n.e}</div><div><h4>{n.t}</h4><p>{n.s}</p></div></div>)}</div>;
}

function Pass() {
  const [f, setF] = useState({ a: "", b: "", c: "" }); const [m, setM] = useState("");
  return <div className="card"><label className="lbl">Password lama</label><input className="inp" type="password" value={f.a} onChange={(e) => setF({ ...f, a: e.target.value })} />
    <label className="lbl">Password baru (≥6)</label><input className="inp" type="password" value={f.b} onChange={(e) => setF({ ...f, b: e.target.value })} />
    <label className="lbl">Ulangi password baru</label><input className="inp" type="password" value={f.c} onChange={(e) => setF({ ...f, c: e.target.value })} />
    {m && <p style={{ fontSize: 13, color: m.startsWith("✓") ? "#237142" : "#b42318" }}>{m}</p>}
    <button className="btn btn-p" style={{ marginTop: 10 }} onClick={() => {
      if (f.b !== f.c) return setM("Konfirmasi tidak sama.");
      api.post("/api/portal/change-password", { current: f.a, next: f.b }).then(() => { setM("✓ Password diganti."); setF({ a: "", b: "", c: "" }); }).catch(() => setM("Gagal — password lama salah atau baru kurang dari 6 karakter."));
    }}>Ganti password</button></div>;
}

function Sett() {
  const [big, setBig] = useState(localStorage.getItem("ak-font") === "big");
  return <div className="card"><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14 }}><span>🔍 Teks besar</span><button className={"tab" + (big ? " on" : "")} onClick={() => { const v = !big; setBig(v); localStorage.setItem("ak-font", v ? "big" : ""); document.documentElement.style.fontSize = v ? "18px" : ""; }}>{big ? "Aktif" : "Mati"}</button></div>
    <p style={{ fontSize: 12, color: "#6f7d75" }}>Memperbesar huruf di seluruh portal. Tersimpan di perangkat ini.</p></div>;
}
