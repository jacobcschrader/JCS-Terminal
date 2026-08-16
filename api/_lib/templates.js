// =====================================================================
//  Editable email copy. Each client-facing email has a subject + a note
//  paragraph; Jacob can override either in Settings (stored as settings
//  rows tpl_<key>_subject / tpl_<key>_note). Placeholders: {first}
//  {name} {property} {location} {number} {total} {date} {time}.
// =====================================================================
const escHtml = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const DEFAULTS = {
  confirm: {
    label: "Booking confirmed",
    subject: "{property} | Booking Confirmed",
    note: "You're on the calendar. Questions before the shoot? Just reply. Everything about your shoot — schedule, delivery, and invoices — lives in your client portal.",
  },
  delivery: {
    label: "Media delivery",
    subject: "{property} | Media Delivery",
    note: "Hi {first} — your full delivery is ready. View, download individual files, or grab the full-res and MLS bundles from your listing page — always up to date.",
  },
  invoice: {
    label: "Invoice",
    subject: "{property} | Invoice {number}",
    note: "Hi {first} — here is your invoice. Questions? Just reply.",
  },
  proposal: {
    label: "Proposal",
    subject: "{property} | Project Proposal",
    note: "Hi {first} — your bespoke proposal for {property} is ready. Review the scope, and reserve the dates when you're ready.",
  },
  application: {
    label: "Application received",
    subject: "{property} | Application Received",
    note: "Hi {first} — your application for {property} has been received. I review every application personally and will reply within 24 hours with availability and your personal proposal — accepting it is what confirms your shoot.",
  },
  reminder_invoice: {
    label: "Reminder — unpaid invoice",
    subject: "{property} | A note on invoice {number}",
    note: "Hi {first} — a quick note that invoice {number} for {property} ({total}) is still open. The link below has everything; reply if anything needs adjusting.",
  },
  reminder_proposal: {
    label: "Reminder — proposal waiting",
    subject: "{property} | Your proposal is waiting",
    note: "Hi {first} — checking in on the proposal for {property}. The dates are held for now; the link below reserves them whenever you're ready.",
  },
  reminder_delivery: {
    label: "Reminder — approve the delivery",
    subject: "{property} | Happy with everything?",
    note: "Hi {first} — your delivery for {property} has been up for a few days. If everything looks right, an approval on your listing page closes it out; if not, tell me what to adjust — revisions are always included.",
  },
};

async function loadTemplates(s) {
  const out = {};
  try {
    const rows = await s`SELECT key, value FROM settings WHERE key LIKE 'tpl_%'`;
    rows.forEach((r) => { if (r.value) out[r.key] = r.value; });
  } catch (e) { /* defaults */ }
  return out;
}

function fill(str, vars, html) {
  return String(str || "").replace(/\{(\w+)\}/g, (m, k) => {
    const v = vars[k] == null ? "" : String(vars[k]);
    return html ? escHtml(v) : v;
  });
}

// tpl(templates, "invoice", { first, property, number, total })
//   → { subject, note (html), text (plain) }
function tpl(templates, key, vars) {
  const d = DEFAULTS[key] || { subject: "{property}", note: "" };
  const subject = (templates && templates["tpl_" + key + "_subject"]) || d.subject;
  const note = (templates && templates["tpl_" + key + "_note"]) || d.note;
  return { subject: fill(subject, vars, false), note: fill(note, vars, true), text: fill(note, vars, false) };
}

module.exports = { DEFAULTS, loadTemplates, tpl, fill };
