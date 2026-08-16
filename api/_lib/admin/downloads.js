// =====================================================================
//  GET /api/admin/downloads?limit=80[&id=<booking>] — download activity
//  feed for the dashboard ("Recent downloads") and per-listing pages.
//  Each row: when, who (client email), what (bundle / file), listing.
// =====================================================================
const { requireAuth } = require("../auth.js");
const { db } = require("../db.js");

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== "GET") { res.status(405).json({ error: "method-not-allowed" }); return; }
  try {
    const s = await db();
    const q = req.query || {};
    const limit = Math.min(300, Math.max(1, parseInt(q.limit, 10) || 80));
    const id = parseInt(q.id, 10) || 0;
    const rows = id
      ? await s`
          SELECT e.id, e.booking_id, e.file_id, e.kind, e.label, e.email, e.created_at,
                 bk.title, bk.delivery_slug AS slug
          FROM download_events e JOIN bookings bk ON bk.id = e.booking_id
          WHERE e.booking_id = ${id} ORDER BY e.created_at DESC LIMIT ${limit}`
      : await s`
          SELECT e.id, e.booking_id, e.file_id, e.kind, e.label, e.email, e.created_at,
                 bk.title, bk.delivery_slug AS slug
          FROM download_events e JOIN bookings bk ON bk.id = e.booking_id
          ORDER BY e.created_at DESC LIMIT ${limit}`;
    const [wk] = await s`SELECT count(*)::int AS n FROM download_events WHERE created_at > now() - interval '7 days' AND kind <> 'view'`;
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ events: rows, week: wk ? wk.n : 0 });
  } catch (e) {
    const msg = /DATABASE_URL/.test(String(e)) ? "db-not-configured" : "db-error";
    res.status(500).json({ error: msg });
  }
};
