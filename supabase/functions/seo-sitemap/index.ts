/**
 * Dynamic XML sitemap for store.sanam.sa
 * GET /functions/v1/seo-sitemap
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const STORE_ORIGIN = "https://store.sanam.sa";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function urlEntry(loc: string, changefreq: string, priority: string) {
  return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!,
  );

  const urls: string[] = [
    urlEntry(`${STORE_ORIGIN}/`, "daily", "1.0"),
    urlEntry(`${STORE_ORIGIN}/categories`, "weekly", "0.7"),
    urlEntry(`${STORE_ORIGIN}/privacy`, "monthly", "0.3"),
    urlEntry(`${STORE_ORIGIN}/terms`, "monthly", "0.3"),
    urlEntry(`${STORE_ORIGIN}/complaints`, "monthly", "0.3"),
  ];

  const categorySlugs = new Set<string>();
  let from = 0;
  const page = 1000;
  while (from < 20000) {
    const { data, error } = await supabase
      .from("categories")
      .select("slug")
      .eq("is_active", true)
      .range(from, from + page - 1);
    if (error) break;
    if (!data?.length) break;
    for (const row of data) {
      if (row.slug) categorySlugs.add(String(row.slug));
    }
    if (data.length < page) break;
    from += page;
  }
  for (const slug of [...categorySlugs].sort()) {
    urls.push(urlEntry(`${STORE_ORIGIN}/category/${slug}`, "weekly", "0.8"));
  }

  const productIds = new Set<string>();
  from = 0;
  while (from < 50000) {
    const { data, error } = await supabase
      .from("product_id_map")
      .select("canonical_product_id")
      .range(from, from + page - 1);
    if (error) break;
    if (!data?.length) break;
    for (const row of data) {
      if (row.canonical_product_id) productIds.add(String(row.canonical_product_id));
    }
    if (data.length < page) break;
    from += page;
  }
  if (productIds.size === 0) {
    from = 0;
    while (from < 50000) {
      const { data, error } = await supabase
        .from("products")
        .select("id")
        .eq("is_active", true)
        .range(from, from + page - 1);
      if (error) break;
      if (!data?.length) break;
      for (const row of data) {
        if (row.id) productIds.add(String(row.id));
      }
      if (data.length < page) break;
      from += page;
    }
  }
  for (const id of [...productIds].sort()) {
    urls.push(urlEntry(`${STORE_ORIGIN}/product/${id}`, "weekly", "0.6"));
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;

  return new Response(xml, {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
});
