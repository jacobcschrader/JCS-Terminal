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

const KEYS = ["pixieset_subdomain", "google_places_key", "google_cse_key", "google_cse_cx"];
const field = (v, max = 200) => String(v == null ? "" : v).trim().slice(0, max);

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  try {
    const s = await db();

    if (req.method === "GET") {
      const rows = await s`SELECT key, value FROM settings`;
      const settings = {};
      rows.forEach((r) => { settings[r.key] = r.value; });
      res.status(200).json({ settings });

    } else if (req.method === "PUT") {
      const b = req.body || {};
      for (const k of KEYS) {
        if (!(k in b)) continue;
        // subdomain: keep it a clean hostname label
        const v = k === "pixieset_subdomain"
          ? field(b[k], 80).toLowerCase().replace(/^https?:\/\//, "").replace(/\.pixieset\.com.*$/, "").replace(/[^a-z0-9-]/g, "")
          : field(b[k]);
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
