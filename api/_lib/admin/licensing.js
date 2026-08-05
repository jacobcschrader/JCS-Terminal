// =====================================================================
//  /api/admin/licensing — the license tracker (auth required).
//  Rebuilt 2026-07-31 as a two-email pipeline per lead:
//    prospect → preview_sent → accepted → licensed → paid  (+ declined)
//
//    Email 1 ("preview"): personalized outreach with the WATERMARKED
//      Pixieset gallery (lead.preview_url).
//    Email 2 ("license"): sent once they say yes — the FINAL gallery
//      (lead.final_url), the license fee + payment, and the license
//      terms & conditions. Sending stamps licensed_at.
//
//    GET                                  → { leads: [...] }
//    POST {property, company, ...}        → create lead
//    POST {action:"search", q, role}      → web research (Serper/Brave/CSE)
//    POST {action:"draft"|"send", id}     → preview email (watermarked)
//    POST {action:"draft_license"|"send_license", id} → license email
//    PUT  {id, ...}                       → update fields / status
//         (status transitions stamp accepted_at / licensed_at / paid_at)
//    DELETE {id}                          → remove
// =====================================================================
const { requireAuth } = require("../auth.js");
const { db } = require("../db.js");
const { sendEmail, jcsEmail, SENDERS, OWNER } = require("../email.js");

const field = (v, max = 300) => String(v == null ? "" : v).trim().slice(0, max);
const escHtml = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => "$" + Number(n || 0).toLocaleString();

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

// New pipeline (legacy values normalized so old rows keep working).
const STATUSES = ["prospect", "preview_sent", "accepted", "licensed", "paid", "declined"];
const LEGACY = { found: "prospect", contacted: "preview_sent", replied: "preview_sent", offer_sent: "accepted" };
const normStatus = (v) => (STATUSES.includes(v) ? v : (LEGACY[v] || "prospect"));

async function getSetting(s, key) {
  const [row] = await s`SELECT value FROM settings WHERE key = ${key}`;
  return row ? row.value : "";
}

// ---- Email 1: watermarked preview outreach ---------------------------
function previewMail(lead) {
  const first = (lead.contact_name || "").split(" ")[0];
  const phrase = ROLE_PHRASE[lead.role] || ROLE_PHRASE.other;
  const where = lead.location ? ` in ${lead.location}` : "";
  const url = lead.preview_url || "";
  const subject = `${lead.property} | Media Licensing`;
  const greeting = first ? `Hi ${first},` : `Hi ${lead.company} team,`;
  const text =
`${greeting}

I recently photographed ${lead.property}${where} — ${phrase}. The set came out beautifully, and I'd love for ${lead.company} to have it for your own marketing: portfolio, website, social, print, and award submissions.

I've put together a watermarked preview of the full gallery for you:
${url}

If you'd like the images, just reply "yes" — I'll send over the final gallery with a simple license and invoice. Most project partners license the set for a fraction of a commissioned shoot.

— Jacob C Schrader
jacobcschrader.com · (408) 824-8719`;
  const noteHtml =
    `${escHtml(greeting)}<br><br>` +
    `I recently photographed <b>${escHtml(lead.property)}</b>${escHtml(where)} — ${escHtml(phrase)}. ` +
    `The set came out beautifully, and I'd love for ${escHtml(lead.company)} to have it for your own marketing: ` +
    `portfolio, website, social, print, and award submissions.<br><br>` +
    `Below is a <b>watermarked preview</b> of the full gallery. If you'd like the images, just reply ` +
    `&ldquo;yes&rdquo; — I'll send over the final gallery with a simple license and invoice. ` +
    `Most project partners license the set for a fraction of a commissioned shoot.`;
  const html = jcsEmail({
    eyebrow: "Media Licensing",
    headline: escHtml(lead.property),
    note: noteHtml,
    rows: [
      ["Property", escHtml(lead.property) + (lead.location ? `<br><span style="color:#8a94a6;">${escHtml(lead.location)}</span>` : "")],
      ["Prepared for", escHtml(lead.company)],
    ],
    cta: { label: "View the Watermarked Preview", url },
    audience: "client",
  });
  return { subject, text, html };
}

