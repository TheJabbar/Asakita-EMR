// ponytail: node:test stdlib — portal orang tua loop (curated, own-children only)
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "file::memory:";
const { default: app } = await import("../../src/index.js");
await import("../../src/seed.js");

async function login(email, pw = "prototype") {
  const r = await app.request("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: pw }) });
  assert.equal(r.status, 200, `login ${email}`);
  return r.headers.get("set-cookie")?.split(";")[0] ?? "";
}
const H = (c) => ({ Cookie: c, "Content-Type": "application/json" });
let alya, budi, staff, kidA, kidB, sessId, repId;

describe("unit: portal orang tua", () => {
  before(async () => {
    alya = await login("alya@example.com");
    budi = await login("budi@example.com");
    staff = await login("dokter@asakita.demo");
    kidA = (await (await app.request("/api/portal/children", { headers: H(alya) })).json()).data[0].id;
    kidB = (await (await app.request("/api/portal/children", { headers: H(budi) })).json()).data[0].id;
  });
  it("children: own listed, other 404", async () => {
    assert.ok(kidA && kidB && kidA !== kidB);
    assert.equal((await app.request(`/api/portal/children/${kidA}`, { headers: H(alya) })).status, 200);
    assert.equal((await app.request(`/api/portal/children/${kidB}`, { headers: H(alya) })).status, 404);
  });
  it("appointments: request own ok, foreign 404; upcoming/history split", async () => {
    const t = new Date(Date.now() + 864e5).toISOString().slice(0, 16);
    const ok = await app.request("/api/portal/appointment-requests", { method: "POST", headers: H(alya), body: JSON.stringify({ child_id: kidA, type: "Konsultasi Dokter", starts_at: t }) });
    assert.equal(ok.status, 201);
    const bad = await app.request("/api/portal/appointment-requests", { method: "POST", headers: H(alya), body: JSON.stringify({ child_id: kidB, starts_at: t }) });
    assert.equal(bad.status, 404);
    const up = await (await app.request("/api/portal/appointments?scope=upcoming", { headers: H(alya) })).json();
    assert.ok(up.data.some((a) => a.child_id === kidA));
    assert.ok(!up.data.some((a) => a.child_id === kidB));
    const hist = await (await app.request("/api/portal/appointments?scope=history", { headers: H(alya) })).json();
    assert.ok(!hist.data.some((a) => a.child_id === kidB));
  });
  it("growth + screening: insert via staff, portal reads curated latest-per-domain", async () => {
    assert.equal((await app.request("/api/growth", { method: "POST", headers: H(staff), body: JSON.stringify({ child_id: kidA, weight_kg: 13.5, height_cm: 91 }) })).status, 201);
    const g = await (await app.request(`/api/portal/growth/${kidA}`, { headers: H(alya) })).json();
    assert.ok(g.data.at(-1).weight_kg === 13.5);
    assert.equal((await app.request(`/api/portal/growth/${kidB}`, { headers: H(alya) })).status, 404);
    for (const d of ["bahasa", "bahasa", "motorik_kasar"])
      await app.request("/api/screenings", { method: "POST", headers: H(staff), body: JSON.stringify({ child_id: kidA, domain: d, result: "Sesuai" }) });
    const s = await (await app.request(`/api/portal/screening/${kidA}`, { headers: H(alya) })).json();
    assert.equal(s.data.filter((x) => x.domain === "bahasa").length, 1); // latest only
  });
  it("therapy: session create raises progress %; sessions list+detail curated", async () => {
    const typeId = (await (await app.request("/api/therapy-types", { headers: H(staff) })).json()).data[0].id;
    const before = (await (await app.request(`/api/portal/therapy/${kidA}`, { headers: H(alya) })).json()).data[0].progress;
    const c = await app.request("/api/therapy-sessions", { method: "POST", headers: H(staff), body: JSON.stringify({ child_id: kidA, type_id: typeId, target: "kontak mata", response: "baik", home_recommendation: "latihan 10 mnt" }) });
    assert.equal(c.status, 201);
    sessId = (await c.json()).id;
    const after = (await (await app.request(`/api/portal/therapy/${kidA}`, { headers: H(alya) })).json()).data[0];
    assert.equal(after.progress, Math.min(100, Math.round(((after.sessions) / 12) * 100)));
    assert.ok(after.progress >= before);
    const list = await (await app.request(`/api/portal/sessions?childId=${kidA}`, { headers: H(alya) })).json();
    assert.ok(list.data.some((x) => x.id === sessId));
    assert.equal((await app.request(`/api/portal/sessions?childId=${kidB}`, { headers: H(alya) })).status, 404);
    const det = await app.request(`/api/portal/sessions/${sessId}`, { headers: H(alya) });
    assert.equal(det.status, 200);
    const txt = await det.text();
    assert.ok(!/"subjective"|"objective"/.test(txt));
    assert.ok(/home_recommendation/.test(txt));
  });
  it("reports: staff creates, portal lists+PDF+email; other parent blocked", async () => {
    const rp = await app.request("/api/reports", { method: "POST", headers: H(staff), body: JSON.stringify({ child_id: kidA, summary: "portal-test" }) });
    assert.equal(rp.status, 201);
    repId = (await rp.json()).id;
    assert.ok((await (await app.request("/api/portal/reports", { headers: H(alya) })).json()).data.some((r) => r.id === repId));
    assert.ok(!(await (await app.request("/api/portal/reports", { headers: H(budi) })).json()).data.some((r) => r.id === repId));
    const pdf = await app.request(`/api/portal/reports/${repId}/pdf`, { headers: H(alya) });
    assert.equal(pdf.status, 200);
    assert.equal(String.fromCharCode(...new Uint8Array(await pdf.arrayBuffer()).slice(0, 4)), "%PDF");
    assert.equal((await app.request(`/api/portal/reports/${repId}/pdf`, { headers: H(budi) })).status, 404);
    assert.equal((await app.request(`/api/portal/reports/${repId}/email`, { method: "POST", headers: H(alya), body: JSON.stringify({ to: "alya@example.com" }) })).status, 200);
    assert.equal((await app.request(`/api/portal/reports/${repId}/email`, { method: "POST", headers: H(budi), body: JSON.stringify({ to: "x@y.z" }) })).status, 404);
  });
  it("stimulation ages + articles filter/slug", async () => {
    for (const a of ["0-6", "6-12", "1-2", "2-3"])
      assert.ok((await (await app.request(`/api/portal/stimulation?age=${a}`, { headers: H(alya) })).json()).data.length > 0, a);
    const mpasi = await (await app.request("/api/articles?category=MPASI")).json();
    assert.ok(mpasi.data.length > 0 && mpasi.data.every((x) => x.category === "MPASI"));
    assert.equal((await app.request("/api/articles/mpasi-pertama")).status, 200);
  });
});
describe("unit: EMR + portal sessions coexist", () => {
  const EMR = "http://localhost:5173", PORTAL = "http://localhost:5174";
  const pick = (r, name) => (r.headers.getSetCookie?.() || []).find((s) => s.startsWith(name + "="))?.split(";")[0] ?? "";
  it("separate cookies per app; /api/me follows Origin; portal logout keeps EMR", async () => {
    const s = await app.request("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", origin: EMR }, body: JSON.stringify({ email: "dokter@asakita.demo", password: "prototype" }) });
    const p = await app.request("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", origin: PORTAL }, body: JSON.stringify({ email: "alya@example.com", password: "prototype" }) });
    const staff = pick(s, "asakita"), portal = pick(p, "asakita_portal");
    assert.ok(staff && portal, "both cookies set");
    const both = `${staff}; ${portal.split("=")[0]}=${portal.split("=").slice(1).join("=")}`;
    assert.equal((await (await app.request("/api/me", { headers: { Cookie: both, origin: EMR } })).json()).user.role, "dokter");
    assert.equal((await (await app.request("/api/me", { headers: { Cookie: both, origin: PORTAL } })).json()).user.role, "parent");
    assert.equal((await app.request("/api/dashboard/summary", { headers: { Cookie: both, origin: EMR } })).status, 200);
    await app.request("/api/auth/logout", { method: "POST", headers: { Cookie: portal, origin: PORTAL } });
    assert.equal((await (await app.request("/api/me", { headers: { Cookie: staff, origin: EMR } })).json()).user.role, "dokter");
  });
  it("COOKIE_CROSS_SITE=1 emits SameSite=None; Secure (https tunnels)", async () => {
    process.env.COOKIE_CROSS_SITE = "1";
    const r = await app.request("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", origin: EMR }, body: JSON.stringify({ email: "dokter@asakita.demo", password: "prototype" }) });
    assert.equal(r.status, 200);
    assert.ok((r.headers.getSetCookie?.() || []).some((s) => /SameSite=None/i.test(s) && /Secure/i.test(s)));
    delete process.env.COOKIE_CROSS_SITE;
  });
});
