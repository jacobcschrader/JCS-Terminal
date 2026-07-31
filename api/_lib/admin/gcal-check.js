// =====================================================================
//  GET /api/admin/gcalcheck — verifies the Google Calendar hookup end
//  to end WITHOUT writing anything: env vars present, service-account
//  JSON parses, an OAuth token can be minted, and the calendar is
//  reachable with the shared permission. Surfaces the exact failure so
//  setup problems diagnose themselves from Admin -> Settings.
// =====================================================================
const { requireAuth } = require("../auth.js");
const gcal = require("../gcal.js");

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (!gcal.isConfigured()) {
    res.status(200).json({ configured: false });
    return;
  }
  let saEmail = "";
  try {
    saEmail = JSON.parse(process.env.GOOGLE_SA_KEY).client_email || "";
  } catch (e) {
    res.status(200).json({ configured: true, ok: false,
      error: "GOOGLE_SA_KEY isn't valid JSON — paste the ENTIRE contents of the downloaded .json key file." });
    return;
  }
  try {
    const token = await gcal.accessToken();
    const calId = encodeURIComponent(process.env.GCAL_CALENDAR_ID);
    const r = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calId}/events?maxResults=1&singleEvents=true`,
      { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      let hint = `Google error ${r.status}`;
      if (r.status === 404) hint = "Calendar not found — check GCAL_CALENDAR_ID, and make sure the calendar is shared with the service account.";
      if (r.status === 403) hint = "No access — share the calendar with the service account (\"Make changes to events\").";
      res.status(200).json({ configured: true, ok: false, saEmail,
        error: hint + (txt ? " · " + txt.slice(0, 180) : "") });
      return;
    }
    res.status(200).json({ configured: true, ok: true, saEmail,
      calendarId: process.env.GCAL_CALENDAR_ID });
  } catch (e) {
    res.status(200).json({ configured: true, ok: false, saEmail,
      error: String((e && e.message) || e).slice(0, 300) });
  }
};
