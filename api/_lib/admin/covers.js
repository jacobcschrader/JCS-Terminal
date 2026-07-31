// =====================================================================
//  POST /api/admin/covers — backfill delivery cover images (admin).
//  For bookings that have delivery links but no cached cover, fetch
//  the first gallery link and pull its og:image (Pixieset galleries
//  expose their cover photo this way). Processes a few per call —
//  the Deliveries page fires it in the background and refreshes.
// =====================================================================
const { requireAuth } = require("../auth.js");
const { db } = require("../db.js");
const { linksOf } = require("../links.js");

async function ogImage(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    // Full browser UA — some hosts 403 obvious bots. (Pixieset sits
    // behind a Cloudflare JS challenge that no server fetch passes,
    // which is why portfolio matching below is the primary source.)
    const r = await fetch(url, { signal: ctrl.signal, redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" } });
    if (!r.ok) return "";
    const html = (await r.text()).slice(0, 200000);
    const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
          || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return m && /^https?:\/\//.test(m[1]) ? m[1].slice(0, 600) : "";
  } catch (e) {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

// Cover resolution, most reliable first: a portfolio project with the
// same property title (Blob-hosted, always loads) -> the gallery
// link's og:image (works on hosts without bot challenges) -> miss.
const slugKey = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
async function portfolioCover(s, title) {
  if (!title) return "";
  const key = slugKey(title);
  if (!key) return "";
  const rows = await s`SELECT title, cover_url FROM site_projects WHERE cover_url != ''`;
  const hit = rows.find((p) => slugKey(p.title) === key);
  return hit ? String(hit.cover_url).slice(0, 600) : "";
}
async function coverFor(s, b, links) {
  return (await portfolioCover(s, b.title)) ||
    (links && links.length ? await ogImage(links[0].url) : "");
}

async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== "POST") { res.status(405).json({ error: "method-not-allowed" }); return; }

  try {
    const s = await db();
    const rows = await s`
      SELECT * FROM bookings
      WHERE delivery_cover_url = '' AND (delivery_links != '' OR delivery_url != '')
      ORDER BY id DESC LIMIT 4`;
    let updated = 0;
    for (const b of rows) {
      const links = linksOf(b);
      if (!links.length) continue;
      const img = await coverFor(s, b, links);
      // cache '-' for misses so we don't refetch forever
      await s`UPDATE bookings SET delivery_cover_url = ${img || "-"} WHERE id = ${b.id}`;
      if (img) updated++;
    }
    res.status(200).json({ ok: true, checked: rows.length, updated });
  } catch (e) {
    const msg = /DATABASE_URL/.test(String(e)) ? "db-not-configured" : "error";
    res.status(500).json({ error: msg });
  }
}

module.exports = handler;
module.exports.ogImage = ogImage;
module.exports.coverFor = coverFor;   // reused by deliver.js at send time
