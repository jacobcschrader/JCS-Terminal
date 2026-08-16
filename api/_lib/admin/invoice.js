// =====================================================================
//  POST /api/admin/invoice { id, send? } — generate / send an invoice:
//    - Issues invoice_token (powers the public /invoice?t=… page).
//    - send:true additionally emails the invoice to every address on
//      the client profile and stamps invoice_sent_at / invoice_sends.
//  Invoice numbers derive from the booking id: JCS-0007.
// =====================================================================
const crypto = require("node:crypto");
const { requireAuth } = require("../auth.js");
const { db } = require("../db.js");
const { recipientsOf } = require("../links.js");
const { sendEmail, jcsEmail, SENDERS, OWNER } = require("../email.js");
const { logEvent } = require("../events.js");
const { loadTemplates, tpl } = require("../templates.js");

const escHtml = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const invoiceNumber = (id) => "JCS-" + String(id).padStart(4, "0");
const money = (n) => "$" + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== "POST") { res.status(405).json({ error: "method-not-allowed" }); return; }

  try {
    const s = await db();
    const body = req.body || {};
    const id = parseInt(body.id, 10);
    if (!id) { res.status(400).json({ error: "invalid" }); return; }

    const [b] = await s`
      SELECT bk.*, c.name AS client_name, c.email AS client_email,
             c.extra_emails AS client_extra_emails, c.brokerage AS client_brokerage
      FROM bookings bk LEFT JOIN clients c ON c.id = bk.client_id
      WHERE bk.id = ${id}`;
    if (!b) { res.status(404).json({ error: "not-found" }); return; }
    if (b.price == null) { res.status(400).json({ error: "no-price" }); return; }

    const token = b.invoice_token || crypto.randomBytes(12).toString("base64url");
    const pageUrl = `https://www.jacobcschrader.com/invoice?t=${token}`;
    const number = invoiceNumber(b.id);
    const total = Number(b.price) + (Number(b.travel_fee) || 0) - (Number(b.discount_value) || 0);

    if (!body.send) {
      const [updated] = await s`
        UPDATE bookings SET invoice_token = ${token} WHERE id = ${id} RETURNING *`;
      res.status(200).json({ ok: true, booking: updated, pageUrl, number });
      return;
    }

    // ---- send: email the invoice to the whole client profile ---------
    const clientTo = recipientsOf(b.client_email, b.client_extra_emails);
    if (!clientTo.length) { res.status(400).json({ error: "no-client-email" }); return; }
    const first = (b.client_name || "").split(" ")[0] || "there";

    const T = tpl(await loadTemplates(s), "invoice", { first, name: b.client_name || "", property: b.title, location: b.location || "", number, total: money(total) });
    await sendEmail({
      from: SENDERS.billing,
      to: clientTo,
      replyTo: OWNER,
      subject: T.subject,
      text: `Hi ${first},\n\nInvoice ${number} for ${b.title} — total ${money(total)}.\n` +
        `View it here: ${pageUrl}\n\nQuestions? Just reply to this email.\n\n` +
        `— Jacob Schrader · jacobcschrader.com`,
      html: jcsEmail({
        eyebrow: `Invoice ${number}`,
        headline: `${escHtml(b.client_name || "")}${b.client_name ? " · " : ""}${escHtml(b.title)}`,
        note: T.note,
        rows: [
          ["Invoice", escHtml(number)],
          ["Property", escHtml(b.title) + (b.location ? `<br><span style="color:#8a94a6;">${escHtml(b.location)}</span>` : "")],
          ["Service", b.type ? escHtml(b.type) : ""],
          ["Status", b.status === "paid" ? "Paid — thank you" : "Due"],
          ["Total", escHtml(money(total))],
        ],
        cta: { label: "View Invoice", url: pageUrl },
        audience: "client",
      }),
    });

    const [updated] = await s`
      UPDATE bookings SET
        invoice_token = ${token},
        invoice_sent_at = now(),
        invoice_sends = COALESCE(invoice_sends, 0) + 1
      WHERE id = ${id} RETURNING *`;

    await logEvent(s, id, "invoice", (b.invoice_sent_at ? "Invoice re-sent" : "Invoice " + number + " sent") + " · " + money(total), "admin");
    res.status(200).json({ ok: true, booking: updated, pageUrl, number, sentTo: clientTo });
  } catch (e) {
    const msg = /DATABASE_URL/.test(String(e)) ? "db-not-configured"
      : /RESEND_API_KEY|Resend error/.test(String(e)) ? "send-failed" : "error";
    res.status(502).json({ error: msg });
  }
};
