// ponytail: billing — invoice lines per child (auto-generated from therapy sessions or manual),
// IDR, printable receipt + PDF. No payment gateway (out of scope).
import { Hono } from "hono";
import { row, rows, run, uid, tx } from "./db.js";
import { err, need, STAFF, needOwnChild, audit } from "./guard.js";
import { pdfBytes } from "./pdf.js";
import { DEFAULT_PRICES } from "./constants.js";

export { DEFAULT_PRICES };

export function priceOf(name) {
  const p = row("SELECT price FROM service_prices WHERE name=?", name || "");
  return p ? p.price : (DEFAULT_PRICES[name] ?? 100000);
}
export function itemsFor(childId, from, to) {
  let sql = "SELECT * FROM billing_items WHERE child_id=?";
  const p = [childId];
  if (from) { sql += " AND date>=?"; p.push(from); }
  if (to) { sql += " AND date<=?"; p.push(to); }
  const items = rows(sql + " ORDER BY date DESC, rowid DESC", ...p);
  for (const i of items) i.total = Math.round(i.qty * i.unit_price);
  return items;
}
export function totals(items) {
  const total = items.reduce((a, b) => a + b.total, 0);
  const paid = items.filter((i) => i.status === "paid").reduce((a, b) => a + b.total, 0);
  return { total, paid, unpaid: total - paid };
}

export const billingRouter = new Hono();

billingRouter.get("/api/billing", need(...STAFF), (c) => {
  const childId = c.req.query("childId");
  if (!childId) return err(c, "invalid", "childId wajib", 400);
  const items = itemsFor(childId, c.req.query("from") || "", c.req.query("to") || "");
  return c.json({ data: items, totals: totals(items), prices: rows("SELECT * FROM service_prices ORDER BY name") });
});

billingRouter.get("/api/billing/prices", need(...STAFF), (c) => c.json({ data: rows("SELECT * FROM service_prices ORDER BY name") }));

billingRouter.post("/api/billing/items", need("owner", "dokter", "admin"), async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!b.child_id || !row("SELECT id FROM children WHERE id=?", b.child_id)) return err(c, "invalid", "child_id tidak dikenal", 400);
  if (!b.description) return err(c, "invalid", "deskripsi wajib", 400);
  const qty = Number(b.qty) > 0 ? Number(b.qty) : 1;
  let unit;
  if (b.unit_price === undefined || b.unit_price === null || b.unit_price === "") unit = priceOf(b.description);
  else {
    unit = Number(String(b.unit_price).replace(",", ".")); // tolerate ID decimal comma — a NaN here must not bill 0
    if (!Number.isFinite(unit) || unit < 0) return err(c, "invalid", "harga tidak valid", 400);
  }
  const id = uid("bi");
  run("INSERT INTO billing_items(id,child_id,date,description,qty,unit_price,session_id,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
    id, b.child_id, b.date || new Date().toISOString().slice(0, 10), b.description, qty, unit, b.session_id || null, "unpaid", new Date().toISOString());
  audit(c.get("user").id, "billing_item_create", "billing_item", id, { child_id: b.child_id, total: qty * unit });
  return c.json({ id }, 201);
});

// ponytail: one click bills every unbilled therapy session in the period at the service price
billingRouter.post("/api/billing/generate", need("owner", "dokter", "admin"), async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!b.child_id || !row("SELECT id FROM children WHERE id=?", b.child_id)) return err(c, "invalid", "child_id tidak dikenal", 400);
  const from = b.from || "1900-01-01", to = b.to || "2999-12-31";
  const sessions = rows(
    `SELECT s.id,s.date,t.name type_name FROM therapy_sessions s LEFT JOIN therapy_types t ON t.id=s.type_id
     WHERE s.child_id=? AND s.date BETWEEN ? AND ? AND s.id NOT IN (SELECT session_id FROM billing_items WHERE session_id IS NOT NULL)`,
    b.child_id, from, to);
  let created = 0;
  tx(() => { // all-or-nothing: no half-billed run
    for (const s of sessions) {
      const desc = s.type_name || "Terapi";
      run("INSERT INTO billing_items(id,child_id,date,description,qty,unit_price,session_id,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        uid("bi"), b.child_id, s.date, desc, 1, priceOf(desc), s.id, "unpaid", new Date().toISOString());
      created++;
    }
  });
  if (created) audit(c.get("user").id, "billing_generate", "child", b.child_id, { created });
  return c.json({ created }, 201);
});

billingRouter.patch("/api/billing/items/:id", need("owner", "dokter", "admin"), async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!["paid", "unpaid"].includes(b.status)) return err(c, "invalid", "status tidak dikenal", 400);
  const it = row("SELECT * FROM billing_items WHERE id=?", c.req.param("id"));
  if (!it) return err(c, "not_found", "item tidak ada", 404);
  run("UPDATE billing_items SET status=? WHERE id=?", b.status, it.id);
  audit(c.get("user").id, "billing_status", "billing_item", it.id, { status: b.status });
  return c.json({ ok: true });
});

billingRouter.delete("/api/billing/items/:id", need("owner", "dokter", "admin"), async (c) => {
  const it = row("SELECT * FROM billing_items WHERE id=?", c.req.param("id"));
  if (!it) return err(c, "not_found", "item tidak ada", 404);
  run("DELETE FROM billing_items WHERE id=?", it.id);
  return c.json({ ok: true });
});

billingRouter.put("/api/billing/prices/:name", need("owner", "dokter"), async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const price = Number(b.price);
  if (!Number.isFinite(price) || price < 0) return err(c, "invalid", "harga tidak valid", 400);
  run("INSERT OR REPLACE INTO service_prices(name,price) VALUES(?,?)", c.req.param("name"), Math.round(price));
  return c.json({ ok: true });
});

// --- printable receipt (PDF) ---
billingRouter.get("/api/billing/receipt", need(...STAFF), (c) => {
  const childId = c.req.query("childId");
  const child = row("SELECT * FROM children WHERE id=?", childId || "-");
  if (!child) return err(c, "not_found", "pasien tidak ada", 404);
  const items = itemsFor(child.id, c.req.query("from") || "", c.req.query("to") || "");
  const t = totals(items);
  const lines = [
    `Pasien: ${child.full_name} (${child.mr_number || "-"})`,
    `Periode: ${c.req.query("from") || "-"} s/d ${c.req.query("to") || "-"}`,
    ...items.slice(0, 12).map((i) => `${i.date} ${i.description} x${i.qty} = ${i.total} (${i.status})`),
    `TOTAL: ${t.total} • Lunas: ${t.paid} • Tunggakan: ${t.unpaid}`,
  ];
  c.header("content-type", "application/pdf");
  return c.body(pdfBytes(`Struk-${child.full_name}`, lines));
});

// --- portal: parent sees their own child's bill ---
billingRouter.get("/api/portal/billing", need("parent"), needOwnChild, (c) => {
  const childId = c.req.query("childId");
  if (!childId) return err(c, "invalid", "childId wajib", 400);
  const items = itemsFor(childId);
  return c.json({ data: items, totals: totals(items) });
});
