// =====================================================================
//  GET /api/site-projects — public: published portfolio projects.
//  The site (projects-data.js) merges these with the static repo
//  projects, newest-managed first. Shape matches buildProject() there.
// =====================================================================
const { db } = require("./_lib/db.js");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") { res.status(405).json({ error: "method-not-allowed" }); return; }
  try {
    const s = await db();
    const rows = await s`
      SELECT * FROM site_projects WHERE draft = false
      ORDER BY sort_order ASC, id DESC`;
    const projects = rows.map((r) => {
      let gallery = [];
      try { gallery = JSON.parse(r.gallery || "[]"); } catch (e) {}
      return {
        slug: r.slug,
        draft: false,
        title: r.title,
        location: r.location || "",
        year: r.year || "",
        headline: r.headline || "",
        summary: r.summary || "",
        shot_for: r.shot_for || "",
        brokerage: r.brokerage || "",
        price: r.price || "",
        cover_url: r.cover_url || "",
        gallery,
        horizontal_video: r.horizontal_url || "",
        vertical_video: r.vertical_url || "",
      };
    });
    // no caching — edits, publishes, and reorders from the admin show
    // on the very next page load
    let testimonials = [];
    try {
      const t = await s`SELECT client_name, brokerage, quote FROM testimonials WHERE approved = true ORDER BY created_at DESC LIMIT 12`;
      testimonials = t.map((x) => ({ name: x.client_name || "", firm: x.brokerage || "", quote: x.quote }));
    } catch (e) { /* table may not exist yet */ }
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ projects, testimonials });
  } catch (e) {
    res.status(200).json({ projects: [] });   // site falls back to static
  }
};
