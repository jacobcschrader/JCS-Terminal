// =====================================================================
//  GET /api/cron — daily, called by Vercel Cron (vercel.json → crons;
//  runs 14:00 UTC = 6/7am Pacific).
//
//  1. Projects whose shoot date has arrived (LA time) move
//     upcoming → editing.
//  2. Automatic reminders — each switched on in Settings (settings rows
//     remind_invoice / remind_proposal / remind_delivery = "1"), each
//     sent once per milestone and logged on the project timeline:
//       · unpaid invoice at 14 and 21 days after it was sent
//       · proposal still 'sent' 3 days after sending
//       · delivery not approved / no changes requested 5 days after send
//
//  Optionally protect it: set a CRON_SECRET env var in Vercel — their
//  cron invocations send "Authorization: Bearer <CRON_SECRET>"
//  automatically, and anyone else gets a 401. Without the env var the
//  endpoint stays open but is idempotent and exposes nothing.
// =====================================================================
const { db } = require("./_lib/db.js");
const { recipientsOf } = require("./_lib/links.js");
const { sendEmail, jcsEmail, SENDERS, OWNER } = require("./_lib/email.js");
const { loginUrl } = require("./_lib/portal-auth.js");
const { logEvent } = require("./_lib/events.js");
const { loadTemplates, tpl } = require("./_lib/templates.js");
const backup = require("./_lib/backup.js");

const escHtml = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => "$" + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

async function alreadySent(s, bookingId, tag) {
  const [hit] = await s`SELECT 1 FROM project_events WHERE booking_id = ${bookingId} AND kind = 'reminder' AND meta = ${tag} LIMIT 1`;
  return !!hit;
}

async function reminders(s) {
  const out = { invoice: 0, proposal: 0, delivery: 0 };
  const settings = {};
  (await s`SELECT key, value FROM settings WHERE key LIKE 'remind_%'`).forEach((r) => { settings[r.key] = r.value; });
  const on = (k) => settings[k] === "1" || settings[k] === "true";
  if (!on("remind_invoice") && !on("remind_proposal") && !on("remind_delivery")) return out;
  const T = await loadTemplates(s);

  // ---- unpaid invoices: day 14 and day 21 ---------------------------
  if (on("remind_invoice")) {
    const rows = await s`
      SELECT bk.*, c.name AS client_name, c.email AS client_email, c.extra_emails AS client_extra_emails
      FROM bookings bk LEFT JOIN clients c ON c.id = bk.client_id
      WHERE bk.invoice_sent_at IS NOT NULL AND bk.status NOT IN ('paid', 'canceled')
        AND bk.invoice_sent_at < now() - interval '14 days'`;
    for (const b of rows) {
      const days = (Date.now() - new Date(b.invoice_sent_at)) / 864e5;
      const milestone = days >= 21 ? 21 : 14;
      const tag = "reminder:invoice:" + milestone;
      if (await alreadySent(s, b.id, tag)) continue;
      const to = recipientsOf(b.client_email, b.client_extra_emails);
      if (!to.length || !b.invoice_token) continue;
      const number = "JCS-" + String(b.id).padStart(4, "0");
      const total = (Number(b.price) || 0) + (Number(b.travel_fee) || 0) - (Number(b.discount_value) || 0);
      const first = (b.client_name || "").split(" ")[0] || "there";
      const url = "https://www.jacobcschrader.com/invoice?t=" + b.invoice_token;
      const t = tpl(T, "reminder_invoice", { first, name: b.client_name || "", property: b.title, location: b.location || "", number, total: money(total) });
      try {
        await sendEmail({
          from: SENDERS.billing, to, replyTo: OWNER, subject: t.subject,
          text: `${t.text}\n${url}\n\n— Jacob Schrader · jacobcschrader.com`,
          html: jcsEmail({ eyebrow: "Invoice " + number, headline: escHtml(b.title), note: t.note,
            rows: [["Invoice", number], ["Total", escHtml(money(total))], ["Sent", new Date(b.invoice_sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })]],
            cta: { label: "View Invoice", url }, audience: "client" }),
        });
        await logEvent(s, b.id, "reminder", `Invoice reminder sent (day ${milestone})`, "system", tag);
        out.invoice++;
      } catch (e) { /* next */ }
    }
  }

  // ---- proposals still waiting after 3 days ------------------------
  if (on("remind_proposal")) {
    const rows = await s`
      SELECT * FROM proposals WHERE status = 'sent' AND sent_at IS NOT NULL AND reminded_at IS NULL
        AND sent_at < now() - interval '3 days' AND client_email <> ''`;
    for (const p of rows) {
      const first = (p.client_name || "").split(" ")[0] || "there";
      const url = "https://proposal.jacobcschrader.com/" + p.slug;
      const t = tpl(T, "reminder_proposal", { first, name: p.client_name || "", property: p.title, location: p.location || "" });
      try {
        await sendEmail({
          from: SENDERS.enquiry, to: p.client_email, replyTo: OWNER, subject: t.subject,
          text: `${t.text}\n${url}\n\n— Jacob Schrader · jacobcschrader.com`,
          html: jcsEmail({ eyebrow: "Your Proposal", headline: escHtml(p.title), note: t.note,
            cta: { label: "View Your Proposal", url }, audience: "client" }),
        });
        await s`UPDATE proposals SET reminded_at = now() WHERE id = ${p.id}`;
        if (p.booking_id) await logEvent(s, p.booking_id, "reminder", "Proposal reminder sent (day 3)", "system", "reminder:proposal:3");
        out.proposal++;
      } catch (e) { /* next */ }
    }
  }

  // ---- deliveries waiting on approval after 5 days ---------------------
  if (on("remind_delivery")) {
    const rows = await s`
      SELECT bk.*, c.name AS client_name, c.email AS client_email, c.extra_emails AS client_extra_emails
      FROM bookings bk LEFT JOIN clients c ON c.id = bk.client_id
      WHERE bk.delivery_sent_at IS NOT NULL AND bk.delivery_approved_at IS NULL
        AND COALESCE(bk.delivery_feedback, '') = '' AND bk.status IN ('delivered', 'completed')
        AND bk.delivery_sent_at < now() - interval '5 days'`;
    for (const b of rows) {
      const tag = "reminder:delivery:5";
      if (await alreadySent(s, b.id, tag)) continue;
      const to = recipientsOf(b.client_email, b.client_extra_emails);
      if (!to.length || !b.client_id) continue;
      const first = (b.client_name || "").split(" ")[0] || "there";
      const url = loginUrl(b.client_id, b.id);
      const t = tpl(T, "reminder_delivery", { first, name: b.client_name || "", property: b.title, location: b.location || "" });
      try {
        await sendEmail({
          from: SENDERS.delivery, to, replyTo: OWNER, subject: t.subject,
          text: `${t.text}\n${url}\n\n— Jacob Schrader · jacobcschrader.com`,
          html: jcsEmail({ eyebrow: "Your Delivery", headline: escHtml(b.title), note: t.note,
            cta: { label: "Open Your Listing", url }, audience: "client" }),
        });
        await logEvent(s, b.id, "reminder", "Delivery approval reminder sent (day 5)", "system", tag);
        out.delivery++;
      } catch (e) { /* next */ }
    }
  }
  return out;
}

