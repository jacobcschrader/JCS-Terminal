// =====================================================================
//  JCS PRICING — the single source of truth for public pricing.
//  Powers BOTH the booking form (/book) and the pricing page (/pricing).
//
//  Rates from Jacob's JCS-Pricing sheet (updated 2026-07-30): all five
//  media services priced by property size through 5–6k, 6,000+ =
//  Inquire. Film + Luxury Reel $1,000→$1,600; Basics $700→$1,100.
//
//  HOW PRICING WORKS
//  - Default brackets: 0–2,000 / 2,000–3,000 / 3,000–4,000 / 4,000–5,000
//    / 5,000–6,000 / 6,000+. A `null` tier renders "Inquire".
//  - A service/extra may carry its own `steps` + `labels` (Zillow keeps
//    the older 5-bracket table ending at 5,000+).
//  - Flat things use `price`. `unit` add-ons (per image) are shown but
//    excluded from the estimated total. `quote: true` → "Let's talk".
// =====================================================================

(function () {
  var TIER_STEPS = [2000, 3000, 4000, 5000, 6000, Infinity];
  var TIER_LABELS = [
    "0 – 2,000 sqft", "2,000 – 3,000 sqft", "3,000 – 4,000 sqft",
    "4,000 – 5,000 sqft", "5,000 – 6,000 sqft", "6,000+ sqft"
  ];

  var TWILIGHT_VIDEO = { name: "Twilight Videography", price: 250, note: "Golden-hour / dusk session" };
  var TEASER = { name: "Teaser Video", price: 350, note: "Coming-soon cut from the original video" };

  var SERVICES = [
    {
      key: "photography",
      name: "Flash / Ambient Photography",
      desc: "Editorial, magazine-quality stills — flash-and-ambient frames hand-blended for a true luxury look. Priced by property size.",
      includes: "Edited high-res images · Web & print-ready",
      tiers: [500, 750, 1000, 1250, 1500, null],
      addons: [
        { name: "Aerial Photography", price: 150, note: "Drone stills" },
        { name: "Vertical / Vignette Images", price: 200, note: "Composition set for social" },
        { name: "Twilight Photography", price: 250, note: "Golden-hour / dusk session" },
        { name: "Virtual Staging", price: 25, unit: "image" },
        { name: "Virtual Twilight", price: 25, unit: "image" }
      ]
    },
    {
      key: "film",
      name: "Cinematic Property Film",
      desc: "A cinematic horizontal film that tells the property's story — cut for the MLS, websites, and YouTube.",
      includes: "Aerial drone · Licensed music · Branded + unbranded cuts",
      tiers: [1000, 1150, 1300, 1450, 1600, null],
      addons: [TWILIGHT_VIDEO, TEASER]
    },
    {
      key: "reel-luxury",
      name: "Luxury Social Reel",
      desc: "A vertical listing reel with cinematic pacing — cut for Instagram and social-first marketing.",
      includes: "Vertical 60–90s edit · Social-ready",
      tiers: [1000, 1150, 1300, 1450, 1600, null],
      addons: [TWILIGHT_VIDEO, TEASER]
    },
    {
      key: "basic-video",
      name: "Basic Property Film",
      desc: "A straightforward walkthrough film covering the property practically.",
      includes: "Licensed music · Clean edit",
      tiers: [700, 800, 900, 1000, 1100, null],
      addons: [TWILIGHT_VIDEO, TEASER]
    },
    {
      key: "basic-reel",
      name: "Basic Social Reel",
      desc: "A vertical walkthrough reel, social-ready — no lifestyle elements.",
      includes: "Vertical 60s edit · Social-ready",
      tiers: [700, 800, 900, 1000, 1100, null],
      addons: [TWILIGHT_VIDEO]
    },
    {
      key: "custom",
      name: "Something Else",
      desc: "Design work or something not listed? Select this and tell me what you have in mind.",
      includes: "",
      quote: true,
      addons: []
    }
  ];

  // Extras — offered on every shoot regardless of the services chosen.
  var ZILLOW_STEPS = [2000, 3000, 4000, 5000, Infinity];
  var ZILLOW_LABELS = ["0 – 2,000 sqft", "2,000 – 3,000 sqft", "3,000 – 4,000 sqft", "4,000 – 5,000 sqft", "5,000+ sqft"];
  var EXTRAS = [
    { name: "Zillow 3D Tour", tiers: [250, 300, 350, 400, 500], steps: ZILLOW_STEPS, labels: ZILLOW_LABELS },
    // $100, stepping to $200 above 5,000 sqft (reuses the tier engine).
    { name: "2D Floor Plan", tiers: [100, 100, 100, 100, 200, 200], note: "Branded schematic" },
    { name: "Property Website", price: 350, note: "Single-listing site" }
  ];

  // Stand-alone / à la carte (pricing page only) — Guthrie-style list.
  var ALACARTE = [
    { name: "Exterior Photography only", price: 350 },
    { name: "Aerial Drone Photography only", price: 250 },
    { name: "2D Floor Plan", price: 100 },
    { name: "2D Floor Plan (5,000 sqft +)", price: 200 },
    { name: "Virtual Staging (per image)", price: 25 },
    { name: "Virtual Twilight (per image)", price: 25 },
    { name: "Teaser Video (from your film)", price: 350 },
    { name: "Property Website", price: 350 }
  ];

  // sqft → tier index against a thing's own steps (or the default).
  function tierIndex(sqft, steps) {
    var st = steps || TIER_STEPS;
    var n = Number(sqft) || 0;
    for (var i = 0; i < st.length; i++) if (n <= st[i]) return i;
    return st.length - 1;
  }

  // Price at a given sqft — flat `price` wins, then the sqft tier.
  // null → Inquire (tiered) or quote (no pricing at all).
  function priceAt(thing, sqft) {
    if (thing == null) return null;
    if (typeof thing.price === "number") return thing.price;
    var tiers = thing.tiers || (Array.isArray(thing) ? thing : null);
    if (!tiers || !tiers.length) return null;
    return tiers[tierIndex(sqft, thing.steps)];
  }

  function labelsOf(thing) {
    return (thing && thing.labels) || TIER_LABELS;
  }

  window.JCS_PRICING = {
    year: "2026",
    turnaround: "2–4 days",
    inquireOver: 6000,
    tierLabels: TIER_LABELS,
    services: SERVICES,
    extras: EXTRAS,
    alacarte: ALACARTE,
    tierIndex: tierIndex,
    priceAt: priceAt,
    labelsOf: labelsOf
  };
})();
