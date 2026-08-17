// =====================================================================
//  POST /api/admin/upload — Vercel Blob client-upload broker (auth req.)
//  The browser uploads media STRAIGHT to Blob storage (no 4.5MB function
//  limit); this endpoint only authenticates the request and issues the
//  short-lived client token. Requires a Blob store connected to the
//  project (Vercel → Storage → Blob), which injects BLOB_READ_WRITE_TOKEN.
// =====================================================================
const { requireAuth } = require("../auth.js");
const { handleUpload } = require("@vercel/blob/client");
const r2 = require("../r2.js");

const OK_TYPES = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime", "application/pdf"];

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== "POST") { res.status(405).json({ error: "method-not-allowed" }); return; }
  // ---- Cloudflare R2: hand the browser a presigned PUT ------------------
  const body = req.body || {};
  if (body.action === "presign") {
    if (!r2.configured()) { res.status(400).json({ error: "r2-not-configured" }); return; }
    const key = String(body.path || "").replace(/^\/+/, "");
    const type = String(body.type || "application/octet-stream");
    if (!/^(delivery\/\d+\/|site\/)[\w.\-\/() ]+$/.test(key) || key.includes("..")) { res.status(400).json({ error: "bad-path" }); return; }
    if (!OK_TYPES.includes(type)) { res.status(400).json({ error: "bad-type" }); return; }
    res.status(200).json({ url: r2.presignPut(key, 900), publicUrl: r2.publicUrl(key), key });
    return;
  }
  // Newer stores authenticate via BLOB_STORE_ID + Vercel OIDC instead of
  // a BLOB_READ_WRITE_TOKEN env — accept either.
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
    res.status(500).json({ error: "blob-not-configured" });
    return;
  }

  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        // Client deliveries: the browser already puts every file in its
        // own random folder (delivery/<id>/<rand>/name.jpg), so the
        // stored name stays clean — that's the filename the client's
        // browser saves as. Films can be big; multipart handles it.
        const delivery = /^delivery\/\d+\//.test(pathname);
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime", "application/pdf"],
          maximumSizeInBytes: (delivery ? 4000 : 500) * 1024 * 1024,
          addRandomSuffix: !delivery,
          cacheControlMaxAge: 31536000,
        };
      },
      // Fire-and-forget: nothing to do after upload — the editor sends
      // the final URLs with the project save.
      onUploadCompleted: async () => {},
    });
    res.status(200).json(jsonResponse);
  } catch (e) {
    res.status(400).json({ error: String((e && e.message) || "upload-error") });
  }
};
