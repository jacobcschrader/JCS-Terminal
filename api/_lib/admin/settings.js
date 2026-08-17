// =====================================================================
//  /api/admin/settings — studio settings, key/value (auth required)
//    GET          → { settings: { key: value, … } }
//    PUT {k: v,…} → upsert the given pairs
//  Known keys:
//    pixieset_subdomain — "jacobschrader" → predicted gallery links
//    google_places_key  — Google Places API key for the address
//                         autocomplete in the project form
//    google_cse_key/_cx — Google Programmable Search key + engine id,
//                         powers the Licensing section's web research
// =====================================================================
const { requireAuth } = require("../auth.js");
const { db } = require("../db.js");

const KEYS = ["pixieset_subdomain", "google_places_key", "google_cse_key", "google_cse_cx",
              "serper_key", "brave_search_key"];
const field = (v, max = 200) => String(v == null ? "" : v).trim().slice(0, max);

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  try {
    const s = await db();

    if (req.method === "GET") {
      const rows = await s`SELECT key, value FROM settings`;
      const settings = {};
      rows.forEach((r) => { settings[r.key] = r.value; });
      res.status(200).json({ settings, env: {
        stripe: !!process.env.STRIPE_SECRET_KEY,
        stripe_mode: /^sk_live_/.test(process.env.STRIPE_SECRET_KEY || "") ? "live" : "test",
        blob: !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID),
        gcal: !!(process.env.GCAL_CALENDAR_ID && process.env.GOOGLE_SA_KEY),
        r2: !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET && process.env.R2_PUBLIC_URL),
        r2_public: process.env.R2_PUBLIC_URL || "",
      } });

    } else if (req.method === "PUT") {
      const b = req.body || {};
      const ok = (k) => KEYS.includes(k) || /^(tpl_[a-z_]+_(subject|note)|remind_[a-z_]+|deposit_pct|gcal_read_ids|archive_months)$/.test(k);
      for (const k of Object.keys(b)) {
        if (!ok(k)) continue;
        // subdomain: keep it a clean hostname label
        const v = k === "pixieset_subdomain"
          ? field(b[k], 80).toLowerCase().replace(/^https?:\/\//, "").replace(/\.pixieset\.com.*$/, "").replace(/[^a-z0-9-]/g, "")
          : field(b[k], k.startsWith('tpl_') ? 2000 : 200);
        await s`INSERT INTO settings (key, value) VALUES (${k}, ${v})
                ON CONFLICT (key) DO UPDATE SET value = ${v}`;
      }
      const rows = await s`SELECT key, value FROM settings`;
      const settings = {};
      rows.forEach((r) => { settings[r.key] = r.value; });
      res.status(200).json({ ok: true, settings });

    } else {
      res.status(405).json({ error: "method-not-allowed" });
    }
  } catch (e) {
    const msg = /DATABASE_URL/.test(String(e)) ? "db-not-configured" : "db-error";
    res.status(500).json({ error: msg });
  }
};
