// =====================================================================
//  Stripe (optional) — online payment for invoices and deposits.
//  Env: STRIPE_SECRET_KEY (sk_live_… or sk_test_…). No SDK: plain calls
//  to api.stripe.com. Checkout Sessions carry metadata { booking_id,
//  kind } so the return trip (invoice page ?session_id=…) and the
//  webhook (api/stripe.js) both know what was paid.
// =====================================================================
const { logEvent } = require("./events.js");
const { sendEmail, jcsEmail, SENDERS, OWNER } = require("./email.js");

function configured() { return !!process.env.STRIPE_SECRET_KEY; }
function mode() { return /^sk_live_/.test(process.env.STRIPE_SECRET_KEY || "") ? "live" : "test"; }

async function call(path, method, params) {
  const r = await fetch("https://api.stripe.com/v1" + path, {
    method: method || "GET",
    headers: {
      Authorization: "Bearer " + process.env.STRIPE_SECRET_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params ? new URLSearchParams(params).toString() : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("stripe " + r.status + ": " + ((j.error && j.error.message) || "error"));
  return j;
}

// amount in dollars → Checkout Session URL
async function createCheckout({ amount, name, description, bookingId, kind, successUrl, cancelUrl, email }) {
  const cents = Math.round(Number(amount) * 100);
  if (!(cents > 0)) throw new Error("no-amount");
  const params = {
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(cents),
    "line_items[0][price_data][product_data][name]": name,
    "metadata[booking_id]": String(bookingId),
    "metadata[kind]": kind,
    "payment_intent_data[metadata][booking_id]": String(bookingId),
    "payment_intent_data[metadata][kind]": kind,
    success_url: successUrl,
    cancel_url: cancelUrl,
  };
  if (description) params["line_items[0][price_data][product_data][description]"] = description;
  if (email) params.customer_email = email;
  const s = await call("/checkout/sessions", "POST", params);
  return { id: s.id, url: s.url };
}
async function getSession(id) { return call("/checkout/sessions/" + encodeURIComponent(id)); }
async function getEvent(id) { return call("/events/" + encodeURIComponent(id)); }

// Record a completed payment. kind: deposit | balance | full. Idempotent.
async function applyPayment(s, bookingId, kind, sessionId, amountCents) {
  const id = parseInt(bookingId, 10); if (!id) return null;
  const [b] = await s`
    SELECT bk.*, c.name AS client_name FROM bookings bk LEFT JOIN clients c ON c.id = bk.client_id WHERE bk.id = ${id}`;
  if (!b) return null;
  if (sessionId && b.stripe_session_id === sessionId) return b;   // already applied
  const dollars = amountCents ? amountCents / 100 : null;
  let row;
  if (kind === "deposit") {
    if (b.deposit_paid_at) return b;
    [row] = await s`UPDATE bookings SET deposit_paid_at = now(), stripe_session_id = ${sessionId || ""} WHERE id = ${id} RETURNING *`;
    await logEvent(s, id, "invoice", "Deposit paid online" + (dollars ? " · $" + dollars.toLocaleString() : ""), "client", sessionId || "");
  } else {
    if (b.status === "paid") return b;
    [row] = await s`
      UPDATE bookings SET status = 'paid', paid_at = COALESCE(paid_at, now()), paid_via = 'stripe',
        downloads_locked = false, stripe_session_id = ${sessionId || ""} WHERE id = ${id} RETURNING *`;
    await logEvent(s, id, "invoice", (kind === "balance" ? "Balance" : "Invoice") + " paid online" + (dollars ? " · $" + dollars.toLocaleString() : "") + " · downloads unlocked", "client", sessionId || "");
  }
  sendEmail({
    from: SENDERS.admin, to: OWNER,
    subject: `${b.title} | Payment Received`,
    text: `${b.client_name || "The client"} paid ${kind === "deposit" ? "the deposit" : "the invoice"} for ${b.title}${dollars ? " ($" + dollars.toLocaleString() + ")" : ""} via Stripe.`,
    html: jcsEmail({
      eyebrow: "Payment Received",
      headline: `${b.client_name ? b.client_name + " · " : ""}${b.title}`,
      note: (kind === "deposit" ? "Deposit" : "Invoice") + " paid online via Stripe" + (dollars ? " — $" + dollars.toLocaleString() : "") + (kind !== "deposit" ? ". Downloads are unlocked." : "."),
      cta: { label: "Open Project", url: "https://www.jacobcschrader.com/admin#project/" + id }, audience: "admin",
    }),
  }).catch(() => {});
  return row;
}

module.exports = { configured, mode, createCheckout, getSession, getEvent, applyPayment };
