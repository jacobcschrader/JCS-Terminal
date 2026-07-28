// =====================================================================
//  POST /api/book — public "work with me" application (from /book).
//  1. Stores the request (status: pending) for the admin Requests inbox.
//  2. Emails Jacob a branded "New application".
//  3. Emails the applicant a branded "Application received".
// =====================================================================
const { db } = require("./_lib/db.js");
const { sendEmail, jcsEmail, SENDERS, OWNER } = require("./_lib/email.js");

const field = (v, max = 300) => String(v == null ? "" : v).trim().slice(0, max);
const escHtml = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "method-not-allowed" }); return; }

  const b = req.body || {};
  // Honeypot: bots fill it, humans never see it.
  if (field(b._honey, 10)) { res.status(200).json({ ok: true }); return; }

  const f = {
    name: field(b.name, 200),
    email: field(b.email, 200),
    phone: field(b.phone, 60),
    brokerage: field(b.brokerage, 200),
    title: field(b.address, 300),
    city: field(b.city, 120),
    state: field(b.state, 10),
    zip: field(b.zip, 12),
    sqft: b.sqft ? parseInt(b.sqft, 10) || null : null,
    target_date: field(b.target_date, 10) || null,
    services: field(b.services, 1000),
    message: field(b.message, 5000),
    // Booking-wizard extras (all optional so the old payload still works).
    launch_date: field(b.launch_date, 10) || null,
    addons: field(b.addons, 1000),
    estimated_total: b.estimated_total != null && b.estimated_total !== ""
      ? Number(b.estimated_total) || null : null,
    details: field(b.details, 3000),
    signature: field(b.signature, 200),
  };
  if (!f.name || !f.title || !f.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) {
    res.status(400).json({ error: "missing-fields" });
    return;
  }

  try {
    const s = await db();
    const [row] = await s`
      INSERT INTO requests (name, email, phone, brokerage, title, city, state, zip, sqft, target_date, services, message,
                            launch_date, addons, estimated_total, details, signature, signed_at)
      VALUES (${f.name}, ${f.email}, ${f.phone}, ${f.brokerage}, ${f.title}, ${f.city}, ${f.state}, ${f.zip}, ${f.sqft}, ${f.target_date}, ${f.services}, ${f.message},
              ${f.launch_date}, ${f.addons}, ${f.estimated_total}, ${f.details}, ${f.signature}, ${f.signature ? new Date() : null})
      RETURNING id`;

    const loc = [f.city, [f.state, f.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    // Property-details JSON → readable "Label · value" lines for email.
    let detailLines = "";
    try {
      const d = JSON.parse(f.details || "{}");
      const L = { status: "Status", listing_type: "Listing", faces: "Front faces",
                  view_home: "View home", access: "Access", homeowner_home: "Homeowner home" };
      detailLines = Object.keys(L).filter((k) => d[k])
        .map((k) => `${L[k]}: ${escHtml(d[k])}`).join("<br>");
    } catch (e) { /* optional */ }
    const rows = [
      ["Client", escHtml(f.name)],
      ["Email", `<a href="mailto:${escHtml(f.email)}" style="color:#33507e;">${escHtml(f.email)}</a>`],
      ["Phone", f.phone ? escHtml(f.phone) : ""],
      ["Brokerage", f.brokerage ? escHtml(f.brokerage) : ""],
      ["Property", escHtml(f.title) + (loc ? `<br><span style="color:#8a94a6;">${escHtml(loc)}</span>` : "")],
      ["Sqft", f.sqft ? Number(f.sqft).toLocaleString() : ""],
      ["Services", f.services ? escHtml(f.services) : ""],
      ["Add-ons", f.addons ? escHtml(f.addons) : ""],
      ["Est. total", f.estimated_total ? "$" + Number(f.estimated_total).toLocaleString() : ""],
      ["Shoot date", f.target_date ? escHtml(f.target_date) : ""],
      ["Launch date", f.launch_date ? escHtml(f.launch_date) : ""],
      ["Details", detailLines],
      ["Signed", f.signature ? escHtml(f.signature) : ""],
    ];

    // ---- to Jacob -----------------------------------------------------
    await sendEmail({
      from: SENDERS.admin,
      to: OWNER,
      replyTo: f.email,
      subject: `${f.title} | New Application`,
      text: `New application from ${f.name} (${f.email}) for ${f.title}.\n\n${f.message}`,
      html: jcsEmail({
        eyebrow: "New Application",
        headline: escHtml(f.title) + (loc ? `, ${escHtml(loc)}` : ""),
        note: f.message
          ? `<span style="white-space:pre-line;">&ldquo;${escHtml(f.message)}&rdquo;</span>`
          : "",
        rows,
        cta: { label: "Review in Admin", url: "https://www.jacobcschrader.com/admin#requests" },
        audience: "admin",
      }),
    });

    // ---- to applicant (best effort) ------------------------------------
    try {
      await sendEmail({
        from: SENDERS.enquiry,
        to: f.email,
        replyTo: OWNER,
        subject: `${f.title} | Application Received`,
        text: `Hi ${f.name},\n\nThank you — your application for ${f.title} has been received. ` +
          "I review every request personally and will reply within 24 hours.\n\n" +
          "Once your shoot is confirmed, everything lives in your client portal: https://www.jacobcschrader.com/portal\n\n" +
          "— Jacob Schrader · jacobcschrader.com",
        html: jcsEmail({
          eyebrow: "Application Received",
          headline: "Thank you — I have your request.",
          note: `Hi ${escHtml(f.name)} — your application for <b>${escHtml(f.title)}</b> has been received. ` +
            "I review every request personally and will reply within 24&nbsp;hours with availability and a custom quote.",
          rows: [
            ["Property", escHtml(f.title) + (loc ? `<br><span style="color:#8a94a6;">${escHtml(loc)}</span>` : "")],
            ["Services", f.services ? escHtml(f.services) : ""],
            ["Add-ons", f.addons ? escHtml(f.addons) : ""],
            ["Est. total", f.estimated_total ? "$" + Number(f.estimated_total).toLocaleString() : ""],
            ["Shoot date", f.target_date ? escHtml(f.target_date) : ""],
            ["Launch date", f.launch_date ? escHtml(f.launch_date) : ""],
          ],
          cta: { label: "Go to Your Portal", url: "https://www.jacobcschrader.com/portal" },
          audience: "client",
        }),
      });
    } catch (e) { /* applicant email is best-effort */ }

    res.status(200).json({ ok: true, id: row.id });
  } catch (e) {
    const msg = /DATABASE_URL/.test(String(e)) ? "db-not-configured"
      : /RESEND_API_KEY|Resend error/.test(String(e)) ? "send-failed" : "error";
    res.status(502).json({ error: msg });
  }
};
