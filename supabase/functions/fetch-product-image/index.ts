import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Open Food Facts: free, open, no key required, has Saudi/global products
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { barcode } = await req.json();
    if (!barcode || typeof barcode !== "string") {
      return new Response(JSON.stringify({ error: "barcode مطلوب" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleaned = barcode.trim().replace(/\D/g, "");
    if (!cleaned) {
      return new Response(JSON.stringify({ error: "باركود غير صالح" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try Open Food Facts
    const offRes = await fetch(`https://world.openfoodfacts.org/api/v2/product/${cleaned}.json`);
    if (offRes.ok) {
      const data = await offRes.json();
      if (data.status === 1 && data.product) {
        const p = data.product;
        const image = p.image_front_url || p.image_url || p.image_small_url || null;
        const name = p.product_name_ar || p.product_name || null;
        if (image) {
          return new Response(JSON.stringify({
            success: true,
            image_url: image,
            name,
            source: "openfoodfacts",
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
    }

    // Fallback: Open Beauty Facts (cosmetics, hygiene products)
    const obfRes = await fetch(`https://world.openbeautyfacts.org/api/v2/product/${cleaned}.json`);
    if (obfRes.ok) {
      const data = await obfRes.json();
      if (data.status === 1 && data.product) {
        const p = data.product;
        const image = p.image_front_url || p.image_url || null;
        if (image) {
          return new Response(JSON.stringify({
            success: true,
            image_url: image,
            name: p.product_name_ar || p.product_name || null,
            source: "openbeautyfacts",
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
    }

    return new Response(JSON.stringify({
      success: false,
      error: "لم نجد صورة لهذا الباركود في المصادر المفتوحة",
    }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});