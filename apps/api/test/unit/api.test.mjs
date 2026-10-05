// ponytail: node:test stdlib — no bundler, node:sqlite works natively
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
let staff, childId, visitId, typeId;

describe("unit: EMR loop", () => {
  before(async () => { staff = await login("dokter@asakita.demo"); });
  it("patients CRUD", async () => {
    const c = await app.request("/api/patients", { method: "POST", headers: H(staff), body: JSON.stringify({ full_name: "Unit Kid", mr_number: "UT" + Date.now() }) });
    assert.equal(c.status, 201);
    childId = (await c.json()).id;
    assert.equal((await app.request(`/api/patients/${childId}`, { headers: H(staff) })).status, 200);
  });
  it("appointments: valid ok, skip-level rejected", async () => {
    const c = await app.request("/api/appointments", { method: "POST", headers: H(staff), body: JSON.stringify({ child_id: childId, starts_at: "2026-10-12T09:00", type: "Konsultasi" }) });
    assert.equal(c.status, 201);
    const id = (await c.json()).id;
    assert.equal((await app.request(`/api/appointments/${id}/status`, { method: "PATCH", headers: H(staff), body: JSON.stringify({ status: "done" }) })).status, 400);
    assert.equal((await app.request(`/api/appointments/${id}/status`, { method: "PATCH", headers: H(staff), body: JSON.stringify({ status: "confirmed" }) })).status, 200);
  });
  it("soap draft → finalize → locked", async () => {
    const v = await app.request("/api/visits", { method: "POST", headers: H(staff), body: JSON.stringify({ child_id: childId }) });
    visitId = (await v.json()).id;
    assert.equal((await app.request(`/api/visits/${visitId}/soap`, { method: "PUT", headers: H(staff), body: JSON.stringify({ subjective: "s", status: "draft" }) })).status, 200);
    assert.equal((await app.request(`/api/visits/${visitId}/soap`, { method: "PUT", headers: H(staff), body: JSON.stringify({ subjective: "s", status: "final" }) })).status, 200);
    assert.equal((await app.request(`/api/visits/${visitId}/soap`, { method: "PUT", headers: H(staff), body: JSON.stringify({ subjective: "x", status: "final" }) })).status, 409);
    const vl = await (await app.request(`/api/visits?childId=${childId}`, { headers: H(staff) })).json();
    assert.ok(vl.data.some((v) => v.id === visitId && v.has_soap === 1 && v.status === "final"));
    assert.equal((await app.request(`/api/visits/${visitId}`, { method: "DELETE", headers: H(staff) })).status, 409); // final locked
    const dv = await (await app.request("/api/visits", { method: "POST", headers: H(staff), body: JSON.stringify({ child_id: childId }) })).json();
    assert.equal((await app.request(`/api/visits/${dv.id}`, { method: "DELETE", headers: H(staff) })).status, 200);
    assert.equal((await app.request(`/api/visits/${dv.id}`, { headers: H(staff) })).status, 404);
  });
  it("therapy + growth + screening + report pdf + articles", async () => {
    typeId = (await (await app.request("/api/therapy-types", { headers: H(staff) })).json()).data[0].id;
    assert.equal((await app.request("/api/therapy-sessions", { method: "POST", headers: H(staff), body: JSON.stringify({ child_id: childId, type_id: typeId, target: "bicara", activities: ["a"] }) })).status, 201);
    assert.equal((await app.request("/api/growth", { method: "POST", headers: H(staff), body: JSON.stringify({ child_id: childId, weight_kg: 13, height_cm: 90 }) })).status, 201);
    assert.equal((await app.request("/api/milestones", { method: "PUT", headers: H(staff), body: JSON.stringify({ child_id: childId, key: "bicara", label: "Bicara", status: "in_progress" }) })).status, 200);
    assert.equal((await app.request("/api/therapy-programs", { method: "PUT", headers: H(staff), body: JSON.stringify({ child_id: childId, type_id: typeId, frequency: "2x/minggu", status: "aktif" }) })).status, 200);
    assert.ok((await (await app.request(`/api/therapy-programs?childId=${childId}`, { headers: H(staff) })).json()).data.some((p) => p.status === "aktif"));
    assert.equal((await app.request("/api/screenings", { method: "POST", headers: H(staff), body: JSON.stringify({ child_id: childId, domain: "bahasa", result: "Dalam Proses" }) })).status, 201);
    assert.equal((await app.request(`/api/reports/preview?childId=${childId}`, { headers: H(staff) })).status, 200);
    const rp = await app.request("/api/reports", { method: "POST", headers: H(staff), body: JSON.stringify({ child_id: childId, summary: "ok" }) });
    assert.equal(rp.status, 201);
    const pdf = await app.request(`/api/reports/${(await rp.json()).id}/pdf`, { headers: H(staff) });
    assert.equal(pdf.status, 200);
    const buf = new Uint8Array(await pdf.arrayBuffer());
    assert.equal(String.fromCharCode(...buf.slice(0, 4)), "%PDF");
    assert.ok((await (await app.request("/api/articles?category=MPASI")).json()).data.length > 0);
  });
});
