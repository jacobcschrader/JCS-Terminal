// =====================================================================
//  /api/admin/bookings — booking CRUD (auth required)
//    GET              → list bookings (with client name)
//    POST   {fields}  → create
//    PUT    {id, ...} → update
//    DELETE {id}      → delete
//  Pipeline stages: upcoming | editing | revisions | delivered | completed | paid
//  (+ canceled, + pending = proposal sent, not yet accepted — sits
//  before the pipeline; accepting the proposal flips it to upcoming).
//  Delivery: media lives in delivery_files (see admin/files.js); every
//  booking carries delivery_slug (portal URL) + downloads_locked.
// =====================================================================
const crypto = require("node:crypto");
const { requireAuth } = require("../auth.js");
const { db } = require("../db.js");
const { ensureSlug } = require("../delivery.js");
const { logEvent } = require("../events.js");

const field = (v, max = 300) => String(v == null ? "" : v).trim().slice(0, max);
const STATUSES = ["pending", "upcoming", "editing", "revisions", "delivered", "completed", "paid", "canceled"];

function parse(b) {
  return {
    title: field(b.title, 200),
    location: field(b.location, 200),
    shoot_date: field(b.shoot_date, 10) || null,   // YYYY-MM-DD
    shoot_time: field(b.shoot_time, 40),
    type: field(b.type, 100),
    price: b.price === "" || b.price == null ? null : Number(b.price) || null,
    status: STATUSES.includes(b.status) ? b.status : "upcoming",
    notes: field(b.notes, 5000),
    client_id: b.client_id ? parseInt(b.client_id, 10) || null : null,
    delivery_url: field(b.delivery_url, 600),
    delivered_at: field(b.delivered_at, 10) || null,
    twilight_date: field(b.twilight_date, 10) || null,
    twilight_time: field(b.twilight_time, 40),
    deliverables: field(b.deliverables, 2000),
    city: field(b.city, 120),
    state: field(b.state, 10),
    zip: field(b.zip, 12),
    sqft: b.sqft === "" || b.sqft == null ? null : parseInt(b.sqft, 10) || null,
    addons: field(b.addons, 2000),
    travel_fee: b.travel_fee === "" || b.travel_fee == null ? null : Number(b.travel_fee) || null,
    travel_note: field(b.travel_note, 300),
    show_price: b.show_price !== false && b.show_price !== "false",
    skip_confirmation: b.skip_confirmation === true || b.skip_confirmation === "true",
    discount_code: field(b.discount_code, 40).toUpperCase().replace(/\s+/g, ""),
    download_url: field(b.download_url, 600),
    delivery_message: field(b.delivery_message, 2000),
    delivery_cc: field(b.delivery_cc, 600),
    delivery_links: parseLinks(b.delivery_links),
    delivery_cover_url: field(b.delivery_cover_url, 600),
    delivery_created_at: field(b.delivery_created_at, 40) || null,
    deposit_paid: b.deposit_paid === true,   // "Deposit received" (manual)
  };
}

// Named delivery links: JSON array of { label, url }. Validated and
// re-stringified so the DB only ever holds clean JSON (or '').
// URLs without a scheme ("jacobcschrader.com") get https:// prepended —
// otherwise browsers treat them as relative links on the client page.
function absUrl(u) {
  if (!u) return "";
  return /^https?:\/\//i.test(u) ? u : "https://" + u.replace(/^\/+/, "");
}
function parseLinks(raw) {
  try {
    const arr = typeof raw === "string" ? JSON.parse(raw || "[]") : raw || [];
    const clean = (Array.isArray(arr) ? arr : [])
      .map((l) => ({ label: field(l && l.label, 80), url: absUrl(field(l && l.url, 600)) }))
      .filter((l) => l.url)
      .slice(0, 12);
    return clean.length ? JSON.stringify(clean) : "";
  } catch (e) { return ""; }
}

// Snapshot the discount in dollars at save time (so later edits to the
// code definition never change past projects).
async function applyDiscount(s, f) {
  if (!f.discount_code) { f.discount_value = null; return; }
  const [d] = await s`SELECT * FROM discounts WHERE upper(code) = ${f.discount_code} AND active = true`;
  if (!d) { f.discount_code = ""; f.discount_value = null; return; }
  f.discount_code = d.code;
  const price = Number(f.price) || 0;
  f.discount_value = d.kind === "percent"
    ? Math.round(price * Number(d.value)) / 100
    : Math.min(Number(d.value), price);
}

