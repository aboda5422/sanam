import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { query } = await req.json();
    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return new Response(JSON.stringify({ matches: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const q = query.trim();
    // Tokenize (Arabic + English) – take meaningful words
    const tokens = q
      .split(/[\s,،.\-]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2)
      .slice(0, 6);

    // Build OR filter to fetch a candidate pool
    const orParts: string[] = [];
    for (const tok of tokens.length ? tokens : [q]) {
      const safe = tok.replace(/[%,()]/g, "");
      orParts.push(`name.ilike.%${safe}%`);
      orParts.push(`name_en.ilike.%${safe}%`);
    }

    const { data: candidates, error } = await supabase
      .from("products")
      .select("id, name, name_en, price, image, unit, category_id, is_active")
      .eq("is_active", true)
      .or(orParts.join(","))
      .limit(40);

    if (error) throw error;

    if (!candidates || candidates.length === 0) {
      return new Response(JSON.stringify({ matches: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If we have <= 6 candidates, return them ranked by simple substring score
    if (candidates.length <= 6) {
      return new Response(JSON.stringify({ matches: candidates.slice(0, 8) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use AI to rank/pick best alternatives, including size variants
    const productList = candidates
      .map((p, i) => `${i}: ${p.name}${p.unit ? ` (${p.unit})` : ""} - ${p.price} ر.س`)
      .join("\n");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content:
              "أنت مساعد بقالة ذكي. مهمتك ترتيب المنتجات الأقرب لطلب العميل. أعد فقط فهارس المنتجات (أرقام) من الأكثر تطابقاً للأقل. إذا طلب العميل حجماً غير متوفر، اقترح أقرب حجم. أعد حتى 8 نتائج.",
          },
          {
            role: "user",
            content: `طلب العميل: "${q}"\n\nالمنتجات المتاحة:\n${productList}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "rank_products",
              description: "ترتيب المنتجات حسب الأقرب لطلب العميل",
              parameters: {
                type: "object",
                properties: {
                  ranked_indexes: {
                    type: "array",
                    items: { type: "integer" },
                    description: "فهارس المنتجات مرتبة من الأفضل تطابقاً للأقل",
                  },
                },
                required: ["ranked_indexes"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "rank_products" } },
      }),
    });

    if (!aiResp.ok) {
      // Fallback: return candidates as-is
      return new Response(JSON.stringify({ matches: candidates.slice(0, 8) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    let ranked: number[] = [];
    try {
      const args = JSON.parse(toolCall?.function?.arguments || "{}");
      ranked = Array.isArray(args.ranked_indexes) ? args.ranked_indexes : [];
    } catch {
      ranked = [];
    }

    const matches =
      ranked.length > 0
        ? ranked.map((i) => candidates[i]).filter(Boolean).slice(0, 8)
        : candidates.slice(0, 8);

    return new Response(JSON.stringify({ matches }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-quick-order error:", e);
    return new Response(JSON.stringify({ error: String(e), matches: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});