// ponytail: node:test — new clinical features (growth curve, denver checklist, home program, billing)
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
const monthsAgo = (m) => new Date(Date.now() - m * 30.4375 * 864e5).toISOString().slice(0, 10);
let staff, parent, childId;

describe("unit: growth curve (WHO <5y, CDC >=5y)", () => {
  before(async () => {
    staff = await login("dokter@asakita.demo");
    const c = await app.request("/api/patients", { method: "POST", headers: H(staff), body: JSON.stringify({ full_name: "Kurva Kid", mr_number: "KK" + Date.now(), dob: monthsAgo(12), gender: "Laki-laki" }) });
    childId = (await c.json()).id;
    await app.request("/api/growth", { method: "POST", headers: H(staff), body: JSON.stringify({ child_id: childId, date: monthsAgo(0), weight_kg: 9.56, height_cm: 75 }) });
  });
  it("scores a 12-month-old boy at the WHO median (~z 0)", async () => {
    const g = await (await app.request(`/api/growth/curve?childId=${childId}&type=weight`, { headers: H(staff) })).json();
    assert.equal(g.standard, "WHO");
    assert.equal(g.points.length, 1);
    assert.ok(Math.abs(g.points[0].z) < 0.2, `z was ${g.points[0].z}`);
    assert.ok(g.points[0].percentile > 40 && g.points[0].percentile < 60);
    assert.ok(g.curves.length === 7 && g.curves[0].points.length > 0);
  });
  it("uses CDC for children over 5 years", async () => {
    const c = await app.request("/api/patients", { method: "POST", headers: H(staff), body: JSON.stringify({ full_name: "CDC Kid", mr_number: "CK" + Date.now(), dob: monthsAgo(96), gender: "Laki-laki" }) });
    const id = (await c.json()).id;
    await app.request("/api/growth", { method: "POST", headers: H(staff), body: JSON.stringify({ child_id: id, date: monthsAgo(0), weight_kg: 28 }) });
    const g = await (await app.request(`/api/growth/curve?childId=${id}&type=weight`, { headers: H(staff) })).json();
    assert.equal(g.standard, "CDC");
    assert.ok(g.points[0].z > -2.5 && g.points[0].z < 2.5);
  });
  it("rejects an unknown indicator", async () => {
    assert.equal((await app.request(`/api/growth/curve?childId=${childId}&type=bmi`, { headers: H(staff) })).status, 400);
  });
});

describe("unit: Denver checklist", () => {
  before(async () => { parent = await login("alya@example.com"); });
  it("lists bands + items and records a check", async () => {
    const d = await (await app.request(`/api/denver?childId=${childId}`, { headers: H(staff) })).json();
    assert.equal(d.bands.length, 8);
    const item = d.bands.find((b) => b.isCurrent).items[0];
    assert.ok(item && item.key);
    const up = await app.request("/api/denver", { method: "PUT", headers: H(staff), body: JSON.stringify({ child_id: childId, item_key: item.key, status: "pass" }) });
    assert.equal(up.status, 200);
    const d2 = await (await app.request(`/api/denver?childId=${childId}`, { headers: H(staff) })).json();
    assert.equal(d2.bands.find((b) => b.isCurrent).items.find((i) => i.key === item.key).status, "pass");
    assert.ok(d2.score.checked >= 1);
  });
  it("rejects unknown item + status", async () => {
    assert.equal((await app.request("/api/denver", { method: "PUT", headers: H(staff), body: JSON.stringify({ child_id: childId, item_key: "nope", status: "pass" }) })).status, 404);
    assert.equal((await app.request("/api/denver", { method: "PUT", headers: H(staff), body: JSON.stringify({ child_id: childId, item_key: "b1-motor-1", status: "maybe" }) })).status, 400);
  });
  it("portal sees only the score of its own child", async () => {
    const own = await app.request(`/api/portal/denver/${childId}`, { headers: H(parent) });
    assert.equal(own.status, 404); // parent is not linked to this child
    const kids = await (await app.request("/api/portal/children", { headers: H(parent) })).json();
    const mine = kids.data[0];
    const r = await app.request(`/api/portal/denver/${mine.id}`, { headers: H(parent) });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(body.domains.length === 4);
    assert.ok(!("items" in body)); // curated: no raw item list
  });
});

