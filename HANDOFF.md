# jacobcschrader.com — Project Handoff

The complete guide to Jacob Schrader's photography-business platform.
Chronological build history lives in `docs/CHANGELOG.md`. This file is the
current-state reference.

---

## 1. What this is

One repo, three surfaces, all on Vercel (project `jacobcschrader-website`,
domain www.jacobcschrader.com):

1. **Public site** — static HTML marketing site (design modeled on
   jacobguthrie.com, JCS navy/Cormorant identity).
2. **Studio Admin** (`/admin`) — Jacob's back office: booking pipeline,
   clients, deliveries, invoices, requests inbox, portfolio CMS, settings.
3. **Client experience** — magic-link portal (`/portal`), shareable
   delivery pages (`/delivery?t=…`), invoices (`/invoice?t=…`).

**Stack:** static HTML/CSS/vanilla JS + Vercel serverless functions (Node,
CommonJS) + Neon Postgres (`@neondatabase/serverless`) + Vercel Blob
(portfolio media) + Resend (email). No framework, no build step. Deploys
happen by pushing to `main` via GitHub Desktop (Jacob pushes; assistants
prepare commits but cannot push).

---

## 2. Repo map

```
index.html                 Home (video hero, work grid, services, approach,
                           marquee, testimonials, press, CTA)
projects.html              Work grid          services.html   Photography/Films/Reels/Design
about.html                 About
book.html                  7-step booking wizard (Guthrie-style, live sqft
                           pricing) — /book + form.jacobcschrader.com.
                           Replaced contact.html (301 /contact → /book).
pricing.html               Shareable pricing page — /pricing +
                           pricing.jacobcschrader.com (noindex)
pricing-data.js            THE pricing source of truth (services, sqft
                           tiers, add-ons) — powers book.html + pricing.html
proposal.html              Private client proposal page — /proposals/<slug>
                           + proposal.jacobcschrader.com/<slug> (noindex)
project.html               Dynamic project page (renders ?slug=…)
project/<slug>.html        Static share pages (generated — see §4)
portal.html delivery.html invoice.html   Client pages (minimal .mnav chrome)
admin.html                 Entire admin SPA (single file: CSS + views + JS)
admin-blob.js              Browser bundle of @vercel/blob/client (esbuild IIFE)
styles.css                 All public-site styles (tokens at top, "v2 layer"
                           + ≤520px mobile layer at bottom)
site.js                    Nav, reveals, video enhancer (data-video),
                           selected-work grid, lightbox, custom cursor
projects-data.js           RAW_PROJECTS (static/repo projects) + PROJECTS_READY
                           fetch that merges CMS projects from the API
api/                       Serverless functions (see §7 — 8 of 12 max)
projects/<folder>/         Repo project media (cover.jpg, 1..N.jpg, films)
videos/                    Films + hero.mp4 + reels/ (9:16)
images/                    Site imagery, posters/, press/ (SVG logos),
                           svc/ (home service cards), email/ (wordmark)
tools/generate-share-pages.mjs   Regenerates project/<slug>.html
docs/CHANGELOG.md          Full chronological build log
vercel.json                cleanUrls, redirects (/architecture,/films,/design
                           → /services), cron (14:00 UTC daily)
```

---

## 3. Public site notes

- **Design language:** navy `#0f2240` + warm paper, Cormorant Garamond
  (headings; weight 400) + Inter. Sizing was measured off the reference
  site (h1 56px hero / 72px page-heads, h2 52px, eyebrows 11px/0.26em
  slate `--accent`, buttons 11px w/ 15×26px padding, container 1420px).
- **Nav (all pages):** JCS wordmark · Work / Services / About / Contact ·
  Client Login + navy "Book a Shoot" → /contact. Footer: columned navy
  (Studio / Connect + Instagram instagram.com/byjcs_) with
  "© 2026 JCS LLC" bottom bar.
- **Home hero:** `videos/hero.mp4` (35MB 1080p, silent) with
  `data-nosound` (no mute button). The `data-video` enhancer in site.js
  handles all video: autoplay muted, one-sound-at-a-time, visibility
  pause, `data-poster`, error fallback.
- **Services page:** numbered sections 01 Photography (incl. aerial) /
  02 Films (4 cut cards) / 03 Social Reels (4 reels in videos/reels/) /
  04 Design, one short paragraph each + tag pills; film & reel captions
  share .cut__loc/.cut__price typography.
- **Mobile:** ≤520px layer at the end of styles.css (+ page-local blocks
  in portal/delivery/invoice/admin). `overflow-x: clip` guards sideways
  scroll. Headless-Chromium screenshots verified the layout.
- **SEO:** JSON-LD on every page (LocalBusiness/Person on home, breadcrumbs
  everywhere, VideoObjects on services, ImageGallery on project pages),
  sitemap.xml, robots.txt (blocks /admin, /api), OG/Twitter tags, 301s
  from retired URLs. Client pages are noindexed.

