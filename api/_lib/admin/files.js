// =====================================================================
//  /api/admin/files — a listing's media + delivery controls (auth req.)
//    GET    ?id=<booking>            → { files, events, booking: {slug, locked…} }
//    POST   { id, files: [{kind,name,url,web_url,thumb_url,size,width,height}] }
//                                    → append uploaded files (Blob URLs
//                                      come from the browser upload)
//    PUT    { id, action: 'cover', file_id }   → set the cover photo
//           { id, action: 'lock',  locked }    → lock / unlock downloads
//           { id, action: 'sort',  order: [file ids] }
//    DELETE { id, file_id }          → remove a file (row + blobs)
//  The first upload also stamps delivery_created_at, issues the delivery
//  token (share-preview links) and makes sure the portal slug exists.
// =====================================================================
const crypto = require("node:crypto");
const { requireAuth } = require("../auth.js");
const { db } = require("../db.js");
const { ensureSlug, filesOf } = require("../delivery.js");
const { logEvent } = require("../events.js");

let blobDel = null;
try { blobDel = require("@vercel/blob").del; } catch (e) { blobDel = null; }

const field = (v, max = 300) => String(v == null ? "" : v).trim().slice(0, max);
const KINDS = ["photo", "film", "file"];

async function bookingOf(s, id) {
  const [b] = await s`
    SELECT bk.*, c.name AS client_name, c.email AS client_email
    FROM bookings bk LEFT JOIN clients c ON c.id = bk.client_id WHERE bk.id = ${id}`;
  return b;
}