describe("unit: home program (resep) + tracking", () => {
  let itemId, ownChild;
  before(async () => {
    const typeId = (await (await app.request("/api/therapy-types", { headers: H(staff) })).json()).data[0].id;
    const r = await app.request("/api/therapy-sessions", { method: "POST", headers: H(staff), body: JSON.stringify({
      child_id: childId, type_id: typeId, target: "bicara",
      home_program: { title: "Latihan bicara", items: [{ label: "Sebut nama benda", target_per_day: 2 }] },
    }) });
    assert.equal(r.status, 201);
    // a program for the child that belongs to a parent account (Arslan → alya@example.com)
    const kids = await (await app.request("/api/patients", { headers: H(staff) })).json();
    ownChild = kids.data.find((k) => k.full_name === "Arslan Shah Malik");
    await app.request("/api/home-programs", { method: "POST", headers: H(staff), body: JSON.stringify({ child_id: ownChild.id, title: "Resep harian", items: [{ label: "Latihan bicara 10 menit" }] }) });
  });
  it("creates the program from the session", async () => {
    const p = await (await app.request(`/api/home-programs?childId=${childId}`, { headers: H(staff) })).json();
    assert.equal(p.data.length, 1);
    assert.equal(p.data[0].items.length, 1);
    assert.equal(p.data[0].items[0].doneToday, false);
  });
  it("deletes a session together with its program (owner/dokter only)", async () => {
    const typeId = (await (await app.request("/api/therapy-types", { headers: H(staff) })).json()).data[0].id;
    const s = await (await app.request("/api/therapy-sessions", { method: "POST", headers: H(staff), body: JSON.stringify({ child_id: childId, type_id: typeId, target: "hapus", home_program: { title: "Resep uji", items: [{ label: "item uji" }] } }) })).json();
    const programs = await (await app.request(`/api/home-programs?childId=${childId}`, { headers: H(staff) })).json();
    const prog = programs.data.find((p) => p.title === "Resep uji");
    assert.ok(prog, "program attached to the session");
    const del = await app.request(`/api/therapy-sessions/${s.id}`, { method: "DELETE", headers: H(staff) });
    assert.equal(del.status, 200);
    const after = await (await app.request(`/api/home-programs?childId=${childId}`, { headers: H(staff) })).json();
    assert.ok(!after.data.some((p) => p.title === "Resep uji"), "program removed with the session");
    assert.equal((await app.request(`/api/therapy-sessions/${s.id}`, { method: "DELETE", headers: H(staff) })).status, 404);
  });
  it("parent toggles an item for today (own child only)", async () => {
    const mine = await (await app.request(`/api/portal/home-programs?childId=${ownChild.id}`, { headers: H(parent) })).json();
    itemId = mine.data[0].items[0].id;
    const on = await app.request(`/api/portal/home-programs/items/${itemId}/toggle`, { method: "POST", headers: H(parent) });
    assert.equal(on.status, 200);
    assert.equal((await on.json()).doneToday, true);
    const off = await app.request(`/api/portal/home-programs/items/${itemId}/toggle`, { method: "POST", headers: H(parent) });
    assert.equal((await off.json()).doneToday, false);
  });
  it("another parent cannot touch the item", async () => {
    const parent2 = await login("budi@example.com");
    assert.equal((await app.request(`/api/portal/home-programs/items/${itemId}/toggle`, { method: "POST", headers: H(parent2) })).status, 404);
  });
});

describe("unit: billing + receipt", () => {
  let billId;
  before(async () => {
    const typeId = (await (await app.request("/api/therapy-types", { headers: H(staff) })).json()).data[0].id;
    await app.request("/api/therapy-sessions", { method: "POST", headers: H(staff), body: JSON.stringify({ child_id: childId, type_id: typeId, date: monthsAgo(1), target: "okupasi" }) });
    const gen = await app.request("/api/billing/generate", { method: "POST", headers: H(staff), body: JSON.stringify({ child_id: childId }) });
    assert.equal(gen.status, 201);
    assert.ok((await gen.json()).created >= 1);
  });
  it("lists items with totals", async () => {
    const b = await (await app.request(`/api/billing?childId=${childId}`, { headers: H(staff) })).json();
    assert.ok(b.data.length >= 1);
    assert.equal(b.totals.total, b.totals.paid + b.totals.unpaid);
    assert.ok(b.prices.length > 0);
    billId = b.data[0].id;
  });
  it("marks an item paid", async () => {
    const r = await app.request(`/api/billing/items/${billId}`, { method: "PATCH", headers: H(staff), body: JSON.stringify({ status: "paid" }) });
    assert.equal(r.status, 200);
    const b = await (await app.request(`/api/billing?childId=${childId}`, { headers: H(staff) })).json();
    assert.ok(b.totals.paid > 0);
  });
  it("prints a receipt PDF", async () => {
    const pdf = await app.request(`/api/billing/receipt?childId=${childId}`, { headers: H(staff) });
    assert.equal(pdf.status, 200);
    const buf = new Uint8Array(await pdf.arrayBuffer());
    assert.equal(String.fromCharCode(...buf.slice(0, 4)), "%PDF");
  });
  it("portal sees only its own child's bill", async () => {
    const parent2 = await login("budi@example.com");
    const r = await app.request(`/api/portal/billing?childId=${childId}`, { headers: H(parent2) });
    assert.equal(r.status, 404);
  });
});
