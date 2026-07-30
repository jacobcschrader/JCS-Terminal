// =====================================================================
//  /api/admin/proposals — client proposals (auth required)
//    GET               → { proposals: [...] } newest first
//    POST {title,...}  → create (slug auto-generated from title)
//    POST {id, action:"send"} → email the client the proposal link,
//                        stamp sent_at, status draft→sent
//    PUT  {id, ...}    → update fields / items / slug
//    DELETE {id}       → remove
//  Public page: /proposals/<slug> (and proposal.jacobcschrader.com/<slug>).
// =====================================================================
const { requireAuth } = require("../auth.js");
const { db } = require("../db.js");
const { sendEmail, jcsEmail, SENDERS, OWNER } = require("../email.js");

const field = (v, max = 300) => String(v == null ? "" : v).trim().slice(0, max);
const escHtml = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// "465 Headwaters Way" → "465headwatersway" (same convention as projects).
const slugify = (v) =>
  String(v || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "").slice(0, 80);

// items arrive as an array of { group, name, desc, price, badge } — keep
// only known keys, coerce price to number-or-blank ("" renders Included).
function cleanItems(raw) {
  let arr = raw;
  if (typeof raw === "string") { try { arr = JSON.parse(raw); } catch (e) { arr = []; } }
  if (!Array.isArray(arr)) arr = [];
  return JSON.stringify(arr.slice(0, 40).map((it) => ({
    group: field(it.group, 60),
    name: field(it.name, 160),
    desc: field(it.desc, 500),
    price: it.price === "" || it.price == null ? "" : (Number(it.price) || 0),
    badge: field(it.badge, 40),
  })).filter((it) => it.name));
}

async function uniqueSlug(s, base, ownId) {
  let slug = slugify(base) || "proposal";
  for (let i = 0; i < 20; i++) {
    const candidate = i ? `${slug}-${i + 1}` : slug;
    const [hit] = await s`SELECT id FROM proposals WHERE slug = ${candidate} LIMIT 1`;
    if (!hit || (ownId && hit.id === ownId)) return candidate;
  }
  return `${slug}-${Date.now().toString(36)}`;
}

// Canonical share link — every proposal lives at the subdomain
// (middleware rewrites proposal.jacobcschrader.com/<slug> → /proposal).
const PUBLIC_URL = (slug) => `https://proposal.jacobcschrader.com/${slug}`;

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  try {
    const s = await db();
    const b = req.body || {};

    if (req.method === "GET") {
      const rows = await s`SELECT * FROM proposals ORDER BY created_at DESC`;
      res.status(200).json({ proposals: rows });
      return;
    }

    if (req.method === "DELETE") {
      const id = parseInt(b.id, 10);
      if (!id) { res.status(400).json({ error: "invalid" }); return; }
      await s`DELETE FROM proposals WHERE id = ${id}`;
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === "PUT") {
      const id = parseInt(b.id, 10);
      const [p] = await s`SELECT * FROM proposals WHERE id = ${id}`;
      if (!p) { res.status(404).json({ error: "not-found" }); return; }
      const title = field(b.title) || p.title;
      let slug = p.slug;
      if (b.slug != null && slugify(b.slug) && slugify(b.slug) !== p.slug) {
        slug = await uniqueSlug(s, b.slug, p.id);
      }
      const [row] = await s`
        UPDATE proposals SET
          title = ${title},
          slug = ${slug},
          location = ${b.location != null ? field(b.location, 160) : p.location},
          client_name = ${b.client_name != null ? field(b.client_name, 160) : p.client_name},
          client_email = ${b.client_email != null ? field(b.client_email, 200) : p.client_email},
          intro = ${b.intro != null ? field(b.intro, 600) : p.intro},
          note = ${b.note != null ? field(b.note, 600) : p.note},
          items = ${b.items != null ? cleanItems(b.items) : p.items},
          updated_at = now()
        WHERE id = ${id} RETURNING *`;
      res.status(200).json({ ok: true, proposal: row });
      return;
    }

    if (req.method !== "POST") { res.status(405).json({ error: "method-not-allowed" }); return; }

    // ---- POST {id, action:"send"} --------------------------------------
    if (b.action === "send") {
      const id = parseInt(b.id, 10);
      const [p] = await s`SELECT * FROM proposals WHERE id = ${id}`;
      if (!p) { res.status(404).json({ error: "not-found" }); return; }
      const to = field(b.email, 200) || p.client_email;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { res.status(400).json({ error: "no-client-email" }); return; }

      let total = 0;
      try { JSON.parse(p.items || "[]").forEach((it) => { if (typeof it.price === "number") total += it.price; }); } catch (e) {}
      const first = (p.client_name || "").split(" ")[0];
      const url = PUBLIC_URL(p.slug);

      await sendEmail({
        from: SENDERS.enquiry,
        to,
        replyTo: OWNER,
        subject: `${p.title} | Project Proposal`,
        text: `Hi ${first || "there"},\n\nYour proposal for ${p.title} is ready:\n${url}\n\n— Jacob Schrader · jacobcschrader.com`,
        html: jcsEmail({
          eyebrow: "Project Proposal",
          headline: escHtml(p.title),
          note: `Hi ${escHtml(first || "there")} — your bespoke proposal for <b>${escHtml(p.title)}</b> is ready. ` +
            "Review the scope below, and reserve the dates when you're ready.",
          rows: [
            ["Property", escHtml(p.title) + (p.location ? `<br><span style="color:#8a94a6;">${escHtml(p.location)}</span>` : "")],
            ["Campaign", total ? "$" + total.toLocaleString() : "Custom"],
          ],
          cta: { label: "View Your Proposal", url },
          audience: "client",
        }),
      });

      const [row] = await s`
        UPDATE proposals SET
          sent_at = now(),
          sends = COALESCE(sends, 0) + 1,
          status = ${p.status === "accepted" ? "accepted" : "sent"},
          client_email = ${to},
          updated_at = now()
        WHERE id = ${id} RETURNING *`;
      res.status(200).json({ ok: true, proposal: row });
      return;
    }

    // ---- POST create ----------------------------------------------------
    // booking_id links a proposal to a gated booking (status 'pending');
    // accepting the proposal flips that booking to 'upcoming'.
    const title = field(b.title);
    if (!title) { res.status(400).json({ error: "missing-title" }); return; }
    const slug = await uniqueSlug(s, b.slug || title);
    const bookingId = b.booking_id ? parseInt(b.booking_id, 10) || null : null;
    const [row] = await s`
      INSERT INTO proposals (slug, title, location, client_name, client_email, intro, note, items, booking_id)
      VALUES (${slug}, ${title}, ${field(b.location, 160)}, ${field(b.client_name, 160)},
              ${field(b.client_email, 200)}, ${field(b.intro, 600)}, ${field(b.note, 600)},
              ${cleanItems(b.items || [])}, ${bookingId})
      RETURNING *`;
    res.status(200).json({ ok: true, proposal: row });
  } catch (e) {
    const msg = /DATABASE_URL/.test(String(e)) ? "db-not-configured"
      : /RESEND_API_KEY|Resend error/.test(String(e)) ? "send-failed" : "db-error";
    res.status(500).json({ error: msg });
  }
};
