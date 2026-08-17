// =====================================================================
//  Nightly backup — every table as JSON, encrypted (AES-256-GCM, key
//  derived from SESSION_SECRET) and stored in Vercel Blob under
//  backups/YYYY-MM-DD.json.enc. The store is public but the file is
//  ciphertext behind a random-suffixed URL. Keeps the last 30.
//  Restore: admin Settings → Download latest backup (decrypted JSON).
// =====================================================================
const crypto = require("node:crypto");

const TABLES = ["clients", "bookings", "requests", "proposals", "license_leads", "delivery_files",
  "download_events", "project_events", "tasks", "testimonials", "settings", "discounts", "site_projects"];

function key() {
  if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET is not configured");
  return crypto.createHash("sha256").update("jcs-backup:" + process.env.SESSION_SECRET).digest();
}
function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]);   // 12 iv + 16 tag + data
}
function decrypt(buf) {
  const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), data = buf.subarray(28);
  const d = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}

// one tagged query per table (the neon tag needs static SQL)
const Q = {
  clients: (s) => s`SELECT * FROM clients`,
  bookings: (s) => s`SELECT * FROM bookings`,
  requests: (s) => s`SELECT * FROM requests`,
  proposals: (s) => s`SELECT * FROM proposals`,
  license_leads: (s) => s`SELECT * FROM license_leads`,
  delivery_files: (s) => s`SELECT * FROM delivery_files`,
  download_events: (s) => s`SELECT * FROM download_events`,
  project_events: (s) => s`SELECT * FROM project_events`,
  tasks: (s) => s`SELECT * FROM tasks`,
  testimonials: (s) => s`SELECT * FROM testimonials`,
  settings: (s) => s`SELECT * FROM settings`,
  discounts: (s) => s`SELECT * FROM discounts`,
  site_projects: (s) => s`SELECT * FROM site_projects`,
};
async function dump(s) {
  const out = { taken_at: new Date().toISOString(), tables: {} };
  for (const t of TABLES) {
    try { out.tables[t] = await Q[t](s); }
    catch (e) { out.tables[t] = { error: String(e.message || e).slice(0, 200) }; }
  }
  return out;
}

async function run(s) {
  const blob = require("@vercel/blob");
  const data = await dump(s);
  const day = data.taken_at.slice(0, 10);
  const body = encrypt(JSON.stringify(data));
  const put = await blob.put(`backups/${day}.json.enc`, body, { access: "public", addRandomSuffix: true, contentType: "application/octet-stream" });
  // retention: keep the newest 30
  try {
    const { blobs } = await blob.list({ prefix: "backups/" });
    const sorted = blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    const old = sorted.slice(30).map((b) => b.url);
    if (old.length) await blob.del(old);
  } catch (e) { /* retention is best-effort */ }
  return { url: put.url, day, bytes: body.length, tables: Object.keys(data.tables).length };
}

async function latest() {
  const blob = require("@vercel/blob");
  const { blobs } = await blob.list({ prefix: "backups/" });
  return blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)).map((b) => ({ url: b.url, at: b.uploadedAt, size: b.size, path: b.pathname }));
}

async function fetchDecrypted(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("fetch " + r.status);
  return decrypt(Buffer.from(await r.arrayBuffer()));
}

module.exports = { run, latest, fetchDecrypted, TABLES };
