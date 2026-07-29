# Jacob Schrader — Website Handoff

A handoff for taking this site live on **Vercel**. Hand this whole file to a new
Claude chat (or any developer) and they'll have everything they need.

---

## 1. What this is

A personal/business website for **Jacob Schrader** — a real estate,
architecture, and design photographer + videographer. It's a **static website**:
plain HTML, CSS, and JavaScript. **No backend, no database, no build step, no
dependencies.** Every page is a file you can open in a browser.

Brand: white + deep navy (`#0f2240`), serif display type (Cormorant Garamond) +
sans body (Inter), elegant/editorial. Fonts load from Google Fonts. The brand
monogram is **"JCS"** (serif italic), used in the nav and footer.

**Goal of the next step:** host it on Vercel at a custom domain.

---

## 2. Pages

| File | Page | Notes |
|------|------|-------|
| `index.html` | Home | Hero, projects carousel, clients marquee, press, testimonials, CTA |
| `about.html` | About | "Meet Jacob" intro, bio, recognition, CTA |
| `projects.html` | Projects | Gallery grid of all projects (built from `projects-data.js`) |
| `project.html` | Project detail | One shared template; opened as `project.html?slug=…` |
| `architecture.html` | Architecture | Photography services (agents / architects / builders / designers) |
| `films.html` | Films | Horizontal films + vertical reels (autoplay-muted, mute button) |
| `design.html` | Design | Web + design services + "Selected work" showcase |
| `contact.html` | Contact | Editorial split: intro/details + enquiry form |

**Shared assets**
- `styles.css` — all styling (one file, shared by every page).
- `site.js` — all behavior: sticky nav, mobile menu, scroll reveals, the
  projects carousel, autoplay-muted video + mute button, custom cursor, hero
  parallax, first-load intro animation.
- `projects-data.js` — the list of projects (see §4).

Navigation order: Home · About · Projects · Architecture · Films · Design · Contact.

---

## 3. There is no backend (by design)

Earlier versions had an admin/CMS and a Supabase/Stripe backend. **All of that
was removed** — this is now purely a static marketing site. Nothing to configure,
no API keys, no server. To change content you edit the files directly (below).

---

## 4. How to edit content

**Projects** — edit `projects-data.js`. Each project is an object:

```js
{
  slug: "toro-canyon",                 // used in the URL: project.html?slug=toro-canyon
  title: "420 Toro Canyon Road",
  location: "Montecito, CA",
  year: "2026",
  headline: "Santa Ynez Designer Home",// shown above the description
  summary: "A short paragraph…",
  shot_for: "Ricardo Munoz",           // "Shot for" credit
  brokerage: "Berkshire Hathaway",
  cover_url: "images/toro-cover.jpg",  // full-width hero image
  gallery: ["images/toro-1.jpg", "images/toro-2.jpg"],  // photo grid
  horizontal_video: "videos/toro-film.mp4",   // optional 16:9 film (autoplay muted + mute button)
  vertical_video:   "videos/toro-reel.mp4"     // optional 9:16 reel
}
```

Add/remove/reorder objects in this array and the home carousel, the projects
grid, and each project page update automatically. Leave a field as `""` (or
`[]`) to hide it. The project page supports three looks: photos only, photos +
horizontal film, or photos + horizontal + vertical.

**Page copy** — edit the text directly inside each `.html` file.

**Photos & videos** — create `images/` and `videos/` folders next to the HTML
files and reference them by path (e.g. `images/hero.jpg`, `videos/hero.mp4`).
Any element with `data-video="…"` autoplays muted and loops, with a mute button.

---

## 5. Replace before / soon after launch (placeholders)

- **Photos & videos** — none are included yet. The dark gradient boxes are
  placeholders. Add real `images/` and `videos/` files. Referenced filenames the
  pages already expect: `videos/hero.mp4` (home hero), `videos/showreel.mp4`
  (films hero), plus the films-page cut/reel clips. Films/projects use **direct
  video files** (no Vimeo/YouTube embeds).
- **Project content** — the six projects in `projects-data.js` have titles +
  locations only; add covers, galleries, copy, and films.
