// =====================================================================
//  /api/admin/backup — nightly backups (auth required)
//    GET             → { backups: [{at,size,path}], storage: {...} }
//    GET ?download=1 → the newest backup, decrypted, as JSON
//    POST            → run a backup now
//  Also returns the delivery storage meter (bytes across delivery files).
// =====================================================================
const { requireAuth } = require("../auth.js");
const { db } = require("../db.js");
const backup = require("../backup.js");

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  try {
    const s = await db();
    if (req.method === "POST") {
      const out = await backup.run(s);
      res.status(200).json({ ok: true, backup: out });
      return;
    }
    if (req.method !== "GET") { res.status(405).json({ error: "method-not-allowed" }); return; }
    if ((req.query || {}).download) {
      const list = await backup.latest();
      if (!list.length) { res.status(404).json({ error: "no-backups" }); return; }
      const json = await backup.fetchDecrypted(list[0].url);
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="jcs-backup-${list[0].at.slice(0, 10)}.json"`);
      res.status(200).send(json);
      return;
    }
    let backups = [], error = "";
    try { backups = (await backup.latest()).slice(0, 10).map((b) => ({ at: b.at, size: b.size, path: b.path })); }
    catch (e) { error = String(e.message || e).slice(0, 200); }
    const [st] = await s`
      SELECT count(*)::int AS files, COALESCE(sum(size), 0)::bigint AS bytes,
             count(*) FILTER (WHERE kind = 'photo')::int AS photos,
             count(*) FILTER (WHERE kind = 'film')::int AS films,
             count(*) FILTER (WHERE archived_at IS NOT NULL)::int AS archived,
             COALESCE(sum(size) FILTER (WHERE archived_at IS NULL), 0)::bigint AS live_bytes
      FROM delivery_files`;
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ backups, error, storage: { files: st.files, bytes: Number(st.bytes), live_bytes: Number(st.live_bytes), photos: st.photos, films: st.films, archived: st.archived } });
  } catch (e) {
    const msg = /DATABASE_URL/.test(String(e)) ? "db-not-configured" : "error";
    res.status(500).json({ error: msg, detail: String(e.message || e).slice(0, 200) });
  }
};
