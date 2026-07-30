// =====================================================================
//  /api/proposal — public, slug-gated, powers /proposals/<slug> and
//  proposal.jacobcschrader.com/<slug>.
//    GET  ?slug=<slug>[&preview=1]   → client-safe proposal data
//         (drafts are hidden unless the caller has a valid admin
//          session and passes preview=1)
//    POST { slug, action:"accept", name, phone?, access?, notes? }
//         → acceptance IS the contract: stores the typed e-signature
//         (signature/signed_at) + deeper info (acceptance JSON), flips
//         a linked 'pending' booking to 'upcoming', emails Jacob and a
//         confirmation to the client. Accepting twice is a no-op.
//  Slugs are unguessable enough for share links (like delivery tokens,
//  possession of the URL is the credential) and carry no payment data.
// =====================================================================
const { db } = require("./_lib/db.js");
const { verifySessionToken, readCookie } = require("./_lib/auth.js");
const { sendEmail, jcsEmail, SENDERS, OWNER } = require("./_lib/email.js");
const { loginUrl } = require("./_lib/portal-auth.js");

const escHtml = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const cleanSlug = (v) =>
  String(v || "").toLowerCase().trim().replace(/[^a-z0-9-]/g, "").slice(0, 120);

function publicShape(p) {
  let items = [];
  try { items = JSON.parse(p.items || "[]"); } catch (e) {}
  return {
    title: p.title,
    location: p.location || "",
    client_name: p.client_name || "",
    intro: p.intro || "",
    items,
    note: p.note || "",
    status: p.status,
    sent_at: p.sent_at || null,
    accepted_at: p.accepted_at || null,
    created_at: p.created_at,
  };
}

