// =====================================================================
//  Media storage switchboard — Vercel Blob today, Cloudflare R2 when the
//  R2_* env vars exist. Both can coexist: every stored URL is absolute,
//  so old files keep serving from wherever they were uploaded.
// =====================================================================
const r2 = require("./r2.js");

function isBlobUrl(u) { return /^https:\/\/[^ ]+\.public\.blob\.vercel-storage\.com\//i.test(String(u || "")); }
function isR2Url(u) { return !!r2.keyOf(u); }
function isOurs(u) { return isBlobUrl(u) || isR2Url(u); }
function provider() { return r2.configured() ? "r2" : "blob"; }

// delete a set of URLs wherever they live (best effort)
async function removeUrls(urls) {
  const list = [].concat(urls).filter(Boolean);
  const r2keys = list.map((u) => r2.keyOf(u)).filter(Boolean);
  const blobs = list.filter(isBlobUrl);
  if (r2keys.length) await r2.del(r2keys);
  if (blobs.length) {
    try { const { del } = require("@vercel/blob"); await del(blobs); } catch (e) { /* needs BLOB_READ_WRITE_TOKEN; orphans are harmless */ }
  }
}

module.exports = { isBlobUrl, isR2Url, isOurs, provider, removeUrls };
