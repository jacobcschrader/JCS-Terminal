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
2. **Studio Admin** (`/admin`) — Jacob's back office: projects
   (listings) with the custom delivery system (uploads, cover, lock,
   downloads feed), clients, invoices, requests inbox, proposals,
   portfolio CMS, license tracker, settings.
3. **Client experience** — magic-link portal (`/portal`, "Your
   listings." grid), listing pages (`/portal/<slug>` — gallery, films,
   bundle downloads), invoices (`/invoice?t=…`).

**Delivery is custom (2026-08-08, replaces Pixieset):** media uploads
browser→Vercel Blob from the project page in the admin; the client
views/downloads on /portal/<slug>; every download is logged. Design
pattern for admin + portal + listing page: jacobguthrie.com (REM
Academy call frames) — site chrome, pill tabs, "Dashboard." titles.

**The booking flow is proposal-first (2026-07-29):** /book is an
application (no pricing, no signature). Jacob reviews it in Requests →
"Send Proposal" (client + PENDING project + prefilled draft proposal) or
"Book directly" (project straight to Upcoming). Same choice exists on
+ New project for text/email clients ("Send a proposal first" checkbox).
Client acceptance on the proposal page collects phone/access/notes +
terms + typed e-signature and flips the project to Upcoming; Jacob then
Confirms as usual. "+ New proposal" itself is client-first: search/
select/create the client (typeahead, same as projects) + a grouped
services selection that seeds Scope & Investment (descs pulled from
pricing-data.js; prices set in the editor). A STANDALONE proposal (no
gated project) creates the project as Upcoming at acceptance time —
acceptance always produces a project either way. Admin loads
pricing-data.js: svcDesc()/svcQuote() price services exactly from the
sheet rates — the proposal modal takes a sqft and prices each selected
service live (per-image add-ons annotate instead),
and the project form auto-generates Price from sqft + the CHECKED
services/add-ons (the Service dropdown + TYPES list are gone — scope
lives in the checklist; bookings.type derives silently from the first
checked main service on create, edits keep the stored value). Custom
services take an optional price box that joins the quote. "Send a
proposal" turns each checked service into its own priced line item at
the project's sqft. Past 6,000 sqft (the sheet's Inquire zone) every tiered service
swaps its auto price for a per-line custom price input in BOTH create
modals — typed prices add into the project total / proposal line
items, survive sqft edits, and are required at create (named in the
validation message). The form ends in four sending options (Send
booking confirmation / Include price / Don't send / Send a proposal —
price implies confirm, silent + proposal are exclusive, one required)
and has NO Stage select: creating sends the confirmation immediately
when chosen (needs a shoot date; toast reports it), and status sets
itself — proposal → pending, past shoot date → editing, else
upcoming. Edits never touch status (move stages on the pipeline). 'pending' projects sit above the pipeline in a strip,
are hidden from the client portal's project list, and surface there as a
"Your Proposal Is Ready" band once the proposal is SENT (cron never
touches 'pending').

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
book.html                  6-step APPLICATION wizard (Guthrie-style) —
                           /book + form.jacobcschrader.com. No live
                           pricing, no signature: info + interest only;
                           Jacob answers with a proposal, and ACCEPTING
                           the proposal is the contract.
contact.html               Real contact page (2026-08-08): "Let's work
                           together." + call/text · email · studio ·
                           Instagram on the left; navy "Ready to book?"
                           card → /book + "Send a note." form (name,
                           email, phone, message; honeypot) on the right.
                           Posts to /api/book with kind:"contact" → email
                           to Jacob (reply-to sender) + receipt to sender.
pricing.html               Shareable pricing page — /pricing +
                           pricing.jacobcschrader.com (noindex). Renders 4
                           cards: the two reels merge into one "Social
                           Reels" card whose accordion holds both as named
                           groups (the form still sells them separately).
pricing-data.js            THE pricing source of truth (services, sqft
                           tiers, add-ons) — powers book.html + pricing.html
