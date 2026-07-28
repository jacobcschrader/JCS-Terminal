// =====================================================================
//  /api/admin/licensing — media-licensing leads (auth required).
//  The Resid-style flow, in-house: research who worked on a shot
//  property → track them as leads → personalized outreach → license.
//    GET                    → { leads: [...] } newest first
//    POST {property, company, ...}        → create lead
//    POST {action:"search", q, role}      → Google Programmable Search
//         (needs settings google_cse_key + google_cse_cx; 100/day free)
//    POST {action:"draft", id}            → role-aware outreach draft
//    POST {action:"send", id}             → send the outreach email
//    PUT  {id, ...}         → update fields / status
//    DELETE {id}            → remove
// =====================================================================
const { requireAuth } = require("../auth.js");
const { db } = require("../db.js");
const { sendEmail, jcsEmail, SENDERS, OWNER } = require("../email.js");

const field = (v, max = 300) => String(v == null ? "" : v).trim().slice(0, max);
const escHtml = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Role → how the email refers to their part in the project.
const ROLE_PHRASE = {
  architect: "the home you designed",
  builder: "the home you built",
  developer: "the project you developed",
  interior: "the interiors you designed",
  landscape: "the landscape you created",
  pool: "the outdoor spaces you built",
  brokerage: "your listing",
  other: "the property",
};
const ROLE_SEARCH = {
  architect: "architect",
  builder: "builder OR \"general contractor\"",
  developer: "developer",
  interior: "\"interior design\"",
  landscape: "\"landscape architect\" OR landscaping",
  pool: "pool builder",
  brokerage: "listing agent",
  other: "",
};

const STATUSES = ["found", "contacted", "replied", "offer_sent", "licensed", "declined"];

async function getSetting(s, key) {
  const [row] = await s`SELECT value FROM settings WHERE key = ${key}`;
  return row ? row.value : "";
}

