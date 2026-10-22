// ponytail: growth curve engine — WHO Child Growth Standards (<5y) + CDC 2000 (>=5y) via LMS
// WHO tables: who-growth-standards npm (official LMS, offline). CDC tables: vendored src/data/cdc-lms.json
import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { getTable, lookupLms, zScoreToPercentile } from "who-growth-standards";
import { rows } from "./db.js";
import { err, need, STAFF, needOwnChild } from "./guard.js";
import { log } from "./log.js";

// ponytail: CDC tables are vendored in src/reference/ — a missing file must not kill the whole API
let CDC = { indicators: {} };
try {
  CDC = JSON.parse(readFileSync(new URL("./reference/cdc-lms.json", import.meta.url), "utf8"));
} catch (e) {
  log.error("CDC reference tables missing — CDC curves unavailable", { file: "src/reference/cdc-lms.json" });
}

export const INDICATORS = {
  weight: { who: "wfa", unit: "kg", label: "Berat badan", cdc: "weight" },
  height: { who: "lhfa", unit: "cm", label: "Tinggi badan", cdc: "height" },
  head: { who: "hcfa", unit: "cm", label: "Lingkar kepala", cdc: null },
};
const SEX = { "Laki-laki": "male", "Perempuan": "female" };
const WHO_MAX_DAYS = 1856; // 5 years
const CDC_MIN_MONTHS = 24;

// --- LMS maths (same formula for WHO and CDC) ---
function zFromLms(x, lms) {
  if (!(x > 0) || !lms) return null;
  const { L, M, S } = lms;
  return L === 0 ? Math.log(x / M) / S : (Math.pow(x / M, L) - 1) / (L * S);
}
function lmsFromZ(z, lms) {
  const { L, M, S } = lms;
  return L === 0 ? M * Math.exp(z * S) : M * Math.pow(1 + L * S * z, 1 / L);
}
export function bandOf(z) {
  if (z === null || z === undefined) return "unknown";
  if (z < -3) return "very_low";
  if (z < -2) return "low";
  if (z <= 2) return "normal";
  if (z <= 3) return "high";
  return "very_high";
}

// --- CDC table lookup (linear interpolation between the 0.5-month rows) ---
function cdcLms(indicator, sex, ageMonths) {
  const tbl = CDC.indicators[indicator]?.[sex];
  if (!tbl) return null;
  if (ageMonths <= tbl[0][0]) return { L: tbl[0][1], M: tbl[0][2], S: tbl[0][3] };
  const last = tbl[tbl.length - 1];
  if (ageMonths >= last[0]) return { L: last[1], M: last[2], S: last[3] };
  let i = 0;
  while (tbl[i + 1][0] < ageMonths) i++;
  const a = tbl[i], b = tbl[i + 1];
  const t = (ageMonths - a[0]) / (b[0] - a[0]);
  return { L: a[1] + (b[1] - a[1]) * t, M: a[2] + (b[2] - a[2]) * t, S: a[3] + (b[3] - a[3]) * t };
}
function whoLms(ind, sex, days) {
  const r = lookupLms(getTable(ind, sex), days, { clamp: true });
  return { L: r.l, M: r.m, S: r.s };
}

function ageIn(dob, date) {
  const d = new Date(dob), m = new Date(date);
  if (isNaN(d.getTime()) || isNaN(m.getTime())) return null;
  const days = Math.round((m.getTime() - d.getTime()) / 864e5);
  if (days < 0) return null;
  return { days, months: days / 30.4375 };
}

// --- evaluate one measurement against the reference that applies ---
function evaluate(ind, sex, age, value, force) {
  // ponytail: head circumference has no CDC table — beyond 5y there is simply no reference
  if (!ind.cdc && age.days > WHO_MAX_DAYS) return { standard: "WHO", z: null, median: null };
  const useWho = force === "WHO" || age.days <= WHO_MAX_DAYS || !ind.cdc || age.months < CDC_MIN_MONTHS;
  const lms = useWho
    ? whoLms(ind.who, sex, Math.min(age.days, WHO_MAX_DAYS))
    : cdcLms(ind.cdc, sex, age.months);
  const z = zFromLms(value, lms);
  return { standard: useWho ? "WHO" : "CDC", z, median: lms ? lmsFromZ(0, lms) : null };
}

