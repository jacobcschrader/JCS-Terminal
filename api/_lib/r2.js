// =====================================================================
//  Cloudflare R2 (S3-compatible) — zero-egress media storage.
//  Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
//       R2_PUBLIC_URL (https://media.jacobcschrader.com or the r2.dev URL)
//  When all five exist, uploads go browser → R2 via presigned PUT URLs
//  (SigV4, no SDK), public reads come off R2_PUBLIC_URL, deletes are
//  signed DELETEs. When they don't, everything stays on Vercel Blob.
// =====================================================================
const crypto = require("node:crypto");

function configured() {
  return !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET && process.env.R2_PUBLIC_URL);
}
function base() { return `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`; }
function publicBase() { return String(process.env.R2_PUBLIC_URL || "").replace(/\/+$/, ""); }
function publicUrl(key) { return publicBase() + "/" + key.split("/").map(encodeURIComponent).join("/"); }
function keyOf(url) {
  const pb = publicBase();
  if (!pb || !String(url || "").startsWith(pb + "/")) return null;
  return decodeURIComponent(String(url).slice(pb.length + 1).split("?")[0]);
}
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const hmac = (k, s) => crypto.createHmac("sha256", k).update(s).digest();

function amzDate() {
  const d = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { full: d, day: d.slice(0, 8) };
}
function signingKey(day) {
  const kDate = hmac("AWS4" + process.env.R2_SECRET_ACCESS_KEY, day);
  const kRegion = hmac(kDate, "auto");
  const kService = hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}
function canonicalKey(key) { return "/" + process.env.R2_BUCKET + "/" + key.split("/").map(enc).join("/"); }

// Presigned PUT (query-string auth) the browser can use directly.
function presignPut(key, expires) {
  const { full, day } = amzDate();
  const host = `${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const cred = `${process.env.R2_ACCESS_KEY_ID}/${day}/auto/s3/aws4_request`;
  const q = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": cred,
    "X-Amz-Date": full,
    "X-Amz-Expires": String(expires || 900),
    "X-Amz-SignedHeaders": "host",
  };
  const qs = Object.keys(q).sort().map((k) => enc(k) + "=" + enc(q[k])).join("&");
  const canonical = ["PUT", canonicalKey(key), qs, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", full, `${day}/auto/s3/aws4_request`, sha256(canonical)].join("\n");
  const sig = crypto.createHmac("sha256", signingKey(day)).update(toSign).digest("hex");
  return `${base()}${canonicalKey(key)}?${qs}&X-Amz-Signature=${sig}`;
}

// Header-signed request (server side) — used for DELETE.
async function request(method, key) {
  const { full, day } = amzDate();
  const host = `${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const payload = sha256("");
  const headers = { host, "x-amz-content-sha256": payload, "x-amz-date": full };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers).sort().map((h) => `${h}:${headers[h]}\n`).join("");
  const canonical = [method, canonicalKey(key), "", canonicalHeaders, signedHeaders, payload].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", full, `${day}/auto/s3/aws4_request`, sha256(canonical)].join("\n");
  const sig = crypto.createHmac("sha256", signingKey(day)).update(toSign).digest("hex");
  const auth = `AWS4-HMAC-SHA256 Credential=${process.env.R2_ACCESS_KEY_ID}/${day}/auto/s3/aws4_request, SignedHeaders=${signedHeaders}, Signature=${sig}`;
  return fetch(base() + canonicalKey(key), { method, headers: { Authorization: auth, "x-amz-content-sha256": payload, "x-amz-date": full } });
}
async function del(keys) {
  for (const k of [].concat(keys).filter(Boolean)) {
    try { await request("DELETE", k); } catch (e) { /* orphan is harmless */ }
  }
}

module.exports = { configured, publicUrl, keyOf, presignPut, del };
