// =====================================================================
//  EMAIL — the one place all site email goes through (Resend).
//
//  Any current or future serverless function that needs to send email
//  should import { sendEmail } from here — never call Resend directly.
//
//  Env vars (Vercel → Settings → Environment Variables):
//    RESEND_API_KEY  required — from resend.com/api-keys
//    CONTACT_TO      where enquiries land   (default jacxbschrader@gmail.com)
//    CONTACT_FROM    the sender identity    (default onboarding@resend.dev)
//
//  ⚠️ To email ANYONE other than the account owner (e.g. the auto-reply
//  to an enquirer), the domain must be verified at resend.com/domains,
//  and CONTACT_FROM set to it, e.g.:
//    CONTACT_FROM = Jacob Schrader <enquiry@jacobcschrader.com>
//
//  (The _lib folder is underscore-prefixed so Vercel does not expose
//  this file as an endpoint.)
// =====================================================================

const FROM = process.env.CONTACT_FROM || "Jacob Schrader <onboarding@resend.dev>";
const OWNER = process.env.CONTACT_TO || "jacxbschrader@gmail.com";

async function sendEmail({ from, to, subject, text, html, replyTo, cc, attachments }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not configured");

  const payload = { from: from || FROM, to: Array.isArray(to) ? to : [to], subject };
  if (text) payload.text = text;
  if (html) payload.html = html;
  // Every reply lands in Jacob's real inbox — the @jacobcschrader.com
  // senders are send-only identities with no mailbox behind them.
  payload.reply_to = replyTo || OWNER;
  if (cc && cc.length) payload.cc = Array.isArray(cc) ? cc : [cc];
  if (attachments) payload.attachments = attachments; // [{ filename, content(base64), content_type }]

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    throw new Error(`Resend error ${r.status}: ${await r.text().catch(() => "")}`);
  }
  return r.json();
}

// ---------------------------------------------------------------------
//  Brand system for outbound email — Visaro-structured, JCS-branded:
//  navy masthead with the Cormorant italic JCS wordmark (logo only),
//  tracked-out eyebrow for the event, serif headline, hairline detail
//  table, navy button, "Or copy" link, quiet footer. Web fonts render
//  in Apple Mail; Gmail falls back to Georgia/Helvetica gracefully.
// ---------------------------------------------------------------------
const SERIF = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
const SANS = "'Inter', Helvetica, Arial, sans-serif";
const NAVY = "#0f2240";
const INK = "#16233b";
const MUTED = "#5d6a7e";
const FAINT = "#8a94a6";
const FOOT = "#a8b0be";
const PAPER_WARM = "#f6f4ef";
const LINE = "#ece8df";

// Sender identities — domain is verified on Resend, so any mailbox
// @jacobcschrader.com sends without further setup.
// One sender for everything (Jacob's call, 2026-07-31). The purpose
// keys stay so any flow can get its own address back with one line.
const SENDER = "Jacob C Schrader <admin@jacobcschrader.com>";
const SENDERS = {
  delivery: SENDER,
  enquiry: SENDER,
  billing: SENDER,
  admin: SENDER,
};

// One detail row: uppercase label left, value right.
const row = (label, valueHtml) =>
  `<tr>
    <td style="padding:9px 0;border-top:1px solid ${LINE};font-family:${SANS};font-size:10px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:${FAINT};vertical-align:top;white-space:nowrap;">${label}</td>
    <td style="padding:9px 0 9px 16px;border-top:1px solid ${LINE};font-family:${SANS};font-size:13px;line-height:1.55;color:${INK};text-align:right;">${valueHtml}</td>
  </tr>`;

// The one template every email uses.
//   eyebrow   "Media Delivery" — also the footer event name
//   headline  "Client · Property"
//   note      optional sentence under the headline (HTML ok)
//   rows      [[label, valueHtml], …] — empty values are skipped
//   cta       { label, url }
//   copyUrl   the "Or copy:" link (defaults to cta.url)
//   audience  'client' | 'admin' — footer notification line
//   extraHtml optional block after the button (e.g. calendar links)
function jcsEmail({ eyebrow, headline, note, rows = [], cta, copyUrl, audience = "client", extraHtml = "" }) {
  const table = rows.filter((r) => r && r[1] !== null && r[1] !== undefined && r[1] !== "");
  const copy = copyUrl || (cta && cta.url);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400;1,500&family=Inter:wght@400;500;600&display=swap');
</style>
</head>
<body style="margin:0;padding:0;background:${PAPER_WARM};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER_WARM};padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;">

        <tr><td style="background:${NAVY};padding:24px 0;text-align:center;">
          <img src="https://www.jacobcschrader.com/images/email/jcs-wordmark.png" width="64" height="36" alt="JCS"
               style="display:block;margin:0 auto;border:0;font-family:${SERIF};font-style:italic;font-weight:500;font-size:30px;line-height:36px;color:#ffffff;letter-spacing:2px;">
        </td></tr>

        <tr><td style="padding:30px 34px 26px;">
          <div style="font-family:${SANS};font-size:10px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:${FAINT};margin-bottom:10px;">${eyebrow}</div>
          <div style="font-family:${SERIF};font-weight:500;font-size:24px;line-height:1.25;color:${NAVY};margin-bottom:8px;">${headline}</div>
          ${note ? `<div style="font-family:${SANS};font-size:13px;line-height:1.6;color:${MUTED};margin-bottom:20px;">${note}</div>` : `<div style="height:12px;"></div>`}
          ${table.length
            ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid ${LINE};">${table.map((r) => row(r[0], r[1])).join("")}</table>`
            : ""}
          ${cta ? `<div style="margin:22px 0 14px;"><a href="${cta.url}" style="display:inline-block;background:${NAVY};color:#ffffff;font-family:${SANS};font-size:11px;font-weight:500;letter-spacing:2.5px;text-transform:uppercase;text-decoration:none;padding:12px 26px;">${cta.label}</a></div>` : `<div style="height:14px;"></div>`}
          ${copy ? `<div style="font-family:${SANS};font-size:11px;color:${FAINT};">Or copy: <a href="${copy}" style="color:#33507e;">${copy.replace(/^https?:\/\/(www\.)?/, "")}</a></div>` : ""}
          ${extraHtml}
        </td></tr>

        <tr><td style="border-top:1px solid ${LINE};padding:16px 34px;text-align:center;">
          <div style="font-family:${SANS};font-size:9px;letter-spacing:2.5px;text-transform:uppercase;color:${FOOT};">${audience === "admin" ? "Admin" : "Client"} notification &nbsp;·&nbsp; ${eyebrow}</div>
          <div style="font-family:${SANS};font-size:10px;color:${FOOT};margin-top:4px;">© ${new Date().getFullYear()} Jacob Schrader &nbsp;·&nbsp; <a href="https://www.jacobcschrader.com" style="color:${FOOT};text-decoration:none;">jacobcschrader.com</a></div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

module.exports = { sendEmail, jcsEmail, SENDERS, NAVY, INK, MUTED, LINE, FROM, OWNER };