module.exports = async function handler(req, res) {
  try {
    const s = await db();

    if (req.method === "POST") {
      const b = req.body || {};
      const slug = cleanSlug(b.slug);
      const name = String(b.name || "").trim().slice(0, 200);
      if (!slug || b.action !== "accept" || name.length < 3) {
        res.status(400).json({ error: "invalid" }); return;
      }
      const phone = String(b.phone || "").trim().slice(0, 60);
      const access = String(b.access || "").trim().slice(0, 500);
      const notes = String(b.notes || "").trim().slice(0, 3000);
      const [p] = await s`SELECT * FROM proposals WHERE slug = ${slug} AND status <> 'draft' LIMIT 1`;
      if (!p) { res.status(404).json({ error: "not-found" }); return; }
      if (p.accepted_at) { res.status(200).json({ ok: true, accepted_at: p.accepted_at }); return; }

      // Acceptance = the contract: typed name is the e-signature, and
      // the deeper info rides along as JSON.
      const acceptance = JSON.stringify({ phone, access, notes });
      const [row] = await s`
        UPDATE proposals SET accepted_at = now(), accepted_by = ${name}, status = 'accepted',
          signature = ${name}, signed_at = now(), acceptance = ${acceptance}, updated_at = now()
        WHERE id = ${p.id} RETURNING accepted_at`;

      let total = 0, firstService = "";
      try {
        JSON.parse(p.items || "[]").forEach((it) => {
          if (typeof it.price === "number") total += it.price;
          if (!firstService && it.name) firstService = it.name;
        });
      } catch (e) {}
      const extra = [
        `Proposal accepted & signed by ${name}`,
        phone ? `Phone: ${phone}` : null,
        access ? `Access: ${access}` : null,
        notes ? `Client notes: ${notes}` : null,
      ].filter(Boolean).join("\n");

      // Linked gated booking: pending → upcoming, acceptance details
      // appended to the project notes, client phone backfilled.
      let booking = null;
      if (p.booking_id) {
        [booking] = await s`
          UPDATE bookings SET
            status = CASE WHEN status = 'pending' THEN 'upcoming' ELSE status END,
            notes = TRIM(BOTH E'\n' FROM COALESCE(NULLIF(notes, ''), '') || E'\n\n' || ${extra})
          WHERE id = ${p.booking_id} RETURNING *`;
      } else {
        // Standalone proposal (created straight from + New proposal):
        // acceptance IS the booking moment — resolve/create the client
        // and open the project as Upcoming, linked back to the proposal.
        let client = null;
        if (p.client_id) [client] = await s`SELECT * FROM clients WHERE id = ${p.client_id} LIMIT 1`;
        if (!client && p.client_email) {
          [client] = await s`SELECT * FROM clients WHERE lower(email) = ${String(p.client_email).toLowerCase()} LIMIT 1`;
        }
        if (!client) {
          [client] = await s`
            INSERT INTO clients (name, email, phone, notes)
            VALUES (${p.client_name || name}, ${p.client_email || ""}, ${phone}, ${"Created from proposal acceptance."})
            RETURNING *`;
        }
        [booking] = await s`
          INSERT INTO bookings (client_id, title, location, type, price, status, notes)
          VALUES (${client.id}, ${p.title}, ${p.location || ""}, ${firstService || "Photography"},
                  ${total || null}, ${"upcoming"}, ${extra})
          RETURNING *`;
        await s`UPDATE proposals SET booking_id = ${booking.id} WHERE id = ${p.id}`;
      }
      if (booking && booking.client_id && phone) {
        await s`UPDATE clients SET phone = ${phone} WHERE id = ${booking.client_id} AND COALESCE(phone, '') = ''`;
      }
      const adminUrl = booking
        ? `https://www.jacobcschrader.com/admin#project/${booking.id}`
        : `https://www.jacobcschrader.com/admin#proposal/${p.id}`;
      await sendEmail({
        from: SENDERS.admin,
        to: OWNER,
        subject: `${p.title} | Proposal Accepted`,
        text: `${name} accepted and signed the proposal for ${p.title} (${total ? "$" + total.toLocaleString() : "custom"}).` +
          (phone ? `\nPhone: ${phone}` : "") + (access ? `\nAccess: ${access}` : "") + (notes ? `\nNotes: ${notes}` : "") +
          `\n${adminUrl}`,
        html: jcsEmail({
          eyebrow: "Proposal Accepted",
          headline: `${escHtml(p.client_name || name)} · ${escHtml(p.title)}`,
          note: `${escHtml(name)} accepted and signed — ` +
            (booking ? "the project moved to Upcoming. Confirm the shoot to send the calendar invite." :
              "follow up within 24 hours to lock in the schedule."),
          rows: [
            ["Property", escHtml(p.title)],
            ["Signed by", escHtml(name)],
            ["Phone", phone ? escHtml(phone) : ""],
            ["Access", access ? escHtml(access) : ""],
            ["Notes", notes ? escHtml(notes) : ""],
            ["Campaign", total ? "$" + total.toLocaleString() : ""],
          ],
          cta: { label: "Open in Admin", url: adminUrl },
          audience: "admin",
        }),
      }).catch(() => {});

      // Client confirmation (best effort) — with an already-signed-in
      // portal link when we know the client (email possession = proof).
      const to = String(p.client_email || "").trim();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        const portalUrl = booking && booking.client_id
          ? loginUrl(booking.client_id) : "https://www.jacobcschrader.com/portal";
        await sendEmail({
          from: SENDERS.enquiry,
          to,
          replyTo: OWNER,
          subject: `${p.title} | Proposal Accepted`,
          text: `Hi ${name},\n\nYour acceptance for ${p.title} is confirmed — the dates are reserved. ` +
            "I'll follow up shortly to confirm the shoot details.\n\n" +
            `Your portal: ${portalUrl}\n\n— Jacob Schrader · jacobcschrader.com`,
          html: jcsEmail({
            eyebrow: "You're All Set",
            headline: "The dates are reserved.",
            note: `Hi ${escHtml(name.split(" ")[0] || name)} — your acceptance for <b>${escHtml(p.title)}</b> is confirmed. ` +
              "I'll follow up shortly to lock in the schedule; everything lives in your client portal from here.",
            rows: [
              ["Property", escHtml(p.title) + (p.location ? `<br><span style="color:#8a94a6;">${escHtml(p.location)}</span>` : "")],
              ["Signed", escHtml(name)],
              ["Campaign", total ? "$" + total.toLocaleString() : ""],
            ],
            cta: { label: "Go to Your Portal", url: portalUrl },
            audience: "client",
          }),
        }).catch(() => {});
      }

      res.status(200).json({ ok: true, accepted_at: row.accepted_at });
      return;
    }

    // ---- GET ----------------------------------------------------------
    const q = req.query || {};
    const slug = cleanSlug(q.slug);
    if (!slug) { res.status(404).json({ error: "not-found" }); return; }
    const [p] = await s`SELECT * FROM proposals WHERE slug = ${slug} LIMIT 1`;
    const isAdmin = q.preview && verifySessionToken(readCookie(req));
    if (!p || (p.status === "draft" && !isAdmin)) {
      res.status(404).json({ error: "not-found" }); return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(publicShape(p));
  } catch (e) {
    res.status(500).json({ error: "error" });
  }
};
