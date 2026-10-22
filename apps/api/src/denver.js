// ponytail: Denver II style checklist — the catalog lives in the database (denver_items) so
// clinicians can add / edit / remove items; this module loads it, scores it and serves the API.
import { Hono } from "hono";
import { row, rows, run, uid } from "./db.js";
import { err, need, STAFF, needOwnChild, audit } from "./guard.js";
import { DENVER_DOMAINS, DENVER_BANDS, DENVER_STATUSES, STATUS_LABEL, bandForAge } from "./denver-catalog.js";

export { DENVER_DOMAINS, DENVER_STATUSES, STATUS_LABEL, bandForAge };

// ponytail: bands = static structure (age ranges) + items from the database
export function loadBands() {
  const items = rows("SELECT id,band_key,domain,text,sort FROM denver_items ORDER BY sort, rowid");
  if (!items.length) return DENVER_BANDS; // table not seeded yet → fall back to the bundled catalog
  return DENVER_BANDS.map((b) => ({
    ...b,
    items: items.filter((i) => i.band_key === b.key).map((i) => ({ id: i.id, key: i.id, domain: i.domain, text: i.text })),
  }));
}

// ponytail: simplified Denver-style scoring — per-domain progress in the current age band,
// plus delayed (failed item in a lower band) and advanced (passed item in a higher band) flags.
export function scoreDenver(bands, results, ageMonths) {
  const current = bandForAge(ageMonths);
  const statusOf = (key) => results[key]?.status || null;
  const perDomain = {};
  const delayed = [];
  const advanced = [];
  for (const d of DENVER_DOMAINS) perDomain[d.key] = { key: d.key, label: d.label, passed: 0, total: 0, checked: 0, notYet: 0 };
  for (const band of bands) {
    const isCurrent = current && band.key === current.key;
    const isLower = current && band.maxMonths <= current.minMonths;
    const isHigher = current && band.minMonths > current.maxMonths;
    for (const item of band.items) {
      const st = statusOf(item.key);
      const bucket = perDomain[item.domain];
      if (!bucket) continue;
      if (isCurrent) {
        bucket.total++;
        if (st) bucket.checked++;
        if (st === "pass") bucket.passed++;
        if (st === "not_yet") bucket.notYet++;
      }
      if (st === "not_yet" && isLower) delayed.push({ ...item, band: band.label });
      if (st === "pass" && isHigher) advanced.push({ ...item, band: band.label });
    }
  }
  for (const k of Object.keys(perDomain)) {
    const b = perDomain[k];
    b.progress = b.total ? Math.round((b.passed / b.total) * 100) : 0;
  }
  const totals = Object.values(perDomain).reduce((a, b) => ({ total: a.total + b.total, passed: a.passed + b.passed, checked: a.checked + b.checked }), { total: 0, passed: 0, checked: 0 });
  return {
    band: current ? current.label : "-",
    domains: DENVER_DOMAINS.map((d) => perDomain[d.key]),
    progress: totals.total ? Math.round((totals.passed / totals.total) * 100) : 0,
    checked: totals.checked, total: totals.total,
    delayed: delayed.map((d) => d.key), advanced: advanced.map((d) => d.key),
  };
}

// --- routes ---
export const denverRouter = new Hono();

function childAgeMonths(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  return Math.round(((Date.now() - d.getTime()) / 864e5 / 30.4375) * 10) / 10;
}
function resultsOf(childId) {
  const out = {};
  for (const r of rows("SELECT item_key,status,note,checked_at FROM denver_results WHERE child_id=?", childId))
    out[r.item_key] = r;
  return out;
}

denverRouter.get("/api/denver", need(...STAFF), (c) => {
  const childId = c.req.query("childId");
  const child = row("SELECT id,dob,full_name FROM children WHERE id=?", childId || "-");
  if (!child) return err(c, "not_found", "pasien tidak ada", 404);
  const age = childAgeMonths(child.dob);
  const results = resultsOf(child.id);
  const bands = loadBands();
  const current = bandForAge(age);
  return c.json({
    childId: child.id, childName: child.full_name, ageMonths: age,
    bands: bands.map((b) => ({
      key: b.key, label: b.label, minMonths: b.minMonths, maxMonths: b.maxMonths,
      isCurrent: current ? b.key === current.key : false,
      items: b.items.map((it) => ({ ...it, status: results[it.key]?.status || null, note: results[it.key]?.note || "" })),
    })),
    score: scoreDenver(bands, results, age),
  });
});

