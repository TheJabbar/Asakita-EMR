// ponytail: one-file portal — mobile cards, bottom nav, plain fetch; curated endpoints only, never raw SOAP
import React, { useEffect, useMemo, useState } from "react";
const API = (import.meta as any).env?.VITE_API_URL || "http://localhost:8787";
const j = (r: Response) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); };
const api = {
  get: (p: string) => fetch(API + p, { credentials: "include" }).then(j),
  post: (p: string, b: any) => fetch(API + p, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(j),
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
:root{--green:#275844;--green2:#4d8266;--sage:#e1eee1;--cream:#fbf7ec;--card:#fff;--ink:#1d2b25;--muted:#6f7d75;--line:#e9e0cf;--yellow:#f2c14e;--peach:#ffe4cf;--blue:#e2f1ff;--pink:#ffe6ec;--radius:24px;--sh:0 14px 34px rgba(39,88,68,.12)}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;font-family:"Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",sans-serif;background:radial-gradient(600px 300px at 15% 0%,#f2c14e2e,transparent),radial-gradient(700px 340px at 90% 10%,#4d82662b,transparent),linear-gradient(135deg,#fdf6e7,#ecf4ec 60%,#fff7e8);color:var(--ink);min-height:100vh;-webkit-font-smoothing:antialiased}
h1,h2,.serif{font-family:Fraunces,Georgia,serif;letter-spacing:-.02em}
button,input,select{font:inherit}:focus-visible{outline:3px solid var(--yellow);outline-offset:2px;border-radius:10px}
@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes pop{0%{transform:scale(.97);opacity:0}100%{transform:none;opacity:1}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
.phone{max-width:440px;margin:0 auto;min-height:100vh;background:#fdfbf4;border-left:1px solid var(--line);border-right:1px solid var(--line);position:relative;box-shadow:0 0 60px #27584414}
@media(min-width:500px){.phone{margin:22px auto;border:1px solid var(--line);border-radius:36px;overflow:hidden;min-height:min(900px,94vh)}body{padding:0 12px}}
.pad{padding:18px 16px 104px}.pad>*{animation:rise .45s both}.pad>*:nth-child(2){animation-delay:.05s}.pad>*:nth-child(3){animation-delay:.1s}.pad>*:nth-child(4){animation-delay:.15s}
.topbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.topbar h1{font-size:21px;margin:0}.topbar .sub{font-size:12px;color:var(--muted)}
.icon-btn{width:44px;height:44px;border-radius:15px;border:1px solid var(--line);background:#fff;display:grid;place-items:center;font-size:19px;cursor:pointer;box-shadow:var(--sh);transition:.15s}
.icon-btn:hover{transform:translateY(-1px)}
.back-title{display:flex;align-items:center;gap:10px;margin-bottom:14px}.back-title h1{font-size:19px;margin:0}.back-title p{margin:2px 0 0;color:var(--muted);font-size:12px}
.back{border:1px solid var(--line);background:#fff;width:42px;height:42px;border-radius:15px;font-size:20px;cursor:pointer;box-shadow:var(--sh)}
.hello{display:flex;gap:12px;align-items:center;margin-bottom:14px}
.avatar{width:56px;height:56px;border-radius:19px;background:linear-gradient(135deg,#ffdfba,#c6e2cb);display:grid;place-items:center;font-size:29px;flex:none;box-shadow:var(--sh)}
.hello h2{font-size:21px;margin:0}.hello p{margin:3px 0 0;color:var(--muted);font-size:13px}
.card{background:var(--card);border:1px solid #eee3cd;border-radius:var(--radius);padding:15px;margin:10px 0;box-shadow:var(--sh);transition:.16s}
.card.tap{cursor:pointer}.card.tap:hover{transform:translateY(-2px);border-color:var(--green2)}
.child-card{display:flex;align-items:center;gap:13px;cursor:pointer;background:linear-gradient(120deg,#fff,#f2f7ef);border:1.5px solid #e2e8d8}
.child-photo{width:64px;height:64px;border-radius:20px;background:linear-gradient(135deg,#dcefe0,#ffe2c4);display:grid;place-items:center;font-size:33px;flex:none}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:11px;margin:12px 0}
.tile{border-radius:22px;padding:14px;min-height:118px;cursor:pointer;display:flex;flex-direction:column;justify-content:space-between;border:1px solid #00000010;transition:.16s;box-shadow:var(--sh)}
.tile:hover{transform:translateY(-3px)}.tile .emoji{font-size:27px}.tile h4{margin:8px 0 3px;font-size:13.5px}.tile p{font-size:11.5px;color:#4c5a52;margin:0;line-height:1.4}.tile small{font-weight:800;font-size:11px}
.tile.green{background:linear-gradient(150deg,#e7f4e7,#d3e9d5)}.tile.yellow{background:linear-gradient(150deg,#fff6dd,#fbe9b8)}.tile.blue{background:linear-gradient(150deg,#e8f3ff,#d2e7ff)}.tile.pink{background:linear-gradient(150deg,#ffedf1,#ffdfe7)}
.sec{display:flex;align-items:center;justify-content:space-between;margin:16px 2px 8px}.sec h3{font-size:14.5px;margin:0}.sec span{font-size:12px;color:var(--green);font-weight:800;cursor:pointer}
.row{display:flex;gap:12px;align-items:center;background:#fff;border:1px solid #eee3cd;border-radius:19px;padding:12px;margin-bottom:9px;box-shadow:var(--sh);cursor:pointer;transition:.15s}
.row:hover{transform:translateX(3px)}
.thumb{width:56px;height:56px;border-radius:17px;background:linear-gradient(135deg,#f6d391,#c4dfc8);display:grid;place-items:center;font-size:27px;flex:none}
.row h4{margin:0;font-size:13.5px}.row p{font-size:12px;color:var(--muted);margin:3px 0 0}
.pill{display:inline-flex;align-items:center;padding:5px 11px;border-radius:999px;font-size:11px;font-weight:800;border:1px solid transparent;margin:2px}
.pill.green{background:#e2f4e4;color:#237142;border-color:#c4e5c9}.pill.orange{background:#fff0d2;color:#93590a;border-color:#f2d28c}.pill.blue{background:#e3f1ff;color:#2563a6;border-color:#c6e2ff}.pill.red{background:#ffe3e3;color:#b42318;border-color:#f3bcbc}
.tabs{display:flex;gap:8px;margin:12px 0;overflow-x:auto;padding-bottom:4px;scrollbar-width:none}
.tab{border:0;border-radius:999px;padding:10px 16px;background:#efece2;color:#5c665f;font-weight:800;font-size:12.5px;white-space:nowrap;cursor:pointer;transition:.15s}
.tab.on{background:var(--green);color:#fff;box-shadow:0 8px 18px #27584433}
.info{background:#fff;border:1px solid #eee3cd;border-radius:22px;overflow:hidden;margin-bottom:12px;box-shadow:var(--sh)}
.info .tr{display:flex;justify-content:space-between;gap:10px;padding:13px 15px;border-bottom:1px solid #f3ecdd;font-size:13px}.info .tr:last-child{border:0}.info .lab{color:var(--muted)}.info .val{font-weight:800;text-align:right}
input.inp,select.inp{border:1.5px solid #ddd5c2;border-radius:15px;padding:13px 14px;width:100%;margin:5px 0;background:#fff;font-size:14px}
input.inp:focus,select.inp:focus{border-color:var(--green2);outline:none;box-shadow:0 0 0 4px #4d826622}
.lbl{font-size:11px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:#55645c;margin:12px 0 2px;display:block}
.btn{width:100%;border:0;border-radius:17px;padding:15px;font-weight:800;font-size:15px;cursor:pointer;transition:.16s;display:flex;align-items:center;justify-content:center;gap:8px}
.btn:hover{transform:translateY(-1px)}.btn:active{transform:none}
.btn-p{background:linear-gradient(135deg,var(--green2),var(--green));color:#fff;box-shadow:0 12px 24px #27584433}
.btn-o{background:#fff;color:var(--green);border:1.5px solid #c8d8cc}
.btn-soft{background:#ebf4eb;color:var(--green);border:1px solid #d5e7d5}
.btn-d{background:#ffe1e1;color:#b42318;border:1px solid #f3bcbc}
.btn-a{width:auto;padding:10px 14px;font-size:13px}
.appt{display:flex;gap:12px;align-items:center}
.appt-date{width:62px;border-radius:17px;background:#fff0df;color:#b25a1e;text-align:center;padding:9px 4px;font-weight:800;flex:none;border:1px solid #f2d3ac}.appt-date b{font-size:21px;display:block;line-height:1}
.cal{background:#fff;border:1px solid #eee3cd;border-radius:22px;padding:14px;box-shadow:var(--sh);margin-top:12px}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:5px;text-align:center;font-size:12px;color:#6b7280;margin-top:10px}
.cal-grid div{padding:8px 0;border-radius:11px}.cal-grid .hit{background:var(--green);color:#fff;font-weight:800}.cal-grid .wk{font-weight:800;color:#3c4a43}
.chart{background:#e4f3e4;border-radius:18px;padding:15px;margin-bottom:12px;text-align:center}
.chart b.big{font-size:30px;color:var(--green);font-family:Fraunces,Georgia,serif}
.chart-svg{width:100%;height:auto;background:#fbf8ee;border:1px solid #ece1c8;border-radius:16px;margin-top:10px}
.note{font-size:12px;color:#5c665f;background:#fff8e2;padding:12px 14px;border-radius:15px;line-height:1.5;border:1px dashed #e8c96a}
.scr{display:flex;gap:12px;align-items:center;background:#fff;border:1px solid #eee3cd;border-radius:19px;padding:13px;margin-bottom:9px;box-shadow:var(--sh)}
.scr .ico{width:46px;height:46px;border-radius:16px;display:grid;place-items:center;font-size:23px;background:#eaf3ff;flex:none}
.bar{height:11px;background:#e9ece5;border-radius:999px;overflow:hidden;margin-top:8px}
.bar i{display:block;height:100%;background:linear-gradient(90deg,var(--green2),var(--green));border-radius:999px;transition:width .8s ease}
.hero-login{padding:26px 18px 24px;background:linear-gradient(#fffaf0,#f2f7f0);display:flex;flex-direction:column;gap:14px;min-height:92vh}
.brand{display:flex;align-items:center;gap:12px}
.logo{width:62px;height:62px;border-radius:21px;background:linear-gradient(150deg,#eaf5ea,#fff3da);border:1px solid #d5e5d5;display:grid;place-items:center;font-size:31px;color:var(--green);box-shadow:var(--sh)}
.brand-t{font-size:23px;letter-spacing:4px;font-weight:800;color:var(--green)}.brand-s{font-size:11.5px;color:#4c5a52}
.visual{border-radius:28px;background:linear-gradient(135deg,#f9ec d3,#e9f4ea);background:linear-gradient(135deg,#f9ecd3,#e9f4ea);padding:24px;box-shadow:var(--sh);position:relative;overflow:hidden;border:1px solid #fff}
.visual:before{content:"";position:absolute;right:-50px;bottom:-60px;width:190px;height:190px;border-radius:50%;background:#4d82661f;pointer-events:none}
.tagline{font-size:27px;line-height:1.15;font-weight:800;color:#1d3d31}
.illus{height:150px;border-radius:24px;margin:16px 0;background:linear-gradient(135deg,#ffe4c9,#dcEBdd);display:grid;place-items:center;font-size:78px;border:1px solid #ffffff90}
.quote{font-family:Fraunces,Georgia,serif;font-style:italic;color:#5e6b62;text-align:center;font-size:14px}
.cover{background:#fff;border:1px solid #eee3cd;border-radius:26px;padding:22px;box-shadow:var(--sh);text-align:center;margin-bottom:12px}
.cover-logo{font-size:42px;color:var(--green)}
.mini-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:16px 0}.mini-grid div{background:#eef6ee;border-radius:14px;padding:10px 4px;font-size:10.5px;color:var(--green);font-weight:800}
.nav{position:sticky;bottom:12px;margin:14px 12px 0;background:rgba(255,255,255,.95);backdrop-filter:blur(12px);border:1px solid var(--line);border-radius:24px;display:grid;grid-template-columns:repeat(5,1fr);padding:8px;gap:4px;box-shadow:var(--sh)}
.nav a{text-align:center;font-size:10.5px;color:#7a837e;text-decoration:none;border-radius:16px;padding:8px 2px;font-weight:800;transition:.15s}
.nav a.on{background:#e4f3e4;color:var(--green)}
.nav a span{font-size:20px;display:block}
.empty{text-align:center;padding:30px 14px;color:var(--muted)}.empty .big{font-size:42px}
.skel{border-radius:12px;background:linear-gradient(90deg,#ece4cf 25%,#f7f1de 50%,#ece4cf 75%);background-size:200% 100%;animation:sh 1.2s infinite;height:15px}
@keyframes sh{to{background-position:-200% 0}}
.art-body{font-size:12.5px;color:#4c5a52;line-height:1.55;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sheet{background:#fff;border:1px solid var(--line);border-radius:20px;padding:16px;margin-top:12px}
`;

function useHash(): string {
  const [h, setH] = useState(location.hash || "#/");
  useEffect(() => { const f = () => { setH(location.hash || "#/"); window.scrollTo(0, 0); }; addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []);
  return h;
}
function Nav({ r }: any) {
  const it = (p: string, e: string, l: string) => <a href={"#" + p} className={r === p || (p === "/" && (r === "" || r === "/")) ? "on" : ""}><span>{e}</span>{l}</a>;
  return <nav className="nav">{it("/", "🏠", "Beranda")}{it("/appointments", "📅", "Jadwal")}{it("/screening", "🧩", "Perkemb.")}{it("/education", "📚", "Edukasi")}{it("/account", "👤", "Profil")}</nav>;
}

export default function App() {
  const h = useHash();
  const [me, setMe] = useState<any>(null);
  useEffect(() => { const s = document.createElement("style"); s.textContent = css; document.head.append(s); api.get("/api/me").then((r) => setMe((cur: any) => cur || (r.user?.role === "parent" ? r.user : null))).catch(() => {}); }, []);
  const R = h.replace("#", "");
  if (R.startsWith("/welcome") || (!me && !R.startsWith("/education"))) return <Welcome onOk={setMe} />;
  return <div className="phone"><div className="pad">
    {R === "/" || R === "" ? <Home me={me} /> : R.startsWith("/child") ? <Child route={R} /> : R.startsWith("/appointments") ? <Appts /> : R.startsWith("/growth") ? <Growth route={R} /> : R.startsWith("/screening") ? <Screen route={R} /> : R.startsWith("/therapy") ? <Therapy route={R} /> : R.startsWith("/sessions") ? <Session route={R} /> : R.startsWith("/education") ? <Edu /> : R.startsWith("/reports") ? <Rep /> : R.startsWith("/stimulation") ? <Stim /> : R.startsWith("/account") ? <Acct me={me} setMe={setMe} /> : <Home me={me} />}
    <Nav r={R} /></div></div>;
}

function Welcome({ onOk }: any) {
  const [e, setE] = useState("alya@example.com"), [p, setP] = useState("prototype"), [n, setN] = useState("Bunda Alya"), [m, setM] = useState(""), [mode, setMode] = useState<"in" | "up">("in");
  const go = (url: string, body: any) => api.post(url, body).then((r) => {
    if (r.user && r.user.role !== "parent") { setM("Akun ini terdaftar sebagai staff (" + r.user.role + ") — portal ini khusus orang tua. Keluar dari EMR dulu atau pakai browser lain."); return; }
    onOk(r.user || { role: "parent", name: n });
  }).catch(() => setM("Gagal — periksa email/password atau koneksi API."));
  return <div className="phone"><div className="hero-login">
    <div className="brand"><div className="logo">♡</div><div><div className="brand-t serif">ASAKITA</div><div className="brand-s">Child Health Center<br />by dr. Imelda Hady, Sp.A</div></div></div>
    <div className="visual"><div className="tagline serif">Tumbuh bersama,<br />menuju generasi hebat.</div>
      <p style={{ color: "#5f6d64", fontSize: 13, lineHeight: 1.55 }}>Pantau tumbuh kembang, jadwal terapi, edukasi ASI/MPASI & stimulasi harian — khusus data anak Anda.</p>
      <div className="illus">👩‍🍼</div>
      <div className="tabs" style={{ margin: "4px 0 8px" }}><button className={"tab" + (mode === "in" ? " on" : "")} onClick={() => setMode("in")}>Masuk</button><button className={"tab" + (mode === "up" ? " on" : "")} onClick={() => setMode("up")}>Daftar</button></div>
      <label className="lbl">Email</label><input className="inp" value={e} onChange={(x) => setE(x.target.value.trim())} placeholder="alya@example.com" />
      {mode === "up" && <><label className="lbl">Nama panggilan</label><input className="inp" value={n} onChange={(x) => setN(x.target.value)} placeholder="Bunda Alya" /></>}
      <label className="lbl">Password</label><input className="inp" type="password" value={p} onChange={(x) => setP(x.target.value)} onKeyDown={(x) => { if (x.key === "Enter") go(mode === "in" ? "/api/auth/login" : "/api/auth/register-parent", mode === "in" ? { email: e, password: p } : { email: e, password: p, name: n }); }} />
      {m && <p style={{ color: "#b42318", fontSize: 13 }}>{m}</p>}
      {mode === "in"
        ? <><button className="btn btn-p" style={{ marginTop: 12 }} onClick={() => go("/api/auth/login", { email: e, password: p })}>Masuk →</button>
          <button className="btn btn-o" style={{ marginTop: 8 }} onClick={() => go("/api/auth/google", { email: e, name: n })}>Masuk dengan Google</button></>
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
    <div className="hello"><div className="avatar">👩</div><div><h2 className="serif">Halo, {me?.name?.split(" ")[0] || "Bunda"} 👋</h2><p>{k ? `Ringkasan ${k.full_name?.split(" ")[0]} hari ini.` : "Memuat data anak…"}</p></div></div>
    {!kids ? <div className="card"><div className="skel" style={{ width: "60%" }} /><div className="skel" style={{ marginTop: 8 }} /></div>
      : !k ? <div className="card"><b>Belum ada data anak tertaut.</b><p style={{ fontSize: 13, color: "#5f6d64" }}>Akun baru perlu ditautkan ke data anak oleh front office — hubungi klinik dengan membawa No. RM.</p></div>
      : <div className="card child-card tap" onClick={() => (location.hash = "#/child/" + k.id)}><div className="child-photo">👶</div><div style={{ flex: 1 }}><h3 style={{ margin: 0, fontSize: 16 }}>{k.full_name}</h3><p style={{ margin: "4px 0 0", color: "#6f7d75", fontSize: 12 }}>{ageID(k.dob)} • Lihat profil anak</p><span className="pill green">Pasien aktif</span></div><span style={{ fontSize: 22, color: "#275844" }}>›</span></div>}
    <div className="grid-2">
      <div className="tile pink" onClick={() => (location.hash = "#/appointments")}><div className="emoji">📅</div><div><h4>Jadwal</h4><p>{next ? `${dID(next.starts_at)} • ${next.type}` : "Belum ada jadwal"}</p><small>{next ? tHM(next.starts_at) + " →" : "Buat janji →"}</small></div></div>
      <div className="tile green" onClick={() => k && (location.hash = "#/growth/" + k.id)}><div className="emoji">📈</div><div><h4>Pertumbuhan</h4><p>BB/TB/LK sesuai usia</p><small>Lihat grafik →</small></div></div>
      <div className="tile blue" onClick={() => (location.hash = "#/screening" + (k ? "/" + k.id : ""))}><div className="emoji">🧩</div><div><h4>Perkembangan</h4><p>5 domain skrining</p><small>Cek status →</small></div></div>
      <div className="tile yellow" onClick={() => (location.hash = "#/stimulation")}><div className="emoji">💡</div><div><h4>Stimulasi hari ini</h4><p>Motorik & bicara 10 mnt</p><small>Mulai →</small></div></div>
    </div>
    <div className="sec"><h3>Artikel pilihan</h3><span onClick={() => (location.hash = "#/education")}>Lihat semua →</span></div>
    {arts.map((a: any) => <div className="row" key={a.id} onClick={() => (location.hash = "#/education")}><div className="thumb">{a.category === "ASI" ? "🤱" : a.category === "MPASI" ? "🥣" : "🗣️"}</div><div><h4>{a.title}</h4><p>{a.author} • {a.category}</p><p className="art-body">{a.body_md}</p></div></div>)}
  </div>;
}

function Child({ route }: any) {
  const id = route.split("/")[2]; const [c, setC] = useState<any>(null); const [tab, setTab] = useState("Data Dasar");
  useEffect(() => { api.get("/api/portal/children/" + id).then(setC).catch(() => {}); }, [id]);
  if (!c) return <div className="card"><div className="skel" /><div className="skel" style={{ marginTop: 8 }} /></div>;
  return <div>
    <div className="back-title"><button className="back" onClick={() => (location.hash = "#/")}>‹</button><div><h1>Profil anak</h1><p>Data dasar & kontak — read-only</p></div></div>
    <div className="card child-card"><div className="child-photo">👶</div><div style={{ flex: 1 }}><h3 style={{ margin: 0 }}>{c.full_name}</h3><p style={{ color: "#6f7d75", fontSize: 12, margin: "4px 0" }}>{c.gender} • {ageID(c.dob)}</p><span className="pill green">Pasien aktif</span></div></div>
    <div className="tabs">{["Data Dasar", "Riwayat", "Kontak", "Dokumen"].map((t) => <button key={t} className={"tab" + (tab === t ? " on" : "")} onClick={() => setTab(t)}>{t}</button>)}</div>
    {tab === "Data Dasar" && <div className="info">{[["Nama lengkap", c.full_name], ["Panggilan", c.nickname || "—"], ["Tanggal lahir", dID(c.dob)], ["Gol. darah", c.blood_type || "—"], ["BB lahir", c.birth_weight_kg ? c.birth_weight_kg + " kg" : "—"], ["PB lahir", c.birth_length_cm ? c.birth_length_cm + " cm" : "—"]].map(([k, v]) => <div className="tr" key={k}><span className="lab">{k}</span><span className="val">{v}</span></div>)}</div>}
    {tab === "Riwayat" && <div className="card">Riwayat medis lengkap dikurasi dokter — minta salinan via front office bila perlu dibawa kontrol.</div>}
    {tab === "Kontak" && <div className="info"><div className="tr"><span className="lab">Alamat</span><span className="val">{c.address || "—"}</span></div><div className="tr"><span className="lab">Kontak darurat</span><span className="val">Front office Asakita</span></div></div>}
    {tab === "Dokumen" && <div className="card">Dokumen (akte/assessment) dikelola klinik. Unduh resume via <b onClick={() => (location.hash = "#/reports")} style={{ color: "#275844", textDecoration: "underline" }}>Laporan →</b></div>}
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

function Growth({ route }: any) {
  const id = route.split("/")[2]; const [tab, setTab] = useState<"weight" | "height" | "head">("weight");
  const [d, setD] = useState<any[]>([]); const [kid, setKid] = useState("");
  useEffect(() => {
    const cid = id;
    if (!cid) api.get("/api/portal/children").then((r) => { const k = r.data[0]; if (k) { setKid(k.id); api.get(`/api/portal/growth/${k.id}`).then((x) => setD(x.data)); } });
    else api.get(`/api/portal/growth/${cid}`).then((r) => setD(r.data)).catch(() => {});
  }, [id]);
  const key = tab === "weight" ? "weight_kg" : tab === "height" ? "height_cm" : "head_cm";
  const unit = tab === "weight" ? "kg" : "cm";
  const label = tab === "weight" ? "Berat badan" : tab === "height" ? "Tinggi badan" : "Lingkar kepala";
  const vals = d.map((x) => Number(x[key])).filter(Boolean);
  const last = vals[vals.length - 1];
  const W = 340, H = 190, P = 28;
  const path = vals.length > 1 ? vals.map((v, i) => { const x = P + (i / (vals.length - 1)) * (W - P * 2); const mn = Math.min(...vals), mx = Math.max(...vals); const y = H - P - ((v - mn) / Math.max(0.01, mx - mn)) * (H - P * 2); return `${i ? "L" : "M"}${x.toFixed(0)} ${y.toFixed(0)}`; }).join(" ") : "";
  const dot = vals.length > 1 ? (() => { const mn = Math.min(...vals), mx = Math.max(...vals); const v = vals[vals.length - 1]; return { x: W - P, y: H - P - ((v - mn) / Math.max(0.01, mx - mn)) * (H - P * 2) }; })() : null;
  return <div>
    <div className="back-title"><button className="back" onClick={() => (location.hash = "#/")}>‹</button><div><h1>Grafik pertumbuhan</h1><p>BB / TB / LK — kurva dari data klinik</p></div></div>
    <div className="tabs">{[["weight", "Berat badan"], ["height", "Tinggi badan"], ["head", "Lingkar kepala"]].map(([k, l]) => <button key={k} className={"tab" + (tab === k ? " on" : "")} onClick={() => setTab(k as any)}>{l}</button>)}</div>
    <div className="card"><div className="chart"><div style={{ fontSize: 12, color: "#237142" }}>{label} saat ini</div><b className="big">{last ? `${last} ${unit}` : "—"}</b><div style={{ fontSize: 12, color: "#237142" }}>{last ? "✓ sesuai pemantauan" : "Belum ada data"}</div></div>
      {path ? <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`}><line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#d8d0ba" /><line x1={P} y1={P} x2={P} y2={H - P} stroke="#d8d0ba" /><path d={path} fill="none" stroke="#275844" strokeWidth={3.5} strokeLinecap="round" />{dot && <><circle cx={dot.x} cy={dot.y} r={8} fill="#275844" stroke="#fff" strokeWidth={3} /><text x={dot.x - 52} y={dot.y - 12} fontSize={12} fontWeight={800} fill="#275844">{last} {unit}</text></>}</svg>
        : <div className="empty"><div className="big">📈</div>Belum ada pengukuran {label.toLowerCase()}.</div>}
      {d.slice(-4).reverse().map((x: any, i: number) => <div key={i} style={{ fontSize: 12.5, padding: "7px 0", borderBottom: "1px solid #f0e8d4", display: "flex", justifyContent: "space-between" }}><span>{dID(x.date)}</span><b>{x[key] ?? "—"} {x[key] ? unit : ""}</b></div>)}
      <div className="note" style={{ marginTop: 10 }}>Standar final mengikuti acuan klinis dokter. Bawa buku KIA saat kontrol.</div></div>
    <button className="btn btn-soft" onClick={() => (location.hash = "#/reports")}>Lihat laporan pertumbuhan →</button>
  </div>;
}

function Screen({ route }: any) {
  const id = route.split("/")[2] || "";
  const [d, setD] = useState<any[]>([]); const [kid, setKid] = useState("");
  useEffect(() => {
    if (!id) api.get("/api/portal/children").then((r) => { const k = r.data[0]; if (k) { setKid(k.id); api.get(`/api/portal/screening/${k.id}`).then((x) => setD(x.data)); } });
    else api.get(`/api/portal/screening/${id}`).then((r) => setD(r.data)).catch(() => {});
  }, [id]);
  const DOMS: [string, string, string, string][] = [["motorik_kasar", "Motorik kasar", "🏃", "Berjalan, berlari, melompat"], ["motorik_halus", "Motorik halus", "✍️", "Menggenggam, menyusun, menjumput"], ["bahasa", "Bahasa", "💬", "Memahami & ekspresi kata"], ["sosial_emosional", "Sosial & emosional", "🤝", "Interaksi, bermain, mandiri"], ["kognitif", "Kognitif", "🧠", "Fokus & pemecahan masalah"]];
  return <div>
    <div className="back-title"><button className="back" onClick={() => (location.hash = "#/")}>‹</button><div><h1>Skrining perkembangan</h1><p>Checklist 5 domain versi kurasi ortu</p></div></div>
    <div className="card" style={{ background: "#fff4de" }}><b>Perkembangan {ageID("") || "24–36 bln"} <span className="pill orange">Contoh terkurasi</span></b><p style={{ margin: "6px 0 0", color: "#5f6d64", fontSize: 12.5 }}>Detail klinis mentah hanya di EMR internal — ini ringkasan aman untuk ortu.</p></div>
    {DOMS.map(([k, l, e, s]) => { const f = d.find((x) => x.domain === k); const ok = (f?.result || "").toLowerCase().includes("sesuai") || (f?.result || "").toLowerCase().includes("capai"); return <div className="scr" key={k}><div className="ico">{e}</div><div style={{ flex: 1 }}><h4 style={{ margin: 0, fontSize: 14 }}>{l}</h4><p style={{ fontSize: 12, color: "#6f7d75", margin: "3px 0 0" }}>{f?.note || s}</p></div><span className={"pill " + (ok ? "green" : "orange")}>{f?.result || "Dalam proses"}</span></div>; })}
    <button className="btn btn-p" onClick={() => (location.hash = "#/therapy/" + (id || kid))}>Lihat catatan terapi →</button>
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
    <div className="sec"><h3>Rekomendasi di rumah 🏠</h3></div>
    <div className="row"><div className="thumb">🗣️</div><div><h4>Latihan bicara 10 mnt/hari</h4><p>Sebut nama benda sehari-hari</p></div></div>
    <div className="row"><div className="thumb">🧩</div><div><h4>Puzzle / susun balok</h4><p>Motorik halus + fokus</p></div></div>
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
      : shown.map((a: any) => <div className="row" key={a.id} onClick={() => setOpen(open === a.id ? "" : a.id)}><div className="thumb">{emo(a.category)}</div><div style={{ flex: 1 }}><h4>{a.title}</h4><p>{a.author} • <span className="pill green">{a.category}</span></p>{open === a.id ? <p style={{ fontSize: 13, color: "#1d2b25", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{a.body_md}</p> : <p className="art-body">{a.body_md}</p>}</div><span style={{ color: "#275844", fontWeight: 800 }}>{open === a.id ? "▾" : "▸"}</span></div>)}
  </div>;
}

function Rep() {
  const [list, setList] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  useEffect(() => { api.get("/api/portal/reports").then((r) => setList(r.data)).catch(() => {}); }, []);
  const dl = async (id: string) => {
    const r = await fetch(API + `/api/portal/reports/${id}/pdf`, { credentials: "include" });
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
    <div className="back-title"><button className="back" onClick={() => (location.hash = "#/")}>‹</button><div><h1>Laporan perkembangan</h1><p>Resume kurasi dokter untuk ortu</p></div></div>
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
  const rows = [["👤", "Data diri"], ["👶", "Anak saya", "#/"], ["🔔", "Notifikasi"], ["🔐", "Keamanan akun"], ["⚙️", "Pengaturan"], ["❔", "Bantuan"], ["ℹ️", "Tentang Asakita"]];
  return <div>
    <div className="back-title"><button className="back" onClick={() => (location.hash = "#/")}>‹</button><div><h1>Akun orang tua</h1><p>Profil & pengaturan</p></div></div>
    <div className="card child-card"><div className="avatar">👩</div><div><h3 style={{ margin: 0 }}>{me?.name || "Orang tua"}</h3><p style={{ color: "#6f7d75", fontSize: 12, margin: "4px 0 0" }}>{me?.email || ""}</p></div></div>
    <div className="info">{rows.map(([e, l, h]) => <div className="tr" key={l} style={{ cursor: h ? "pointer" : "default" }} onClick={() => h && (location.hash = h)}><span>{e} {l}</span><span>›</span></div>)}</div>
    <button className="btn btn-d" onClick={() => fetch(API + "/api/auth/logout", { method: "POST", credentials: "include" }).then(() => { setMe(null); location.hash = "#/welcome"; })}>Keluar</button>
    <p className="quote">Asakita v0.1 • data anak hanya untuk akun tertaut</p>
  </div>;
}
