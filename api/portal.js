// =====================================================================
//  /api/portal — the client portal (dashboard). Cookie-authenticated:
//    POST { email }        → magic-link sign-in: if the email is on a
//         client profile (primary or co-recipient), a sign-in link is
//         emailed to it. Always responds ok — never reveals whether an
//         email exists.
//    GET  ?login=<token>   → verifies the signed sign-in token, sets a
//         secure HttpOnly session cookie (30 days), redirects to
//         /portal (carrying &p=<project> through if present).
//    GET  ?logout=1        → clears the cookie, redirects to /portal.
//    GET                   → portal data for the signed-in client only
//         (client-safe fields; pricing only where an invoice was sent).
//
//  A bare /portal URL shows nothing but the sign-in form — possession
//  of a URL is never enough; access requires a link sent to an email
//  on the client's profile. Sign-in links and sessions are HMAC-signed
//  with SESSION_SECRET (same secret as the admin, different prefix).
// =====================================================================
const crypto = require("node:crypto");
const { db } = require("./_lib/db.js");
const { ymd } = require("./_lib/ics.js");
const { linksOf } = require("./_lib/links.js");
const { ensureSlug } = require("./_lib/delivery.js");
const { sendEmail, jcsEmail, SENDERS } = require("./_lib/email.js");
const { COOKIE, DAY, makeToken, verifyToken, readCookie, loginUrl } = require("./_lib/portal-auth.js");
const adminAuth = require("./_lib/auth.js");

// Client-facing pipeline, derived — the project moves on its own:
//   Upcoming → In production (shoot date) → Delivered (email sent,
//   Unpaid) → Completed (invoice paid)
function stageOf(b) {
  if (b.status === "paid") return "Completed";
  if (b.delivery_sent_at || ["delivered", "completed"].includes(b.status)) return "Delivered";
  if (["editing", "revisions"].includes(b.status)) return "In production";
  const todayLA = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  if (b.shoot_date && ymd(b.shoot_date) <= todayLA) return "In production";
  return "Upcoming";
}