proposal.html              Private client proposal page — canonical link
                           proposal.jacobcschrader.com/<slug> (also
                           /proposals/<slug>; noindex). Layout measured
                           off jgwebsite.vercel.app/proposals/* (1420px
                           wrap, centered hero over hairline, grouped
                           scope ledger w/ badges, stacked films, 3-col
                           gallery, white quote cards, light centered
                           CTA), JCS type/palette. Acceptance = the
                           contract: phone, access, notes, terms + typed
                           e-signature; flips a linked 'pending' project
                           to Upcoming.
project.html               Dynamic project page (renders ?slug=…)
project/<slug>.html        Static share pages (generated — see §4)
portal.html                Client portal, site chrome: "Client Portal /
                           Your listings." + email, Admin → (if admin
                           session) + Sign Out, 3-up listing cards (cover
                           thumb or "Gallery coming soon", READY / IN
                           PRODUCTION / UPCOMING / LOCKED pill, address,
                           LOCATION · N FILES · YYYY-MM-DD) → /portal/<slug>.
                           Proposal-ready / application-in-review bands sit
                           above the grid. Sign-in = centered column.
delivery.html              Listing page, served at /portal/<slug> (vercel.json
                           rewrite; ?slug= works locally, ?t= = share link).
                           Full-bleed cover hero + address + "LOCATION ·
                           BROKERAGE"; ← All listings / Share preview /
                           PAID — DOWNLOADS UNLOCKED pill; bundle pills
                           (Download all — full res / MLS photo download —
                           2048px + extra links); FILMS · N two-up players
                           w/ checkbox + Download; PHOTOS · N masonry
                           (checkbox, hover download, lightbox); FILES · N;
                           invoice row; approve / request-changes box.
                           Bundles are zipped IN THE BROWSER (STORE zip +
                           CRC32; File System Access streaming on Chrome,
                           in-memory parts elsewhere) — no server limits.
                           window.JCS_ZIP exposes the writer for debugging.
invoice.html               Client invoice page (minimal .mnav chrome).
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
- **Nav (all pages):** JCS wordmark · Work / Services / About / Contact
  (→ /contact) · Client Login + navy "Book a Shoot" → /book. Footer:
  columned navy (Studio col also lists Contact)
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
- **Shell (2026-08-08, deal-desk pattern from Jacob's DealSpace
  reference):** left sidebar (JCS wordmark, account block, groups Work:
  Dashboard / Requests (badge) / Projects / Proposals / Clients; Studio:
  Billing / Licensing / Portfolio / Settings; Other: Client portal ↗ /
  Website ↗; footer = Google Calendar status + date + Sign out), top bar
  with GLOBAL SEARCH (projects, clients, requests, proposals — "/" to
  focus, arrows + Enter) and a NEEDS-ATTENTION bell (derived: new
  requests, proposals sent 3+ days, unconfirmed shoots within 3 days,
  deliveries 3+ days after the shoot with nothing sent, changes
  requested, delivered-but-uninvoiced, invoices 14+ days unpaid, paid but
  downloads still locked) + a "+" new-project button. Soft 10px corners
  everywhere; page titles are small sans (no more serif "Dashboard.").
  Mobile: sidebar slides in from the hamburger.
- **Dashboard:** PROFILE card = studio-setup ring (6 checks: 8+ portfolio
  projects, Google Calendar, Places key, licensing key, first client,
  first delivery — % + next step link) + Update settings / View requests,
  then 4 stat tiles: Requests reviewed (30d, Δ vs prior 30d), Requests
  accepted, Average turnaround (shoot → delivery email, 90d), Current
  pipeline value (active projects). LATEST REQUESTS cards (avatar,
  name, brokerage · city, FIT % — services 30 / sqft on rate card 20 /
  lead time 20 / California 15 / business email 15 — New/Accepted pill,
  message or services, "Deal overview": estimated value priced from the
  sheet, target date, sqft, property; click → Requests row). ACTIVE
  PROJECTS table (project+client · service · stage · last update ·
  next update: shoot / delivery due (+2d) / payment due (+14d) /
  proposal follow-up) beside TODAY'S TASKS (All/Open/Closed, add w/
  priority, tick, delete — `tasks` table via admin `tasks` route), THIS
  WEEK (shoots in 7 days, confirmed pill), MONEY (awaiting payment /
  collected this month / booked this year), then RECENT DOWNLOADS.
- **Billing (new view):** Outstanding / Overdue 14+ / Collected this
  month / this year tiles, "delivered but not invoiced" strip, tabs
  All/Unpaid/Overdue/Paid, ledger (number, project, client, sent, total,
  status, View / Resend / Mark paid), CSV export by date range (invoice
  number, project, client, brokerage, dates, status, subtotal/travel/
  discount/total). bookings.paid_at is stamped when a project flips to
  Paid (backfilled for old rows).
- **Calendar (new view):** month grid of shoots + twilights (solid =
  confirmed, dashed = not), click → project.
- **Clients:** roster with projects · lifetime value (paid) · last shoot
  · open balance · Active / "Check in" pill (no shoot in 90+ days and
  nothing active — also in the bell, top 3); client page has the same
  tiles + Statement (CSV).
- **Project timeline:** project_events (created, stage moves incl. the
  cron's, confirmations, uploads/removals, cover, lock, delivery and
  invoice sends, proposal sent/accepted, client approvals / change
  requests, reminders, testimonials) + free-text notes, merged with the
  download feed in the project page's ACTIVITY section (add note /
  delete note via files.js PUT actions note / delnote).
- **Photo tools on the project page:** drag tiles to reorder (persisted
  via files sort), Select mode (multi-select + Delete selected), hover
  ✎ rename (the client's download filename), Download originals (opens
  /portal/<slug>?dl=full — the listing page auto-starts the full-res
  bundle for an admin session).
- **Automatic reminders (Settings toggles remind_invoice / _proposal /
  _delivery, default OFF):** the daily cron sends unpaid-invoice notes at
  14 + 21 days, a proposal nudge at 3 days (proposals.reminded_at), a
  delivery-approval nudge at 5 days — once each (dedup via
  project_events kind reminder + meta tag), templated, logged.
- **Email templates (Settings):** subject + opening paragraph for
  confirm / delivery / invoice / proposal / application + the three
  reminders; stored as settings tpl_<key>_subject|_note (blank = default),
  placeholders {first} {name} {property} {location} {number} {total}
  {date}; api/_lib/templates.js DEFAULTS mirrored in admin TPL_DEFAULTS.
- **Payments (optional, Stripe):** env STRIPE_SECRET_KEY (+ a webhook to
  /api/stripe for checkout.session.completed). Invoice page shows a Pay
  button (deposit / balance / full); success marks the project Paid,
  stamps paid_at + paid_via=stripe and UNLOCKS downloads; the return trip
  (?session_id) applies it instantly, the webhook covers closed tabs.
  Manual "Mark paid" also unlocks. api/_lib/stripe.js — no SDK.
- **Deposits (optional):** Settings → Payments → deposit % (blank = off).
  Project page then offers "Send deposit invoice (50% · $X)" →
  bookings.deposit_amount + deposit invoice email; "Deposit received"
  (manual) or Stripe sets deposit_paid_at; the invoice page shows
  Deposit / Balance rows and charges the right amount; balance invoice
  after the deposit is paid.
- **Google Calendar READ:** admin Calendar overlays everything on the
  configured calendar (+ settings.gcal_read_ids for other calendars
  shared with the service account) as grey chips — gcal.listEvents,
  admin route gcalevents?from&to; our own shoot events (ids "jcs…") are
  skipped.
- **Nightly backup:** cron dumps every table to JSON, AES-256-GCM
  encrypts it (key derived from SESSION_SECRET) and puts it in Blob
  under backups/YYYY-MM-DD.json.enc (random suffix, last 30 kept).
  Settings → Backups lists them, "Back up now", "Download latest
  (decrypted JSON)" (admin route backup: GET / GET ?download=1 / POST).
  Needs BLOB_READ_WRITE_TOKEN in the function env.
- **Storage meter + archive rule:** Settings → Storage shows delivery
  bytes / files / est. $ per month; settings.archive_months (blank =
  never) makes the cron delete FULL-RES originals of photos N months
  after delivery (delivery_files.url='' + archived_at; web 2048 + thumb
  stay, so MLS downloads keep working). Listing page: archived photos
  download the 2048px copy; the full-res bundle excludes them; a note
  explains. Project tiles show "Archived".
- **Testimonials:** after a client approves a delivery the listing page
  asks for a one-line review → testimonials table + admin email;
  Portfolio → Testimonials card approves/hides/deletes; approved quotes
  ride along in /api/site-projects and lead the home page's "What They
  Say" cards (index.html script, static three fill in).
- **Projects:** a listings ledger — Address · Client · Stage · Files ·
  Invoice · Downloads (LOCKED/UNLOCKED) · Lock/Unlock — with stage
  segments + search + client filter. Stages: pending → upcoming →
  editing → revisions → delivered → completed → paid (+canceled); the
  stage select lives on the project page. Daily cron moves
  upcoming→editing on shoot day.
- **Project page (#project/:id) = the listing:** header (client · N
  files · portal slug · delivery-email-last-sent line; Send/Re-send
  delivery email + Lock/Unlock downloads), PROJECT facts + Edit /
  Confirm / Preview as client / Copy share-preview link / Delete,
  INVOICES, DELIVERY EMAIL (message + CC), DOWNLOAD ACTIVITY, COVER
  PHOTO — CLICK TO SET (6-up grid of every file; hover × removes),
  UPLOAD dropzone (drag/drop or click; photos → original as-is + 2048px
  web JPEG + 640px thumb made in the browser; films → original
  (multipart) + poster frame; PDFs as-is; 3 uploads in flight; blob
  paths delivery/<id>/<rand>/<clean name> so downloads keep clean
  filenames), ADDITIONAL LINKS (external — 3D tour, floor plans).
- **Projects:** Visaro-style form — Google Places address autocomplete
  (key in Settings; Photon fallback), client typeahead (+ inline new
  client w/ CC emails), 30-min time dropdowns, addons → deliverables,
  discount codes, live total, show-price + don't-email-confirmation
  toggles.
- **Confirm & send:** branded emails to client(+CCs) & Jacob w/ .ics and
  Google-Calendar links; writes to Jacob's GCal if service account is
  configured (see api/_lib/gcal.js header — NOT yet set up).
- **Delivery email:** "Send delivery email" (project page) needs media
  or a link + a client email; CTA = 30-day sign-in link that lands on
  /portal/<slug>; stamps delivery_sent_at, advances stage to Delivered.
  Legacy link-only deliveries still work (Pixieset og:image unfurl only
  runs when a listing has no uploaded files).
- **Invoices:** Generate & send (one click) → /invoice?t=… page; resend;
  paid status flips project to Paid (portal shows green chip).
- **Requests:** /book applications; accept → creates client+project.
  (Contact-page notes are email-only — nothing lands in Requests.)
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
  portal-auth.js; ?login=…&p=<id> lands straight on /portal/<slug>).
  "Your listings." card grid; pills: READY (files/delivered), IN
  PRODUCTION, UPCOMING, LOCKED. Possession of a URL is never enough for
  the dashboard; share-preview links (/portal/<slug>?t=<token>) and
  invoice links are intentionally shareable.
- **Listing page (/portal/<slug>):** access = signed-in owner, admin
  session (preview), or share token. Downloads: per-file (native, clean
  filename via ?download=1), Full-res bundle, MLS 2048px bundle,
  selected files — all logged to download_events with the client's
  email (share link → "email (share link)"; admin previews aren't
  logged). LOCKED hides every download control + withholds original
  URLs (films still stream, photos show web/thumb). Approve / Request
  changes kept (feedback demotes project to Revisions + emails Jacob).

## 7. API map (10 functions of Vercel Hobby's 12)

```
api/admin/[action].js   Router → api/_lib/admin/*: login logout me clients
                        bookings confirm requests discounts deliver invoice
                        settings portallink proposals licensing covers siteprojects upload
api/book.js             Public application → request + 2 emails (addons,
                        details JSON; estimated_total/signature columns
                        remain for legacy rows)
api/calendar.js         .ics feed (signed); exports sigFor
api/cron.js             Daily stage advance (optional CRON_SECRET)
api/delivery.js         Listing data (?slug= w/ session|admin, ?t= share)
                        + POST download log / approve / changes
api/invoice.js          Invoice data (+ deposit/balance ledger); ?session_id=
                        verifies a Stripe return trip and applies the payment;
                        POST checkout → Stripe Checkout URL
api/stripe.js           Stripe webhook (checkout.session.completed) — verified by
                        re-fetching the event by id; applies payment idempotently
api/portal.js           Magic link, session, portal data (listing cards:
                        slug, files, cover thumb, ready/locked, is_admin)
api/proposal.js         Public proposal by slug + accept action (drafts 404
                        unless ?preview=1 with admin session). Accept
                        stores acceptance JSON + signature/signed_at,
                        flips linked pending booking → upcoming, emails
                        Jacob + client (portal login link)
api/site-projects.js    Public published projects (Cache-Control: no-store)
```

`api/_lib/`: db.js (idempotent schema — ALL tables/columns created on
first use), email.js, auth.js, portal-auth.js, ics.js, gcal.js, links.js,
delivery.js (slugs, files, publicFile, logDownload).
Admin router additions: `files` (GET list+events / POST add / PUT
cover|lock|sort / DELETE + blob del), `downloads` (feed + 7-day count),
`tasks` (GET / POST / PUT / DELETE — dashboard to-dos), `testimonials`
(GET / PUT approve / DELETE). Shared: events.js (logEvent), templates.js
(DEFAULTS, loadTemplates, tpl).
`upload.js` broker: delivery/<id>/… paths get addRandomSuffix:false and
a 4GB cap; everything else unchanged.

**DB tables:** clients, bookings (~46 cols incl. delivery_*/invoice_*,
delivery_slug unique, downloads_locked, paid_at), tasks (title, priority
low|normal|medium|high, done, due, booking_id), project_events
(booking_id, kind, label, actor, meta), testimonials (booking_id,
client_name, brokerage, quote, approved), proposals.reminded_at, bookings
deposit_amount / deposit_paid_at / stripe_session_id / paid_via,
delivery_files.archived_at, delivery_files (booking_id,
kind photo|film|file, name, url, web_url, thumb_url, size, w/h,
sort_order), download_events (booking_id, file_id, kind
file|full|mls|selected|view, label, email, ip, ua), site_projects,
discounts, settings (key/value), requests (+ launch_date, addons,
estimated_total, details JSON, signature, signed_at), proposals (slug
unique, items JSON, status draft/sent/accepted), license_leads.

