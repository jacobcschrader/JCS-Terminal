// =====================================================================
//  /api/admin/tasks — the dashboard task tracker (auth required)
//    GET                      → { tasks } (open first, then the last 40 done)
//    POST   { title, priority?, due?, booking_id? }
//    PUT    { id, done?, title?, priority?, due? }
//    DELETE { id }
//  priority: low | normal | medium | high
// =====================================================================
const { requireAuth } = require("../auth.js");
const { db } = require("../db.js");

const PRIORITIES = ["low", "normal", "medium", "high"];
const field = (v, max = 300) => String(v == null ? "" : v).trim().slice(0, max);

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  try {
    const s = await db();
    const b = req.body || {};

    if (req.method === "GET") {
      const open = await s`SELECT * FROM tasks WHERE done = false ORDER BY
        CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, due NULLS LAST, id ASC`;
      const done = await s`SELECT * FROM tasks WHERE done = true ORDER BY done_at DESC NULLS LAST, id DESC LIMIT 40`;
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json({ tasks: open.concat(done) });
      return;
    }
    if (req.method === "POST") {
      const title = field(b.title, 300);
      if (!title) { res.status(400).json({ error: "title-required" }); return; }
      const priority = PRIORITIES.includes(b.priority) ? b.priority : "normal";
      const due = field(b.due, 10) || null;
      const booking = parseInt(b.booking_id, 10) || null;
      const [row] = await s`INSERT INTO tasks (title, priority, due, booking_id) VALUES (${title}, ${priority}, ${due}, ${booking}) RETURNING *`;
      res.status(200).json({ task: row });
      return;
    }
    if (req.method === "PUT") {
      const id = parseInt(b.id, 10);
      if (!id) { res.status(400).json({ error: "invalid" }); return; }
      const [cur] = await s`SELECT * FROM tasks WHERE id = ${id}`;
      if (!cur) { res.status(404).json({ error: "not-found" }); return; }
      const done = typeof b.done === "boolean" ? b.done : cur.done;
      const title = b.title != null ? (field(b.title, 300) || cur.title) : cur.title;
      const priority = PRIORITIES.includes(b.priority) ? b.priority : cur.priority;
      const due = b.due !== undefined ? (field(b.due, 10) || null) : cur.due;
      const [row] = await s`
        UPDATE tasks SET done = ${done}, title = ${title}, priority = ${priority}, due = ${due},
          done_at = ${done ? (cur.done ? cur.done_at : new Date()) : null}
        WHERE id = ${id} RETURNING *`;
      res.status(200).json({ task: row });
      return;
    }
    if (req.method === "DELETE") {
      const id = parseInt(b.id, 10);
      if (!id) { res.status(400).json({ error: "invalid" }); return; }
      await s`DELETE FROM tasks WHERE id = ${id}`;
      res.status(200).json({ ok: true });
      return;
    }
    res.status(405).json({ error: "method-not-allowed" });
  } catch (e) {
    const msg = /DATABASE_URL/.test(String(e)) ? "db-not-configured" : "db-error";
    res.status(500).json({ error: msg });
  }
};
