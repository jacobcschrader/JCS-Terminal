// =====================================================================
//  /api/admin/requests — application inbox (auth required)
//    GET                       → list requests (newest first)
//    POST {id, action:"accept"}  → create/match client + create project
//                                  (upcoming, prefilled) + mark accepted
//    POST {id, action:"propose"} → same, but the project waits as
//                                  'pending' behind a prefilled DRAFT
//                                  proposal (send it from the editor;
//                                  client acceptance flips the project
//                                  to upcoming)
//    POST {id, action:"decline"} → branded decline email + mark declined
//    DELETE {id}               → remove a request
// =====================================================================
const { requireAuth } = require("../auth.js");
const { db } = require("../db.js");
const { ymd } = require("../ics.js");
const { sendEmail, jcsEmail, SENDERS, OWNER } = require("../email.js");

const escHtml = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  try {
    const s = await db();
    const b = req.body || {};

    if (req.method === "GET") {
      const rows = await s`SELECT * FROM requests ORDER BY created_at DESC`;
      res.status(200).json({ requests: rows });
      return;
    }

    if (req.method === "DELETE") {
      const id = parseInt(b.id, 10);
      if (!id) { res.status(400).json({ error: "invalid" }); return; }
      await s`DELETE FROM requests WHERE id = ${id}`;
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method !== "POST") { res.status(405).json({ error: "method-not-allowed" }); return; }

    const id = parseInt(b.id, 10);
    const [r] = await s`SELECT * FROM requests WHERE id = ${id}`;
    if (!r) { res.status(404).json({ error: "not-found" }); return; }

    if (b.action === "accept" || b.action === "propose") {
      // Match an existing client by email, otherwise create one.
      let [client] = await s`SELECT * FROM clients WHERE lower(email) = ${r.email.toLowerCase()} LIMIT 1`;
      if (!client) {
        [client] = await s`
          INSERT INTO clients (name, email, phone, brokerage, notes)
          VALUES (${r.name}, ${r.email}, ${r.phone}, ${r.brokerage}, ${"Came in via /book application."})
          RETURNING *`;
      }
      const location = [r.city, [r.state, r.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
      // Booking-wizard extras flow into the project: estimated total →
      // price, add-ons + property details + signature → notes.
      const noteBits = [];
      if (r.message) noteBits.push("From application: " + r.message);
      if (r.addons) noteBits.push("Add-ons: " + r.addons);
      try {
        const d = JSON.parse(r.details || "{}");
        const L = { status: "Status", listing_type: "Listing", faces: "Front faces",
                    view_home: "View home", access: "Access", homeowner_home: "Homeowner home" };
        const lines = Object.keys(L).filter((k) => d[k]).map((k) => `${L[k]}: ${d[k]}`);
        if (lines.length) noteBits.push(lines.join(" · "));
      } catch (e) { /* optional */ }
      if (r.launch_date) noteBits.push("Launch date: " + ymd(r.launch_date));
      if (r.signature) noteBits.push("Terms signed by " + r.signature);
      const gated = b.action === "propose";
      const [project] = await s`
        INSERT INTO bookings (client_id, title, location, city, state, zip, sqft, shoot_date, deliverables, notes, status, price)
        VALUES (${client.id}, ${r.title}, ${location}, ${r.city}, ${r.state}, ${r.zip}, ${r.sqft},
                ${r.target_date}, ${r.services || ""},
                ${noteBits.join("\n")}, ${gated ? "pending" : "upcoming"}, ${r.estimated_total || null})
        RETURNING id`;

      // propose → also draft the proposal, prefilled from the request so
      // Jacob only sets prices. Stays a draft (public page 404s) until
      // he sends it from the proposal editor.
      let proposalId = null;
      if (gated) {
        const strip = (v) => String(v || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
        const items = []
          .concat(String(r.services || "").split(" · ").map(strip).filter(Boolean)
            .map((name) => ({ group: "The Campaign", name, desc: "", price: "", badge: "" })))
          .concat(String(r.addons || "").split(" · ").map(strip).filter(Boolean)
            .map((name) => ({ group: "Add-Ons", name, desc: "", price: "", badge: "" })));
        const base = String(r.title || "proposal").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "").slice(0, 80) || "proposal";
        let slug = base;
        for (let i = 0; i < 20; i++) {
          const candidate = i ? `${base}-${i + 1}` : base;
          const [hit] = await s`SELECT id FROM proposals WHERE slug = ${candidate} LIMIT 1`;
          if (!hit) { slug = candidate; break; }
          slug = `${base}-${Date.now().toString(36)}`;
        }
        const [p] = await s`
          INSERT INTO proposals (slug, title, location, client_name, client_email, items, booking_id)
          VALUES (${slug}, ${r.title}, ${location}, ${r.name || ""}, ${r.email || ""},
                  ${JSON.stringify(items.slice(0, 40))}, ${project.id})
          RETURNING id`;
        proposalId = p.id;
      }

      const [updated] = await s`
        UPDATE requests SET status = 'accepted', project_id = ${project.id} WHERE id = ${id} RETURNING *`;
      res.status(200).json({ ok: true, request: updated, projectId: project.id, clientId: client.id, proposalId });
      return;
    }

    if (b.action === "decline") {
      try {
        await sendEmail({
          from: SENDERS.enquiry,
          to: r.email,
          replyTo: OWNER,
          subject: `${r.title} | Application Update`,
          text: `Hi ${r.name},\n\nThank you for thinking of me for ${r.title}. ` +
            "My calendar is fully committed at the moment and I'm unable to take this one on. " +
            "I take on a limited number of projects to keep the work at its best, and I'd welcome " +
            "the chance to be considered for a future property.\n\n— Jacob Schrader · jacobcschrader.com",
          html: jcsEmail({
            eyebrow: "Application Update",
            headline: "Thank you for thinking of me.",
            note: `Hi ${escHtml(r.name)} — thank you for your application for <b>${escHtml(r.title)}</b>. ` +
              "My calendar is fully committed at the moment and I'm unable to take this one on. " +
              "I take on a limited number of projects each season to keep the work at its best — " +
              "I'd welcome the chance to be considered for a future property.",
            cta: { label: "View the Work", url: "https://www.jacobcschrader.com/projects" },
            audience: "client",
          }),
        });
      } catch (e) { /* still mark declined even if email fails */ }
      const [updated] = await s`UPDATE requests SET status = 'declined' WHERE id = ${id} RETURNING *`;
      res.status(200).json({ ok: true, request: updated });
      return;
    }

    res.status(400).json({ error: "unknown-action" });
  } catch (e) {
    const msg = /DATABASE_URL/.test(String(e)) ? "db-not-configured" : "db-error";
    res.status(500).json({ error: msg });
  }
};
