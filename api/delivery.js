// =====================================================================
//  /api/delivery — public, token-gated, powers /delivery?t=…
//    GET  ?t=<token>                      → client-safe delivery data
//    POST { t, action, message? }         → client review:
//         action "approve" → stamps delivery_approved_at, emails Jacob
//         action "changes" → saves the note, moves the project back to
//                            Revisions, emails Jacob the request
//  Tokens are random, issued when the delivery is created in the admin.
// =====================================================================
const { db } = require("./_lib/db.js");
const { linksOf } = require("./_lib/links.js");
const { sendEmail, jcsEmail, SENDERS, OWNER } = require("./_lib/email.js");

const escHtml = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function fetchByToken(s, t) {
  const [b] = await s`
    SELECT bk.*, c.name AS client_name, c.portal_token AS client_portal_token
    FROM bookings bk LEFT JOIN clients c ON c.id = bk.client_id
    WHERE bk.delivery_token = ${t} LIMIT 1`;
  return b;
}

async function review(req, res) {
  const body = req.body || {};
  const t = String(body.t || "");
  const action = String(body.action || "");
  const message = String(body.message || "").trim().slice(0, 3000);
  if (!t || t.length < 10 || !["approve", "changes"].includes(action)) {
    res.status(400).json({ error: "invalid" }); return;
  }

  const s = await db();
  const b = await fetchByToken(s, t);
  if (!b) { res.status(404).json({ error: "not-found" }); return; }
  const first = (b.client_name || "").split(" ")[0] || "Your client";
  const adminUrl = `https://www.jacobcschrader.com/admin#project/${b.id}`;

  if (action === "approve") {
    const [row] = await s`
      UPDATE bookings SET delivery_approved_at = now()
      WHERE id = ${b.id} RETURNING delivery_approved_at`;
    await sendEmail({
      from: SENDERS.admin,
      to: OWNER,
      subject: `${b.title} | Delivery Approved`,
      text: `${b.client_name || "The client"} approved the delivery for ${b.title}.\n${adminUrl}`,
      html: jcsEmail({
        eyebrow: "Delivery Approved",
        headline: `${escHtml(b.client_name || "")}${b.client_name ? " · " : ""}${escHtml(b.title)}`,
        note: `${escHtml(first)} approved the delivery — no changes requested.`,
        rows: [
          ["Client", b.client_name ? escHtml(b.client_name) : ""],
          ["Property", escHtml(b.title)],
        ],
        cta: { label: "View Project", url: adminUrl },
        audience: "admin",
      }),
    }).catch(() => {});
    res.status(200).json({ ok: true, approved_at: row.delivery_approved_at });
    return;
  }

  // action === "changes"
  if (!message) { res.status(400).json({ error: "message-required" }); return; }
  const demote = ["delivered", "completed"].includes(b.status);
  await s`
    UPDATE bookings SET
      delivery_feedback = ${message},
      delivery_approved_at = NULL,
      status = ${demote ? "revisions" : b.status}
    WHERE id = ${b.id}`;
  await sendEmail({
    from: SENDERS.admin,
    to: OWNER,
    subject: `${b.title} | Changes Requested`,
    text: `${b.client_name || "The client"} requested changes on ${b.title}:\n\n${message}\n\n${adminUrl}`,
    html: jcsEmail({
      eyebrow: "Changes Requested",
      headline: `${escHtml(b.client_name || "")}${b.client_name ? " · " : ""}${escHtml(b.title)}`,
      note: `<span style="white-space:pre-line;">&ldquo;${escHtml(message)}&rdquo;</span>` +
        (demote ? `<br><br>The project was moved back to Revisions.` : ""),
      rows: [
        ["Client", b.client_name ? escHtml(b.client_name) : ""],
        ["Property", escHtml(b.title)],
      ],
      cta: { label: "View Project", url: adminUrl },
      audience: "admin",
    }),
  }).catch(() => {});
  res.status(200).json({ ok: true });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "POST") { await review(req, res); return; }

    const t = String((req.query || {}).t || "");
    if (!t || t.length < 10) { res.status(404).json({ error: "not-found" }); return; }

    const s = await db();
    const b = await fetchByToken(s, t);
    if (!b) { res.status(404).json({ error: "not-found" }); return; }

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      title: b.title,
      location: b.location || "",
      cover_url: (b.delivery_cover_url && b.delivery_cover_url !== "-") ? b.delivery_cover_url : "",
      deliverables: b.deliverables || "",
      links: linksOf(b),
      delivered_at: b.delivered_at || b.delivery_sent_at || null,
      approved_at: b.delivery_approved_at || null,
      client_first: (b.client_name || "").split(" ")[0] || "",
      portal_url: "/portal",
    });
  } catch (e) {
    res.status(500).json({ error: "error" });
  }
};
