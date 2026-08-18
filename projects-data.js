// =====================================================================
//  PROJECTS
//  ---------------------------------------------------------------------
//  HOW TO ADD / EDIT A PROJECT
//
//  1. Make ONE folder for everything (photos + videos):
//       projects/<folder-name>/
//         cover.jpg          <- the cover (shown on home + projects grid)
//         1.jpg, 2.jpg, …     <- gallery photos, numbered in order
//         horizontal.mp4      <- optional 16:9 film
//         vertical.mp4        <- optional 9:16 reel
//
//  2. In the list below, fill in the text and set:
//       slug:        the URL — lowercase address, no spaces/hyphens
//                    (e.g. "123mainst" -> jacobcschrader.com/project/123mainst)
//       folder:      the folder name from step 1  (e.g. "420-toro-canyon")
//       photos:      how many numbered gallery photos (1.jpg..N.jpg)
//       horizontal:  true if there's a horizontal.mp4
//       vertical:    true if there's a vertical.mp4
//
//  Leave folder as "" for a project whose media isn't ready yet — it
//  will show elegant placeholders until you add it.
//
//  draft: true  hides a project from the home carousel and the projects
//  grid (it stays reachable at its direct /project/<slug> URL). Remove
//  the flag when the real media + text are in.
//
//  TIP: to add a project, duplicate a project folder, swap in the new
//  media (keep the same names: cover.jpg, 1.jpg, 2.jpg…), then copy one
//  entry below, rename its folder/slug, and update the text + counts.
//
//  Notes: photos must be .jpg and named 1.jpg, 2.jpg, …; the cover is
//  cover.jpg. The site builds every file path automatically.
// =====================================================================

var RAW_PROJECTS = [
  { slug: "2350bigranchroad",   folder: "2350-big-ranch-road",  title: "2350 Big Ranch Road",  location: "Napa, CA",          year: "2026", headline: "Vineyard Estate",          summary: "", shot_for: "Ginger Martin",    brokerage: "Sotheby's",          price: "$14,900,000", photos: 44, horizontal: false, vertical: false },
  { slug: "3nlasendadrive",     folder: "3-n-la-senda-drive",   title: "3 N La Senda Drive",   location: "Laguna Beach, CA",  year: "2025", headline: "3 Arch Bay Estate",        summary: "", shot_for: "Leita Covington",  brokerage: "Berkshire Hathaway", price: "$22,000,000", photos: 23, horizontal: true,  vertical: false },
  { slug: "465headwatersway",   folder: "465-headwaters-way",   title: "465 Headwaters Way",   location: "Carson City, NV",   year: "2026", headline: "Clear Creek Estate",       summary: "", shot_for: "Georgia Chase", brokerage: "Chase International", price: "$4,395,000", photos: 11, horizontal: false, vertical: true },
  { slug: "5211pennockpoint",   folder: "5211-pennock-point",   title: "5211 Pennock Point",   location: "Jupiter, FL",       year: "2025", headline: "Loxahatchee River Estate", summary: "", shot_for: "Dan Malloy",       brokerage: "Serhant",            price: "$45,000,000", photos: 22, horizontal: false, vertical: false },
  { slug: "55delmontedrive",    folder: "55-del-monte-drive",   title: "55 Del Monte Drive",   location: "Hillsborough, CA",  year: "2025", headline: "\u2018The Innovation\u2019", summary: "", shot_for: "Geoffrey Nelson", brokerage: "Coldwell Banker",   price: "$12,600,000", photos: 12, horizontal: true,  vertical: false },
  { slug: "8076villandrydrive", folder: "8076-villandry-drive", title: "8076 Villandry Drive", location: "Truckee, CA",       year: "2026", headline: "Martis Camp Estate",       summary: "", shot_for: "Eric Navarro", brokerage: "Compass",     price: "$6,995,000",  photos: 10, horizontal: true,  vertical: false },
  { slug: "9233heartwooddrive", folder: "9233-heartwood-drive", title: "9233 Heartwood Drive", location: "Truckee, CA",       year: "2026", headline: "Schaffers Mill Estate",    summary: "", shot_for: "Eric Navarro",     brokerage: "Compass",            price: "$4,250,000",  photos: 23, horizontal: false, vertical: false },
  { slug: "9290braeroad",       folder: "9290-brae-road",       title: "9290 Brae Road",       location: "Truckee, CA",       year: "2026", headline: "Schaffers Mill Estate",    summary: "", shot_for: "Eric Navarro",     brokerage: "Compass",            price: "$4,350,000",  photos: 49, horizontal: false, vertical: false },
  { slug: "9304ninebarkroad",   folder: "9304-ninebark-road",   title: "9304 Ninebark Road",   location: "Truckee, CA",       year: "2026", headline: "Schaffers Mill Estate",    summary: "", shot_for: "Eric Navarro", brokerage: "Compass", price: "$6,995,000", photos: 11, horizontal: true,  vertical: false }
];

