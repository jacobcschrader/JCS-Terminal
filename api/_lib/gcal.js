// =====================================================================
//  GOOGLE CALENDAR — direct event insertion via a service account.
//  When configured, confirming a booking writes the shoot (and twilight)
//  straight onto Jacob's calendar — no invite to accept.
//
//  One-time setup:
//    1. console.cloud.google.com → create project → enable
//       "Google Calendar API".
//    2. IAM & Admin → Service Accounts → create one → Keys →
//       Add key → JSON → download.
//    3. Google Calendar → your calendar → Settings and sharing →
//       "Share with specific people" → add the service account's
//       email (…@….iam.gserviceaccount.com) with
//       "Make changes to events".
//    4. Vercel env vars:
//         GCAL_CALENDAR_ID  = the calendar ID (Settings → "Integrate calendar")
//         GOOGLE_SA_KEY     = the ENTIRE contents of the downloaded JSON file
//    5. Redeploy.
//
//  If these env vars are missing, isConfigured() is false and the
//  confirm flow simply skips direct insertion (invites still work).
// =====================================================================

const crypto = require("node:crypto");
const { TZID } = require("./ics.js");

function isConfigured() {
  return !!(process.env.GOOGLE_SA_KEY && process.env.GCAL_CALENDAR_ID);
}

function saKey() {
  try { return JSON.parse(process.env.GOOGLE_SA_KEY); }
  catch { throw new Error("GOOGLE_SA_KEY is not valid JSON"); }
}

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");

// Service-account JWT → OAuth access token (no libraries needed).
async function accessToken() {
  const key = saKey();
  const now = Math.floor(Date.now() / 1000);
  const unsigned =
    b64url({ alg: "RS256", typ: "JWT" }) + "." +
    b64url({
      iss: key.client_email,
      scope: "https://www.googleapis.com/auth/calendar.events",
      aud: "https://oauth2.googleapis.com/token",
      iat: now, exp: now + 3600,
    });
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  const jwt = unsigned + "." + signer.sign(key.private_key, "base64url");

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!r.ok) throw new Error(`Google token error ${r.status}: ${await r.text().catch(() => "")}`);
  return (await r.json()).access_token;
}

// events: same shape as ics.js — { uid, title, date, time, durationMin, location, description }
// Uses the ICS uid as the Google event id (sanitized) so re-confirming
// UPDATES the calendar events instead of duplicating them.
async function upsertEvents(events) {
  const token = await accessToken();
  const calId = encodeURIComponent(process.env.GCAL_CALENDAR_ID);

  for (const e of events) {
    const gid = e.uid.toLowerCase().replace(/[^a-v0-9]/g, ""); // Google id charset (base32hex)
    const dateOnly = ymd(e.date);
    const hasTime = /^\d{2}:\d{2}/.test(String(e.time || ""));
    let start, end;
    if (hasTime) {
      const startDt = `${dateOnly}T${e.time.slice(0, 5)}:00`;
      const endD = new Date(`${startDt}`);
      endD.setMinutes(endD.getMinutes() + (e.durationMin || 120));
      const p = (n) => String(n).padStart(2, "0");
      const endDt = `${endD.getFullYear()}-${p(endD.getMonth() + 1)}-${p(endD.getDate())}T${p(endD.getHours())}:${p(endD.getMinutes())}:00`;
      start = { dateTime: startDt, timeZone: TZID };
      end = { dateTime: endDt, timeZone: TZID };
    } else {
      start = { date: dateOnly };
      end = { date: dateOnly };
    }
    const body = JSON.stringify({
      id: gid,
      summary: e.title,
      location: e.location || "",
      description: e.description || "",
      start, end,
    });

    // Try update first (idempotent re-confirm), fall back to insert.
    const base = `https://www.googleapis.com/calendar/v3/calendars/${calId}/events`;
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    let r = await fetch(`${base}/${gid}`, { method: "PUT", headers, body });
    if (r.status === 404 || r.status === 400) {
      r = await fetch(base, { method: "POST", headers, body });
    }
    if (!r.ok) throw new Error(`Google Calendar error ${r.status}: ${await r.text().catch(() => "")}`);
  }
  return events.length;
}

module.exports = { isConfigured, upsertEvents };
