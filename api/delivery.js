// =====================================================================
//  /api/delivery — powers the client listing page (/portal/<slug>).
//    GET  ?slug=<slug>            → listing data for the signed-in client
//                                   (portal session cookie) or for Jacob
//                                   (admin session — "preview as client")
//    GET  ?t=<delivery token>     → the same via the share-preview link
//                                   (no sign-in; downloads still logged)
//    POST { slug|t, action, … }   → 'download' logs activity
//                                   { kind: file|full|mls|selected, file_id?, label? }
//                                   'approve' / 'changes' = client review
//  Access rules: a signed-in client only ever sees their own listings;
//  a share link is possession-based (Jacob hands it out on purpose).
// =====================================================================
const { db } = require("./_lib/db.js");
const { linksOf } = require("./_lib/links.js");
const { filesOf, publicFile, summarize, logDownload } = require("./_lib/delivery.js");
const { sendEmail, jcsEmail, SENDERS, OWNER } = require("./_lib/email.js");
const portalAuth = require("./_lib/portal-auth.js");
const { logEvent } = require("./_lib/events.js");
const adminAuth = require("./_lib/auth.js");

const escHtml = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function loadListing(s, req, params) {
  const t = String(params.t || "");
  const slug = String(params.slug || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 80);
  const cid = portalAuth.verifyToken(portalAuth.readCookie(req), "portal-session");
  const isAdmin = adminAuth.verifySessionToken(adminAuth.readCookie(req));

  let b = null, via = "";
  if (t && t.length >= 10) {
    [b] = await s`
      SELECT bk.*, c.name AS client_name, c.email AS client_email, c.brokerage AS client_brokerage
      FROM bookings bk LEFT JOIN clients c ON c.id = bk.client_id
      WHERE bk.delivery_token = ${t} LIMIT 1`;
    via = "share";
  } else if (slug) {
    [b] = await s`
      SELECT bk.*, c.name AS client_name, c.email AS client_email, c.brokerage AS client_brokerage
      FROM bookings bk LEFT JOIN clients c ON c.id = bk.client_id
      WHERE bk.delivery_slug = ${slug} LIMIT 1`;
    if (b) {
      // a signed-in client who owns the listing counts as the client even
      // when Jacob is also holding an admin session (his own test runs
      // should show up in the activity feed like any client's)
      if (cid && b.client_id === cid) via = "client";
      else if (isAdmin) via = "admin";
      else b = null;
    }
  }
  if (!b) return { b: null, status: (cid || isAdmin || t) ? 404 : 401 };
  // the downloader's identity for the activity feed
  let email = "";
  if (via === "client") {
    const [c] = await s`SELECT email FROM clients WHERE id = ${cid}`;
    email = (c && c.email) || "";
  } else if (via === "admin") email = "admin";
  else email = (b.client_email ? b.client_email + " (share link)" : "share link");
  return { b, via, email, isAdmin, status: 200 };
}

async function review(s, req, res, ctx, body) {
  const b = ctx.b;
  const action = String(body.action || "");
  const message = String(body.message || "").trim().slice(0, 3000);
  const first = (b.client_name || "").split(" ")[0] || "Your client";
  const adminUrl = `https://www.jacobcschrader.com/admin#project/${b.id}`;

  if (action === "approve") {
    const [row] = await s`UPDATE bookings SET delivery_approved_at = now() WHERE id = ${b.id} RETURNING delivery_approved_at`;
    await sendEmail({
      from: SENDERS.admin, to: OWNER,
      subject: `${b.title} | Delivery Approved`,
      text: `${b.client_name || "The client"} approved the delivery for ${b.title}.\n${adminUrl}`,
      html: jcsEmail({
        eyebrow: "Delivery Approved",
        headline: `${escHtml(b.client_name || "")}${b.client_name ? " · " : ""}${escHtml(b.title)}`,
        note: `${escHtml(first)} approved the delivery — no changes requested.`,
        rows: [["Client", escHtml(b.client_name || "")], ["Property", escHtml(b.title)]],
        cta: { label: "View Project", url: adminUrl }, audience: "admin",
      }),
    }).catch(() => {});
    await logEvent(s, b.id, "approved", "Client approved the delivery", "client");
    res.status(200).json({ ok: true, approved_at: row.delivery_approved_at });
    return;
  }
  if (!message) { res.status(400).json({ error: "message-required" }); return; }
  const demote = ["delivered", "completed"].includes(b.status);
  await s`
    UPDATE bookings SET delivery_feedback = ${message}, delivery_approved_at = NULL,
      status = ${demote ? "revisions" : b.status} WHERE id = ${b.id}`;
  await sendEmail({
    from: SENDERS.admin, to: OWNER,
    subject: `${b.title} | Changes Requested`,
    text: `${b.client_name || "The client"} requested changes on ${b.title}:\n\n${message}\n\n${adminUrl}`,
    html: jcsEmail({
      eyebrow: "Changes Requested",
      headline: `${escHtml(b.client_name || "")}${b.client_name ? " · " : ""}${escHtml(b.title)}`,
      note: `<span style="white-space:pre-line;">&ldquo;${escHtml(message)}&rdquo;</span>` +
        (demote ? `<br><br>The project was moved back to Revisions.` : ""),
      rows: [["Client", escHtml(b.client_name || "")], ["Property", escHtml(b.title)]],
      cta: { label: "View Project", url: adminUrl }, audience: "admin",
    }),
  }).catch(() => {});
  await logEvent(s, b.id, "changes", "Client requested changes", "client", message);
  res.status(200).json({ ok: true });
}

