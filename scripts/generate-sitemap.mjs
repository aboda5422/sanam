/**
 * Build-time sitemap generator for store.sanam.sa
 * Writes public/sitemap.xml with static pages, category slugs, and active products.
 *
 * Usage: node scripts/generate-sitemap.mjs
 * Invoked automatically via npm run build.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const STORE_ORIGIN = "https://store.sanam.sa";
const OUT = join(root, "public", "sitemap.xml");

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(join(root, ".env"));
loadEnvFile(join(root, ".env.local"));
loadEnvFile(join(root, ".env.production"));

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "";

const STATIC_PATHS = [
  "/",
  "/categories",
  "/privacy",
  "/terms",
  "/complaints",
];

/** Fallback category slugs from src/data/store-data.ts (id fields). */
const FALLBACK_CATEGORY_SLUGS = [
  "latest-offers", "weekly-offers", "riyalak-yofreq",
  "daily-cheese", "daily-fish", "daily-herbs", "daily-dairy", "daily-eggs",
  "daily-vegetables", "daily-poultry", "daily-fresh-juices", "daily-fruits",
  "daily-meat", "daily-seafood", "daily-chilled", "daily-ready-meals",
  "pantry-ice-cream", "pantry-rice", "pantry-frozen-fish", "pantry-world-foods",
  "pantry-frozen-fries-sides", "pantry-pulses", "pantry-spices", "pantry-pizza",
  "pantry-tuna", "pantry-frozen-vegetables", "pantry-flour", "pantry-frozen-poultry",
  "pantry-oils", "pantry-sugar", "pantry-ghee", "pantry-soups", "pantry-chips-snacks",
  "pantry-sauces", "pantry-frozen-meat", "pantry-pickles", "pantry-jam-honey",
  "pantry-frozen-pastry", "pantry-pasta", "pantry-canned-food", "pantry-other",
  "pantry-breakfast", "pantry-ready-meals",
  "drinks-tea", "drinks-concentrates", "drinks-juices", "drinks-coffee",
  "drinks-hot-drinks", "drinks-energy-drinks", "drinks-soft-drinks", "drinks-water",
  "snacks-biscuits", "snacks-dates", "snacks-toast", "snacks-sweets", "snacks-bread",
  "snacks-chocolate", "snacks-croissant", "snacks-cake", "snacks-pastries", "snacks-nuts",
  "makeup-cosmetics",
  "beauty-men-s-shaving", "beauty-women-s-shaving", "beauty-perfumes", "beauty-skin-care",
  "beauty-hair-care", "beauty-face-care", "beauty-conditioner", "beauty-shampoo",
  "beauty-soap", "beauty-body-wash", "beauty-toothbrushes", "beauty-deodorants",
  "beauty-toothpaste",
  "home-storage", "home-cleaning-tools", "home-kitchen-tools", "home-cups",
  "home-shopping-bags", "home-garbage-bags", "home-sponges-brushes",
  "home-outdoor-lighting", "home-accessories", "home-camping", "home-food-wrap-storage",
  "home-bags", "home-home-decor", "home-flowers-plants", "home-grills", "home-plates",
  "home-charcoal", "home-garden-supplies", "home-bathroom-essentials", "home-air-fresheners",
  "home-insect-control", "home-men-clothing", "home-women-clothing", "home-tissues",
  "home-floor-cleaners", "home-bathroom-cleaners", "home-kitchen-cleaners", "home-laundry",
  "electronics-small-appliances", "electronics-phone-accessories", "electronics-car-accessories",
  "electronics-batteries", "electronics-mobiles", "electronics-smartwatches",
  "electronics-headphones", "electronics-chargers", "electronics-cables",
  "electronics-car-fresheners", "electronics-car-cleaners",
  "baby-diapers", "baby-baby-wipes",
  "pets-pet-accessories", "pets-cat-litter", "pets-cat-food",
  "toys-kids-toys", "toys-electronic-toys", "toys-educational-toys",
  "stationery-office-supplies", "stationery-pens", "stationery-notebooks",
  "stationery-school-supplies",
  "cleaning-tools-cleaning-and-household",
  "bread-bakery-and-sweets",
];

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function urlEntry(loc, changefreq, priority) {
  return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

async function fetchPaged(path, select, extraParams = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return [];
  const rows = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
    url.searchParams.set("select", select);
    for (const [k, v] of Object.entries(extraParams)) {
      url.searchParams.set(k, v);
    }
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Range: `${from}-${from + pageSize - 1}`,
        Prefer: "count=exact",
      },
    });
    if (!res.ok) {
      console.warn(`[sitemap] ${path} fetch failed:`, res.status, await res.text());
      break;
    }
    const chunk = await res.json();
    if (!Array.isArray(chunk) || chunk.length === 0) break;
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
    if (from > 50000) break;
  }
  return rows;
}

async function fetchAll(path, select) {
  return fetchPaged(path, select, { is_active: "eq.true" });
}

async function fetchAllRaw(path, select) {
  return fetchPaged(path, select);
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [];

  for (const path of STATIC_PATHS) {
    urls.push(
      urlEntry(
        path === "/" ? `${STORE_ORIGIN}/` : `${STORE_ORIGIN}${path}`,
        path === "/" ? "daily" : "weekly",
        path === "/" ? "1.0" : "0.7",
      ),
    );
  }

  let categorySlugs = new Set(FALLBACK_CATEGORY_SLUGS);
  try {
    const cats = await fetchAll("categories", "slug");
    for (const row of cats) {
      if (row?.slug) categorySlugs.add(String(row.slug).trim());
    }
    console.log(`[sitemap] categories from DB: ${cats.length}`);
  } catch (err) {
    console.warn("[sitemap] categories fallback only:", err?.message || err);
  }

  for (const slug of [...categorySlugs].filter(Boolean).sort()) {
    urls.push(urlEntry(`${STORE_ORIGIN}/category/${slug}`, "weekly", "0.8"));
  }

  const productIds = new Set();
  try {
    // Prefer canonical catalog ids to avoid near-duplicate URLs per branch copy.
    const maps = await fetchAllRaw("product_id_map", "canonical_product_id");
    for (const row of maps) {
      if (row?.canonical_product_id) productIds.add(String(row.canonical_product_id));
    }
    if (productIds.size === 0) {
      const products = await fetchAll("products", "id");
      for (const row of products) {
        if (row?.id) productIds.add(String(row.id));
      }
    }
    console.log(`[sitemap] products from DB: ${productIds.size}`);
  } catch (err) {
    console.warn("[sitemap] products skipped:", err?.message || err);
  }

  for (const id of [...productIds].sort()) {
    urls.push(urlEntry(`${STORE_ORIGIN}/product/${id}`, "weekly", "0.6"));
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<!-- generated ${today} · ${urls.length} urls -->
${urls.join("\n")}
</urlset>
`;

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, xml, "utf8");
  console.log(`[sitemap] wrote ${OUT} (${urls.length} urls)`);
}

main().catch((err) => {
  console.error("[sitemap] fatal:", err);
  process.exitCode = 1;
});