---

## 4. Projects: two sources, one list

1. **Repo projects** — defined in `projects-data.js` (RAW_PROJECTS),
   media in `projects/<folder>/` (cover.jpg + 1..N.jpg at 2400px q80,
   optional horizontal.mp4/vertical.mp4). After editing RAW_PROJECTS run
   `node tools/generate-share-pages.mjs` to rebuild `project/<slug>.html`
   (bakes OG tags; `$` in prices is escaped via `rep()` — don't remove).
2. **CMS projects** — created in Admin → Portfolio, rows in
   `site_projects` (Neon), media in the **public** Vercel Blob store
   `jcs-website-media`. Published instantly (API is `no-store`).

`projects-data.js` defines `window.PROJECTS_READY`: fetches
`/api/site-projects`, prepends CMS projects, dedupes by slug (CMS wins).
Home grid (site.js → #sw-grid), projects.html and project.html all await
it. CMS projects use `/project?slug=…` URLs; repo ones keep their static
`/project/<slug>` pages. All 10 current projects live in the CMS
(the 9 originals reference their repo media via absolute URLs).

**Admin → Portfolio:** drag cards to reorder the whole site lineup
(first 6 = homepage); editor has cover/film tiles + drag-sortable gallery
(4-parallel browser→Blob uploads, client-side resize to 2400px), draft
toggle, delete (cleans Blob media).

---

## 5. Studio Admin (`/admin`)

- **Auth:** ADMIN_EMAIL + PBKDF2 hash (ADMIN_PASSWORD_HASH) → HMAC session
  cookie `jcs_session` (SESSION_SECRET). All data handlers requireAuth.
- **Pipeline:** upcoming → editing → revisions → delivered → completed →
  paid (+canceled). Board + list views, search, drag between stages.
  Daily cron moves upcoming→editing on shoot day.
- **Projects:** Visaro-style form — Google Places address autocomplete
  (key in Settings; Photon fallback), client typeahead (+ inline new
  client w/ CC emails), 30-min time dropdowns, addons → deliverables,
  discount codes, live total, show-price + don't-email-confirmation
  toggles.
- **Confirm & send:** branded emails to client(+CCs) & Jacob w/ .ics and
  Google-Calendar links; writes to Jacob's GCal if service account is
  configured (see api/_lib/gcal.js header — NOT yet set up).
- **Deliveries:** cover-photo cards (og:image unfurl from Pixieset links,
  cached in delivery_cover_url), editor w/ named links + per-link Save,
  CC, personal note; "Send delivery" emails client (magic-link CTA).
  Moving a project to Editing pre-drafts the predicted Pixieset URL
  (settings.pixieset_subdomain).
- **Invoices:** Generate & send (one click) → /invoice?t=… page; resend;
  paid status flips project to Paid (portal shows green chip).
- **Requests:** /contact submissions; accept → creates client+project.
- **Toasts** replaced all alert() popups (navy success, red error).

- **Licensing (Resid-style):** Admin → Licensing. Research a property
  (in-admin web search; provider auto-detected from Settings keys:
  serper_key preferred → brave_search_key → google_cse_key+_cx; Google
  quick-links when none set. NOTE: Custom Search is hard-blocked on
  Jacob's Maps-provisioned Google project — use Serper) →
  one-click results→leads (license_leads table: company, role, contact,
  status found→contacted→replied→offer_sent→licensed/declined, fee,
  follow_up date). Per lead: role-aware outreach email (preview modal →
  send via Resend, "the home you built/designed…", reply-to Jacob),
  "Create offer page" auto-builds a proposal with license tiers priced
  from the licSuggest() rate card (base photo 350/film 500 × role ×
  print 1.3 × ads 1.5 × set size), Mark licensed → ledger stat.
- **Proposals:** create in Admin → Proposals (+ New proposal). Editor:
  property/slug/client, intro, grouped line items (blank price renders
  "Included"), note, live campaign total. Buttons: Preview (opens
  /proposal?slug=…&preview=1 — drafts visible only with admin session),
  Copy link (proposal.jacobcschrader.com/<slug>), Send to client (branded
  email, stamps sent_at, draft→sent). Client "Reserve the Dates" → typed
  name → status accepted + email to Jacob. Public page auto-pulls 2
  portfolio films + a photo set + testimonials.

## 6. Client experience

- **Portal:** cookie session via emailed magic link (30-day HMAC token;
  portal-auth.js). Derived pipeline: Upcoming → In production (shoot
  day) → Delivered (red Unpaid chip) → Completed (green Paid). Rows link
  View Delivery / View Invoice. Possession of a URL is never enough for
  the dashboard; delivery/invoice token links are intentionally shareable.
- **Delivery page:** navy hero, link buttons, Approve Delivery /
  Request Changes (feedback demotes project to Revisions + emails Jacob).

## 7. API map (9 functions of Vercel Hobby's 12)

```
api/admin/[action].js   Router → api/_lib/admin/*: login logout me clients
                        bookings confirm requests discounts deliver invoice
                        settings portallink proposals licensing covers siteprojects upload
api/book.js             Public booking wizard → request + 2 emails (now also
                        addons, estimated_total, details JSON, e-signature)
api/calendar.js         .ics feed (signed); exports sigFor
api/cron.js             Daily stage advance (optional CRON_SECRET)
api/delivery.js         Delivery data + approve/changes actions
api/invoice.js          Invoice data
api/portal.js           Magic link, session, portal data
api/proposal.js         Public proposal by slug + accept action (drafts 404
                        unless ?preview=1 with admin session)
api/site-projects.js    Public published projects (Cache-Control: no-store)
```

`api/_lib/`: db.js (idempotent schema — ALL tables/columns created on
first use), email.js, auth.js, portal-auth.js, ics.js, gcal.js, links.js.

**DB tables:** clients, bookings (~40 cols incl. delivery_*/invoice_*),
site_projects, discounts, settings (key/value), requests (+ launch_date,
addons, estimated_total, details JSON, signature, signed_at), proposals
(slug unique, items JSON, status draft/sent/accepted).

**Subdomains (middleware.js):** Edge Middleware (runs pre-filesystem;
does NOT count toward the 12-function cap) serves the subdomain roots
with no path in the URL — form. → /book, pricing. → /pricing,
proposal./<slug> → /proposal (bare proposal. root redirects to www).
vercel.json still handles /contact → /book and /proposals/:slug.
The three subdomains are attached to the project in Vercel → Domains
(DNS is Vercel-managed, so that was just "Add Domain" three times).

## 8. Email system

One template `jcsEmail()` in api/_lib/email.js — navy masthead with the
real Cormorant wordmark PNG (images/email/jcs-wordmark.png), detail rows,
navy CTA, footer. Senders (Resend, domain verified): delivery@ enquiry@
billing@ admin@ — all display "Jacob C Schrader". **Every email sets
reply-to jacxbschrader@gmail.com** (senders have no mailboxes). Subjects:
`{Property} | {Event}`.

## 9. Environment variables (names only — values live in Vercel)

```
DATABASE_URL (Neon)          RESEND_API_KEY
ADMIN_EMAIL                  ADMIN_PASSWORD_HASH
SESSION_SECRET               CONTACT_TO (default jacxbschrader@gmail.com)
BLOB_READ_WRITE_TOKEN + BLOB_STORE_ID + BLOB_WEBHOOK_PUBLIC_KEY
  (from Blob store "jcs-website-media" — must be the PUBLIC store;
   private stores 503 client uploads)
Optional/pending: CRON_SECRET, GCAL_CALENDAR_ID + GOOGLE_SA_KEY
Google Places key is NOT an env var — stored in admin Settings (DB).
```

## 10. Gotchas (learned the hard way)

- **12-function cap** — new admin endpoints go in the [action].js router,
  never as new files under api/.
- **Env changes need a redeploy** to take effect.
- **JS `.replace()` + `$`** — prices like "$22,000,000" corrupt replacement
  strings ($2 = capture group). generate-share-pages uses rep() to escape.
- **Blob store must be public**; connection needs the read-write-token
  checkbox or handleUpload fails.
- **`.footer a` specificity** can override .footer__brand — keep the
  compound selector.
- **Pixieset has no public API** — links are predicted from the subdomain
  + slugified title; collection must be created in Pixieset by hand.
- Cormorant old-style numerals look odd in UI — portal uses lining nums.
- Repo media conventions: photos 2400px JPEG q80; films 1080p H.264
  CRF23-27 faststart; reels 720×1280 CRF26; keep files well under
  GitHub's 100MB limit.

## 11. Outstanding / known items

- **Booking-form terms** (book.html step 7) need Jacob's/legal review —
  esp. the payment clause (currently "due on final invoice").
- **Add subdomains in Vercel** (Settings → Domains): form., pricing.,
  proposal.jacobcschrader.com — redirects/rewrites are already live.
- Static project share pages still link /contact in their navs — the
  /contact → /book redirect covers it; regenerate via
  `node tools/generate-share-pages.mjs` when Node is available locally.
- About page portrait is still the placeholder ("Portrait · Replace").
- Google Calendar service account not configured (gcal.js header has steps).
- CRON_SECRET optional hardening not set.
- Test data to delete: JCS client "Test Client (delete me)", request
  "Claude Email Test (delete me)"; old empty Blob store
  `jacobcschrader-website-blob` can be deleted in Vercel Storage.
- Headwaters: info.txt said 456, folder/site say 465 — unconfirmed.
- Tahoe Quarterly has no logo asset (dropped from press row for now).
- Post-deploy SEO: Rich Results Test + submit sitemap in Search Console.
