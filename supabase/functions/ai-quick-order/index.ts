import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { query, branch_id } = await req.json();
    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return new Response(JSON.stringify({ matches: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
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

    let productQuery = supabase
      .from("products")
      .select("id, name, name_en, price, image, unit, category_id, is_active")
      .eq("is_active", true)
      .or(orParts.join(","))
      .limit(40);
    if (branch_id) productQuery = productQuery.eq("branch_id", branch_id);

    const { data: candidates, error } = await productQuery;

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

    // Without Gemini key, fall back to first candidates
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ matches: candidates.slice(0, 8) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use Gemini to rank/pick best alternatives, including size variants
    const productList = candidates
      .map((p, i) => `${i}: ${p.name}${p.unit ? ` (${p.unit})` : ""} - ${p.price} ر.س`)
      .join("\n");

    const model = "gemini-flash-lite-latest";
    const aiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text:
                  "أنت مساعد بقالة ذكي. مهمتك ترتيب المنتجات الأقرب لطلب العميل. أعد فقط فهارس المنتجات (أرقام) من الأكثر تطابقاً للأقل. إذا طلب العميل حجماً غير متوفر، اقترح أقرب حجم. أعد حتى 8 نتائج.",
              },
            ],
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `طلب العميل: "${q}"\n\nالمنتجات المتاحة:\n${productList}`,
                },
              ],
            },
          ],
          tools: [
            {
              functionDeclarations: [
                {
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
              ],
            },
          ],
          toolConfig: {
            functionCallingConfig: {
              mode: "ANY",
              allowedFunctionNames: ["rank_products"],
            },
          },
        }),
      },
    );

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("Gemini error:", aiResp.status, errText);
      return new Response(JSON.stringify({ matches: candidates.slice(0, 8) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    const parts = aiData?.candidates?.[0]?.content?.parts ?? [];
    const fnCall = parts.find((p: { functionCall?: unknown }) => p.functionCall)?.functionCall;
    let ranked: number[] = [];
    try {
      const args = fnCall?.args ?? {};
      ranked = Array.isArray(args.ranked_indexes) ? args.ranked_indexes : [];
    } catch {
      ranked = [];
    }

    const matches =
      ranked.length > 0
        ? ranked.map((i: number) => candidates[i]).filter(Boolean).slice(0, 8)
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