// ponytail: manage the item lists — add / edit / remove (owner + dokter only, audited)
denverRouter.post("/api/denver/items", need("owner", "dokter"), async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const bands = loadBands();
  if (!bands.some((x) => x.key === b.band_key)) return err(c, "invalid", "rentang usia tidak dikenal", 400);
  if (!DENVER_DOMAINS.some((d) => d.key === b.domain)) return err(c, "invalid", "domain tidak dikenal", 400);
  if (!String(b.text || "").trim()) return err(c, "invalid", "teks item wajib", 400);
  const id = uid("di");
  const sort = row("SELECT COALESCE(MAX(sort),0)+1 s FROM denver_items WHERE band_key=?", b.band_key)?.s ?? 1;
  run("INSERT INTO denver_items(id,band_key,domain,text,sort,created_at) VALUES(?,?,?,?,?,?)",
    id, b.band_key, b.domain, String(b.text).trim().slice(0, 200), sort, new Date().toISOString());
  audit(c.get("user").id, "denver_item_create", "denver_item", id, { band: b.band_key, domain: b.domain });
  return c.json({ id }, 201);
});

denverRouter.put("/api/denver/items/:id", need("owner", "dokter"), async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!String(b.text || "").trim()) return err(c, "invalid", "teks item wajib", 400);
  const it = row("SELECT * FROM denver_items WHERE id=?", c.req.param("id"));
  if (!it) return err(c, "not_found", "item tidak ada", 404);
  run("UPDATE denver_items SET text=? WHERE id=?", String(b.text).trim().slice(0, 200), it.id);
  audit(c.get("user").id, "denver_item_update", "denver_item", it.id, { band: it.band_key });
  return c.json({ ok: true });
});

denverRouter.delete("/api/denver/items/:id", need("owner", "dokter"), (c) => {
  const it = row("SELECT * FROM denver_items WHERE id=?", c.req.param("id"));
  if (!it) return err(c, "not_found", "item tidak ada", 404);
  run("DELETE FROM denver_results WHERE item_key=?", it.id); // checks of a removed item go with it
  run("DELETE FROM denver_items WHERE id=?", it.id);
  audit(c.get("user").id, "denver_item_delete", "denver_item", it.id, { band: it.band_key });
  return c.json({ ok: true });
});

denverRouter.put("/api/denver", need("owner", "dokter", "terapis"), async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!b.child_id || !b.item_key) return err(c, "invalid", "child_id + item_key wajib", 400);
  if (!DENVER_STATUSES.includes(b.status)) return err(c, "invalid", "status tidak dikenal", 400);
  const known = loadBands().some((band) => band.items.some((it) => it.key === b.item_key));
  if (!known) return err(c, "not_found", "item tidak dikenal", 404);
  run("INSERT OR REPLACE INTO denver_results(child_id,item_key,status,note,checked_at,checked_by) VALUES(?,?,?,?,?,?)",
    b.child_id, b.item_key, b.status, b.note || "", new Date().toISOString(), c.get("user").id);
  audit(c.get("user").id, "denver_check", "child", b.child_id, { item: b.item_key, status: b.status });
  return c.json({ ok: true });
});

// ponytail: portal sees the score and the checklist of the current age band — never clinician notes
denverRouter.get("/api/portal/denver/:id", need("parent"), needOwnChild, (c) => {
  const child = row("SELECT id,dob FROM children WHERE id=?", c.req.param("id"));
  if (!child) return err(c, "not_found", "not found", 404);
  const age = childAgeMonths(child.dob);
  const results = resultsOf(child.id);
  const bands = loadBands();
  const score = scoreDenver(bands, results, age);
  const band = bands.find((b) => b.label === score.band);
  const itemsByDomain = {};
  for (const d of DENVER_DOMAINS) itemsByDomain[d.key] = [];
  for (const it of band?.items || []) {
    itemsByDomain[it.domain]?.push({ text: it.text, status: results[it.key]?.status || null });
  }
  return c.json({
    band: score.band, progress: score.progress, checked: score.checked, total: score.total,
    domains: score.domains.map((d) => ({
      key: d.key, label: d.label, passed: d.passed, total: d.total, progress: d.progress,
      items: itemsByDomain[d.key] || [],
    })),
    flags: { delayed: score.delayed.length, advanced: score.advanced.length },
  });
});
