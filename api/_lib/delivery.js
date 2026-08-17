// =====================================================================
//  Custom delivery system — shared helpers.
//
//  A project ("listing") owns its media in Vercel Blob (delivery_files)
//  and is reachable in the client portal at /portal/<delivery_slug>.
//  Photos are stored three ways — original, 2048px "web" (MLS bundle +
//  on-page viewing) and ~640px thumb; films are original + poster thumb.
//  Downloads are logged in download_events (dashboard feed).
// =====================================================================

function slugify(title) {
  return String(title || "").toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// Every listing gets a stable portal slug the first time anything needs
// it (admin list, delivery send, portal). Unique per booking: a second
// "150 Humphrey Road" becomes 150-humphrey-road-2.
async function ensureSlug(s, b) {
  if (b.delivery_slug) return b.delivery_slug;
  const base = slugify(b.title) || ("listing-" + b.id);
  let slug = base;
  for (let n = 2; n < 50; n++) {
    const [hit] = await s`SELECT id FROM bookings WHERE delivery_slug = ${slug} AND id <> ${b.id} LIMIT 1`;
    if (!hit) break;
    slug = base + "-" + n;
  }
  await s`UPDATE bookings SET delivery_slug = ${slug} WHERE id = ${b.id} AND (delivery_slug IS NULL OR delivery_slug = '')`;
  b.delivery_slug = slug;
  return slug;
}

async function filesOf(s, bookingId) {
  return s`SELECT * FROM delivery_files WHERE booking_id = ${bookingId} ORDER BY sort_order ASC, id ASC`;
}

// Client-safe file shape. When downloads are locked the originals stay
// server-side: photos keep web + thumb for viewing, films keep the
// stream URL (needed to play) but the page hides every download control.
function publicFile(f, locked) {
  const isFilm = f.kind === "film";
  return {
    id: f.id,
    kind: f.kind,
    name: f.name,
    url: (!locked || isFilm) ? f.url : "",
    web: f.web_url || "",
    thumb: f.thumb_url || "",
    size: Number(f.size) || 0,
    width: f.width || null,
    height: f.height || null,
    archived: !!f.archived_at,
  };
}

function summarize(files) {
  const photos = files.filter((f) => f.kind === "photo").length;
  const films = files.filter((f) => f.kind === "film").length;
  const other = files.length - photos - films;
  const parts = [];
  if (photos) parts.push(photos + (photos === 1 ? " photo" : " photos"));
  if (films) parts.push(films + (films === 1 ? " film" : " films"));
  if (other) parts.push(other + (other === 1 ? " file" : " files"));
  return parts.join(" · ");
}

async function logDownload(s, req, ev) {
  const ip = String((req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "")).split(",")[0].trim().slice(0, 64);
  const ua = String(req.headers["user-agent"] || "").slice(0, 200);
  await s`
    INSERT INTO download_events (booking_id, file_id, kind, label, email, ip, ua)
    VALUES (${ev.booking_id}, ${ev.file_id || null}, ${ev.kind || "file"}, ${String(ev.label || "").slice(0, 200)},
            ${String(ev.email || "").toLowerCase().slice(0, 200)}, ${ip}, ${ua})`;
}

module.exports = { slugify, ensureSlug, filesOf, publicFile, summarize, logDownload };