// ---- Email 2: license delivery (final gallery + payment + terms) -----
const TERMS = [
  ["Grant", (c) => `JCS LLC grants ${c} a non-exclusive, non-transferable, perpetual license to use the delivered images for ${c}'s own marketing: portfolio, website, social media, print collateral, and award submissions.`],
  ["Exclusions", () => "The license may not be resold, sublicensed, or transferred. Use is limited to the project photographed — other properties, projects, or third parties (partners, subcontractors, press) require their own license."],
  ["Credit", () => "Where practical, credit “Photo: Jacob C Schrader”."],
  ["Ownership", () => "All images remain the copyright and property of JCS LLC."],
  ["Alterations", () => "Cropping and minor color adjustment are fine; the images may not be altered in ways that misrepresent the work, including composites or AI-driven alteration."],
  ["Effective", () => "The license takes effect on receipt of the license fee. Until then, use of the images is not authorized."],
];

function licenseMail(lead) {
  const first = (lead.contact_name || "").split(" ")[0];
  const url = lead.final_url || "";
  const subject = `${lead.property} | Your Media License`;
  const greeting = first ? `Hi ${first},` : `Hi ${lead.company} team,`;
  const payLine = lead.payment_url
    ? `Pay online: ${lead.payment_url}`
    : "Payment is due within 14 days — reply to this email to arrange ACH or check.";
  const termsText = TERMS.map(([t, f]) => `${t}: ${f(lead.company)}`).join("\n\n");
  const text =
`${greeting}

Wonderful — here is everything for ${lead.property}.

Final gallery (full resolution, no watermarks):
${url}

License fee: ${money(lead.fee)}
${payLine}

LICENSE TERMS & CONDITIONS

${termsText}

Thank you — it means a lot to see this work living in ${lead.company}'s portfolio.

— Jacob C Schrader
jacobcschrader.com · (408) 824-8719`;

  const termsHtml =
    `<div style="margin-top:18px;padding:16px 18px;background:#f6f4ef;border:1px solid rgba(15,34,64,0.12);">` +
    `<div style="font-family:'Inter',Helvetica,Arial,sans-serif;font-size:10px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#5d6a7e;margin-bottom:8px;">License Terms &amp; Conditions</div>` +
    TERMS.map(([t, f]) =>
      `<p style="font-family:'Inter',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.65;color:#5d6a7e;margin:0 0 8px;"><b style="color:#16233b;">${escHtml(t)}.</b> ${escHtml(f(lead.company))}</p>`
    ).join("") +
    `</div>`;

  const html = jcsEmail({
    eyebrow: "Your Media License",
    headline: escHtml(lead.property),
    note: `${escHtml(greeting)}<br><br>Wonderful — here is everything for <b>${escHtml(lead.property)}</b>. ` +
      `The final gallery is below (full resolution, no watermarks), along with the license terms. ` +
      `The license takes effect on receipt of the fee.`,
    rows: [
      ["Property", escHtml(lead.property) + (lead.location ? `<br><span style="color:#8a94a6;">${escHtml(lead.location)}</span>` : "")],
      ["Licensed to", escHtml(lead.company)],
      ["License fee", money(lead.fee)],
      ["Payment", lead.payment_url
        ? `<a href="${escHtml(lead.payment_url)}" style="color:#33507e;">Pay online</a>`
        : "Due within 14 days — reply to arrange ACH or check"],
    ],
    cta: { label: "Open the Final Gallery", url },
    extraHtml: termsHtml,
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
      res.status(200).json({ leads: rows.map((l) => ({ ...l, status: normStatus(l.status) })) });
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
      const status = b.status != null ? normStatus(b.status) : normStatus(l.status);
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
          preview_url = ${b.preview_url != null ? field(b.preview_url, 500) : l.preview_url},
          final_url = ${b.final_url != null ? field(b.final_url, 500) : l.final_url},
          payment_url = ${b.payment_url != null ? field(b.payment_url, 500) : l.payment_url},
          notes = ${b.notes != null ? field(b.notes, 3000) : l.notes},
          fee = ${b.fee !== undefined ? (b.fee === "" || b.fee == null ? null : Number(b.fee) || null) : l.fee},
          booking_id = ${b.booking_id !== undefined ? (parseInt(b.booking_id, 10) || null) : l.booking_id},
          proposal_id = ${b.proposal_id !== undefined ? (parseInt(b.proposal_id, 10) || null) : l.proposal_id},
          follow_up = ${b.follow_up !== undefined ? (field(b.follow_up, 10) || null) : l.follow_up},
          status = ${status},
          accepted_at = ${status === "accepted" && !l.accepted_at ? new Date() : l.accepted_at},
          licensed_at = ${status === "licensed" && !l.licensed_at ? new Date() : l.licensed_at},
          paid_at = ${status === "paid" && !l.paid_at ? new Date() : l.paid_at},
          updated_at = now()
        WHERE id = ${id} RETURNING *`;
      res.status(200).json({ ok: true, lead: { ...row, status: normStatus(row.status) } });
      return;
    }

    if (req.method !== "POST") { res.status(405).json({ error: "method-not-allowed" }); return; }

    // ---- web research: Serper (preferred) / Brave / Google CSE --------
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

    // ---- the two emails ----------------------------------------------
    if (["draft", "send", "draft_license", "send_license"].includes(b.action)) {
      const id = parseInt(b.id, 10);
      const [l] = await s`SELECT * FROM license_leads WHERE id = ${id}`;
      if (!l) { res.status(404).json({ error: "not-found" }); return; }
      l.status = normStatus(l.status);
      const isLicense = b.action === "draft_license" || b.action === "send_license";

      // What's missing for a real send — surfaced in the draft modal.
      const missing = [];
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(l.email || "")) missing.push("email");
      if (!isLicense && !/^https?:\/\//.test(l.preview_url || "")) missing.push("watermarked preview link");
      if (isLicense && !/^https?:\/\//.test(l.final_url || "")) missing.push("final gallery link");
      if (isLicense && !(Number(l.fee) > 0)) missing.push("license fee");

      const mail = isLicense ? licenseMail(l) : previewMail(l);

      if (b.action === "draft" || b.action === "draft_license") {
        res.status(200).json({ subject: mail.subject, text: mail.text, to: l.email || "", missing });
        return;
      }
      if (missing.length) { res.status(400).json({ error: "missing", missing }); return; }

      await sendEmail({
        from: SENDERS.enquiry,
        to: l.email,
        replyTo: OWNER,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
      const [row] = isLicense
        ? await s`
            UPDATE license_leads SET
              status = 'licensed',
              licensed_at = COALESCE(licensed_at, now()),
              emailed_at = now(),
              sends = COALESCE(sends, 0) + 1,
              updated_at = now()
            WHERE id = ${id} RETURNING *`
        : await s`
            UPDATE license_leads SET
              status = ${["prospect", "preview_sent"].includes(l.status) ? "preview_sent" : l.status},
              emailed_at = now(),
              sends = COALESCE(sends, 0) + 1,
              updated_at = now()
            WHERE id = ${id} RETURNING *`;
      res.status(200).json({ ok: true, lead: { ...row, status: normStatus(row.status) } });
      return;
    }

    // ---- create -------------------------------------------------------
    const property = field(b.property);
    const company = field(b.company, 200);
    if (!property || !company) { res.status(400).json({ error: "missing-fields" }); return; }
    const [row] = await s`
      INSERT INTO license_leads (booking_id, property, location, company, role, contact_name,
                                 email, phone, website, source_url, preview_url, final_url, payment_url, notes, status)
      VALUES (${parseInt(b.booking_id, 10) || null}, ${property}, ${field(b.location, 160)},
              ${company}, ${field(b.role, 30) || "other"}, ${field(b.contact_name, 160)},
              ${field(b.email, 200)}, ${field(b.phone, 60)}, ${field(b.website, 300)},
              ${field(b.source_url, 500)}, ${field(b.preview_url, 500)}, ${field(b.final_url, 500)},
              ${field(b.payment_url, 500)}, ${field(b.notes, 3000)}, ${"prospect"})
      RETURNING *`;
    res.status(200).json({ ok: true, lead: row });
  } catch (e) {
    const msg = /DATABASE_URL/.test(String(e)) ? "db-not-configured"
      : /RESEND_API_KEY|Resend error/.test(String(e)) ? "send-failed" : "db-error";
    res.status(500).json({ error: msg });
  }
};