// location is derived: "City, ST 96145" (falls back to a raw location string)
function makeLocation(f, raw) {
  const cityBit = [f.city, [f.state, f.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return cityBit || field(raw, 200);
}

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  try {
    const s = await db();
    const b = req.body || {};

    if (req.method === "GET") {
      const rows = await s`
        SELECT bk.*, c.name AS client_name, c.email AS client_email,
               (SELECT count(*)::int FROM delivery_files f WHERE f.booking_id = bk.id) AS files_count
        FROM bookings bk LEFT JOIN clients c ON c.id = bk.client_id
        ORDER BY bk.shoot_date DESC NULLS LAST, bk.id DESC`;
      // portal slugs are lazy — backfill any listing that predates them
      for (const r of rows) if (!r.delivery_slug) await ensureSlug(s, r);
      res.status(200).json({ bookings: rows });

    } else if (req.method === "POST") {
      const f = parse(b);
      f.location = makeLocation(f, b.location);
      await applyDiscount(s, f);
      if (!f.title) { res.status(400).json({ error: "title-required" }); return; }
      const token = (f.delivery_links || f.delivery_url) ? crypto.randomBytes(12).toString("base64url") : "";
      const [row] = await s`
        INSERT INTO bookings (client_id, title, location, shoot_date, shoot_time, type, price, status, notes, delivery_url, delivered_at, twilight_date, twilight_time, deliverables, city, state, zip, sqft, addons, travel_fee, travel_note, show_price, skip_confirmation, discount_code, discount_value, download_url, delivery_message, delivery_cc, delivery_links, delivery_token)
        VALUES (${f.client_id}, ${f.title}, ${f.location}, ${f.shoot_date}, ${f.shoot_time}, ${f.type}, ${f.price}, ${f.status}, ${f.notes}, ${f.delivery_url}, ${f.delivered_at}, ${f.twilight_date}, ${f.twilight_time}, ${f.deliverables}, ${f.city}, ${f.state}, ${f.zip}, ${f.sqft}, ${f.addons}, ${f.travel_fee}, ${f.travel_note}, ${f.show_price}, ${f.skip_confirmation}, ${f.discount_code}, ${f.discount_value}, ${f.download_url}, ${f.delivery_message}, ${f.delivery_cc}, ${f.delivery_links}, ${token})
        RETURNING *`;
      await logEvent(s, row.id, "created", "Project created" + (f.status !== "upcoming" ? " · " + f.status : ""), "admin");
      res.status(200).json({ booking: row });

    } else if (req.method === "PUT") {
      const id = parseInt(b.id, 10);
      const f = parse(b);
      f.location = makeLocation(f, b.location);
      await applyDiscount(s, f);
      if (!id || !f.title) { res.status(400).json({ error: "invalid" }); return; }
      const [before] = await s`SELECT status, deposit_paid_at FROM bookings WHERE id = ${id}`;
      const [row] = await s`
        UPDATE bookings SET
          client_id = ${f.client_id}, title = ${f.title}, location = ${f.location},
          shoot_date = ${f.shoot_date}, shoot_time = ${f.shoot_time}, type = ${f.type},
          price = ${f.price}, status = ${f.status}, notes = ${f.notes},
          delivery_url = ${f.delivery_url}, delivered_at = ${f.delivered_at},
          twilight_date = ${f.twilight_date}, twilight_time = ${f.twilight_time},
          deliverables = ${f.deliverables}, city = ${f.city}, state = ${f.state}, zip = ${f.zip},
          sqft = ${f.sqft}, addons = ${f.addons}, travel_fee = ${f.travel_fee},
          travel_note = ${f.travel_note}, show_price = ${f.show_price},
          skip_confirmation = ${f.skip_confirmation},
          discount_code = ${f.discount_code}, discount_value = ${f.discount_value},
          download_url = ${f.download_url},
          delivery_message = ${f.delivery_message}, delivery_cc = ${f.delivery_cc},
          delivery_links = ${f.delivery_links},
          delivery_cover_url = ${f.delivery_cover_url},
          delivery_created_at = COALESCE(delivery_created_at, ${f.delivery_created_at}),
          delivery_token = COALESCE(NULLIF(delivery_token, ''), ${(f.delivery_links || f.delivery_url) ? crypto.randomBytes(12).toString("base64url") : null}),
          paid_at = CASE WHEN ${f.status} = 'paid' THEN COALESCE(paid_at, now()) ELSE NULL END,
          downloads_locked = CASE WHEN ${f.status} = 'paid' THEN false ELSE downloads_locked END,
          deposit_paid_at = CASE WHEN ${f.deposit_paid} THEN COALESCE(deposit_paid_at, now()) ELSE deposit_paid_at END
        WHERE id = ${id} RETURNING *`;
      if (!row) { res.status(404).json({ error: "not-found" }); return; }
      if (before && before.status !== row.status) await logEvent(s, id, "stage", "Moved to " + row.status + (row.status === "paid" ? " · downloads unlocked" : ""), "admin");
      if (f.deposit_paid && !before.deposit_paid_at) await logEvent(s, id, "invoice", "Deposit received (recorded manually)", "admin");
      res.status(200).json({ booking: row });

    } else if (req.method === "DELETE") {
      const id = parseInt(b.id, 10);
      if (!id) { res.status(400).json({ error: "invalid" }); return; }
      await s`DELETE FROM project_events WHERE booking_id = ${id}`;
      await s`DELETE FROM download_events WHERE booking_id = ${id}`;
      await s`DELETE FROM delivery_files WHERE booking_id = ${id}`;
      await s`DELETE FROM bookings WHERE id = ${id}`;
      res.status(200).json({ ok: true });

    } else {
      res.status(405).json({ error: "method-not-allowed" });
    }
  } catch (e) {
    const msg = /DATABASE_URL/.test(String(e)) ? "db-not-configured" : "db-error";
    res.status(500).json({ error: msg });
  }
};
