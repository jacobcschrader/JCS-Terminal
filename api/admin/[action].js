// =====================================================================
//  /api/admin/[action] — single serverless function for the whole
//  admin API (Vercel Hobby caps deployments at 12 functions, so the
//  nine admin endpoints live behind one dynamic route). The real
//  handlers are unchanged, in api/_lib/admin/.
// =====================================================================
const routes = {
  login: require("../_lib/admin/login.js"),
  logout: require("../_lib/admin/logout.js"),
  me: require("../_lib/admin/me.js"),
  clients: require("../_lib/admin/clients.js"),
  bookings: require("../_lib/admin/bookings.js"),
  confirm: require("../_lib/admin/confirm.js"),
  requests: require("../_lib/admin/requests.js"),
  discounts: require("../_lib/admin/discounts.js"),
  deliver: require("../_lib/admin/deliver.js"),
  invoice: require("../_lib/admin/invoice.js"),
  settings: require("../_lib/admin/settings.js"),
  portallink: require("../_lib/admin/portal-link.js"),
  proposals: require("../_lib/admin/proposals.js"),
  licensing: require("../_lib/admin/licensing.js"),
  covers: require("../_lib/admin/covers.js"),
  gcalcheck: require("../_lib/admin/gcal-check.js"),
  siteprojects: require("../_lib/admin/site-projects.js"),
  upload: require("../_lib/admin/upload.js"),
  files: require("../_lib/admin/files.js"),
  downloads: require("../_lib/admin/downloads.js"),
  tasks: require("../_lib/admin/tasks.js"),
};

module.exports = function handler(req, res) {
  const h = routes[(req.query || {}).action];
  if (!h) { res.status(404).json({ error: "not-found" }); return; }
  return h(req, res);
};