**Subdomains (middleware.js):** Edge Middleware (runs pre-filesystem;
does NOT count toward the 12-function cap) serves the subdomain roots
with no path in the URL — form. → /book, pricing. → /pricing,
proposal./<slug> → /proposal (bare proposal. root redirects to www).
vercel.json handles /proposals/:slug and /portal/:slug rewrites (the
old /contact → /book redirect is gone — /contact is a page again).
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
- **Pixieset is retired for delivery** (custom system since 2026-08-08);
  the Settings card and the admin `covers` route are gone — covers.js is
  only used by deliver.js for legacy link-only deliveries; the
  pixieset_subdomain settings key is inert.
- **Blob deletes** need BLOB_READ_WRITE_TOKEN in the function env; if
  the store is OIDC-only the DB row still goes and the blob is orphaned
  (harmless).
- Cormorant old-style numerals look odd in UI — portal uses lining nums.
- Repo media conventions: photos 2400px JPEG q80; films 1080p H.264
  CRF23-27 faststart; reels 720×1280 CRF26; keep files well under
  GitHub's 100MB limit.

## 11. Outstanding / known items

- **Booking-form terms** (book.html step 7) need Jacob's/legal review —
  esp. the payment clause (currently "due on final invoice").
- **Add subdomains in Vercel** (Settings → Domains): form., pricing.,
  proposal.jacobcschrader.com — redirects/rewrites are already live.
- Static project share pages were patched by hand (Contact → /contact,
  Book a Shoot → /book); regenerate via `node tools/generate-share-pages.mjs`
  when Node is available locally (the generator now keeps the app
  rewrites in vercel.json — it used to delete them all).
- About page portrait is still the placeholder ("Portrait · Replace").
- Google Calendar service account not configured (gcal.js header has steps).
- CRON_SECRET optional hardening not set.
- Test data to delete: JCS client "Test Client (delete me)", request
  "Claude Email Test (delete me)"; old empty Blob store
  `jacobcschrader-website-blob` can be deleted in Vercel Storage.
- Headwaters: info.txt said 456, folder/site say 465 — unconfirmed.
- Tahoe Quarterly has no logo asset (dropped from press row for now).
- Post-deploy SEO: Rich Results Test + submit sitemap in Search Console.
