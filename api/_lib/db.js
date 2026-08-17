// =====================================================================
//  DATABASE — Neon Postgres over HTTP (works in Vercel functions).
//
//  Setup (one time): Vercel → Storage → Create Database → Neon →
//  connect it to this project. That injects DATABASE_URL automatically.
//
//  The schema is created on first use (idempotent), so there is no
//  separate migration step. Add new tables here as the admin grows.
// =====================================================================

const { neon } = require("@neondatabase/serverless");

let _sql = null;
function sql() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

let _ready = null;
function ensureSchema() {
  if (!_ready) {
    _ready = (async () => {
      const s = sql();
      await s`CREATE TABLE IF NOT EXISTS clients (
        id         serial PRIMARY KEY,
        name       text NOT NULL,
        email      text DEFAULT '',
        phone      text DEFAULT '',
        brokerage  text DEFAULT '',
        notes      text DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      // Co-recipient emails (JSON array) — every notification goes to
      // the primary email plus all of these.
      await s`ALTER TABLE clients ADD COLUMN IF NOT EXISTS extra_emails text DEFAULT ''`;
      // Client portal: one private token per client → /portal?c=…
      await s`ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_token text DEFAULT ''`;
      await s`CREATE TABLE IF NOT EXISTS bookings (
        id         serial PRIMARY KEY,
        client_id  integer REFERENCES clients(id) ON DELETE SET NULL,
        title      text NOT NULL,
        location   text DEFAULT '',
        shoot_date date,
        shoot_time text DEFAULT '',
        type       text DEFAULT '',
        price      numeric,
        status     text NOT NULL DEFAULT 'upcoming',
        notes      text DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      // Pipeline upgrade: delivery fields + status rename (idempotent).
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS delivery_url text DEFAULT ''`;
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS delivered_at date`;
      await s`UPDATE bookings SET status = 'upcoming' WHERE status = 'scheduled'`;
      // Twilight slot + booking confirmation (idempotent).
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS twilight_date date`;
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS twilight_time text DEFAULT ''`;
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS confirmed_at timestamptz`;
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deliverables text DEFAULT ''`;
      // Visaro-style form fields (idempotent).
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS city text DEFAULT ''`;
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS state text DEFAULT ''`;
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS zip text DEFAULT ''`;
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS sqft integer`;
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS addons text DEFAULT ''`;
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS travel_fee numeric`;
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS travel_note text DEFAULT ''`;
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS show_price boolean DEFAULT true`;
      // Opt out of the client-side booking-confirmation email.
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS skip_confirmation boolean DEFAULT false`;
      // Branded delivery flow (gallery + download links, send tracking).
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS download_url text DEFAULT ''`;
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS delivery_token text DEFAULT ''`;
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS delivery_sent_at timestamptz`;
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS delivery_sends integer DEFAULT 0`;
      // Delivery editor: personal note, CC list, named links (JSON array
      // of { label, url } — replaces the fixed gallery/download pair).
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS delivery_message text DEFAULT ''`;
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS delivery_cc text DEFAULT ''`;
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS delivery_links text DEFAULT ''`;
      // Cover image for the admin Deliveries cards (unfurled from the
      // gallery link's og:image).
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS delivery_cover_url text DEFAULT ''`;
      // Draft deliveries: stamped when "Create delivery" is first hit,
      // so the Deliveries page shows the draft before anything is sent.
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS delivery_created_at timestamptz`;
      // Client review on the delivery page: approve / request changes.
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS delivery_approved_at timestamptz`;
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS delivery_feedback text DEFAULT ''`;
      // Invoices: token powers the public /invoice?t=… page.
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS invoice_token text DEFAULT ''`;
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS invoice_sent_at timestamptz`;
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS invoice_sends integer DEFAULT 0`;
      // Discount codes (Settings) + per-project application snapshot.
      await s`CREATE TABLE IF NOT EXISTS discounts (
        id         serial PRIMARY KEY,
        code       text NOT NULL,
        kind       text NOT NULL DEFAULT 'percent',
        value      numeric NOT NULL,
        note       text DEFAULT '',
        active     boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_code text DEFAULT ''`;
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_value numeric`;
      // Studio settings (key/value) — e.g. pixieset_subdomain.
      await s`CREATE TABLE IF NOT EXISTS settings (
        key   text PRIMARY KEY,
        value text NOT NULL DEFAULT ''
      )`;
      // Portfolio projects (admin-managed CMS) — media lives in Vercel
      // Blob; the public site merges these with the static repo projects.
      await s`CREATE TABLE IF NOT EXISTS site_projects (
        id             serial PRIMARY KEY,
        slug           text NOT NULL,
        title          text NOT NULL,
        location       text DEFAULT '',
        year           text DEFAULT '',
        headline       text DEFAULT '',
        summary        text DEFAULT '',
        shot_for       text DEFAULT '',
        brokerage      text DEFAULT '',
        price          text DEFAULT '',
        cover_url      text DEFAULT '',
        gallery        text DEFAULT '[]',
        horizontal_url text DEFAULT '',
        vertical_url   text DEFAULT '',
        draft          boolean NOT NULL DEFAULT true,
        sort_order     integer NOT NULL DEFAULT 0,
        created_at     timestamptz NOT NULL DEFAULT now(),
        updated_at     timestamptz NOT NULL DEFAULT now()
      )`;
      await s`CREATE UNIQUE INDEX IF NOT EXISTS site_projects_slug ON site_projects (slug)`;
      // Work-with-me applications (public /book form).
      await s`CREATE TABLE IF NOT EXISTS requests (
        id          serial PRIMARY KEY,
        name        text NOT NULL,
        email       text NOT NULL,
        phone       text DEFAULT '',
        brokerage   text DEFAULT '',
        title       text NOT NULL,
        city        text DEFAULT '',
        state       text DEFAULT '',
        zip         text DEFAULT '',
        sqft        integer,
        target_date date,
        services    text DEFAULT '',
        message     text DEFAULT '',
        status      text NOT NULL DEFAULT 'pending',
        project_id  integer,
        created_at  timestamptz NOT NULL DEFAULT now()
      )`;
      // Guthrie-style booking wizard fields (idempotent): live-priced
      // add-ons, estimated total, property details JSON, e-signature.
      await s`ALTER TABLE requests ADD COLUMN IF NOT EXISTS launch_date date`;
      await s`ALTER TABLE requests ADD COLUMN IF NOT EXISTS addons text DEFAULT ''`;
      await s`ALTER TABLE requests ADD COLUMN IF NOT EXISTS estimated_total numeric`;
      await s`ALTER TABLE requests ADD COLUMN IF NOT EXISTS details text DEFAULT ''`;
      await s`ALTER TABLE requests ADD COLUMN IF NOT EXISTS signature text DEFAULT ''`;
      await s`ALTER TABLE requests ADD COLUMN IF NOT EXISTS signed_at timestamptz`;
      // Client proposals (admin-authored) — public page at
      // /proposals/<slug> and proposal.jacobcschrader.com/<slug>.
      // items is a JSON array of { group, name, desc, price, badge }.
      await s`CREATE TABLE IF NOT EXISTS proposals (
        id           serial PRIMARY KEY,
        slug         text NOT NULL,
        title        text NOT NULL,
        location     text DEFAULT '',
        client_name  text DEFAULT '',
        client_email text DEFAULT '',
        intro        text DEFAULT '',
        items        text DEFAULT '[]',
        note         text DEFAULT '',
        status       text NOT NULL DEFAULT 'draft',
        sent_at      timestamptz,
        sends        integer DEFAULT 0,
        accepted_at  timestamptz,
        accepted_by  text DEFAULT '',
        created_at   timestamptz NOT NULL DEFAULT now(),
        updated_at   timestamptz NOT NULL DEFAULT now()
      )`;
      await s`CREATE UNIQUE INDEX IF NOT EXISTS proposals_slug ON proposals (slug)`;
      // Proposal-first booking flow: a proposal can gate a booking
      // (booking.status 'pending' until accepted). Acceptance doubles as
      // the contract — deeper info JSON + typed e-signature live here.
      await s`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS booking_id integer`;
      await s`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS client_id integer`;
      await s`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS sqft integer`;
      await s`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS acceptance text DEFAULT ''`;
      await s`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS signature text DEFAULT ''`;
      await s`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS signed_at timestamptz`;
      // Media licensing leads (admin Licensing section) — companies that
      // worked on a shot property (architect, builder, designer…) who can
      // license the media for their own marketing.
      await s`CREATE TABLE IF NOT EXISTS license_leads (
        id           serial PRIMARY KEY,
        booking_id   integer,
        property     text NOT NULL,
        location     text DEFAULT '',
        company      text NOT NULL,
        role         text DEFAULT 'other',
        contact_name text DEFAULT '',
        email        text DEFAULT '',
        phone        text DEFAULT '',
        website      text DEFAULT '',
        source_url   text DEFAULT '',
        status       text NOT NULL DEFAULT 'found',
        fee          numeric,
        notes        text DEFAULT '',
        proposal_id  integer,
        follow_up    date,
        emailed_at   timestamptz,
        sends        integer DEFAULT 0,
        created_at   timestamptz NOT NULL DEFAULT now(),
        updated_at   timestamptz NOT NULL DEFAULT now()
      )`;
      await s`CREATE INDEX IF NOT EXISTS license_leads_booking ON license_leads (booking_id)`;
      // License tracker rebuild (2026-07-31): watermarked preview +
      // final gallery links, optional payment link, and stage stamps.
      await s`ALTER TABLE license_leads ADD COLUMN IF NOT EXISTS preview_url text DEFAULT ''`;
      await s`ALTER TABLE license_leads ADD COLUMN IF NOT EXISTS final_url text DEFAULT ''`;
      await s`ALTER TABLE license_leads ADD COLUMN IF NOT EXISTS payment_url text DEFAULT ''`;
      await s`ALTER TABLE license_leads ADD COLUMN IF NOT EXISTS accepted_at timestamptz`;
      await s`ALTER TABLE license_leads ADD COLUMN IF NOT EXISTS licensed_at timestamptz`;
      await s`ALTER TABLE license_leads ADD COLUMN IF NOT EXISTS paid_at timestamptz`;
      // Custom delivery system (2026-08-08, replaces Pixieset): media is
      // uploaded browser→Vercel Blob; every project ("listing") gets a
      // portal slug (/portal/<slug>), a downloads lock, and its files.
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS delivery_slug text DEFAULT ''`;
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS downloads_locked boolean NOT NULL DEFAULT false`;
      await s`CREATE UNIQUE INDEX IF NOT EXISTS bookings_delivery_slug ON bookings (delivery_slug) WHERE delivery_slug <> ''`;
      // One row per uploaded file. Photos carry a 2048px "web" copy (the
      // MLS bundle + on-page viewing) and a ~640px thumb; films carry a
      // poster frame as thumb. name = clean download filename.
      await s`CREATE TABLE IF NOT EXISTS delivery_files (
        id          serial PRIMARY KEY,
        booking_id  integer NOT NULL,
        kind        text NOT NULL DEFAULT 'photo',
        name        text NOT NULL,
        url         text NOT NULL,
        web_url     text DEFAULT '',
        thumb_url   text DEFAULT '',
        size        bigint DEFAULT 0,
        width       integer,
        height      integer,
        sort_order  integer NOT NULL DEFAULT 0,
        created_at  timestamptz NOT NULL DEFAULT now()
      )`;
      await s`CREATE INDEX IF NOT EXISTS delivery_files_booking ON delivery_files (booking_id, sort_order, id)`;
      // Download activity (dashboard "Recent downloads" + per-listing feed).
      // kind: file | full | mls | selected | view
      await s`CREATE TABLE IF NOT EXISTS download_events (
        id          serial PRIMARY KEY,
        booking_id  integer NOT NULL,
        file_id     integer,
        kind        text NOT NULL DEFAULT 'file',
        label       text DEFAULT '',
        email       text DEFAULT '',
        ip          text DEFAULT '',
        ua          text DEFAULT '',
        created_at  timestamptz NOT NULL DEFAULT now()
      )`;
      await s`CREATE INDEX IF NOT EXISTS download_events_booking ON download_events (booking_id, created_at)`;
      await s`CREATE INDEX IF NOT EXISTS download_events_time ON download_events (created_at)`;
      // Admin upgrade (2026-08-08): task tracker + paid stamp for billing.
      await s`CREATE TABLE IF NOT EXISTS tasks (
        id          serial PRIMARY KEY,
        title       text NOT NULL,
        priority    text NOT NULL DEFAULT 'normal',
        done        boolean NOT NULL DEFAULT false,
        due         date,
        booking_id  integer,
        created_at  timestamptz NOT NULL DEFAULT now(),
        done_at     timestamptz
      )`;
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid_at timestamptz`;
      // Project timeline (events + notes) and client testimonials.
      await s`CREATE TABLE IF NOT EXISTS project_events (
        id          serial PRIMARY KEY,
        booking_id  integer NOT NULL,
        kind        text NOT NULL DEFAULT 'note',
        label       text DEFAULT '',
        actor       text DEFAULT 'system',
        meta        text DEFAULT '',
        created_at  timestamptz NOT NULL DEFAULT now()
      )`;
      await s`CREATE INDEX IF NOT EXISTS project_events_booking ON project_events (booking_id, created_at)`;
      await s`CREATE TABLE IF NOT EXISTS testimonials (
        id           serial PRIMARY KEY,
        booking_id   integer,
        client_name  text DEFAULT '',
        brokerage    text DEFAULT '',
        quote        text NOT NULL,
        approved     boolean NOT NULL DEFAULT false,
        created_at   timestamptz NOT NULL DEFAULT now()
      )`;
      await s`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS reminded_at timestamptz`;
      // Payments (Stripe, optional) + deposits; archived originals.
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_amount numeric`;
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_paid_at timestamptz`;
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stripe_session_id text DEFAULT ''`;
      await s`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid_via text DEFAULT ''`;
      await s`ALTER TABLE delivery_files ADD COLUMN IF NOT EXISTS archived_at timestamptz`;
      await s`UPDATE bookings SET paid_at = COALESCE(paid_at, invoice_sent_at, delivered_at::timestamptz, created_at) WHERE status = 'paid' AND paid_at IS NULL`;
    })();
  }
  return _ready;
}

// Every route should call: const s = await db();
async function db() {
  await ensureSchema();
  return sql();
}

module.exports = { db };