- **Email** — every page uses `jacxbschrader@gmail.com`. Confirm that's the address
  you want, or swap it (it's the old "Visaro" address). Search/replace across
  files if changing.
- **Instagram** — the footer + contact "Instagram" links point to `#`. Put in
  the real profile URL.
- **Contact form** — it only shows a thank-you message; it does **not** send
  email yet. Wire it to a form service (e.g. **Formspree**, **Web3Forms**, or a
  Vercel serverless function). See §7.
- **Design page "Selected work"** — placeholder tiles + the "Sold in 6 days,
  over asking" result line; replace with real work and outcomes.
- **Testimonials / press / clients** — these are realistic samples; confirm
  they're accurate before publishing.
- **Phone** — `(408) 824-8719` is set across the site (this is real per the
  owner; confirm).
- **Favicon + social preview image** — none yet; add a favicon and an OpenGraph
  image for nice link previews (see §7).

---

## 6. Deploy to Vercel (the main task)

The site is static, so Vercel needs **no build settings** — it just serves the
files. Three ways, easiest first:

### Option A — Drag & drop (fastest, no account setup beyond signup)
1. Go to **https://vercel.com** and sign up (free Hobby plan).
2. Put all the site files (`index.html`, `styles.css`, etc.) in one folder.
3. Use Vercel's deploy — the simplest path is to push to GitHub (Option B), but
   you can also use the Vercel CLI (Option C) to deploy a plain folder.

### Option B — GitHub (recommended; gives auto-deploys on every edit)
1. Create a new GitHub repository and upload all the site files to it (keep the
   flat structure — `index.html` at the repo root).
2. In Vercel: **Add New… → Project → Import** that GitHub repo.
3. Framework preset: **Other** (it's plain static). Build command: **none/empty**.
   Output directory: **leave as root** (`.`). Click **Deploy**.
4. Vercel gives you a live URL like `your-project.vercel.app`. Every push to the
   repo redeploys automatically.

### Option C — Vercel CLI (deploy a folder directly)
1. Install: `npm i -g vercel`
2. From inside the site folder: `vercel` (first run links/creates the project),
   then `vercel --prod` to publish. Accept the defaults — no build step.

> No `vercel.json` is required. If one is ever added, it should NOT set a build
> command; this is a static site served as-is.

### Custom domain
In the Vercel project → **Settings → Domains** → add your domain (e.g.
`jacobschrader.com`) and follow Vercel's DNS instructions (either change your
registrar's nameservers to Vercel, or add the A/CNAME records it shows). HTTPS is
automatic.

---

## 7. Nice-to-haves after it's live

- **Working contact form (Formspree, ~5 min):** create a form at formspree.io,
  then in `contact.html` change the `<form>` to
  `action="https://formspree.io/f/XXXX" method="POST"` and remove the
  `onsubmit="…"` handler (or keep a success message). Give each input a `name`
  (most already have one).
- **Favicon:** add `favicon.ico` / a PNG and a `<link rel="icon" …>` in each
  page's `<head>`.
- **Social/OG preview image:** add `<meta property="og:image" …>` (and a
  1200×630 image) so shared links look good. Titles/descriptions already exist.
- **Analytics:** Vercel Analytics (one toggle in the dashboard) or Plausible/GA.
- **Sitemap/robots:** optional `sitemap.xml` + `robots.txt` for SEO.
- **Compress media:** keep hero/film files reasonably sized so pages load fast
  (consider 1080p, H.264 MP4; large 4K files will feel slow).

---

## 8. Quick prompt for the next Claude chat

> "I have a finished static website (plain HTML/CSS/JS, no backend) for a
> photographer. I want to deploy it to Vercel with a custom domain, wire up the
> contact form, and add a favicon + social preview image. Here's the handoff
> doc: [paste this file]. Walk me through it step by step."

---

*Everything is plain files — open `index.html` in a browser to preview locally
(some video autoplay may behave better once hosted). Nothing else is required to
run it.*

---

## 11. July 2026 — client-experience upgrades (Claude session)

1. **Contact form now really sends** — POSTs via FormSubmit AJAX to
   jacxbschrader@gmail.com (contact.html). ⚠️ One-time step: the first submission
   triggers a FormSubmit activation email to that address — click the link in
   it once, and all later enquiries arrive normally. Honeypot spam trap included.
2. **Social link previews** — every page has Open Graph/Twitter tags
   (default share image: `images/og/og-default.jpg`, 1200×630). Per-project
   previews: `tools/generate-share-pages.mjs` writes a static copy of
   project.html per finished project into `p/` with that project's
   title/cover baked in, and `vercel.json` rewrites `/project?slug=…` to it.
   **Re-run `node tools/generate-share-pages.mjs` whenever projects-data.js
   or project.html changes.**
3. **Gallery lightbox** — click any project photo for a fullscreen viewer
   (arrows / keyboard / swipe, counter). Code: `JSLightbox` in site.js +
   `.lb` styles in styles.css.
4. **Lazy loading** — project galleries (first 8 photos eager, rest lazy),
   projects grid, home carousel. The justified layout now re-lays-out as lazy
   photos arrive (placeholder ratio 1.5 until measured).
5. **Drafts hidden** — `draft: true` in projects-data.js hides a project from
   the carousel/grid (direct URL still works). All six sample projects are
   drafts; only 9290 Brae Road is public. Remove the flag as real projects land.
   Carousel supports a single slide (no arrows/autoplay until ≥2 projects).
6. **Films page cleaned** — fake cuts/reels commented out until real videos
   exist; the three real films got poster frames (`images/posters/`,
   via `data-poster`). Vertical Reels section is commented out entirely.
7. **Responsive heroes** — home + architecture heroes use `srcset`
   (1280/1920/2560/3840w, generated at q82); phones now pull ~190–360KB
   instead of ~2.4–2.8MB.
8. **184 Tiburon Bay** — folder set to "" (no more 404 cover); it's also a draft.

### Update: contact form now uses Resend (with FormSubmit fallback)

`api/contact.js` is a Vercel serverless function that emails enquiries via
Resend. To activate: create a Resend account → make an API key → Vercel →
Settings → Environment Variables → `RESEND_API_KEY` → redeploy. Optional:
verify jacobcschrader.com at resend.com/domains, then set
`CONTACT_FROM = JCS Website <enquiry@jacobcschrader.com>`.
Until the key is set (or if Resend ever fails), the form automatically
falls back to FormSubmit, so no enquiry is lost. Replies go straight to
the enquirer thanks to reply-to.

### Update 2: dynamic project page renamed + canonical host

- `project.html` → **`project-view.html`**. Reason: Vercel serves real files
  before rewrites, so while project.html existed, the per-project share pages
  in `p/` were never served. `/project?slug=…` URLs are unchanged — vercel.json
  now rewrites them to the right `p/` stub (finished projects) or to
  project-view.html (drafts/unknown). Don't recreate a file named project.html.
- All canonical/OG URLs now use https://www.jacobcschrader.com (the apex
  domain 308-redirects to www).

### Update 3 (FINAL project-URL scheme): static pages, no rewrites

Vercel silently ignored the query-based rewrites, which 404'd /project?slug=…
after the rename. Fixed for good by dropping rewrites entirely:

- The dynamic page is back at its original name, **project.html**
  (serves /project?slug=… — now only used for previewing drafts).
- Finished projects get REAL static pages: `tools/generate-share-pages.mjs`
  writes `project/<slug>.html` (own OG tags + `<base href="/">`), served at
  **/project/<slug>** thanks to cleanUrls. The whole site (carousel, grid,
  prev/next) links there. `p/` folder is gone; vercel.json has no rewrites.
- As before: re-run `node tools/generate-share-pages.mjs` after changing
  projects-data.js or project.html.

### Update 4: Resend is now the ONLY email path (FormSubmit removed)

- `api/_lib/email.js` — shared email layer. ALL future site email (any new
  function) must go through its `sendEmail()`; `brandedHtml()` gives the
  navy/JCS email template.
- `api/contact.js` — sends the enquiry to Jacob (reply-to = enquirer) AND a
  branded auto-reply confirmation to the enquirer (non-fatal if it fails).
- Required setup in Vercel env vars: `RESEND_API_KEY`.
- For the auto-reply to actually deliver (and for best inbox placement),
  verify the domain at resend.com/domains and set
  `CONTACT_FROM = Jacob Schrader <enquiry@jacobcschrader.com>`.
- No FormSubmit fallback anymore: if Resend fails, the visitor is shown an
  error asking them to email directly.

---

## 12. Studio Admin (Phase 1) — jacobcschrader.com/admin

Password-protected business dashboard: projects overview, clients, and
bookings. Phase 2 (planned): invoices (branded email + mark-paid) and
gallery delivery emails.

**Files:** `admin.html` (UI, served at /admin, noindex),
`api/admin/{login,logout,me,clients,bookings}.js`,
`api/_lib/auth.js` (scrypt + HMAC session cookie, 7 days),
`api/_lib/db.js` (Neon Postgres, schema auto-created),
`tools/hash-password.mjs`, `package.json` (@neondatabase/serverless).

**One-time setup (Jacob):**
1. Vercel → project → **Storage → Create Database → Neon** (free) →
   connect to the project. This injects `DATABASE_URL` automatically.
2. Double-click `tools/hash-password.html` (opens in the browser, no
   install needed), type a password, copy the hash. (`tools/hash-password.mjs`
   does the same from Terminal if Node is installed.)
3. Vercel env vars (Settings → Environment Variables):
   - `ADMIN_EMAIL` = jacxbschrader@gmail.com
   - `ADMIN_PASSWORD_HASH` = (the hash from step 2 — NOT the password)
   - `SESSION_SECRET` = any long random string (e.g. 40 random characters)
4. Redeploy. Log in at jacobcschrader.com/admin.

**Notes:** single admin user by design. Sessions are stateless signed
cookies; changing SESSION_SECRET logs out everywhere. Tables:
`clients`, `bookings` (see db.js). Projects tab reads projects-data.js —
project publishing still goes through the normal Claude workflow.

### Admin update: twilight slot, confirm flow, Google Calendar

- Projects have a second time slot: `twilight_date` (blank = same day) +
  `twilight_time`. Times are real time-pickers now (needed for calendar).
- **Confirm & send** button on a project detail page: emails a branded
  confirmation to the client (+ copy to Jacob), both with a .ics invite
  containing the shoot and twilight events (America/Los_Angeles).
  Stamps `confirmed_at`; cards show "✓ confirmed". Re-clicking resends
  and updates (calendar events upsert by stable ID — no duplicates).
- **Direct Google Calendar write** (api/_lib/gcal.js): if
  `GOOGLE_SA_KEY` (service-account JSON) + `GCAL_CALENDAR_ID` env vars
  are set, confirming also writes both events straight onto Jacob's
  calendar — nothing to accept. Setup steps are documented at the top of
  gcal.js. Without those vars it silently falls back to invite-only.

### Confirm flow refinements (Visaro-style calendar events)

- New `deliverables` field on projects (client-facing list, e.g. "HDR
  photography · Drone photos …"); `notes` is now labeled "Access notes"
  (internal — Jacob's calendar only).
- Jacob's calendar event: title "Client - Service", location = full
  property address, description = Package / Property / Client (phone) /
  Price, then Deliverables and Access notes, plus admin deep link.
- Clients are NOT sent a calendar invite. Their confirmation email has
  an "Add to Calendar" button → signed public endpoint
  `/api/calendar?id&sig` (HMAC via SESSION_SECRET) serving the client
  version of the .ics (no price/notes). Google quick-add links included.
- Jacob's copy keeps the .ics attachment as a fallback when the direct
  Google Calendar write isn't configured.

### Create-project form (Visaro-style)

Rebuilt to mirror The Visaro's New Project modal, adapted for JCS:
structured address (street/city/state/zip/sqft — location string is
derived), client select with inline "+ New" client creation, Service
dropdown, grouped Addons checkboxes (Photography/Videography/Universal,
trimmed premium list in admin.html ADDONS) that auto-compose the
Deliverables text, manual Price + Travel fee/note, twilight slot,
delivery link, access notes, and a "Show price in confirmation" toggle
(hides the Total row in the client's confirmation email when off).
New bookings columns: city, state, zip, sqft, addons(json), travel_fee,
travel_note, show_price. No pricing engine by choice — price is manual.

### Work-with-me application flow (/book)

JCS takes custom quotes — so instead of Visaro's self-serve booking
wizard, /book is an "apply to work with me" flow:

- `book.html` — public, JCS-branded 3-step wizard (You → The property →
  The work): contact, address/sqft, target date, services of interest,
  message. Honeypot included. Submits to `api/book.js`, which stores a
  pending request, emails Jacob (with "Review in admin" button) and a
  branded "Application received" note to the applicant.
- Admin → **Requests** (sidebar, with red pending-count badge; also a
  Pending Requests stat on the dashboard): tabs Pending/Accepted/
  Declined/All. **Accept** matches-or-creates the client by email and
  creates a prefilled project (services → deliverables, target date →
  shoot date, status upcoming) then opens it — Jacob sets the custom
  quote and uses Confirm & send. **Decline** sends a graceful branded
  "fully committed" email. `api/admin/requests.js`, `requests` table.
- No pricing engine anywhere, by design (custom quotes only).

Site CTAs still point at /contact — link /book from the site when ready.

### Settings tab + discount codes

- Admin sidebar gained **Settings** with a Discount Codes card: create
  (code, percent-off or dollar-off, value, note), activate/deactivate,
  delete. `api/admin/discounts.js`, `discounts` table.
- Project form has a **Discount code** select (active codes only; an
  inactive code already on a project stays selectable there). Works on
  new AND existing projects.
- The discount is snapshotted in dollars at save time
  (`discount_code` + `discount_value` on bookings) — editing or deleting
  a code later never changes past projects. Dollar-off is capped at the
  project price; percent computed server-side.
- Where it shows: project detail (Discount + Total rows), client
  confirmation email (Discount line + reduced Total, respecting the
  show-price toggle), Jacob's calendar description, and dashboard
  revenue stats (now net of discounts).

### Branded delivery flow (A+)

How it works: paste the Pixieset gallery link (and optionally a
Dropbox/Drive download link for films) into the project via Edit, then
hit **Send delivery to client** on the project page. The client gets a
branded "Your delivery is ready" email whose button opens a JCS-branded
delivery page at `/delivery?t=<token>` — property title, deliverables,
View Gallery + Download Films & Files buttons. No invite to Pixieset's
branding first; JCS front door always.

- `delivery.html` — the public page (noindex; fetches `/api/delivery`).
- `api/delivery.js` — public, token-gated; returns client-safe fields
  only (no price, no access notes). Tokens are random, issued on first
  send, stable across resends.
- `api/admin/deliver.js` — sends the email, stamps
  `delivery_sent_at`/`delivery_sends`/`delivered_at`, and auto-advances
  the stage to Delivered if the project was still Upcoming/Editing/
  Revisions (later stages untouched).
- Project form gained a **Download link (films / zip)** field.
- Project detail Delivery card: Send/Resend button, gallery/download/
  preview-page links, "✓ Sent Jul 10 · 2×" state.
- Deliveries page cards show sent status + a Delivery page link.
- Guards: needs a gallery link and a client with an email.

### Serverless function consolidation (Vercel Hobby 12-function cap)

The delivery deploy failed: Hobby allows max 12 serverless functions and
we hit 13. Fixed by consolidating:

- All nine admin endpoints moved to `api/_lib/admin/` (Vercel ignores
  `_lib`) behind ONE dynamic route: `api/admin/[action].js`. URLs are
  unchanged (`/api/admin/bookings` etc. — `[action]` catches them), so
  no front-end changes were needed.
- Deleted `api/contact.js` — dead since /contact became the application
  wizard posting to `/api/book`.
- Function count is now 4 (`admin/[action]`, `book`, `calendar`,
  `delivery`) — lots of headroom for Stripe etc.

### Project page: Visaro-style info grid + delivery modal

- Project detail main column is now one "Project info" card matching
  Visaro's grid: Property / City, State / Square footage / Service /
  Shoot date (+time) / Twilight (when set) / Total amount / Payment
  (Paid-Unpaid badge) / Client (with brokerage) — no shooter/duration/
  Frame.io by design. Deliverables + access notes below.
- Actions card gained a Change stage dropdown (Visaro quick action).
- Delivery card: "Create delivery" opens a small modal (gallery link,
  download link, delivered-on) instead of the full Edit form; after
  creation it becomes Send/Resend + Edit delivery + links.

### Delivery editor (Visaro-style page, no uploads)

Creating a delivery now opens a full editor at `#delivery/:id` instead
of a modal (Create/Open delivery from the project page or Deliveries):

- Header: property title, Draft/Sent badge, client + email, and
  Preview as client / Save / Publish & send.
- **Delivery settings**: message to client (goes in the email), CC
  recipients (comma-separated, validated server-side, max 10),
  delivered-on date.
- **Links**: named link rows — title + URL — with "+ Add link" for as
  many as needed (Gallery, Cinematic Film, Zillow 3D Tour, whatever).
  Each becomes a button on the client's delivery page and replaces the
  old fixed gallery/download pair (legacy fields still fall back).
- Publish & send saves first, then emails client + CCs.
- New booking columns: delivery_message, delivery_cc, delivery_links
  (validated JSON). Tokens now issue when a delivery is saved, so
  Preview as client works before sending.
- Delivery fields were removed from the project Edit modal (project
  edits merge over the booking so delivery data survives).

### Client page (Visaro-style) + multiple emails per profile

- Client detail rebuilt like Visaro's: avatar initials + name header
  (brokerage, email · phone), Edit client/Delete; left = Projects card
  with count and Visaro-style rows (property/location · date, Paid or
  Unpaid badge, total, stage badge) + Notes card; right rail = Emails
  card and Contact info (phone, brokerage, date added, total revenue —
  net of discounts, incl. travel).
- **Emails card**: primary address (Primary chip) plus co-recipient
  emails — add with the input + Add (or Enter), remove with ×. Stored
  as validated JSON in clients.extra_emails (deduped vs primary, max
  10). EVERY client notification — booking confirmation and delivery —
  now goes to all addresses on the profile (shared recipientsOf() in
  api/_lib/links.js; confirm.js + deliver.js select extra_emails).
- Client Edit modal preserves extras (passes extra_emails through).

### Draft deliveries + invoices

**Draft deliveries.** Hitting Create delivery now stamps
delivery_created_at, so the draft appears on the Deliveries page
immediately with a Draft badge (Sent badge once published). The project
Delivery card shows the same badge, and its send button is "Publish &
send" (only enabled once links exist).

**Invoices.** Payment card on the project page:
- **Generate invoice** (needs a price) issues a token → "View
  invoice →" opens the branded public page at `/invoice?t=…`
  (print-friendly — client can Print / Save as PDF).
- **Send invoice to client** emails every address on the client
  profile: branded email, total + View Invoice button; stamps
  invoice_sent_at / invoice_sends ("✓ Invoice JCS-0007 sent Jul 9").
- Invoice number = JCS-<project id> (JCS-0007). Line items: service
  (+deliverables), travel (+note), discount (code). Paid/Due badge
  follows the project's Paid stage; Payment card header now shows
  Paid/Unpaid too.
- Files: api/_lib/admin/invoice.js (router action 'invoice'),
  api/invoice.js (public, token-gated, client-safe), invoice.html.
  Function count: 5 of 12.

### Client portal (/portal)

Simplified Luma-style portal, no logins — each client gets one private
tokenized link (clients.portal_token, issued automatically with their
first delivery):

- **"View Your Delivery" in the delivery email now lands here** —
  `/portal?c=<token>&p=<project>` — with that delivery as a navy hero
  card up top (its link buttons inline).
- Below: welcome header, stats strip (In production / Delivered /
  $ Outstanding — unpaid sent invoices only), then projects grouped
  In production / Booked / Delivered. Delivered rows link to their
  delivery page; invoiced rows show "Invoice JCS-0007" + Due/Paid chip
  linking to the invoice page.
- Client-facing stages are simplified: upcoming→Booked,
  editing/revisions→In production, delivered/completed/paid→Delivered.
- Files: api/portal.js (public, token-gated, client-safe — prices only
  appear once an invoice was actually sent), portal.html. Admin client
  page → Contact info shows "Open portal →" once the token exists.
  Function count: 6 of 12.

### Client login (magic link, no passwords) + Visaro-style header

- **Header**: every site page now matches The Visaro's layout — brand
  left, nav links centered, muted "CLIENT LOGIN" top-right (→ /portal).
  On mobile it sits beside the hamburger. Verified visually at desktop
  and 390px widths.
- **Login**: /portal without a token shows an email-only sign-in card.
  POST /api/portal { email } → if it matches a client profile (primary
  OR co-recipient email), their portal link is emailed ("Open Your
  Portal"). No accounts, no passwords. Always responds ok — never
  reveals whether an email exists; honeypot field included. Token is
  issued on first login request if the client doesn't have one yet.

### Pixieset auto-draft (Editing → delivery draft)

Pixieset has NO public developer API (only a Lightroom plugin + mobile
app), so collections can't be created programmatically. Instead we
exploit their predictable URLs:

- Settings → **Pixieset** card: set the studio subdomain once
  (e.g. "jacobschrader" → jacobschrader.pixieset.com). Stored in the
  new `settings` table (key/value; api/_lib/admin/settings.js, router
  action 'settings').
- When a project moves to **Editing** (from any path — stage dropdown,
  drag, edit form) and has no delivery links yet, the server prefills
  the delivery draft: predicted gallery link
  `https://<sub>.pixieset.com/<slugified title>/` + draft stamp, so it
  appears on Deliveries immediately.
- Workflow: name the Pixieset collection exactly like the property
  ("123 Main St" — or sync via the Lightroom plugin) and the predicted
  link resolves; adjust it in the delivery editor if it ever differs.
- Custom links are never overwritten; the hook skips projects that
  already have links, and does nothing until the subdomain is set.

### Delivery editor tweaks

- Live edits: the client's delivery page reads the DB fresh on every
  load (no-store), so Save alone updates it — no resend. The editor
  says so once a delivery is sent, and the resend button is now
  "Resend email" to make the distinction clear.
- Publish & send / Resend email no longer show confirm dialogs or
  success alerts — the Sent status updating is the feedback (errors
  still alert).
- Removed the "Delivered on" field from the editor; delivered_at still
  auto-stamps on first send.

### Portal search + newest-first ordering

- Portal: search box above the project sections (address, city,
  service, invoice number; live filter; hidden when a client has
  fewer than 4 projects).
- Ordering is newest shoot date → oldest everywhere: admin pipeline
  rows AND board cards (were ascending), client portal groups (API
  already DESC), client-page project list, and Deliveries.

### Fix: scheme-less delivery links

A link saved as "jacobcschrader.com" (no https://) rendered as a
RELATIVE link on the client page — the browser resolved it against the
delivery page URL, which looked like "the old link still there". Now
https:// is prepended both on save (bookings parseLinks) and on read
(linksOf, covers already-stored and legacy values).

### Per-link Save in the delivery editor

Each link row now has its own Save button — saves the delivery (all
fields) without re-rendering the form, flashes "✓ Live", and the
client's page reflects it immediately.

### Email system redesign (Visaro-structured, JCS-branded)

One template (jcsEmail in api/_lib/email.js) now powers every email:
navy masthead with only the Cormorant-italic JCS wordmark (no tagline),
tracked eyebrow, serif headline "Client · Property", optional note,
hairline label/value detail table, navy button, "Or copy:" link, and a
"CLIENT/ADMIN NOTIFICATION · {event}" footer.

Subjects: `{Property} | {Event}` — Booking Confirmed, Media Delivery,
Delivery Sent (new admin copy), Invoice JCS-0007, New Application,
Application Received, Application Update (decline). Portal magic link:
"Your Client Portal | Jacob Schrader".

Senders (domain verified on Resend, no extra setup):
- enquiry@jacobcschrader.com — confirmations, applications, declines,
  portal links (client-facing)
- delivery@jacobcschrader.com — media deliveries
- billing@jacobcschrader.com — invoices
- admin@jacobcschrader.com — all notifications to Jacob ("JCS Studio")
CONTACT_FROM env is now only a fallback when no sender is passed.
All 8 email paths covered by mock tests (senders, subjects, template).

### Delivery page redesign + client review flow

- delivery.html rebuilt: full-bleed navy hero (eyebrow, big serif
  italic property title, location, delivered date, link buttons — white
  solid first), "Included in your delivery" strip below, then a review
  section, then contact.
- **Client review**: "Happy with everything?" → Approve Delivery
  (stamps delivery_approved_at, admin email "{Property} | Delivery
  Approved") or Request Changes (textarea → saves delivery_feedback,
  moves delivered/completed projects back to Revisions, admin email
  "{Property} | Changes Requested" with the note). Approved state shows
  a green "✓ Delivery approved · date" chip and can be reopened.
- Admin: project Delivery card shows "✓ Client approved {date}" or a
  red "Changes requested" block with the note; Deliveries cards get
  Approved / Changes requested badges. Resending a delivery clears the
  feedback flag.
- api/delivery.js gained POST {t, action: approve|changes, message}.
  New columns: delivery_approved_at, delivery_feedback.

### Client pages: minimal chrome

Delivery, invoice, and portal pages no longer show the site nav (or
"Client Login" — pointless when they're already in). Each gets a
minimal bar (.mnav in styles.css): JCS wordmark + one contextual link —
"← Back to Portal" on delivery/invoice (APIs now return portal_url),
"View the Work →" on the portal. Footers slimmed to brand + contact +
copyright. Delivery bar is white over the navy hero, flips dark on the
invalid-link state.

### Portal pipeline (derived, self-advancing)

Client-facing stages are now derived — nothing to move manually:
- **Upcoming** — scheduled, shoot day hasn't come
- **In production** — from the shoot date on (LA time), or
  editing/revisions in the admin
- **Delivered** — the delivery email went out (or admin stage
  delivered/completed) — chip shows red **Unpaid**
- **Completed** — invoice paid (admin stage Paid) — chip shows green
  **Paid**
Stats strip: Delivered count includes Completed. Invoice rows no
longer show their own Due/Paid chip (the stage chip covers it).
Test projects #2–#5 created on client 1 covering all four states.

### One-click invoicing

- Payment card: "Generate & send invoice" — one click creates the
  invoice and emails it to every address on the client profile (no
  confirm popup; the "✓ Invoice JCS-XXXX sent" status is the
  feedback). Becomes "Resend invoice" after the first send. "View
  invoice →" appears once the token exists.
- Portal rows: the invoice link is now a "View Invoice →" button next
  to "View Delivery →" (appears once the invoice was sent).

### Shoot-day automation (stage move only)

api/cron.js + vercel.json crons: daily at 14:00 UTC (6/7am Pacific),
projects whose shoot date has arrived move upcoming → editing. That is
ALL it does — no Pixieset drafts, no emails (Jacob scratched the
auto-gallery part). The manual Pixieset draft hook still fires when a
project is saved into Editing by hand. Optional CRON_SECRET env var
locks the endpoint. 7 of 12 functions.

### Portfolio: JCS-Originals imported (complete)

All 8 remaining projects from ~/Desktop/JCS-originals/Projects are
live, with FULL metadata from each folder's info.txt (location, year,
headline, description, shot for, brokerage, price), the dedicated
cover.jpg from each folder as the project cover, and web-transcoded
films (1080p H.264 CRF23, 27-51MB — GitHub caps files at 100MB):

- 2350 Big Ranch Road — Napa · Vineyard Estate · $14.9M (44)
- 3 N La Senda Drive — Laguna Beach · $22M (23 + horizontal film)
- 465 Headwaters Way — Carson City NV · Clear Creek · $4.395M
  (11 + vertical film) [info.txt said "456" — folder name 465 used]
- 5211 Pennock Point — Jupiter FL · $45M (22)
- 55 Del Monte Drive — Hillsborough · 'The Innovation' · $12.6M
  (12 + horizontal film)
- 8076 Villandry Drive — Truckee · Martis Camp · $6.995M
  (10 + horizontal film)
- 9233 Heartwood Drive — Truckee · $4.25M (23)
- 9304 Ninebark Road — Truckee · $6.995M (11 + horizontal film)
(9290 Brae Road was already live, 49 photos.)

Sample/filler project folders deleted (420-toro-canyon, 1437-san-miguel,
rincon-point, 850-rockbridge, la-vista-grande). Share pages regenerated
for all 9. Total new media ~250MB — the git push will be large.

### SEO: JSON-LD structured data + sitemap + robots

- JSON-LD on every public page (schema.org, validated absolute URLs):
  homepage @graph = ProfessionalService/LocalBusiness (Danville CA,
  areaServed, founder) + WebSite + Person; About = ProfilePage +
  Person + breadcrumb; Films = breadcrumb + 4 VideoObjects (posters,
  durations); Projects/Architecture/Design/Contact = breadcrumbs.
- Per-project pages: generator now injects BreadcrumbList +
  ImageGallery into each project/<slug>.html (regenerated).
- robots.txt (blocks /admin + /api, points at sitemap) and
  sitemap.xml (16 URLs: 7 static + 9 projects). Client pages
  (portal/delivery/invoice) stay noindex and out of the sitemap.
- After deploy: verify with Google Rich Results Test + submit
  sitemap in Search Console (property for jacobcschrader.com).

### Client dashboard locked down (verified sessions)

The portal (dashboard) no longer serves data to anyone holding a URL:
- /portal requires a signed HttpOnly session cookie (HMAC,
  SESSION_SECRET, 30 days). Bare/legacy ?c= URLs show only the
  sign-in form and the API answers 401.
- Sign-in: magic-link email (only to addresses on the client profile)
  → /api/portal?login=<signed 30-day token> → sets cookie → redirect.
  Tampered/expired tokens are rejected (timing-safe compare).
  ?logout=1 signs out (Sign Out link in the portal bar).
- Delivery email "View Delivery" is now a sign-in link (safe — the
  email itself is the identity proof) landing on the portal with that
  delivery hero'd.
- Delivery + invoice PAGES stay tokenized and shareable by design
  (agents forward them); their "Back to Portal" goes to plain /portal.
- Admin client page "Open portal →" mints a sign-in URL via the new
  authed action api/_lib/admin/portal-link.js (router: portallink).
- clients.portal_token is now unused (harmless legacy column).
- Fully mock-tested: 401 paths, forged/expired tokens, cookie flags,
  logout, deliver CTA format.

### Deliveries page: cover-photo cards

Admin Deliveries cards now lead with a 16:10 cover image, status badge
overlaid (Approved / Changes requested / Sent / Draft), then title,
client, sent info + link count, and Open delivery / Preview actions.
Covers come from the Pixieset gallery itself: a new authed action
(api/_lib/admin/covers.js, router 'covers') fetches each delivery's
first link and caches its og:image on bookings.delivery_cover_url
(misses cached as '-'; a few per pass, fired in the background when
the Deliveries page opens). Fallbacks: matching portfolio cover by
title, else a navy JCS monogram tile.

### Project form: client search + CC emails

- The Client field in the project form is now a typeahead search
  (name, email, or brokerage; top 8 matches with email/brokerage
  sublines; Esc closes; clearing text clears the selection; "No
  matches — use + New" hint). Hidden input keeps client_id so the
  save/draft flow is unchanged.
- Client form (standalone and inline "+ New" from a project) gained a
  "CC emails" field — comma-separated co-recipients saved to
  extra_emails, so every notification reaches all addresses from the
  moment the client is created.
- Sorting: Deliveries now orders strictly by Create-delivery time
  (newest first; legacy items fall back to send time).

### Address autocomplete + skip-confirmation + form polish

- Property address field: Google-style autocomplete. With a Google
  Places API key saved in Settings it uses Places Autocomplete (New) +
  Place Details — picking a suggestion fills street, city, state, zip.
  Without a key it falls back to Photon/OSM (weak US house numbers).
  Key stored in settings.google_places_key (admin-only API).
- "Don't email confirmation" checkbox on projects
  (bookings.skip_confirmation): Confirm & send skips the client email;
  Jacob still gets his copy + calendar; dialogs/notes reflect it.
- Client field is a typeahead; client form has CC emails; form shows a
  live Total (price + travel − discount).
- Shoot time + twilight time are 30-minute dropdowns (6:00 AM–10:00 PM);
  off-grid times on existing projects are kept as an extra option.
- All email senders are "Jacob C Schrader" (no more JCS Studio); the
  masthead wordmark is a real Cormorant-italic PNG
  (images/email/jcs-wordmark.png) so the JCS font renders in Gmail too.
- Admin alert() popups replaced with quiet bottom-center toasts
  (navy = success, red = error); pre-send confirm dialogs kept.

### Frontend v2 — Guthrie-template redesign (JCS navy)

- Whole public site restructured on the jacobguthrie.com template,
  keeping the JCS navy + warm-paper palette and Cormorant/Inter type.
- Nav (all pages): brand left · Work/Services/Films/Design/About/Contact
  center · Client Login + navy "Book a Shoot" button right.
- Home: full-screen looping film hero (Ninebark) with centered serif
  headline ("Homes, artfully told."), small-caps subline, white +
  ghost CTAs; Selected Work text-on-image grid (first 6 projects,
  built by site.js into #sw-grid); Services image cards + "Also
  available" strip; Approach split; Trusted-By marquee band;
  white testimonial cards w/ monogram avatars; press row; CTA band;
  columned navy footer (Studio / Connect).
- Typography scale raised site-wide (.display up to 5rem, .h-section
  3.1rem); eyebrows are dash-less slate small-caps (--accent #52688f).
- New CSS lives in the "v2 — editorial template layer" block of
  styles.css. Old carousel (.pcar) code remains but home no longer
  uses it. project.html template + all project/*.html regenerated
  nav/footer. Interior page headers rewritten to the new scale.

### v2.1 — exact sizing pass (measured from jacobguthrie.com computed styles)

- Container 1420px; sections ~5.7rem vertical rhythm.
- Type: hero h1 56px (serif 300, -0.01em, lh 1.12); page-head h1 72px;
  section h2 52px; eyebrows 11px/0.26em; nav links 11px uppercase/0.2em;
  buttons 11px/0.2em, 15x26px padding; leads 24px serif 300.
- Cards: work titles 26px/300, loc 10.5px/0.2em, agent 12px; service
  cards 3:4 with 24px titles, 12.5px desc; quotes 16.5px serif 300;
  marquee 26px serif 300; footer tagline 19px serif, links 14px,
  column heads 11px/0.22em. All serif headings weight 300.

### Portfolio CMS — create/edit website projects from /admin

- Admin → Portfolio: "+ New project" editor — fields (title/slug/location/
  year/price/headline/shot for/brokerage/description), cover + horizontal
  film + vertical reel tiles, multi-upload gallery with reorder/remove,
  Published toggle (draft by default). Save → live on the site instantly,
  no deploy. Repo-based projects listed read-only below.
- Media: browser → Vercel Blob directly (admin-blob.js bundle of
  @vercel/blob/client; images client-resized to 2400px JPEG). Token
  broker: /api/admin/upload (auth-gated handleUpload). Removing media or
  deleting a project also deletes its blobs.
- Data: site_projects table (db.js); admin CRUD /api/admin/siteprojects;
  public /api/site-projects (published only, 60s edge cache) — 8th
  Vercel function. projects-data.js PROJECTS_READY fetches + merges DB
  projects ahead of the static ones; home grid, /projects, and
  /project?slug=… all await it. CMS projects use the dynamic
  /project?slug= URL (static /project/<slug> pages stay for repo ones).
- ONE-TIME SETUP: Vercel → Storage → Create Database → Blob → connect to
  the project (injects BLOB_READ_WRITE_TOKEN), then redeploy. Until then
  uploads show a friendly "Blob storage isn't set up yet" toast.

### Portfolio polish
- Gallery photos and portfolio project cards are drag-to-reorder (navy
  insertion line); project order persists via PUT {reorder:[ids]} and is
  the order on the website. Uploads run 4-in-parallel. Blob store is the
  PUBLIC "jcs-website-media" store (private stores 503 client uploads).

### Mobile pass (≤520px layer)
- Global: overflow-x clip (no sideways scroll anywhere); tighter gutters;
  stacked full-width hero CTAs; sec-head stacks; smaller display scale;
  press logos 14px; footer bottom stacks; mnav compact.
- Portal: compact stats (2x2, 1.45rem numerals), full-width hero buttons,
  tighter rows/panel. Delivery: shorter hero, full-width buttons.
  Invoice: stacked header/columns, smaller total.
- Admin: phone layer on top of the 760px shell — tighter main/cards,
  2-col stats, full-screen modals, 82vw pipeline columns, 1-col delivery
  grid, 2-col portfolio grid, smaller upload tiles, full-width toasts.

### Services page merge
- architecture.html + films.html + design.html merged into
  services.html (/services):
  film hero with Photography/Films jump pills, the four audience
  photography blocks (#photography), the four cinematic film cards
  (#films), CTA. Old URLs 301-redirect via vercel.json
  (/architecture, /films, /design -> /services); old files deleted.
  #design section carries the four design blocks (the placeholder
  design-work mockup grid was dropped).
- Navs/footers site-wide: Work / Services / About / Contact.
  Home service cards -> /services#photography / #films. Sitemap updated.

### Services page v2 (Guthrie-style)
- Numbered editorial sections with one short paragraph each:
  01 Photography (split text/image, aerial folded in, tag pills),
  02 Films (short intro + the four film cards),
  03 Social Reels (9:16 autoplay cards — currently the Clear Creek
  vertical; add more by duplicating the block),
  04 Design (split, tag pills replace the four long blocks),
  "Also available" strip, CTA. New CSS: .svcx / .svc-tags.

### Homepage hero video
- videos/hero.mp4 (35MB, 1080p CRF27 faststart, audio stripped) from the
  1.28GB 4K master; poster images/posters/hero.jpg. Hero uses
  data-nosound — site.js skips the mute button for silent clips.

## 2026-07-22 — Booking wizard, pricing page, proposals (Guthrie parity)

### Booking form v2 (book.html — /book + form.jacobcschrader.com)
- Replaced the /contact 3-step card form with a full-screen 7-step wizard
  modeled on form.jacobguthrie.com: Services (sqft + à-la-carte cards,
  live tier pricing) → Add-ons (filtered by service + extras) → Property
  → Details (status/listing/facing/view/access/homeowner) → Timing
  (shoot + launch dates) → Review (contact + booking summary) →
  Agreement (JCS terms + typed e-signature). Sticky estimated-total bar,
  per-step validation, honeypot kept. contact.html deleted; /contact
  301s to /book; all nav/footer links updated (sitemap too).
- /api/book + requests table extended: launch_date, addons,
  estimated_total, details (JSON), signature, signed_at. Accepting a
  request now carries the estimated total into the project's price and
  the wizard details into its notes.

### Pricing engine + page (pricing-data.js, pricing.html — /pricing +
### pricing.jacobcschrader.com)
- pricing-data.js: single source of truth — 6 services with 7 sqft tiers
  (0–8k, inquire above), per-service add-ons, extras, à-la-carte;
  ⚠️ seeded with PLACEHOLDER numbers pending Jacob's real 2026 rates.
- pricing.html: photo-hero editorial page (2026 Pricing & Services),
  per-service sections with add-on chips + expandable tier tables,
  additional-services block, navy CTA, confidentiality note. noindex.

### Proposals (admin + proposal.html — /proposals/<slug> +
### proposal.jacobcschrader.com/<slug>)
- New proposals table (slug unique, items JSON, draft/sent/accepted).
- Admin → Proposals: list + editor (property, slug, client, intro,
  grouped line items w/ blank-price = "Included", note, live total),
  Preview (draft-safe via ?preview=1 + admin cookie), Copy link,
  Send to client (branded email, stamps sent_at/sends).
- Public page: PRIVATE PROPOSAL hero, Scope & Investment groups,
  campaign total, auto-pulled portfolio films/photos, testimonials,
  "Reserve the Dates" accept (typed name → accepted + email to Jacob,
  9th Vercel function api/proposal.js).

### Routing (vercel.json)
- Host redirects: form./pricing. roots → /book, /pricing (redirects run
  pre-filesystem; rewriting "/" is impossible — index.html wins).
- Rewrites: /proposals/:slug and proposal-host /:slug → /proposal.
- NOTE for Jacob: add the three subdomains in Vercel → Settings → Domains.

### Pricing restructured to Jacob's sheet (same day, later)
- Extracted the service taxonomy from Jacob's JCS-Pricing.numbers
  (Spotlight text + raw IWA/Snappy decode — the sheet's price cells were
  still blank, so dollar figures remain placeholders): 5 sqft brackets
  ending at 5,000+, Flash/Ambient as the only size-priced photo service,
  Aerial/Vertical/Twilight as flat add-ons, flat Cinematic Film + Social
  Reel (+ Twilight Videography add-on), Zillow 3D by size, Floor Plan /
  Virtual Staging / Virtual Twilight / Property Website extras.
- pricing-data.js API: priceAt(serviceOrExtra, sqft), flat `price` OR
  `tiers`, no sqft cap (top bracket open-ended); book.html + pricing.html
  updated (flat-rate display, 5-row tables, cap copy removed).

### Booking form visual parity pass (same day, later)
- Rebuilt book.html's design system to replicate form.jacobguthrie.com
  measured via computed styles, keeping JCS palette + type: 16px-radius
  flat white cards / 14px add-on rows / 12px inputs / 11px buttons /
  22px 7px-radius ticks, hairline borders rgba(navy,.22) (.12 for
  header/footer), 3px pill progress track under the header bar, 30px
  Cormorant-300 step headings, 19px serif subcopy, serif slate (--accent)
  prices, blurred bone sticky footer (rgba paper .92 + blur 10px), navy
  11px-radius Continue button. Verified steps 1/2/4/7 in the browser.

### Real 2026 rates in (same day, later)
- pricing-data.js updated with Jacob's confirmed numbers: Flash/Ambient
  500/750/1000/1250/1500 by bracket; Aerial 150, Vertical/Vignette 200,
  Twilight Photo 250; Cinematic Film 950, Social Reel 950, Twilight
  Video 250; Zillow 3D 250/300/350/400/500; Floor Plan 50, Virtual
  Staging 25/img, Virtual Twilight 25/img (now per-image), Property
  Website 350. Placeholder banners removed from CLAUDE.md/HANDOFF.md.

### Pricing page v2 (Guthrie design parity) + bare-root subdomains
- pricing.html rebuilt to mirror pricing.jacobguthrie.com (measured):
  narrow ~620px editorial column, square-cornered white cards with a
  photo lead (images/svc/*), 24px serif titles, serif slate "From $"
  + BY SQUARE FOOTAGE caps, caps includes-line, plain-text add-on rows,
  native <details> VIEW FULL PRICING tables, ink VIEW EXAMPLES buttons,
  bone CTA w/ 50px serif, dark navy footer w/ confidentiality note.
- NEW middleware.js (Edge Middleware — not one of the 12 functions):
  serves form./pricing. subdomain ROOTS with no path in the URL
  (rewrites run pre-filesystem there, which vercel.json rewrites can't
  do) and routes proposal.<slug>. vercel.json host redirects removed;
  /contact→/book + /proposals/:slug rules kept.

## 2026-07-23 — Pricing page true parity pass
- Deeper measurement of pricing.jacobguthrie.com at full width revealed
  the real layout my first pass missed (reveal animations had hidden it):
  solid bone top bar in flow, LEFT-aligned ~860px hero with 84px serif
  title + italic accent word, centered ~990px container, TWO-column card
  grid (26px gap), photo overlays (ring icon + caps label linking to
  examples), muted includes-line, 50px Title Case section heading,
  scroll fade-ins. pricing.html rebuilt to match; hero photo switched to
  posters/3-n-la-senda.jpg (warm interior, brightness .72) to mirror the
  reference's mood. Verified locally at 1280px.

### Pricing hero swap (same day)
- Hero image → projects/55-del-monte-drive/1.jpg (The Innovation living
  room — matched from Jacob's pasted photo) with a navy gradient overlay
  (rgba(9,22,39) .68→.34 left-to-right) replacing the brightness filter,
  per Jacob: dark overlay for text legibility.

## 2026-07-26 — Media Licensing (Resid-style, in-house)
- Deep-dived getresid.com (licensing engine for architecture/RE
  photographers: research parties on a property → priced licenses →
  role-aware outreach → gallery/pay → ledger; app IA: Properties,
  Licenses, Renewals, Follow-ups, Revenue, People, Companies, Outbox).
- Built the JCS version inside /admin (no new Vercel function — router
  action `licensing`): license_leads table (idempotent in db.js);
  research panel (Google Programmable Search via settings
  google_cse_key/_cx, Google-link fallback); one-click result→lead;
  role-aware outreach drafts w/ preview-before-send (Resend, reply-to
  Jacob); fee helper rate card (role/usage/set-size multipliers);
  "Create offer page" reuses the proposals engine with license tiers;
  statuses + follow-up dates + licensed-$ ledger stats; Settings gained
  the two Programmable Search fields.

### Licensing section redesigned (Resid-grade)
- Measured getresid.com's actual design (Space Mono microlabels w/ 0.12em
  tracking, teal #3f7c92 accent + dots, warm-gray/ink palette, 999px pill
  buttons/chips, dark ledger surfaces, hatched terminal notes, blinking
  cursor, "(RSD — 01) //" section markers, "OUTPUT: N PARTIES" result
  headers) and rebuilt vLicensing with a scoped .lx-* system: mono marker
  header + "License everything." hero, dark ledger band (mono numerals,
  teal licensed-total), 001/002 numbered cards, pill inputs + Run
  research, result rows w/ teal domain pills + "+ Lead" pills, mono tab
  pills, lead rows w/ status-dot chips (per-status colors), role chips,
  Space Mono fee chips (dark when licensed), pill action buttons.
  Rest of the admin untouched; Space Mono loaded in admin only.

### Whole admin restyled to the Resid system
- Extended the Licensing section's Resid design to the entire admin by
  restyling the shared adm-* layer (structure untouched): near-black
  sidebar w/ teal active dots + mono STUDIO ADMIN/SIGN OUT; "● JCS
  STUDIO // {VIEW}" mono breadcrumb markers over Inter-800 titles
  (head() emits .adm-headmark); dark ledger stat bands (Space Mono
  numerals, first stat teal); white rounded-18 hairline cards w/
  teal-dot mono card headers; dot-chip badges (status hues preserved);
  pill buttons/inputs/segments/toasts; mono table headers, kv labels,
  money values (Space Mono via --rx-mono var), rounded modals. Fixed
  Space Mono @import (was mid-stylesheet where CSS ignores it → moved
  to top; lx block aliases). Wordmarks stay Cormorant italic per brand.
- Gotcha fixed: injecting quoted font names into single-quoted JS
  strings broke the app — inline styles must use var(--rx-mono).

### Licensing research: multi-provider search
- Google Cloud blocked Custom Search on Jacob's Maps-provisioned,
  org-attached project (project-level 403 regardless of key/API/billing
  state — verified by direct API calls). Search is now provider-flexible:
  Serper.dev (preferred; free 2,500 Google-quality searches, no card) →
  Brave Search API → Google CSE, auto-detected from whichever key is in
  Settings (new keys: serper_key, brave_search_key). Settings UI + the
  Licensing no-key note updated to point at Serper first.

### "Invalid Date" fix (confirmation emails, .ics, GCal, portal)
- Root cause: the Neon driver returns Postgres `date` columns as JS Date
  objects; String(date).slice(0,10) yields "Thu Aug 07" → "Invalid Date"
  in confirm emails, malformed DTSTART in .ics attachments, broken
  Google-Calendar links, and a portal stage comparison that could never
  match. New exported ymd() in api/_lib/ics.js normalizes Date|string →
  "YYYY-MM-DD"; applied in ics.js (dtLocal/addMinutes), confirm.js
  (email display), gcal.js, portal.js (In-production check), requests.js
  (launch-date note). Confirmation flow should be re-tested after deploy.

### One-click portal access from booking flow
- Emails are the identity proof, so they now carry signed 30-day
  loginUrl() links: booking-confirmation (confirm.js) adds an
  auto-sign-in "your client portal" link; the applicant email (book.js)
  uses loginUrl when the email matches an existing client, plain /portal
  otherwise. The form's success button passes ?email= to /portal, which
  prefills and auto-requests the magic link once (sessionStorage guard) —
  browser stays magic-link-gated (typing an email must never open
  someone's dashboard directly).

### Seamless portal after booking
- book.js now gets-or-creates the client at submission time. NEW clients:
  the form response returns a 15-minute signed login URL — "Go to Your
  Portal" lands them signed in, no email round-trip (safe: their fresh
  portal contains only their own application). EXISTING clients: browser
  stays magic-link-gated (auto-requested via /portal?email=), and their
  emails carry 30-day loginUrl links. portal.js GET now returns pending
  requests for the client's email; portal.html renders an "Application
  In Review" hero (+ "Welcome," instead of "Welcome back," on first
  visit) so the post-booking portal isn't an empty dashboard.

### Delivery page hero pulls the gallery cover
- The og:image unfurl that fed the admin Deliveries cards now also feeds
  the client page: /api/delivery returns cover_url (delivery_cover_url,
  "-" misses filtered), delivery.html layers it behind a black scrim as
  the hero (navy fallback). deliver.js re-unfurls at SEND time when the
  cover is empty or a cached "-" miss — the Pixieset gallery usually
  exists by then even if it didn't when the draft was created. covers.js
  exports ogImage for that.

## 2026-07-29 — Video sqft pricing synced from the final sheet
- Workflow: video tier structure was first built INTO Jacob's
  JCS-Pricing.numbers via AppleScript (add row below; four by-property-
  size blocks prefilled), Jacob tuned it (film family 1250→1650 +$100
  steps, Basics 700→1100, "Signature"→"Luxury Social Reel"), then the
  site synced FROM the sheet's CSV export.
- pricing-data.js: 6-bracket engine (0–2k…5–6k, 6,000+ = Inquire; null
  tier = Inquire; per-thing steps/labels so Zillow keeps its 5-bracket
  table). Five sized services: Photography 500–1500, Cinematic Listing
  Film + Luxury Social Reel 1250–1650, Basic Property Video + Basic
  Social Reel 700–1100. Add-ons per sheet (Teaser Video $350 new; Floor
  Plan $100). book.html: Inquire states (cards, note, custom-quote
  total, estimated_total withheld). pricing.html: per-service labels,
  INQUIRE rows, 6k copy.
- Admin: TYPES + project-form ADDONS updated to the new lineup (legacy
  type values preserved as selectable on old projects); licensing fee
  helper film base 500→600.

### À la carte formatted like the reference + JCS admin typography
- Pricing page à-la-carte now mirrors pricing.jacobguthrie.com's list
  minus Site Plan: Exterior Photography only $350 + Aerial Drone
  Photography only $250 (prices borrowed from the reference — sheet has
  no entries yet), 2D Floor Plan $100 with a $200 (5,000 sqft +) line,
  then the JCS extras. Floor Plan is now size-aware in the form too
  (tiers 100×4/200×2 — reuses the bracket engine).
- Admin typography re-branded per the kit while keeping the Resid
  structure: Space Mono removed (the --rx-mono var now resolves to
  Inter, converting every tracked-caps microlabel to the site's eyebrow
  style at 600), display headings back to Cormorant italic (view titles,
  modal titles, project heads, "License everything."), money/numerals in
  Cormorant 500 with lining figures (font-feature "lnum" — the portal
  gotcha), avatar serif italic. Colors/layout untouched.

### À-la-carte section layout matched to the reference
- Restructured from one wide stacked card to the reference's two
  side-by-side white cards (À LA CARTE | ZILLOW 3D TOUR · BY SQUARE
  FOOTAGE), accent-colored caps labels, equal-height grid.
