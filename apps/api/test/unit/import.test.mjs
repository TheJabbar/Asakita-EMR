// ponytail: node:test stdlib, :memory: db — covers parser edge cases + import idempotency
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "file::memory:";
const { parseCsv, importCsv } = await import("../../src/import-csv.js");
const { row, rows } = await import("../../src/db.js");

const tmp = (name, content) => { const f = join(mkdtempSync(join(tmpdir(), "imp-")), name); writeFileSync(f, content); return f; };

describe("unit: csv import", () => {
  it("parseCsv: quotes, commas, ; separator, BOM", () => {
    const r = parseCsv('"a","b, c"\n1,"x, y"');
    assert.equal(r[0].a, "1");
    assert.equal(r[0]["b, c"], "x, y");
    const s = parseCsv("\uFEFFnama;alamat\nxi;\"jl. a, no 1\"");
    assert.equal(s[0].nama, "xi");
    assert.equal(s[0].alamat, "jl. a, no 1");
  });
  it("import: parents+children+link, re-run skips, bad rows reported", () => {
    const f = tmp("p.csv", `parent_name,parent_email,parent_password,parent_phone,parent_address,relation,mr_number,child_full_name,child_nickname,dob,gender,blood_type,birth_weight_kg,birth_length_cm,child_address,insurance,birth_history,allergies,notes
Ibu Tes,ibu.tes@tes.id,,+62 800,"Jl. A",Ibu,MR9001,Kid Tes,,2023-01-01,Laki-laki,O,3.1,49,"Jl. A",Pribadi,,,,
,,,,,,MR9002,Kid Solo,,,,,,,,,,
,,,,,,,Kid Tanpa MR,,,,,,,,,,
`);
    const o1 = importCsv(f);
    assert.equal(o1.imported, 2);
    assert.equal(o1.errors.length, 1);
    assert.match(o1.errors[0].message, /mr_number/);
    assert.equal(row("SELECT role FROM users WHERE email=?", "ibu.tes@tes.id").role, "parent");
    assert.equal(rows("SELECT child_id FROM parent_children").length, 1);
    assert.equal(row("SELECT full_name FROM children WHERE mr_number=?", "MR9002").full_name, "Kid Solo");
    const o2 = importCsv(f); // idempotent
    assert.equal(o2.imported, 0);
    assert.equal(o2.skipped, 2);
  });
});