function outreach(lead) {
  const first = (lead.contact_name || "").split(" ")[0];
  const phrase = ROLE_PHRASE[lead.role] || ROLE_PHRASE.other;
  const where = lead.location ? ` in ${lead.location}` : "";
  const url = lead.offer_url ||
    "https://www.jacobcschrader.com/projects";
  const subject = `${lead.property} | Media Licensing`;
  const greeting = first ? `Hi ${first},` : `Hi ${lead.company} team,`;
  const text =
`${greeting}

I recently photographed ${lead.property}${where} — ${phrase}. The set came out beautifully, and I'd love for ${lead.company} to have it for your own marketing: portfolio, website, social, print, and award submissions.

You can see the work here: ${url}

If it's of interest, reply here and I'll put together a simple quote for the images you'd use — most project partners license the set for a fraction of a commissioned shoot.

— Jacob Schrader
jacobcschrader.com · (408) 824-8719`;
  const noteHtml =
    `${escHtml(greeting)}<br><br>` +
    `I recently photographed <b>${escHtml(lead.property)}</b>${escHtml(where)} — ${escHtml(phrase)}. ` +
    `The set came out beautifully, and I'd love for ${escHtml(lead.company)} to have it for your own marketing: ` +
    `portfolio, website, social, print, and award submissions.<br><br>` +
    `If it's of interest, reply to this email and I'll put together a simple quote for the images you'd use — ` +
    `most project partners license the set for a fraction of a commissioned shoot.`;
  const html = jcsEmail({
    eyebrow: "Media Licensing",
    headline: escHtml(lead.property),
    note: noteHtml,
    rows: [
      ["Property", escHtml(lead.property) + (lead.location ? `<br><span style="color:#8a94a6;">${escHtml(lead.location)}</span>` : "")],
      ["Prepared for", escHtml(lead.company)],
    ],
    cta: { label: lead.offer_url ? "View Your Private Offer" : "View the Work", url },
    audience: "client",
  });
  return { subject, text, html };
}

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  try {
    const s = await db();
    const b = req.body || {};

    if (req.method === "GET") {
      const rows = await s`SELECT * FROM license_leads ORDER BY created_at DESC`;
      res.status(200).json({ leads: rows });
      return;
    }

    if (req.method === "DELETE") {
      const id = parseInt(b.id, 10);
      if (!id) { res.status(400).json({ error: "invalid" }); return; }
      await s`DELETE FROM license_leads WHERE id = ${id}`;
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === "PUT") {
      const id = parseInt(b.id, 10);
      const [l] = await s`SELECT * FROM license_leads WHERE id = ${id}`;
      if (!l) { res.status(404).json({ error: "not-found" }); return; }
      const status = STATUSES.includes(b.status) ? b.status : l.status;
      const [row] = await s`
        UPDATE license_leads SET
          property = ${b.property != null ? field(b.property) : l.property},
          location = ${b.location != null ? field(b.location, 160) : l.location},
          company = ${b.company != null ? field(b.company, 200) : l.company},
          role = ${b.role != null ? field(b.role, 30) : l.role},
          contact_name = ${b.contact_name != null ? field(b.contact_name, 160) : l.contact_name},
          email = ${b.email != null ? field(b.email, 200) : l.email},
          phone = ${b.phone != null ? field(b.phone, 60) : l.phone},
          website = ${b.website != null ? field(b.website, 300) : l.website},
          source_url = ${b.source_url != null ? field(b.source_url, 500) : l.source_url},
          notes = ${b.notes != null ? field(b.notes, 3000) : l.notes},
          fee = ${b.fee !== undefined ? (b.fee === "" || b.fee == null ? null : Number(b.fee) || null) : l.fee},
          booking_id = ${b.booking_id !== undefined ? (parseInt(b.booking_id, 10) || null) : l.booking_id},
          proposal_id = ${b.proposal_id !== undefined ? (parseInt(b.proposal_id, 10) || null) : l.proposal_id},
          follow_up = ${b.follow_up !== undefined ? (field(b.follow_up, 10) || null) : l.follow_up},
          status = ${status},
          updated_at = now()
        WHERE id = ${id} RETURNING *`;
      res.status(200).json({ ok: true, lead: row });
      return;
    }

    if (req.method !== "POST") { res.status(405).json({ error: "method-not-allowed" }); return; }

    // ---- web research: Serper (preferred) / Brave / Google CSE --------
    // Provider is auto-detected from whichever key is saved in Settings.
    if (b.action === "search") {
      const role = field(b.role, 30);
      const q = `"${field(b.q, 200)}" ${ROLE_SEARCH[role] || field(b.roleQuery, 60) || ""}`.trim();
      const norm = (title, link, snippet) => ({
        title: String(title || "").slice(0, 160),
        link: String(link || "").slice(0, 500),
        domain: String(link || "").replace(/^https?:\/\/(www\.)?/i, "").split("/")[0].slice(0, 120),
        snippet: String(snippet || "").slice(0, 260),
      });

      try {
        const serperKey = await getSetting(s, "serper_key");
        if (serperKey) {
          const r = await fetch("https://google.serper.dev/search", {
            method: "POST",
            headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
            body: JSON.stringify({ q, num: 8 }),
          });
          const j = await r.json();
          if (!r.ok) { res.status(200).json({ results: [], searchError: `Serper: ${j.message || r.status}`, q }); return; }
          res.status(200).json({ results: (j.organic || []).slice(0, 8).map((it) => norm(it.title, it.link, it.snippet)), q, provider: "serper" });
          return;
        }

        const braveKey = await getSetting(s, "brave_search_key");
        if (braveKey) {
          const r = await fetch("https://api.search.brave.com/res/v1/web/search?count=8&q=" + encodeURIComponent(q), {
            headers: { "X-Subscription-Token": braveKey, "Accept": "application/json" },
          });
          const j = await r.json();
          if (!r.ok) { res.status(200).json({ results: [], searchError: `Brave: ${(j.error && j.error.detail) || r.status}`, q }); return; }
          const items = (j.web && j.web.results) || [];
          res.status(200).json({ results: items.slice(0, 8).map((it) => norm(it.title, it.url, it.description)), q, provider: "brave" });
          return;
        }

        const key = await getSetting(s, "google_cse_key");
        const cx = await getSetting(s, "google_cse_cx");
        if (key && cx) {
          const url = "https://www.googleapis.com/customsearch/v1?key=" + encodeURIComponent(key) +
            "&cx=" + encodeURIComponent(cx) + "&num=8&q=" + encodeURIComponent(q);
          const r = await fetch(url);
          const j = await r.json();
          if (j.error) { res.status(200).json({ results: [], searchError: j.error.message || "search-failed", q }); return; }
          res.status(200).json({ results: (j.items || []).map((it) => norm(it.title, it.link, it.snippet)), q, provider: "google" });
          return;
        }
      } catch (e) {
        res.status(200).json({ results: [], searchError: "request failed — try again", q });
        return;
      }

      res.status(200).json({ results: null, needsKey: true });
      return;
    }

    // ---- outreach draft / send ---------------------------------------
    if (b.action === "draft" || b.action === "send") {
      const id = parseInt(b.id, 10);
      const [l] = await s`SELECT * FROM license_leads WHERE id = ${id}`;
      if (!l) { res.status(404).json({ error: "not-found" }); return; }
      if (l.proposal_id) {
        const [p] = await s`SELECT slug FROM proposals WHERE id = ${l.proposal_id}`;
        if (p) l.offer_url = `https://www.jacobcschrader.com/proposals/${p.slug}`;
      }
      const mail = outreach(l);

      if (b.action === "draft") {
        res.status(200).json({ subject: mail.subject, text: mail.text, to: l.email || "" });
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(l.email || "")) {
        res.status(400).json({ error: "no-email" }); return;
      }
      await sendEmail({
        from: SENDERS.enquiry,
        to: l.email,
        replyTo: OWNER,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
      const [row] = await s`
        UPDATE license_leads SET
          status = ${l.status === "found" ? "contacted" : l.status},
          emailed_at = now(),
          sends = COALESCE(sends, 0) + 1,
          updated_at = now()
        WHERE id = ${id} RETURNING *`;
      res.status(200).json({ ok: true, lead: row });
      return;
    }

    // ---- create -------------------------------------------------------
    const property = field(b.property);
    const company = field(b.company, 200);
    if (!property || !company) { res.status(400).json({ error: "missing-fields" }); return; }
    const [row] = await s`
      INSERT INTO license_leads (booking_id, property, location, company, role, contact_name,
                                 email, phone, website, source_url, notes)
      VALUES (${parseInt(b.booking_id, 10) || null}, ${property}, ${field(b.location, 160)},
              ${company}, ${field(b.role, 30) || "other"}, ${field(b.contact_name, 160)},
              ${field(b.email, 200)}, ${field(b.phone, 60)}, ${field(b.website, 300)},
              ${field(b.source_url, 500)}, ${field(b.notes, 3000)})
      RETURNING *`;
    res.status(200).json({ ok: true, lead: row });
  } catch (e) {
    const msg = /DATABASE_URL/.test(String(e)) ? "db-not-configured"
      : /RESEND_API_KEY|Resend error/.test(String(e)) ? "send-failed" : "db-error";
    res.status(500).json({ error: msg });
  }
};