// --- build the curve payload for a child ---
// ponytail: only WHO/CDC are valid overrides — anything else falls back to the age-based choice
export function normalizeStandard(s) {
  const v = String(s || "").toUpperCase();
  return v === "WHO" || v === "CDC" ? v : undefined;
}

export function buildCurve(child, records, indicator, force) {
  const ind = INDICATORS[indicator];
  if (!ind) return null;
  const sex = SEX[child.gender] || "male"; // default row when gender is missing
  const key = indicator === "weight" ? "weight_kg" : indicator === "height" ? "height_cm" : "head_cm";
  const points = [];
  for (const r of records) {
    const value = Number(r[key]);
    if (!value) continue;
    const age = ageIn(child.dob, r.date);
    if (!age) continue;
    const ev = evaluate(ind, sex, age, value, force);
    points.push({
      id: r.id, date: r.date, ageMonths: Math.round(age.months * 10) / 10, value,
      z: ev.z === null ? null : Math.round(ev.z * 100) / 100,
      percentile: ev.z === null ? null : Math.round(zScoreToPercentile(ev.z) * 10) / 10,
      band: bandOf(ev.z), standard: ev.standard,
    });
  }
  points.sort((a, b) => a.date.localeCompare(b.date));
  const last = points.at(-1) || null;
  const standard = force || (last ? last.standard : "WHO");
  const maxAge = last ? Math.min(Math.ceil(last.ageMonths), 240) : 60;
  const from = standard === "WHO" ? 0 : CDC_MIN_MONTHS;
  const to = standard === "WHO" ? Math.min(maxAge, 60) : maxAge; // WHO standards stop at 5 years
  const curves = [];
  for (const z of [-3, -2, -1, 0, 1, 2, 3]) {
    const pts = [];
    for (let m = from; m <= Math.max(to, from); m++) {
      const lms = standard === "WHO"
        ? whoLms(ind.who, sex, Math.min(m * 30.4375, WHO_MAX_DAYS))
        : cdcLms(ind.cdc, sex, m);
      if (!lms) continue;
      const v = lmsFromZ(z, lms);
      if (!Number.isFinite(v)) continue;
      pts.push({ ageMonths: m, value: Math.round(v * 10) / 10 });
    }
    curves.push({ z, points: pts });
  }
  return {
    childId: child.id, indicator, unit: ind.unit, label: ind.label, sex, standard, points, curves, latest: last,
    note: standard === "WHO"
      ? "Acuan: WHO Child Growth Standards (0–5 tahun)."
      : "Acuan: CDC 2000 (5–19 tahun).",
  };
}

// --- routes ---
export const growthRouter = new Hono();

growthRouter.get("/api/growth/curve", need(...STAFF), (c) => {
  const childId = c.req.query("childId");
  const child = rows("SELECT id,dob,gender FROM children WHERE id=?", childId || "-")[0];
  if (!child) return err(c, "not_found", "pasien tidak ada", 404);
  const records = rows("SELECT id,date,weight_kg,height_cm,head_cm FROM growth_records WHERE child_id=? ORDER BY date", child.id);
  const curve = buildCurve(child, records, c.req.query("type") || "weight", normalizeStandard(c.req.query("standard")));
  if (!curve) return err(c, "invalid", "jenis grafik tidak dikenal", 400);
  return c.json(curve);
});

growthRouter.get("/api/portal/growth/:id/curve", need("parent"), needOwnChild, (c) => {
  const child = rows("SELECT id,dob,gender FROM children WHERE id=?", c.req.param("id"))[0];
  if (!child) return err(c, "not_found", "not found", 404);
  const records = rows("SELECT id,date,weight_kg,height_cm,head_cm FROM growth_records WHERE child_id=? ORDER BY date", child.id);
  const curve = buildCurve(child, records, c.req.query("type") || "weight", normalizeStandard(c.req.query("standard")));
  if (!curve) return err(c, "invalid", "jenis grafik tidak dikenal", 400);
  return c.json(curve);
});