module.exports = async function handler(req, res) {
  try {
    const s = await db();
    const isPost = req.method === "POST";
    const params = isPost ? (req.body || {}) : (req.query || {});
    const ctx = await loadListing(s, req, params);
    if (!ctx.b) { res.status(ctx.status).json({ error: ctx.status === 401 ? "unauthorized" : "not-found" }); return; }
    const b = ctx.b;

    if (isPost) {
      const body = req.body || {};
      const action = String(body.action || "");
      if (action === "approve" || action === "changes") { await review(s, req, res, ctx, body); return; }
      if (action === "testimonial") {
        const quote = String(body.quote || "").trim().slice(0, 600);
        if (quote.length < 8) { res.status(400).json({ error: "too-short" }); return; }
        const [dup] = await s`SELECT id FROM testimonials WHERE booking_id = ${b.id} LIMIT 1`;
        if (dup) { res.status(200).json({ ok: true }); return; }
        await s`INSERT INTO testimonials (booking_id, client_name, brokerage, quote)
                VALUES (${b.id}, ${b.client_name || ""}, ${b.client_brokerage || ""}, ${quote})`;
        await logEvent(s, b.id, "testimonial", "Client left a testimonial", "client", quote);
        await sendEmail({
          from: SENDERS.admin, to: OWNER,
          subject: `${b.title} | New Testimonial`,
          text: `${b.client_name || "The client"} left a testimonial on ${b.title}:\n\n"${quote}"\n\nApprove it in the admin (Portfolio → Testimonials) to show it on the site.`,
          html: jcsEmail({
            eyebrow: "New Testimonial",
            headline: `${escHtml(b.client_name || "")}${b.client_name ? " · " : ""}${escHtml(b.title)}`,
            note: `<span style="white-space:pre-line;">&ldquo;${escHtml(quote)}&rdquo;</span>`,
            rows: [["Client", escHtml(b.client_name || "")], ["Brokerage", escHtml(b.client_brokerage || "")]],
            cta: { label: "Review in Admin", url: "https://www.jacobcschrader.com/admin#portfolio" }, audience: "admin",
          }),
        }).catch(() => {});
        res.status(200).json({ ok: true });
        return;
      }
      if (action === "download") {
        const locked = !!b.downloads_locked && ctx.via !== "admin";
        if (locked) { res.status(423).json({ error: "locked" }); return; }
        const kind = ["file", "full", "mls", "selected"].includes(body.kind) ? body.kind : "file";
        const fid = parseInt(body.file_id, 10) || null;
        let label = String(body.label || "").slice(0, 200);
        if (kind === "full") label = "Full-res bundle (all photos)";
        else if (kind === "mls") label = "MLS bundle (all photos, 2048px)";
        else if (kind === "file" && fid) {
          const [f] = await s`SELECT name FROM delivery_files WHERE id = ${fid} AND booking_id = ${b.id}`;
          if (f) label = f.name;
        }
        if (ctx.via !== "admin") await logDownload(s, req, { booking_id: b.id, file_id: fid, kind, label, email: ctx.email });
        res.status(200).json({ ok: true });
        return;
      }
      res.status(400).json({ error: "invalid" });
      return;
    }

    // ---- GET: listing data --------------------------------------------
    const files = await filesOf(s, b.id);
    const locked = !!b.downloads_locked && ctx.via !== "admin";
    const total = (Number(b.price) || 0) + (Number(b.travel_fee) || 0) - (Number(b.discount_value) || 0);
    const invoiced = !!(b.invoice_token && b.invoice_sent_at);
    const [tst] = await s`SELECT id FROM testimonials WHERE booking_id = ${b.id} LIMIT 1`;
    if (ctx.via === "client") {
      // a portal view shows in the activity feed as "—" (never a download);
      // one row per client per 6 hours so reloads don't pile up
      try {
        const [recent] = await s`
          SELECT 1 FROM download_events WHERE booking_id = ${b.id} AND kind = 'view'
            AND email = ${ctx.email} AND created_at > now() - interval '6 hours' LIMIT 1`;
        if (!recent) await logDownload(s, req, { booking_id: b.id, kind: "view", label: "", email: ctx.email });
      } catch (e) { /* cosmetic */ }
    }
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      id: b.id,
      slug: b.delivery_slug || "",
      title: b.title,
      location: b.location || "",
      client_name: b.client_name || "",
      client_brokerage: b.client_brokerage || "",
      client_first: (b.client_name || "").split(" ")[0] || "",
      cover_url: (b.delivery_cover_url && b.delivery_cover_url !== "-") ? b.delivery_cover_url : "",
      delivered_at: b.delivered_at || b.delivery_sent_at || null,
      shoot_date: b.shoot_date || null,
      approved_at: b.delivery_approved_at || null,
      has_testimonial: !!tst,
      deliverables: b.deliverables || "",
      links: linksOf(b),
      files: files.map((f) => publicFile(f, locked)),
      summary: summarize(files),
      locked,
      locked_by_admin: !!b.downloads_locked,
      paid: b.status === "paid",
      invoice: invoiced ? { number: "JCS-" + String(b.id).padStart(4, "0"), total, paid: b.status === "paid", url: "/invoice?t=" + b.invoice_token } : null,
      share_url: (ctx.via !== "share" && b.delivery_token) ? `https://www.jacobcschrader.com/portal/${b.delivery_slug}?t=${b.delivery_token}` : "",
      via: ctx.via,
      portal_url: "/portal",
    });
  } catch (e) {
    res.status(500).json({ error: "error" });
  }
};
