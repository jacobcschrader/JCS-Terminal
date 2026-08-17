// =====================================================================
//  GET /api/admin/gcalevents?from=YYYY-MM-DD&to=YYYY-MM-DD — everything
//  on Jacob's Google Calendar(s) for the range (minus our own shoot
//  events). Calendars: GCAL_CALENDAR_ID + settings.gcal_read_ids
//  (comma-separated ids of other calendars shared with the SA).
// =====================================================================
const { requireAuth } = require("../auth.js");
const { db } = require("../db.js");
const gcal = require("../gcal.js");

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  const q = req.query || {};
  const ok = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ""));
  if (!ok(q.from) || !ok(q.to)) { res.status(400).json({ error: "invalid" }); return; }
  if (!gcal.isConfigured()) { res.status(200).json({ configured: false, events: [] }); return; }
  try {
    const s = await db();
    const [row] = await s`SELECT value FROM settings WHERE key = 'gcal_read_ids'`;
    const extra = String((row && row.value) || "").split(/[,\s]+/).filter(Boolean);
    const events = await gcal.listEvents(q.from, q.to, extra);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ configured: true, events });
  } catch (e) {
    res.status(200).json({ configured: true, events: [], error: String(e.message || e).slice(0, 200) });
  }
};
