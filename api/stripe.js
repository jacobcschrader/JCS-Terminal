// =====================================================================
//  POST /api/stripe — Stripe webhook (checkout.session.completed).
//  Authenticity: instead of raw-body signature math we re-fetch the
//  event from Stripe by id with the secret key — only real events
//  resolve. Idempotent via applyPayment. Configure in Stripe →
//  Developers → Webhooks → https://www.jacobcschrader.com/api/stripe
//  with the event checkout.session.completed.
// =====================================================================
const { db } = require("./_lib/db.js");
const stripe = require("./_lib/stripe.js");

module.exports = async function handler(req, res) {
  if (!stripe.configured()) { res.status(404).json({ error: "not-configured" }); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "method-not-allowed" }); return; }
  try {
    const body = req.body || {};
    const id = String(body.id || "");
    if (!/^evt_/.test(id)) { res.status(400).json({ error: "invalid" }); return; }
    const ev = await stripe.getEvent(id);
    if (ev.type === "checkout.session.completed") {
      const sess = ev.data && ev.data.object;
      if (sess && sess.payment_status === "paid" && sess.metadata && sess.metadata.booking_id) {
        const s = await db();
        await stripe.applyPayment(s, sess.metadata.booking_id, sess.metadata.kind || "full", sess.id, sess.amount_total);
      }
    }
    res.status(200).json({ received: true });
  } catch (e) {
    res.status(500).json({ error: "error" });
  }
};
