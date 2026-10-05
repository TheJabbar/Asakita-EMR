// ponytail: node:test stdlib security gate — any failure blocks deploy
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "file::memory:";
const { default: app } = await import("../../src/index.js");
await import("../../src/seed.js");

async function login(email, pw = "prototype", extra = {}) {
  const r = await app.request("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", ...extra }, body: JSON.stringify({ email, password: pw }) });
  return { status: r.status, cookie: r.headers.get("set-cookie")?.split(";")[0] ?? "" };
}
const H = (c) => ({ Cookie: c, "Content-Type": "application/json" });

describe("security gate", () => {
  it("1 auth: wrong pw 401, anon 401, tampered jwt 401", async () => {
    assert.equal((await login("dokter@asakita.demo", "wrong")).status, 401);
    assert.equal((await app.request("/api/patients")).status, 401);
    assert.equal((await app.request("/api/patients", { headers: { Cookie: "asakita=aaa.bbb.ccc" } })).status, 401);
  });
  it("2 RBAC matrix", async () => {
    const ter = await login("terapis@asakita.demo"), adm = await login("admin@asakita.demo"),
      par = await login("alya@example.com"), dok = await login("dokter@asakita.demo");
    assert.equal((await app.request("/api/users", { headers: H(ter.cookie) })).status, 403);
    const kids = await (await app.request("/api/patients", { headers: H(dok.cookie) })).json();
    const v = await (await app.request("/api/visits", { method: "POST", headers: H(dok.cookie), body: JSON.stringify({ child_id: kids.data[0].id }) })).json();
    assert.equal((await app.request(`/api/visits/${v.id}/soap`, { method: "PUT", headers: H(adm.cookie), body: JSON.stringify({ subjective: "x" }) })).status, 403);
    assert.equal((await app.request("/api/patients", { headers: H(par.cookie) })).status, 403);
    assert.equal((await app.request("/api/portal/children", { headers: H(dok.cookie) })).status, 403);
  });
  it("3 IDOR: parent A cannot read parent B child", async () => {
    const a = await login("alya@example.com"), b = await login("budi@example.com");
    const kidsB = await (await app.request("/api/portal/children", { headers: H(b.cookie) })).json();
    assert.ok(kidsB.data.length > 0);
    assert.equal((await app.request(`/api/portal/children/${kidsB.data[0].id}`, { headers: H(a.cookie) })).status, 404);
  });
  it("4 curated portal: no subjective/objective keys", async () => {
    const p = await login("alya@example.com");
    for (const u of ["/api/portal/children", "/api/portal/appointments", "/api/portal/reports"]) {
      const txt = await (await app.request(u, { headers: H(p.cookie) })).text();
      assert.ok(!/"subjective"|"objective"/.test(txt), u);
    }
  });
  it("5 injection: login bypass fails", async () => {
    assert.equal((await login("' OR '1'='1", "x")).status, 401);
  });
  it("6 upload abuse blocked (.exe rejected)", async () => {
    const dok = await login("dokter@asakita.demo");
    const kids = await (await app.request("/api/patients", { headers: H(dok.cookie) })).json();
    const fd = new FormData();
    fd.append("file", new Blob(["x"], { type: "application/x-msdownload" }), "../../evil.exe");
    const r = await app.request(`/api/patients/${kids.data[0].id}/documents`, { method: "POST", headers: { Cookie: dok.cookie }, body: fd });
    assert.ok([400, 404].includes(r.status));
  });
  it("7 rate-limit: 21st rapid login → 429", async () => {
    const ip = { "Content-Type": "application/json", "x-forwarded-for": "rate-test-" + Date.now() };
    let last = 0;
    for (let i = 0; i < 21; i++) {
      const r = await app.request("/api/auth/login", { method: "POST", headers: ip, body: JSON.stringify({ email: "dokter@asakita.demo", password: "wrong" }) });
      last = r.status;
    }
    assert.equal(last, 429);
  });
  it("8 headers: CSP + DENY + non-* CORS", async () => {
    const r = await app.request("/api/healthz");
    assert.ok(r.headers.get("content-security-policy"));
    assert.equal(r.headers.get("x-frame-options"), "DENY");
    assert.notEqual(r.headers.get("access-control-allow-origin"), "*");
  });
  it("9 preflight: PUT/PATCH allowed (browser SOAP save needs it)", async () => {
    const r = await app.request("/api/visits/x/soap", { method: "OPTIONS", headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": "PUT" } });
    assert.ok((r.headers.get("access-control-allow-methods") || "").includes("PUT"));
  });
});
