// =====================================================================
//  /api/invoice — public, powers the branded invoice page at /invoice?t=…
//    GET  ?t=<token>[&session_id=cs_…]  → invoice data (only what belongs
//         on an invoice). A session_id from Stripe's return trip is
//         verified against Stripe and applied (paid) right there, so the
//         page shows Paid even before the webhook lands.
//    POST { t, action: "checkout", kind: "deposit" | "balance" | "full" }
//         → { url } Stripe Checkout (only when STRIPE_SECRET_KEY is set)
//  Deposits: bookings.deposit_amount (set when the deposit invoice is
//  sent) + deposit_paid_at; balance = total − deposit.
// =====================================================================
const { db } = require("./_lib/db.js");
const stripe = require("./_lib/stripe.js");

const SITE = "https://www.jacobcschrader.com";

async function load(s, t) {
  const [b] = await s`
    SELECT bk.id, bk.title, bk.location, bk.type, bk.shoot_date, bk.price,
           bk.travel_fee, bk.travel_note, bk.discount_code, bk.discount_value,
           bk.status, bk.deliverables, bk.invoice_sent_at, bk.created_at,
           bk.deposit_amount, bk.deposit_paid_at, bk.paid_at, bk.paid_via, bk.invoice_token,
           c.name AS client_name, c.brokerage AS client_brokerage, c.email AS client_email
    FROM bookings bk LEFT JOIN clients c ON c.id = bk.client_id
    WHERE bk.invoice_token = ${t} LIMIT 1`;
  return b;
}
function ledger(b) {
  const items = [{ label: b.type || "Photography", detail: b.deliverables || "", amount: Number(b.price) || 0 }];
  if (Number(b.travel_fee)) items.push({ label: "Travel", detail: b.travel_note || "", amount: Number(b.travel_fee) });
  if (Number(b.discount_value)) items.push({ label: "Discount", detail: b.discount_code || "", amount: -Number(b.discount_value) });
  const total = items.reduce((s2, i) => s2 + i.amount, 0);
  const deposit = Number(b.deposit_amount) || 0;
  const depositPaid = !!b.deposit_paid_at;
  const paid = b.status === "paid";
  const balance = Math.max(0, total - (deposit && depositPaid ? deposit : 0));
  return { items, total, deposit, depositPaid, paid, balance };
}

module.exports = async function handler(req, res) {
  try {
    const s = await db();
    if (req.method === "POST") {
      const body = req.body || {};
      const t = String(body.t || "");
      if (!t || t.length < 10 || body.action !== "checkout") { res.status(400).json({ error: "invalid" }); return; }
      if (!stripe.configured()) { res.status(400).json({ error: "payments-off" }); return; }
      const b = await load(s, t);
      if (!b) { res.status(404).json({ error: "not-found" }); return; }
      const L = ledger(b);
      let kind = String(body.kind || "full"), amount = 0, name = "";
      const number = "JCS-" + String(b.id).padStart(4, "0");
      if (kind === "deposit") {
        if (!L.deposit || L.depositPaid || L.paid) { res.status(400).json({ error: "nothing-due" }); return; }
        amount = L.deposit; name = `Deposit — ${b.title} (${number})`;
      } else {
        if (L.paid) { res.status(400).json({ error: "nothing-due" }); return; }
        kind = L.deposit && L.depositPaid ? "balance" : "full";
        amount = kind === "balance" ? L.balance : L.total; name = `${kind === "balance" ? "Balance — " : ""}${b.title} (${number})`;
      }
      const back = `${SITE}/invoice?t=${encodeURIComponent(t)}`;
      const out = await stripe.createCheckout({
        amount, name, description: [b.type, b.location].filter(Boolean).join(" · "),
        bookingId: b.id, kind, email: b.client_email || undefined,
        successUrl: back + "&session_id={CHECKOUT_SESSION_ID}&paid=1", cancelUrl: back,
      });
      res.status(200).json({ url: out.url });
      return;
    }

    const q = req.query || {};
    const t = String(q.t || "");
    if (!t || t.length < 10) { res.status(404).json({ error: "not-found" }); return; }
    let b = await load(s, t);
    if (!b) { res.status(404).json({ error: "not-found" }); return; }

    // Stripe return trip: verify the session and apply the payment now.
    if (q.session_id && stripe.configured() && /^cs_/.test(String(q.session_id))) {
      try {
        const sess = await stripe.getSession(String(q.session_id));
        if (sess && sess.payment_status === "paid" && sess.metadata && String(sess.metadata.booking_id) === String(b.id)) {
          await stripe.applyPayment(s, b.id, sess.metadata.kind || "full", sess.id, sess.amount_total);
          b = await load(s, t);
        }
      } catch (e) { /* the webhook will catch up */ }
    }

    const L = ledger(b);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      number: "JCS-" + String(b.id).padStart(4, "0"),
      title: b.title,
      location: b.location || "",
      shoot_date: b.shoot_date || null,
      issued: b.invoice_sent_at || b.created_at || null,
      client: { name: b.client_name || "", brokerage: b.client_brokerage || "" },
      items: L.items,
      total: L.total,
      deposit: L.deposit || 0,
      deposit_paid_at: b.deposit_paid_at || null,
      balance: L.balance,
      paid: L.paid,
      paid_at: b.paid_at || null,
      pay_online: stripe.configured() && !L.paid,
      portal_url: "/portal",
    });
  } catch (e) {
    res.status(500).json({ error: "error" });
  }
};
