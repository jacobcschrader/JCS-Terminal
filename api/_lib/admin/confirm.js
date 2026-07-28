// =====================================================================
//  POST /api/admin/confirm { id } — confirm a booking (auth required):
//    1. Emails a branded confirmation to the client (if they have an
//       email) and a copy to Jacob — both with a .ics calendar invite
//       containing the shoot slot and, if set, the twilight slot.
//    2. Stamps confirmed_at on the booking.
//  Safe to call again — resends the confirmation.
// =====================================================================
const { requireAuth } = require("../auth.js");
const { db } = require("../db.js");
const { sendEmail, jcsEmail, SENDERS, OWNER } = require("../email.js");
const { buildIcs, fmtTime, gcalLink, ymd } = require("../ics.js");
const { loginUrl } = require("../portal-auth.js");
const gcal = require("../gcal.js");
const { recipientsOf } = require("../links.js");
const { sigFor } = require("../../calendar.js");

const escHtml = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== "POST") { res.status(405).json({ error: "method-not-allowed" }); return; }

  try {
    const s = await db();
    const id = parseInt((req.body || {}).id, 10);
    if (!id) { res.status(400).json({ error: "invalid" }); return; }

    const [b] = await s`
      SELECT bk.*, c.name AS client_name, c.email AS client_email, c.phone AS client_phone,
             c.extra_emails AS client_extra_emails
      FROM bookings bk LEFT JOIN clients c ON c.id = bk.client_id
      WHERE bk.id = ${id}`;
    if (!b) { res.status(404).json({ error: "not-found" }); return; }
    if (!b.shoot_date) { res.status(400).json({ error: "no-date" }); return; }

    // ---- calendar events (main slot + optional twilight) -------------
    // Twilight is optional: with both twilight fields blank, only the
    // main slot exists anywhere (calendar, invites, emails).
    const fullAddress = [b.title, b.location].filter(Boolean).join(", ");
    const service = b.type || "Photography";
    const hasTwilight = !!(b.twilight_date || b.twilight_time);

    const slots = [{ key: "main", date: b.shoot_date, time: b.shoot_time || "", durationMin: 120 }];
    if (hasTwilight) slots.push({ key: "twilight", date: b.twilight_date || b.shoot_date, time: b.twilight_time || "", durationMin: 45 });

    // Jacob's calendar: "Client - Service", full address, Visaro-style body:
    //   Package / Property / Client (phone), then Deliverables, then Access notes.
    const ownerDesc = [
      `Package: ${service}`,
      `Property: ${fullAddress}`,
      b.client_name ? `Client: ${b.client_name}${b.client_phone ? " (" + b.client_phone.replace(/[^0-9+]/g, "") + ")" : ""}` : null,
      b.sqft ? `Sqft: ${Number(b.sqft).toLocaleString()}` : null,
      b.price ? `Price: $${Number(b.price).toLocaleString()}${b.travel_fee ? " + $" + Number(b.travel_fee).toLocaleString() + " travel" + (b.travel_note ? " (" + b.travel_note + ")" : "") : ""}${b.discount_value ? " - $" + Number(b.discount_value).toLocaleString() + " discount (" + b.discount_code + ")" : ""}` : null,
      b.deliverables ? `\nDeliverables:\n• ${b.deliverables}` : null,
      b.notes ? `\nAccess notes:\n${b.notes}` : null,
      `\nhttps://www.jacobcschrader.com/admin#project/${b.id}`,
    ].filter(Boolean).join("\n");
    const ownerEvents = slots.map((sl) => ({
      uid: `jcs-${b.id}-${sl.key}@jacobcschrader.com`,
      title: `${b.client_name || b.title} - ${sl.key === "twilight" ? "Twilight" : service}`,
      date: sl.date, time: sl.time, durationMin: sl.durationMin,
      location: fullAddress,
      description: ownerDesc,
    }));

    // Client invite: property-first titles, no price/internal notes.
    const clientEvents = slots.map((sl) => ({
      uid: `jcs-${b.id}-${sl.key}@jacobcschrader.com`,
      title: `${sl.key === "twilight" ? "Twilight shoot" : "Shoot"} — ${b.title}`,
      date: sl.date, time: sl.time, durationMin: sl.durationMin,
      location: fullAddress,
      description: `${service} with Jacob Schrader${b.deliverables ? "\\nDeliverables: " + b.deliverables : ""} · jacobcschrader.com`,
    }));

    const mkIcs = (evts) => ({
      filename: "jcs-shoot.ics",
      content: Buffer.from(buildIcs(evts)).toString("base64"),
      content_type: "text/calendar",
    });
    const ownerIcs = mkIcs(ownerEvents);
    const events = clientEvents; // for the quick-add links below
    const addToCalUrl = `https://www.jacobcschrader.com/api/calendar?id=${b.id}&sig=${sigFor(b.id)}`;

    // ---- shared email fragments --------------------------------------
    const whenMain = `${new Date(ymd(b.shoot_date) + "T12:00:00")
      .toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}` +
      (b.shoot_time ? ` · ${fmtTime(b.shoot_time)}` : "");
    const twiDate = b.twilight_date || b.shoot_date;
    const whenTwi = (b.twilight_date || b.twilight_time)
      ? `${new Date(ymd(twiDate) + "T12:00:00")
          .toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}` +
        (b.twilight_time ? ` · ${fmtTime(b.twilight_time)}` : "")
      : null;

    const money = (n) => "$" + Number(n).toLocaleString();
    const total = Number(b.price || 0) + Number(b.travel_fee || 0) - Number(b.discount_value || 0);
    const showPrice = b.show_price !== false && b.price;
    const headline = `${escHtml(b.client_name || "")}${b.client_name ? " · " : ""}${escHtml(b.title)}`;
    const propertyVal = escHtml(b.title) + (b.location ? `<br><span style="color:#8a94a6;">${escHtml(b.location)}</span>` : "");
    const calLinks = `<div style="margin-top:14px;font-family:'Inter',Helvetica,Arial,sans-serif;font-size:11px;color:#8a94a6;">` +
      `<a href="${escHtml(gcalLink(events[0]))}" style="color:#33507e;">Add shoot to Google Calendar</a>` +
      (events[1] ? ` &nbsp;·&nbsp; <a href="${escHtml(gcalLink(events[1]))}" style="color:#33507e;">Add twilight</a>` : "") +
      `</div>`;

    // ---- 1) client confirmation (skipped gracefully if no email) -----
    // Goes to every address on the client profile (primary + extras).
    const clientTo = recipientsOf(b.client_email, b.client_extra_emails);
    let clientSent = false;
    if (clientTo.length && !b.skip_confirmation) {
      // One-click, already-signed-in portal link — safe because this email
      // itself is the ownership proof (same trust as the magic link).
      const portalUrl = b.client_id ? loginUrl(b.client_id) : "https://www.jacobcschrader.com/portal";
      await sendEmail({
        from: SENDERS.enquiry,
        to: clientTo,
        replyTo: OWNER,
        subject: `${b.title} | Booking Confirmed`,
        text: `Your shoot is confirmed.\n\nProperty: ${b.title}\nShoot: ${whenMain}` +
          (whenTwi ? `\nTwilight: ${whenTwi}` : "") +
          `\n\nAdd to calendar: ${addToCalUrl}` +
          `\nYour portal (schedule, delivery & invoices): ${portalUrl}` +
          `\n\n— Jacob Schrader · jacobcschrader.com`,
        html: jcsEmail({
          eyebrow: "Booking Confirmed",
          headline,
          note: "You're on the calendar. Questions before the shoot? Just reply. " +
            `Everything about your shoot — schedule, delivery, and invoices — lives in ` +
            `<a href="${escHtml(portalUrl)}" style="color:#33507e;">your client portal</a> (signs you in automatically).`,
          rows: [
            ["Property", propertyVal],
            ["Service", b.type ? escHtml(b.type) : ""],
            ["Shoot date", escHtml(whenMain)],
            ["Twilight", whenTwi ? escHtml(whenTwi) : ""],
            ["Included", b.deliverables ? escHtml(b.deliverables) : ""],
            ["Discount", showPrice && b.discount_value
              ? "&minus;" + money(b.discount_value) + (b.discount_code ? ` <span style="color:#8a94a6;">(${escHtml(b.discount_code)})</span>` : "") : ""],
            ["Total", showPrice
              ? money(total) + (b.travel_fee ? ` <span style="color:#8a94a6;">(incl. ${money(b.travel_fee)} travel)</span>` : "") : ""],
          ],
          cta: { label: "Add to Calendar", url: addToCalUrl },
          extraHtml: calLinks,
          audience: "client",
        }),
      });
      clientSent = true;
    }

    // ---- 2) copy to Jacob --------------------------------------------
    await sendEmail({
      from: SENDERS.admin,
      to: OWNER,
      subject: `${b.title} | Booking Confirmed`,
      text: `Booking confirmed.\n\nProperty: ${b.title}\nClient: ${b.client_name || "—"}\nShoot: ${whenMain}` +
        (whenTwi ? `\nTwilight: ${whenTwi}` : "") + (b.price ? `\nTotal: ${money(total)}` : ""),
      html: jcsEmail({
        eyebrow: "Booking Confirmed",
        headline,
        note: clientSent
          ? `Client confirmation sent to ${escHtml(clientTo.join(", "))}. Calendar invite attached.`
          : (b.skip_confirmation
              ? `Client email skipped (project setting) — only you received this. Calendar invite attached.`
              : `<span style="color:#8a4d2f;">No client email on file — only you received this.</span>`),
        rows: [
          ["Client", b.client_name ? escHtml(b.client_name) : ""],
          ["Property", propertyVal],
          ["Service", b.type ? escHtml(b.type) : ""],
          ["Shoot date", escHtml(whenMain)],
          ["Twilight", whenTwi ? escHtml(whenTwi) : ""],
          ["Total", b.price
            ? money(total) + (b.travel_fee ? ` <span style="color:#8a94a6;">(incl. ${money(b.travel_fee)} travel)</span>` : "") : ""],
        ],
        cta: { label: "View Project", url: `https://www.jacobcschrader.com/admin#project/${b.id}` },
        extraHtml: calLinks,
        audience: "admin",
      }),
      attachments: [ownerIcs],
    });

    // ---- 3) write straight onto Jacob's Google Calendar (if set up) --
    let calendarWritten = false;
    if (gcal.isConfigured()) {
      try { await gcal.upsertEvents(ownerEvents); calendarWritten = true; }
      catch (e) { /* non-fatal: invite attachments still cover it */ }
    }

    const [updated] = await s`UPDATE bookings SET confirmed_at = now() WHERE id = ${id} RETURNING *`;
    res.status(200).json({ ok: true, clientSent, calendarWritten, booking: updated });
  } catch (e) {
    const msg = /DATABASE_URL/.test(String(e)) ? "db-not-configured"
      : /RESEND_API_KEY|Resend error/.test(String(e)) ? "send-failed" : "error";
    res.status(502).json({ error: msg });
  }
};
