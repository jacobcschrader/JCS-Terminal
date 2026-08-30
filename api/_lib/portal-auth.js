// =====================================================================
//  Client-portal auth: HMAC-signed tokens (SESSION_SECRET) for
//  sign-in links ("portal-login") and session cookies ("portal-session").
//  Token format: <clientId>.<expiresEpochSec>.<sig>
// =====================================================================
const crypto = require("node:crypto");

const COOKIE = "jcs_portal";
const DAY = 24 * 60 * 60;

function secret() {
  if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET is not configured");
  return process.env.SESSION_SECRET;
}
function sign(payload, kind) {
  return crypto.createHmac("sha256", secret()).update(kind + ":" + payload).digest("base64url");
}
// value: a numeric client id (legacy links/sessions) or "e-<b64url email>"
// — since 2026-08-30 the portal identity is the EMAIL, so one login shows
// every project whose client record carries that address (primary or
// extra). Numeric tokens from old emails keep verifying.
function makeToken(value, kind, maxAgeSec) {
  const payload = `${value}.${Math.floor(Date.now() / 1000) + maxAgeSec}`;
  return `${payload}.${sign(payload, kind)}`;
}
function verifyToken(token, kind) {
  const m = /^([A-Za-z0-9_-]+)\.(\d+)\.([\w-]+)$/.exec(String(token || ""));
  if (!m) return null;
  const payload = `${m[1]}.${m[2]}`;
  const expect = sign(payload, kind);
  if (expect.length !== m[3].length ||
      !crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(m[3]))) return null;
  if (parseInt(m[2], 10) < Math.floor(Date.now() / 1000)) return null;
  return /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : m[1];
}
// email <-> token value helpers
function emailValue(email) {
  return "e-" + Buffer.from(String(email).trim().toLowerCase()).toString("base64url");
}
function tokenEmail(value) {
  if (typeof value !== "string" || value.slice(0, 2) !== "e-") return null;
  try {
    const e = Buffer.from(value.slice(2), "base64url").toString("utf8");
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e.toLowerCase() : null;
  } catch (err) { return null; }
}
// does this email belong to a client row (primary or extra_emails JSON)?
function emailMatches(email, primary, extrasJson) {
  const e = String(email || "").toLowerCase();
  if (!e) return false;
  if (String(primary || "").toLowerCase() === e) return true;
  try { return JSON.parse(extrasJson || "[]").some((x) => String(x).toLowerCase() === e); }
  catch (err) { return false; }
}
function readCookie(req) {
  const raw = String(req.headers.cookie || "");
  const m = raw.match(new RegExp("(?:^|;\\s*)" + COOKIE + "=([^;]+)"));
  return m ? m[1] : "";
}
// A 30-day sign-in URL — only ever place this in email to the client
// (or hand it to Jacob from the authed admin).
function loginUrl(clientId, projectId) {
  return `https://www.jacobcschrader.com/api/portal?login=${makeToken(clientId, "portal-login", 30 * DAY)}` +
    (projectId ? `&p=${projectId}` : "");
}
// email-identity sign-in link (portal "email me a link" flow)
function loginUrlEmail(email, projectId) {
  return `https://www.jacobcschrader.com/api/portal?login=${makeToken(emailValue(email), "portal-login", 30 * DAY)}` +
    (projectId ? `&p=${projectId}` : "");
}

module.exports = { COOKIE, DAY, makeToken, verifyToken, readCookie, loginUrl,
  loginUrlEmail, emailValue, tokenEmail, emailMatches };