function shape(b) {
  return {
    id: b.id,
    slug: b.delivery_slug || "",
    locked: !!b.downloads_locked,
    cover_url: (b.delivery_cover_url && b.delivery_cover_url !== "-") ? b.delivery_cover_url : "",
    delivery_token: b.delivery_token || "",
    delivery_sent_at: b.delivery_sent_at || null,
    delivery_sends: Number(b.delivery_sends) || 0,
    delivery_created_at: b.delivery_created_at || null,
    client_email: b.client_email || "",
  };
}

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  try {
    const s = await db();
    const body = req.body || {};
    const id = parseInt(req.method === "GET" ? (req.query || {}).id : body.id, 10);
    if (!id) { res.status(400).json({ error: "invalid" }); return; }
    const b = await bookingOf(s, id);
    if (!b) { res.status(404).json({ error: "not-found" }); return; }

    if (req.method === "GET") {
      await ensureSlug(s, b);
      const files = await filesOf(s, id);
      const events = await s`
        SELECT id, file_id, kind, label, email, created_at FROM download_events
        WHERE booking_id = ${id} ORDER BY created_at DESC LIMIT 60`;
      const timeline = await s`
        SELECT id, kind, label, actor, meta, created_at FROM project_events
        WHERE booking_id = ${id} ORDER BY created_at DESC LIMIT 120`;
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json({ booking: shape(b), files, events, timeline });
      return;
    }

    if (req.method === "POST") {
      const incoming = Array.isArray(body.files) ? body.files.slice(0, 400) : [];
      const clean = incoming.map((f) => ({
        kind: KINDS.includes(f.kind) ? f.kind : "file",
        name: field(f.name, 200) || "file",
        url: field(f.url, 800),
        web_url: field(f.web_url, 800),
        thumb_url: field(f.thumb_url, 800),
        size: Math.max(0, parseInt(f.size, 10) || 0),
        width: parseInt(f.width, 10) || null,
        height: parseInt(f.height, 10) || null,
      })).filter((f) => /^https:\/\/[^ ]+\.public\.blob\.vercel-storage\.com\//i.test(f.url));
      if (!clean.length) { res.status(400).json({ error: "no-files" }); return; }

      const [mx] = await s`SELECT COALESCE(MAX(sort_order), 0) AS m FROM delivery_files WHERE booking_id = ${id}`;
      let order = Number(mx.m) || 0;
      for (const f of clean) {
        order += 1;
        await s`
          INSERT INTO delivery_files (booking_id, kind, name, url, web_url, thumb_url, size, width, height, sort_order)
          VALUES (${id}, ${f.kind}, ${f.name}, ${f.url}, ${f.web_url}, ${f.thumb_url}, ${f.size}, ${f.width}, ${f.height}, ${order})`;
      }
      await ensureSlug(s, b);
      // first media = the delivery exists: draft stamp + share token; the
      // first photo becomes the cover until Jacob picks one.
      const firstPhoto = clean.find((f) => f.kind === "photo");
      const hasCover = b.delivery_cover_url && b.delivery_cover_url !== "-";
      await s`
        UPDATE bookings SET
          delivery_created_at = COALESCE(delivery_created_at, now()),
          delivery_token = COALESCE(NULLIF(delivery_token, ''), ${crypto.randomBytes(12).toString("base64url")}),
          delivery_cover_url = ${(!hasCover && firstPhoto) ? (firstPhoto.web_url || firstPhoto.url) : (b.delivery_cover_url || "")}
        WHERE id = ${id}`;
      const files = await filesOf(s, id);
      const nP = clean.filter((f) => f.kind === "photo").length, nF = clean.filter((f) => f.kind === "film").length;
      await logEvent(s, id, "files", "Uploaded " + [nP ? nP + (nP === 1 ? " photo" : " photos") : "", nF ? nF + (nF === 1 ? " film" : " films") : "", (clean.length - nP - nF) ? (clean.length - nP - nF) + " file(s)" : ""].filter(Boolean).join(", "), "admin");
      res.status(200).json({ ok: true, files, booking: shape(await bookingOf(s, id)) });
      return;
    }

    if (req.method === "PUT") {
      const action = String(body.action || "");
      if (action === "cover") {
        const fid = parseInt(body.file_id, 10);
        const [f] = await s`SELECT * FROM delivery_files WHERE id = ${fid} AND booking_id = ${id}`;
        if (!f) { res.status(404).json({ error: "not-found" }); return; }
        const cover = f.web_url || f.thumb_url || f.url;
        await s`UPDATE bookings SET delivery_cover_url = ${cover} WHERE id = ${id}`;
        await logEvent(s, id, "cover", "Cover set to " + f.name, "admin");
        res.status(200).json({ ok: true, cover_url: cover });
        return;
      }
      if (action === "lock") {
        const locked = body.locked === true || body.locked === "true";
        await s`UPDATE bookings SET downloads_locked = ${locked} WHERE id = ${id}`;
        await logEvent(s, id, "lock", locked ? "Downloads locked" : "Downloads unlocked", "admin");
        res.status(200).json({ ok: true, locked });
        return;
      }
      if (action === "rename") {
        const fid = parseInt(body.file_id, 10);
        const name = field(body.name, 200);
        if (!fid || !name) { res.status(400).json({ error: "invalid" }); return; }
        await s`UPDATE delivery_files SET name = ${name} WHERE id = ${fid} AND booking_id = ${id}`;
        res.status(200).json({ ok: true, files: await filesOf(s, id) });
        return;
      }
      if (action === "note") {
        const text = field(body.text, 2000);
        if (!text) { res.status(400).json({ error: "invalid" }); return; }
        await logEvent(s, id, "note", text, "admin");
        const timeline = await s`SELECT id, kind, label, actor, meta, created_at FROM project_events WHERE booking_id = ${id} ORDER BY created_at DESC LIMIT 120`;
        res.status(200).json({ ok: true, timeline });
        return;
      }
      if (action === "delnote") {
        const eid = parseInt(body.event_id, 10);
        await s`DELETE FROM project_events WHERE id = ${eid} AND booking_id = ${id} AND kind = 'note'`;
        const timeline = await s`SELECT id, kind, label, actor, meta, created_at FROM project_events WHERE booking_id = ${id} ORDER BY created_at DESC LIMIT 120`;
        res.status(200).json({ ok: true, timeline });
        return;
      }
      if (action === "sort") {
        const order = (Array.isArray(body.order) ? body.order : []).map((x) => parseInt(x, 10)).filter(Boolean).slice(0, 1000);
        for (let i = 0; i < order.length; i++) {
          await s`UPDATE delivery_files SET sort_order = ${i + 1} WHERE id = ${order[i]} AND booking_id = ${id}`;
        }
        res.status(200).json({ ok: true });
        return;
      }
      res.status(400).json({ error: "invalid" });
      return;
    }

    if (req.method === "DELETE") {
      const fid = parseInt(body.file_id, 10);
      const [f] = await s`SELECT * FROM delivery_files WHERE id = ${fid} AND booking_id = ${id}`;
      if (!f) { res.status(404).json({ error: "not-found" }); return; }
      await s`DELETE FROM delivery_files WHERE id = ${fid}`;
      // if this was the cover, fall back to the next photo (or none)
      const cover = b.delivery_cover_url || "";
      if (cover && [f.url, f.web_url, f.thumb_url].includes(cover)) {
        const [next] = await s`SELECT * FROM delivery_files WHERE booking_id = ${id} AND kind = 'photo' ORDER BY sort_order ASC, id ASC LIMIT 1`;
        await s`UPDATE bookings SET delivery_cover_url = ${next ? (next.web_url || next.url) : ""} WHERE id = ${id}`;
      }
      // best-effort blob cleanup (needs BLOB_READ_WRITE_TOKEN; orphans are harmless)
      if (blobDel) {
        const urls = [f.url, f.web_url, f.thumb_url].filter(Boolean);
        try { await blobDel(urls); } catch (e) { /* ignore */ }
      }
      await logEvent(s, id, "files", "Removed " + f.name, "admin");
      res.status(200).json({ ok: true, files: await filesOf(s, id) });
      return;
    }

    res.status(405).json({ error: "method-not-allowed" });
  } catch (e) {
    const msg = /DATABASE_URL/.test(String(e)) ? "db-not-configured" : "db-error";
    res.status(500).json({ error: msg });
  }
};