// Build the full project objects (file paths derived from the folder).
function buildProject(p) {
  var dir = "projects/" + p.folder + "/";   // photos + videos live together here
  var gallery = [];
  if (p.folder && p.photos > 0) {
    for (var i = 1; i <= p.photos; i++) gallery.push(dir + i + ".jpg");
  }
  return {
    slug: p.slug,
    draft: !!p.draft,
    title: p.title,
    location: p.location,
    year: p.year || "",
    headline: p.headline || "",
    summary: p.summary || "",
    shot_for: p.shot_for || "",
    brokerage: p.brokerage || "",
    price: p.price || "",
    cover_url: p.folder ? dir + "cover.jpg" : "",
    gallery: gallery,
    horizontal_video: (p.folder && p.horizontal) ? dir + "horizontal.mp4" : "",
    vertical_video:   (p.folder && p.vertical)   ? dir + "vertical.mp4"   : ""
  };
}

window.PROJECTS_DATA = RAW_PROJECTS.map(buildProject);

// Carousel + grid only need a few fields; published projects live at
// their static /project/<slug> pages (see tools/generate-share-pages.mjs).
// Drafts are excluded — clients only ever see finished work.
function toCard(p) {
  return {
    title: p.title,
    loc: p.location,
    file: "/project/" + p.slug,
    img: p.cover_url || ""
  };
}
window.PROJECTS = window.PROJECTS_DATA.filter(function (p) { return !p.draft; }).map(toCard);

// ---------------------------------------------------------------------
//  Admin-managed projects (portfolio CMS) — fetched from the database
//  and merged IN FRONT of the static repo projects. Every consumer
//  (home grid, projects page, project detail) awaits PROJECTS_READY,
//  so new work published from /admin appears with no deploy.
//  Static project pages keep their /project/<slug> URLs; CMS projects
//  render on the dynamic page at /project/<slug> (vercel.json rewrite).
// ---------------------------------------------------------------------
window.PROJECTS_READY = (function () {
  return fetch("/api/site-projects")
    .then(function (r) { return r.ok ? r.json() : { projects: [] }; })
    .then(function (d) {
      var dbProjects = (d.projects || []).map(function (p) {
        p.cms = true;
        return p;
      });
      if (!dbProjects.length) return;
      var slugs = {};
      dbProjects.forEach(function (p) { slugs[p.slug] = true; })
      var statics = window.PROJECTS_DATA.filter(function (p) { return !slugs[p.slug]; });
      window.PROJECTS_DATA = dbProjects.concat(statics);
      window.PROJECTS = window.PROJECTS_DATA.filter(function (p) { return !p.draft; }).map(function (p) {
        var c = toCard(p);
        if (p.cms) c.file = "/project/" + encodeURIComponent(p.slug);   // dynamic page via vercel.json rewrite
        return c;
      });
    })
    .catch(function () { /* offline / API down — static projects still show */ });
})();
