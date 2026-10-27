// ponytail: Denver II style checklist — the catalog lives in the database (denver_items) so
// clinicians can add / edit / remove items; this module loads it, scores it and serves the API.
import { Hono } from "hono";
import { row, rows, run, uid, tx } from "./db.js";
import { err, need, STAFF, needOwnChild, audit } from "./guard.js";
import { DENVER_DOMAINS, DENVER_BANDS, DENVER_STATUSES, STATUS_LABEL } from "./denver-catalog.js";

export { DENVER_DOMAINS, DENVER_STATUSES, STATUS_LABEL };

// ponytail: bands + items come from the database (age ranges and item texts are editable)
export function loadBands() {
  const bandRows = rows("SELECT id,label,min_months,max_months,sort FROM denver_bands ORDER BY sort, min_months, rowid");
  const itemRows = rows("SELECT id,band_key,domain,text,sort FROM denver_items ORDER BY sort, rowid");
  if (!bandRows.length) return DENVER_BANDS; // not migrated yet → bundled catalog
  return bandRows.map((b) => ({
    key: b.id, id: b.id, label: b.label, minMonths: b.min_months, maxMonths: b.max_months, sort: b.sort,
    items: itemRows.filter((i) => i.band_key === b.id).map((i) => ({ id: i.id, key: i.id, domain: i.domain, text: i.text })),
  }));
}

// the band that covers this age (fallback: the last one, like the bundled catalog)
export function bandForAge(bands, ageMonths) {
  if (ageMonths === null || ageMonths === undefined || !bands.length) return null;
  return bands.find((b) => ageMonths >= b.minMonths && ageMonths < b.maxMonths) || bands.at(-1);
}

// ponytail: simplified Denver-style scoring — per-domain progress in the current age band,
// plus delayed (failed item in a lower band) and advanced (passed item in a higher band) flags.
export function scoreDenver(bands, results, ageMonths) {
  const current = bandForAge(bands, ageMonths);
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

// ponytail: bands must not overlap — one checklist per age range (checked on save + listed in the catalog)
export function findOverlaps(bands, id, min, max) {
  return bands.filter((b) => b.id !== id && min < b.maxMonths && max > b.minMonths);
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
  const current = bandForAge(bands, age);
  return c.json({
    childId: child.id, childName: child.full_name, ageMonths: age,
    bands: bands.map((b) => ({
      key: b.key, id: b.id, label: b.label, minMonths: b.minMonths, maxMonths: b.maxMonths,
      isCurrent: current ? b.key === current.key : false,
      items: b.items.map((it) => ({ ...it, status: results[it.key]?.status || null, note: results[it.key]?.note || "" })),
    })),
    score: scoreDenver(bands, results, age),
  });
});

// ponytail: the catalogue on its own — used by the checklist admin page (no patient needed)
denverRouter.get("/api/denver/catalog", need(...STAFF), (c) => {
  const bands = loadBands();
  return c.json({
    bands: bands.map((b) => ({
      id: b.id, key: b.key, label: b.label, minMonths: b.minMonths, maxMonths: b.maxMonths,
      items: b.items.map((i) => ({ id: i.id, domain: i.domain, text: i.text })),
      overlaps: findOverlaps(bands, b.id, b.minMonths, b.maxMonths).map((o) => o.label),
    })),
    domains: DENVER_DOMAINS,
  });
});

// ponytail: manage the age bands (owner + dokter only, audited)
denverRouter.post("/api/denver/bands", need("owner", "dokter"), async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const label = String(b.label || "").trim().slice(0, 60);
  const min = Number(b.min_months), max = Number(b.max_months);
  if (!label) return err(c, "invalid", "nama rentang usia wajib", 400);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max <= min) return err(c, "invalid", "rentang usia tidak valid (min < max)", 400);
  const clashes = findOverlaps(loadBands(), null, min, max);
  if (clashes.length) return err(c, "overlap", `rentang usia tumpang tindih dengan "${clashes[0].label}"`, 409);
  const id = uid("db");
  const sort = row("SELECT COALESCE(MAX(sort),0)+1 s FROM denver_bands")?.s ?? 1;
  run("INSERT INTO denver_bands(id,label,min_months,max_months,sort) VALUES(?,?,?,?,?)", id, label, Math.round(min), Math.round(max), sort);
  audit(c.get("user").id, "denver_band_create", "denver_band", id, { label, min, max });
  return c.json({ id }, 201);
});

denverRouter.put("/api/denver/bands/:id", need("owner", "dokter"), async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const band = row("SELECT * FROM denver_bands WHERE id=?", c.req.param("id"));
  if (!band) return err(c, "not_found", "rentang usia tidak ada", 404);
  const label = b.label === undefined ? band.label : String(b.label || "").trim().slice(0, 60);
  const min = b.min_months === undefined ? band.min_months : Number(b.min_months);
  const max = b.max_months === undefined ? band.max_months : Number(b.max_months);
  const sort = b.sort === undefined ? band.sort : Number(b.sort);
  if (!label) return err(c, "invalid", "nama rentang usia wajib", 400);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max <= min) return err(c, "invalid", "rentang usia tidak valid (min < max)", 400);
  const clashes = findOverlaps(loadBands(), band.id, min, max);
  if (clashes.length) return err(c, "overlap", `rentang usia tumpang tindih dengan "${clashes[0].label}"`, 409);
  run("UPDATE denver_bands SET label=?, min_months=?, max_months=?, sort=? WHERE id=?", label, Math.round(min), Math.round(max), Number.isFinite(sort) ? sort : band.sort, band.id);
  audit(c.get("user").id, "denver_band_update", "denver_band", band.id, { label, min, max });
  return c.json({ ok: true });
});

denverRouter.delete("/api/denver/bands/:id", need("owner", "dokter"), (c) => {
  const band = row("SELECT * FROM denver_bands WHERE id=?", c.req.param("id"));
  if (!band) return err(c, "not_found", "rentang usia tidak ada", 404);
  if (row("SELECT COUNT(*) c FROM denver_bands").c <= 1) return err(c, "invalid", "harus ada minimal satu rentang usia", 400);
  // the items of the band and their checks go with it — atomically
  tx(() => {
    for (const it of rows("SELECT id FROM denver_items WHERE band_key=?", band.id)) {
      run("DELETE FROM denver_results WHERE item_key=?", it.id);
      run("DELETE FROM denver_items WHERE id=?", it.id);
    }
    run("DELETE FROM denver_bands WHERE id=?", band.id);
  });
  audit(c.get("user").id, "denver_band_delete", "denver_band", band.id, { label: band.label });
  return c.json({ ok: true });
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
  tx(() => { run("DELETE FROM denver_results WHERE item_key=?", it.id); run("DELETE FROM denver_items WHERE id=?", it.id); }); // checks of a removed item go with it
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
