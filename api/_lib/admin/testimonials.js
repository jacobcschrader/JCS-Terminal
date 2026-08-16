// =====================================================================
//  /api/admin/testimonials — quotes clients leave after approving a
//  delivery (auth required)
//    GET             → { testimonials }
//    PUT  { id, approved }   → show / hide on the website
//    DELETE { id }
//  Approved quotes flow to /api/site-projects → the home page.
// =====================================================================
const { requireAuth } = require("../auth.js");
const { db } = require("../db.js");

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  try {
    const s = await db();
    const b = req.body || {};
    if (req.method === "GET") {
      const rows = await s`
        SELECT t.*, bk.title AS property FROM testimonials t
        LEFT JOIN bookings bk ON bk.id = t.booking_id ORDER BY t.created_at DESC`;
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json({ testimonials: rows });
      return;
    }
    if (req.method === "PUT") {
      const id = parseInt(b.id, 10);
      const approved = b.approved === true || b.approved === "true";
      const [row] = await s`UPDATE testimonials SET approved = ${approved} WHERE id = ${id} RETURNING *`;
      if (!row) { res.status(404).json({ error: "not-found" }); return; }
      res.status(200).json({ ok: true, testimonial: row });
      return;
    }
    if (req.method === "DELETE") {
      const id = parseInt(b.id, 10);
      await s`DELETE FROM testimonials WHERE id = ${id}`;
      res.status(200).json({ ok: true });
      return;
    }
    res.status(405).json({ error: "method-not-allowed" });
  } catch (e) {
    const msg = /DATABASE_URL/.test(String(e)) ? "db-not-configured" : "db-error";
    res.status(500).json({ error: msg });
  }
};
