// ponytail: "resep" home program — created after a therapy session, tracked by the parent daily
import { Hono } from "hono";
import { row, rows, run, uid, tx } from "./db.js";
import { err, need, STAFF, needOwnChild } from "./guard.js";

const today = () => new Date().toISOString().slice(0, 10);

export function createHomeProgram({ child_id, session_id = null, title, instructions = "", items = [], userId = null }) {
  const id = uid("hp");
  tx(() => {
    run("INSERT INTO home_programs(id,child_id,session_id,title,instructions,created_at,created_by) VALUES(?,?,?,?,?,?,?)",
      id, child_id, session_id, title || "Program latihan di rumah", instructions, new Date().toISOString(), userId);
    for (const it of items) {
      const label = typeof it === "string" ? it : it.label;
      if (!label) continue;
      run("INSERT INTO home_program_items(id,program_id,label,target_per_day,note,done_dates) VALUES(?,?,?,?,?,?)",
        uid("hpi"), id, label, Number((typeof it === "object" && it.target_per_day) || 1) || 1,
        (typeof it === "object" && it.note) || "", "[]");
    }
  });
  return id;
}

export function programsWithItems(childId) {
  const programs = rows("SELECT * FROM home_programs WHERE child_id=? ORDER BY created_at DESC", childId);
  for (const p of programs) {
    p.items = rows("SELECT * FROM home_program_items WHERE program_id=? ORDER BY rowid", p.id).map((i) => {
      const done = JSON.parse(i.done_dates || "[]");
      return { id: i.id, label: i.label, target_per_day: i.target_per_day, note: i.note, done_dates: done, doneCount: done.length, doneToday: done.includes(today()) };
    });
  }
  return programs;
}

export const homeRouter = new Hono();

homeRouter.get("/api/home-programs", need(...STAFF), (c) => {
  const childId = c.req.query("childId");
  if (!childId) return err(c, "invalid", "childId wajib", 400);
  return c.json({ data: programsWithItems(childId) });
});

homeRouter.post("/api/home-programs", need("owner", "dokter", "terapis"), async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!b.child_id || !b.title) return err(c, "invalid", "child_id + judul wajib", 400);
  const id = createHomeProgram({ ...b, userId: c.get("user").id });
  return c.json({ id }, 201);
});

homeRouter.post("/api/home-programs/:id/items", need("owner", "dokter", "terapis"), async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const program = row("SELECT * FROM home_programs WHERE id=?", c.req.param("id"));
  if (!program) return err(c, "not_found", "program tidak ada", 404);
  if (!b.label) return err(c, "invalid", "label wajib", 400);
  const iid = uid("hpi");
  run("INSERT INTO home_program_items(id,program_id,label,target_per_day,note,done_dates) VALUES(?,?,?,?,?,?)",
    iid, program.id, b.label, Number(b.target_per_day) || 1, b.note || "", "[]");
  return c.json({ id: iid }, 201);
});

// --- portal: parent sees the recipe + ticks items done each day ---
homeRouter.get("/api/portal/home-programs", need("parent"), needOwnChild, (c) => {
  const childId = c.req.query("childId");
  if (!childId) return err(c, "invalid", "childId wajib", 400);
  return c.json({ data: programsWithItems(childId) });
});

homeRouter.post("/api/portal/home-programs/items/:id/toggle", need("parent"), async (c) => {
  const item = row("SELECT * FROM home_program_items WHERE id=?", c.req.param("id"));
  if (!item) return err(c, "not_found", "not found", 404);
  const program = row("SELECT child_id FROM home_programs WHERE id=?", item.program_id);
  const childIds = rows("SELECT child_id FROM parent_children WHERE parent_id=(SELECT id FROM parents WHERE user_id=?)", c.get("user").id).map((r) => r.child_id);
  if (!program || !childIds.includes(program.child_id)) return err(c, "not_found", "not found", 404);
  const day = c.req.query("date") || today();
  const done = JSON.parse(item.done_dates || "[]");
  const next = done.includes(day) ? done.filter((d) => d !== day) : [...done, day].sort();
  run("UPDATE home_program_items SET done_dates=? WHERE id=?", JSON.stringify(next), item.id);
  return c.json({ id: item.id, done_dates: next, doneToday: next.includes(day) });
});
