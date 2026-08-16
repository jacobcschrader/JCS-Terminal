// =====================================================================
//  SHARE-PAGE GENERATOR — run after changing projects-data.js
//
//      node tools/generate-share-pages.mjs
//
//  Why this exists: the dynamic project page renders from JavaScript,
//  but the crawlers that build link previews (iMessage, Instagram,
//  Facebook, Slack…) don't run JavaScript — they'd all see the same
//  generic preview. This script writes one static copy of project.html
//  per finished project into project/<slug>.html, with that project's
//  title, description and cover photo baked into the <head>. With
//  cleanUrls, each serves at /project/<slug> — the URL the whole site
//  links to. No Vercel rewrites involved (they proved unreliable with
//  cleanUrls; static files always win).
//
//  Drafts (draft: true) and projects without media are skipped —
//  drafts stay reachable at /project?slug=<slug> (the dynamic page).
// =====================================================================
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://www.jacobcschrader.com";

// --- load RAW_PROJECTS from the browser data file -------------------
const dataSrc = readFileSync(join(root, "projects-data.js"), "utf8");
const sandbox = { window: {} };
new Function("window", dataSrc)(sandbox.window);
const projects = (sandbox.window.PROJECTS_DATA || []).filter(p => !p.draft && p.cover_url);

// --- build one static page per project from project.html ------------
const template = readFileSync(join(root, "project.html"), "utf8");
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
// $ is special in String.replace replacements ("$2" -> capture group 2) —
// double it so prices like "$22,000,000" survive intact.
const rep = s => String(s).replace(/\$/g, "$$$$");
mkdirSync(join(root, "project"), { recursive: true });

for (const p of projects) {
  const title = `${p.title} — Jacob Schrader`;
  const bits = [p.location, p.price].filter(Boolean).join(" · ");
  const desc = `${p.headline || p.title}${bits ? " — " + bits : ""}. Photography & film by Jacob Schrader.`;
  const url = `${BASE}/project/${p.slug}`;
  const img = `${BASE}/${p.cover_url}`;

  let out = template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(">)/, `$1${rep(esc(desc))}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(">)/, `$1${rep(esc(url))}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(">)/, `$1${rep(esc(title))}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(">)/, `$1${rep(esc(desc))}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(">)/, `$1${rep(esc(url))}$2`)
    .replace(/(<meta property="og:image" content=")[^"]*(">)/, `$1${rep(esc(img))}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(">)/, `$1${rep(esc(title))}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(">)/, `$1${rep(esc(desc))}$2`)
    .replace(/(<meta name="twitter:image" content=")[^"]*(">)/, `$1${rep(esc(img))}$2`)
    // cover dimensions vary per project — drop the fixed 1200×630 hints
    .replace(/\n<meta property="og:image:(width|height)" content="\d+">/g, "")
    // the static page knows its own slug (no ?slug= in the URL)
    .replace('var slug = qs("slug");', `var slug = qs("slug") || ${JSON.stringify(p.slug)};`)
    // served from /project/<slug>, so relative asset/media paths need a root base
    .replace("<head>", '<head>\n<base href="/">');

  // JSON-LD: breadcrumb + image gallery for this project
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": `${BASE}/` },
          { "@type": "ListItem", "position": 2, "name": "Projects", "item": `${BASE}/projects` },
          { "@type": "ListItem", "position": 3, "name": p.title }
        ]
      },
      {
        "@type": "ImageGallery",
        "name": p.title,
        "description": desc,
        "url": url,
        "image": img,
        "creator": { "@type": "Person", "name": "Jacob Schrader", "url": `${BASE}/about` }
      }
    ]
  };
  out = out.replace("</head>", `<script type="application/ld+json">\n${JSON.stringify(ld, null, 1)}\n</script>\n</head>`);

  writeFileSync(join(root, "project", `${p.slug}.html`), out);
  console.log(`project/${p.slug}.html`);
}

// --- share pages are static now: drop only OLD /project/* rewrites.
// (vercel.json also carries app rewrites — /proposals/:slug and
// /portal/:slug — which must survive a regeneration.)
const vercelPath = join(root, "vercel.json");
const vercel = JSON.parse(readFileSync(vercelPath, "utf8"));
if (Array.isArray(vercel.rewrites)) {
  vercel.rewrites = vercel.rewrites.filter((r) => !String(r.source || "").startsWith("/project/"));
  if (!vercel.rewrites.length) delete vercel.rewrites;
}
writeFileSync(vercelPath, JSON.stringify(vercel, null, 2) + "\n");
console.log("vercel.json: project rewrites pruned (app rewrites kept)");