module.exports = async function handler(req, res) {
  try {
    if (process.env.CRON_SECRET &&
        req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const s = await db();
    const todayLA = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
    const moved = await s`
      UPDATE bookings SET status = 'editing'
      WHERE status = 'upcoming' AND shoot_date IS NOT NULL AND shoot_date <= ${todayLA}
      RETURNING id`;
    for (const r of moved) await logEvent(s, r.id, "stage", "Moved to editing (shoot day)", "system");

    let sent = { invoice: 0, proposal: 0, delivery: 0 };
    try { sent = await reminders(s); } catch (e) { /* reminders never break the stage job */ }

    // archive full-res originals N months after delivery (web/thumb copies stay)
    let archived = 0;
    try {
      const [row] = await s`SELECT value FROM settings WHERE key = 'archive_months'`;
      const months = parseInt((row && row.value) || "0", 10);
      if (months > 0) {
        const files = await s`
          SELECT f.id, f.booking_id, f.url FROM delivery_files f JOIN bookings bk ON bk.id = f.booking_id
          WHERE f.kind = 'photo' AND f.archived_at IS NULL AND f.url <> '' AND f.web_url <> ''
            AND bk.delivery_sent_at IS NOT NULL AND bk.delivery_sent_at < now() - (${months} * interval '1 month')
          LIMIT 300`;
        let del = null; try { del = require("@vercel/blob").del; } catch (e) {}
        const perBooking = {};
        for (const f of files) {
          try { if (del) await del(f.url); } catch (e) { /* orphan is harmless */ }
          await s`UPDATE delivery_files SET url = '', archived_at = now() WHERE id = ${f.id}`;
          perBooking[f.booking_id] = (perBooking[f.booking_id] || 0) + 1; archived++;
        }
        for (const bid of Object.keys(perBooking)) await logEvent(s, bid, "files", `Archived ${perBooking[bid]} full-res original${perBooking[bid] === 1 ? "" : "s"} (${months}-month rule)`, "system");
      }
    } catch (e) { /* never break the run */ }

    // nightly encrypted backup to Blob (best effort)
    let backedUp = null;
    try { backedUp = await backup.run(s); } catch (e) { backedUp = { error: String(e.message || e).slice(0, 120) }; }

    res.status(200).json({ ok: true, moved: moved.length, reminders: sent, archived, backup: backedUp });
  } catch (e) {
    const msg = /DATABASE_URL/.test(String(e)) ? "db-not-configured" : "error";
    res.status(500).json({ error: msg });
  }
};