async function magicLink(req, res) {
  const body = req.body || {};
  if (body.company) { res.status(200).json({ ok: true }); return; }   // honeypot
  const email = String(body.email || "").trim().toLowerCase();
  const done = () => res.status(200).json({ ok: true });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { done(); return; }

  const s = await db();
  const rows = await s`
    SELECT * FROM clients
    WHERE lower(email) = ${email} OR extra_emails ILIKE ${"%" + email + "%"}
    LIMIT 5`;
  const c = rows.find((r) => {
    if (String(r.email || "").toLowerCase() === email) return true;
    try { return JSON.parse(r.extra_emails || "[]").some((e) => String(e).toLowerCase() === email); }
    catch (e) { return false; }
  });
  if (!c) { done(); return; }

  const url = loginUrl(c.id);
  const first = (c.name || "").split(" ")[0] || "there";

  await sendEmail({
    from: SENDERS.enquiry,
    to: email,
    subject: "Your Client Portal | Jacob Schrader",
    text: `Hi ${first},\n\nSign in to your portal — projects, deliveries, and invoices:\n${url}\n\n` +
      `This link signs you in on this device and is valid for 30 days.\n\n— Jacob Schrader · jacobcschrader.com`,
    html: jcsEmail({
      eyebrow: "Client Portal",
      headline: "Your projects, one place.",
      note: `Hi ${first.replace(/[<>&]/g, "")} — sign in to your private portal: every project, delivery, and invoice, always current. ` +
        "This link signs you in on this device; request a fresh one anytime.",
      cta: { label: "Open Your Portal", url },
      audience: "client",
    }),
  });
  done();
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "POST") { await magicLink(req, res); return; }

    const q = req.query || {};

    // ---- sign in via emailed link → session cookie + redirect --------
    if (q.login) {
      const cid = verifyToken(q.login, "portal-login");
      // expired / tampered link → the portal shows its branded "link
      // expired" block above the sign-in form (portal.html reads ?expired)
      if (!cid) { res.statusCode = 302; res.setHeader("Location", "/portal?expired=1"); res.end(); return; }
      const session = makeToken(cid, "portal-session", 30 * DAY);
      res.setHeader("Set-Cookie",
        `${COOKIE}=${session}; Max-Age=${30 * DAY}; Path=/; HttpOnly; Secure; SameSite=Lax`);
      // land on the listing itself when the link came from a delivery
      // email (?p=<project id>) — the slug is looked up server-side
      let dest = "/portal";
      const pid = parseInt(q.p, 10);
      if (pid) {
        try {
          const s0 = await db();
          const [row] = await s0`SELECT delivery_slug FROM bookings WHERE id = ${pid} AND client_id = ${cid} LIMIT 1`;
          if (row && row.delivery_slug) dest = "/portal/" + row.delivery_slug;
        } catch (e) { /* fall back to the dashboard */ }
      }
      res.statusCode = 302;
      res.setHeader("Location", dest);
      res.end();
      return;
    }

    // ---- sign out -----------------------------------------------------
    if (q.logout) {
      res.setHeader("Set-Cookie", `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`);
      res.statusCode = 302;
      res.setHeader("Location", "/portal");
      res.end();
      return;
    }

    // ---- portal data: signed-in client only ---------------------------
    const cid = verifyToken(readCookie(req), "portal-session");
    if (!cid) { res.status(401).json({ error: "unauthorized" }); return; }

    const s = await db();
    const [c] = await s`SELECT id, name, email FROM clients WHERE id = ${cid} LIMIT 1`;
    if (!c) { res.status(401).json({ error: "unauthorized" }); return; }

    // Applications still in review — shown in the portal so a client who
    // just applied lands on something real, not an empty dashboard. An
    // accepted request whose project is proposal-gated ('pending') and
    // whose proposal hasn't been SENT yet still reads as "in review" —
    // the client should never see a blank gap mid-handoff.
    const pendingRows = c.email ? await s`
      SELECT r.title, r.city, r.state, r.services, r.created_at FROM requests r
      WHERE lower(r.email) = ${String(c.email).toLowerCase()} AND (
        r.status = 'pending'
        OR (r.status = 'accepted' AND EXISTS (
          SELECT 1 FROM bookings bk WHERE bk.id = r.project_id AND bk.status = 'pending'
            AND NOT EXISTS (SELECT 1 FROM proposals p WHERE p.booking_id = bk.id AND p.status = 'sent')
        ))
      )
      ORDER BY r.created_at DESC` : [];

    const rows = await s`
      SELECT bk.*,
        (SELECT count(*)::int FROM delivery_files f WHERE f.booking_id = bk.id) AS files_count,
        (SELECT f.thumb_url FROM delivery_files f WHERE f.booking_id = bk.id AND f.kind = 'photo'
           AND (f.web_url = bk.delivery_cover_url OR f.url = bk.delivery_cover_url) LIMIT 1) AS cover_thumb,
        (SELECT f.thumb_url FROM delivery_files f WHERE f.booking_id = bk.id AND f.kind = 'photo'
           ORDER BY f.sort_order ASC, f.id ASC LIMIT 1) AS first_thumb
      FROM bookings bk
      WHERE bk.client_id = ${c.id} AND bk.status NOT IN ('canceled', 'pending')
      ORDER BY bk.shoot_date DESC NULLS LAST, bk.id DESC`;
    // portal slugs are lazy — make sure every card has a link
    for (const r of rows) if (!r.delivery_slug) await ensureSlug(s, r);

    // Proposal-gated projects (status 'pending'): not in the pipeline
    // yet — surfaced as "your proposal is ready" once the proposal has
    // actually been SENT (drafts stay invisible).
    const awaiting = await s`
      SELECT p.title, p.location, p.slug, p.sent_at
      FROM bookings bk JOIN proposals p ON p.booking_id = bk.id
      WHERE bk.client_id = ${c.id} AND bk.status = 'pending'
        AND p.status = 'sent'
      ORDER BY p.sent_at DESC NULLS LAST`;

    let outstanding = 0;
    const projects = rows.map((b) => {
      const total = (Number(b.price) || 0) + (Number(b.travel_fee) || 0) - (Number(b.discount_value) || 0);
      const invoiced = !!(b.invoice_token && b.invoice_sent_at);
      const paid = b.status === "paid";
      if (invoiced && !paid) outstanding += total;
      const cover = (b.delivery_cover_url && b.delivery_cover_url !== "-") ? b.delivery_cover_url : "";
      return {
        id: b.id,
        slug: b.delivery_slug || "",
        title: b.title,
        location: b.location || "",
        shoot_date: b.shoot_date || null,
        service: b.type || "",
        files: Number(b.files_count) || 0,
        // card cover: the chosen cover's thumb, else the first photo's
        // thumb, else the full cover URL (legacy Pixieset/portfolio covers)
        cover: b.cover_thumb || b.first_thumb || cover || null,
        // "Ready" = there's media on the listing page (delivered)
        ready: !!(b.delivery_sent_at || Number(b.files_count)),
        locked: !!b.downloads_locked,
        stage: stageOf(b),
        delivery: b.delivery_sent_at
          ? { token: b.delivery_token, links: linksOf(b), delivered_at: b.delivered_at || null }
          : null,
        invoice: invoiced
          ? { token: b.invoice_token, number: "JCS-" + String(b.id).padStart(4, "0"), total, paid }
          : null,
      };
    });

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      client_first: (c.name || "").split(" ")[0] || "",
      client_name: c.name || "",
      client_email: c.email || "",
      // Jacob signed in as a client while also holding an admin session
      // gets an "Admin →" shortcut (same as the reference portal)
      is_admin: adminAuth.verifySessionToken(adminAuth.readCookie(req)),
      pending: pendingRows.map((r) => ({
        title: r.title,
        location: [r.city, r.state].filter(Boolean).join(", "),
        services: r.services || "",
        created_at: r.created_at,
      })),
      awaiting: awaiting.map((p) => ({
        title: p.title,
        location: p.location || "",
        url: "https://proposal.jacobcschrader.com/" + p.slug,
        sent_at: p.sent_at,
      })),
      stats: {
        upcoming: projects.filter((p) => p.stage === "Upcoming").length,
        production: projects.filter((p) => p.stage === "In production").length,
        delivered: projects.filter((p) => p.stage === "Delivered" || p.stage === "Completed").length,
        outstanding,
      },
      projects,
    });
  } catch (e) {
    res.status(500).json({ error: "error" });
  }
};
