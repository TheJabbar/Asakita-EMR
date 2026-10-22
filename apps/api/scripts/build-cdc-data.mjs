// ponytail: one-off generator — reads CDC 2000 LMS CSVs (downloaded from cdc.gov/growthcharts/data/zscore)
// and writes a trimmed monthly LMS table used by apps/api/src/growth.js.
// Run: node apps/api/scripts/build-cdc-data.mjs <dir-with-csvs>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] || process.env.CDC_DIR;
const out = { source: "CDC 2000 growth charts (LMS) — https://www.cdc.gov/growthcharts/cdc-data-files.htm", indicators: {} };

for (const [key, file] of [["weight", "wtage.csv"], ["height", "statage.csv"], ["bmi", "bmiagerev.csv"]]) {
  const lines = readFileSync(join(dir, file), "utf8").trim().split(/\r?\n/);
  const male = [], female = [];
  for (const line of lines.slice(1)) {
    const p = line.split(",");
    const age = Number(p[1]); // CDC rows are every 0.5 month (24, 24.5, 25.5, …)
    if (!Number.isFinite(age)) continue;
    const row = [age, +Number(p[2]).toFixed(6), +Number(p[3]).toFixed(6), +Number(p[4]).toFixed(6)];
    (p[0].trim() === "1" ? male : female).push(row);
  }
  out.indicators[key] = { male, female };
}

mkdirSync(join(import.meta.dirname, "../src/reference"), { recursive: true });
writeFileSync(join(import.meta.dirname, "../src/reference/cdc-lms.json"), JSON.stringify(out));
console.log("wrote src/reference/cdc-lms.json");
