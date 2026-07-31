// =====================================================================
//  POST /api/admin/deliver { id } — send (or resend) a delivery:
//    1. Issues a delivery token on first send (powers /delivery?t=…).
//    2. Emails the client a branded "Your delivery is ready" with a
//       button to the JCS delivery page.
//    3. Stamps delivery_sent_at, increments delivery_sends, sets
//       delivered_at, and advances the stage to 'delivered' if the
//       project is still earlier in the pipeline.
//  Requires a client with an email and a gallery link on the project.
// =====================================================================
const crypto = require("node:crypto");
const { requireAuth } = require("../auth.js");
const { db } = require("../db.js");
const { linksOf, recipientsOf } = require("../links.js");
const { loginUrl } = require("../portal-auth.js");
const { sendEmail, jcsEmail, SENDERS, OWNER } = require("../email.js");
const { coverFor } = require("./covers.js");

const escHtml = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== "POST") { res.status(405).json({ error: "method-not-allowed" }); return; }

  try {
    const s = await db();
    const id = parseInt((req.body || {}).id, 10);
    if (!id) { res.status(400).json({ error: "invalid" }); return; }

    const [b] = await s`
      SELECT bk.*, c.name AS client_name, c.email AS client_email,
             c.extra_emails AS client_extra_emails, c.portal_token AS client_portal_token
      FROM bookings bk LEFT JOIN clients c ON c.id = bk.client_id
      WHERE bk.id = ${id}`;
    if (!b) { res.status(404).json({ error: "not-found" }); return; }
    const links = linksOf(b);
    if (!links.length) { res.status(400).json({ error: "no-links" }); return; }
    const clientTo = recipientsOf(b.client_email, b.client_extra_emails);
    if (!clientTo.length) { res.status(400).json({ error: "no-client-email" }); return; }

    const token = b.delivery_token || crypto.randomBytes(12).toString("base64url");
    // Make sure the gallery cover is cached before the client ever opens
    // the page (retries earlier misses — the gallery may exist by now).
    let coverUrl = b.delivery_cover_url;
    if (!coverUrl || coverUrl === "-") {
      coverUrl = (await coverFor(s, b, links)) || "-";
      await s`UPDATE bookings SET delivery_cover_url = ${coverUrl} WHERE id = ${id}`;
    }
    // the email button signs the client in and lands on their portal
    // with this delivery front and center
    const pageUrl = loginUrl(b.client_id, b.id);
    const first = (b.client_name || "").split(" ")[0] || "there";
    const cc = String(b.delivery_cc || "").split(/[,;\s]+/).filter((e) => /.+@.+\..+/.test(e)).slice(0, 10);
    const note = String(b.delivery_message || "").trim();

    const sentAt = new Date().toLocaleString("en-US", {
      timeZone: "America/Los_Angeles", weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit", timeZoneName: "short",
    });
    const headline = `${escHtml(b.client_name || "")}${b.client_name ? " · " : ""}${escHtml(b.title)}`;
    const included = links.map((l) => escHtml(l.label)).join(" · ");

    await sendEmail({
      from: SENDERS.delivery,
      to: clientTo,
      cc,
      replyTo: OWNER,
      subject: `${b.title} | Media Delivery`,
      text: `Hi ${first},\n\n${note ? note + "\n\n" : ""}Your full delivery for ${b.title} is ready:\n${pageUrl}\n\n` +
        `— Jacob Schrader · jacobcschrader.com`,
      html: jcsEmail({
        eyebrow: "Media Delivery",
        headline,
        note: `Hi ${escHtml(first)} — ${note ? escHtml(note) + " " : ""}your full delivery is ready. Everything is on your page, always up to date.`,
        rows: [
          ["Client", b.client_name ? escHtml(b.client_name) : ""],
          ["Property", escHtml(b.title) + (b.location ? `<br><span style="color:#8a94a6;">${escHtml(b.location)}</span>` : "")],
          ["Included", included],
          ["Delivered", escHtml(sentAt)],
        ],
        cta: { label: "View Delivery", url: pageUrl },
        audience: "client",
      }),
    });

    // admin copy — like Visaro's "Delivery Sent" notification
    await sendEmail({
      from: SENDERS.admin,
      to: OWNER,
      subject: `${b.title} | Delivery Sent`,
      text: `Delivery sent to ${clientTo.join(", ")}${cc.length ? " (cc " + cc.join(", ") + ")" : ""}.\n${pageUrl}`,
      html: jcsEmail({
        eyebrow: "Delivery Sent",
        headline,
        note: `Notified ${escHtml(clientTo.join(", "))}${cc.length ? ` · cc ${escHtml(cc.join(", "))}` : ""} at ${escHtml(sentAt)}.`,
        rows: [
          ["Client", b.client_name ? escHtml(b.client_name) : ""],
          ["Property", escHtml(b.title)],
          ["Links", included],
          ["Sends", String((Number(b.delivery_sends) || 0) + 1)],
        ],
        cta: { label: "View Delivery", url: pageUrl },
        copyUrl: `https://www.jacobcschrader.com/admin#project/${b.id}`,
        audience: "admin",
      }),
    }).catch(() => { /* admin copy is best-effort */ });

    // advance stage if the project hasn't reached 'delivered' yet
    const preDelivered = ["upcoming", "editing", "revisions"].includes(b.status);
    const [updated] = await s`
      UPDATE bookings SET
        delivery_token = ${token},
        delivery_created_at = COALESCE(delivery_created_at, now()),
        delivery_feedback = '',
        delivery_sent_at = now(),
        delivery_sends = COALESCE(delivery_sends, 0) + 1,
        delivered_at = COALESCE(delivered_at, CURRENT_DATE),
        status = ${preDelivered ? "delivered" : b.status}
      WHERE id = ${id} RETURNING *`;

    res.status(200).json({ ok: true, booking: updated, pageUrl });
  } catch (e) {
    const msg = /DATABASE_URL/.test(String(e)) ? "db-not-configured"
      : /RESEND_API_KEY|Resend error/.test(String(e)) ? "send-failed" : "error";
    res.status(502).json({ error: msg });
  }
};
