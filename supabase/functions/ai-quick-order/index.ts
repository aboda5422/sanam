import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PRODUCT_SELECT =
  "id, name, name_en, price, original_price, image, unit, category_id, is_active, is_featured, stock_quantity, brand, size_label, extra_label";

type Style = "economic" | "balanced" | "premium";
type Intent = "recipe" | "occasion" | "budget" | "discovery" | "search" | "modify" | "chat";

type ProductRow = {
  id: string;
  name: string;
  name_en: string | null;
  price: number;
  original_price: number | null;
  image: string | null;
  unit: string;
  category_id: string | null;
  is_active: boolean;
  is_featured?: boolean | null;
  stock_quantity?: number | null;
  brand?: string | null;
  size_label?: string | null;
  extra_label?: string | null;
};

type NeededItem = {
  role: string;
  queries: string[];
  qty: number;
  optional?: boolean;
};

type Plan = {
  reply: string;
  intent: Intent;
  style: Style;
  servings: number | null;
  budget_sar: number | null;
  basket_title: string;
  needed_items: NeededItem[];
  followups: string[];
  keep_existing_basket: boolean;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sanitizeToken(tok: string) {
  return tok.replace(/[%(),."'\\]/g, "").trim();
}

function tokenize(s: string) {
  return s
    .toLowerCase()
    .split(/[\s,،.\-_/\\]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function isSanamBrand(p: ProductRow) {
  const hay = `${p.brand || ""} ${p.name || ""} ${p.name_en || ""} ${p.extra_label || ""}`.toLowerCase();
  return /سنام|sanam/.test(hay);
}

function scoreProduct(
  p: ProductRow,
  queries: string[],
  style: Style,
  role = "",
  preferredNames: string[] = [],
  preferredBrands: string[] = [],
) {
  const hay = `${p.name} ${p.name_en || ""} ${p.brand || ""} ${p.size_label || ""}`.toLowerCase();
  let s = 0;
  for (const q of queries) {
    const ql = q.toLowerCase().trim();
    if (!ql) continue;
    if (hay.includes(ql)) s += 14;
    for (const tok of tokenize(ql)) {
      if (hay.includes(tok)) s += 4;
    }
  }
  const skip = new Set(["بيتزا", "pizza", "مقادير", "منتج", "أبي", "ابي", "مع", "من", "على"]);
  const distinctive = tokenize(role).filter((t) => t.length >= 3 && !skip.has(t));
  if (distinctive.length) {
    if (distinctive.some((t) => hay.includes(t))) s += 10;
    else s -= 18;
  }
  for (const name of preferredNames) {
    const n = name.toLowerCase();
    if (n.length >= 3 && hay.includes(n.slice(0, Math.min(12, n.length)))) s += 8;
  }
  for (const brand of preferredBrands) {
    if (brand && hay.includes(brand.toLowerCase())) s += 4;
  }
  if ((p.stock_quantity ?? 1) > 0) s += 2;
  const price = Number(p.price) || 0;
  const onOffer = p.original_price != null && Number(p.original_price) > price;
  // Commercial ranking stays tied to the requested item — not ads.
  if (onOffer) s += 5;
  if (isSanamBrand(p)) s += 6;
  if (p.is_featured) s += 3;
  const stock = Number(p.stock_quantity ?? 0);
  if (stock >= 30) s += 3;
  else if (stock >= 10) s += 1;
  if (style === "economic") {
    s += Math.max(0, 8 - Math.min(price, 50) / 6);
    if (onOffer) s += 2;
  } else if (style === "premium") {
    s += Math.min(price, 90) / 12;
    if (p.is_featured) s += 2;
  }
  return s;
}

function pickVariant(
  candidates: ProductRow[],
  queries: string[],
  style: Style,
  role: string,
  prefs: { names: string[]; brands: string[] },
) {
  if (!candidates.length) return null;
  const ranked = [...candidates].sort(
    (a, b) =>
      scoreProduct(b, queries, style, role, prefs.names, prefs.brands) -
      scoreProduct(a, queries, style, role, prefs.names, prefs.brands),
  );
  const best = ranked[0];
  if (scoreProduct(best, queries, style, role, prefs.names, prefs.brands) < 4) return null;
  const byPrice = [...candidates].sort((a, b) => Number(a.price) - Number(b.price));
  const cheaper = byPrice[0];
  const premium = byPrice[byPrice.length - 1];
  return {
    selected: best,
    cheaper: cheaper && cheaper.id !== best.id ? cheaper : null,
    premium: premium && premium.id !== best.id ? premium : null,
  };
}

function publicProduct(p: ProductRow) {
  return {
    id: p.id,
    name: p.name,
    name_en: p.name_en,
    price: Number(p.price) || 0,
    original_price: p.original_price != null ? Number(p.original_price) : null,
    image: p.image,
    unit: p.unit,
    category_id: p.category_id,
    is_active: p.is_active,
    is_featured: !!p.is_featured,
    stock_quantity: p.stock_quantity ?? null,
    brand: p.brand ?? null,
    size_label: p.size_label ?? null,
  };
}

async function searchProducts(supabase: any, queries: string[], branchId?: string | null) {
  const tokens = [...new Set(queries.flatMap((q) => tokenize(q)).map(sanitizeToken))]
    .filter((t) => t.length >= 2)
    .slice(0, 8);
  if (!tokens.length) return [] as ProductRow[];

  const orParts: string[] = [];
  for (const tok of tokens) {
    orParts.push(`name.ilike.%${tok}%`);
    orParts.push(`name_en.ilike.%${tok}%`);
    orParts.push(`brand.ilike.%${tok}%`);
  }

  let q = supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("is_active", true)
    .or(orParts.join(","))
    .limit(30);
  if (branchId) q = q.eq("branch_id", branchId);

  const { data, error } = await q;
  if (error) {
    console.error("product search error", error);
    return [];
  }
  return (data || []) as ProductRow[];
}

function extractFnArgs(aiData: any): Record<string, unknown> | null {
  const parts = aiData?.candidates?.[0]?.content?.parts ?? [];
  const fnCall = parts.find((p: { functionCall?: unknown }) => p.functionCall)?.functionCall;
  if (fnCall?.args && typeof fnCall.args === "object") return fnCall.args as Record<string, unknown>;
  const text = parts.map((p: { text?: string }) => p.text || "").join("").trim();
  if (!text) return null;
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
  } catch {
    /* ignore */
  }
  return null;
}

function normalizePlan(raw: Record<string, unknown> | null, fallbackQuery: string, preferredStyle: Style): Plan {
  const intent = String(raw?.intent || "search") as Intent;
  const validIntent: Intent[] = ["recipe", "occasion", "budget", "discovery", "search", "modify", "chat"];
  const styleRaw = String(raw?.style || preferredStyle) as Style;
  const validStyle: Style[] = ["economic", "balanced", "premium"];
  const itemsIn = Array.isArray(raw?.needed_items) ? raw!.needed_items : [];
  const needed_items: NeededItem[] = itemsIn
    .map((it: any) => {
      const queries = Array.isArray(it?.queries)
        ? it.queries.map((q: unknown) => String(q || "").trim()).filter(Boolean)
        : [String(it?.role || it?.query || "").trim()].filter(Boolean);
      return {
        role: String(it?.role || queries[0] || "").trim() || "منتج",
        queries: queries.slice(0, 6),
        qty: clamp(Number(it?.qty) || 1, 1, 20),
        optional: !!it?.optional,
      };
    })
    .filter((it) => it.queries.length)
    .slice(0, 16);

  return {
    reply: String(raw?.reply || "").trim() ||
      (needed_items.length
        ? "جهزت لك سلة مقترحة من المتوفر حالياً. تقدر تعدّل أو تحذف قبل الإضافة."
        : "قل لي وش تحتاج: وصفة، مناسبة، أو ميزانية — وأجهز لك السلة."),
    intent: validIntent.includes(intent) ? intent : "search",
    style: validStyle.includes(styleRaw) ? styleRaw : preferredStyle,
    servings: raw?.servings != null && Number(raw.servings) > 0 ? clamp(Number(raw.servings), 1, 30) : null,
    budget_sar: raw?.budget_sar != null && Number(raw.budget_sar) > 0 ? Number(raw.budget_sar) : null,
    basket_title: String(raw?.basket_title || "").trim() || (needed_items.length ? "السلة المقترحة" : ""),
    needed_items,
    followups: Array.isArray(raw?.followups)
      ? raw!.followups.map((f: unknown) => String(f || "").trim()).filter(Boolean).slice(0, 4)
      : [],
    keep_existing_basket: !!raw?.keep_existing_basket || (needed_items.length === 0 && intent === "chat"),
  };
}

function fitBudget<T extends { qty: number; optional?: boolean; cheaper?: ProductRow | null; selected: ProductRow }>(
  slots: T[],
  budget: number,
) {
  const totalOf = (list: T[]) =>
    list.reduce((s, x) => s + Number((x.selected?.price ?? 0)) * x.qty, 0);

  let next = [...slots];
  while (next.length > 1 && totalOf(next) > budget) {
    const optIdx = [...next].map((x, i) => ({ x, i })).reverse().find((e) => e.x.optional);
    if (optIdx) {
      next.splice(optIdx.i, 1);
      continue;
    }
    break;
  }
  next = next.map((x) => {
    if (totalOf([x]) && x.cheaper && Number(x.selected.price) * x.qty > Number(x.cheaper.price) * x.qty) {
      return x;
    }
    return x;
  });
  if (totalOf(next) > budget) {
    next = next.map((x) => (x.cheaper && x.cheaper.id !== x.selected.id ? { ...x, selected: x.cheaper } : x));
  }
  while (next.length > 1 && totalOf(next) > budget) {
    next.pop();
  }
  return next;
}

async function planWithGemini(
  apiKey: string,
  query: string,
  lang: string,
  style: Style,
  history: { role: string; text: string }[],
  basket: { name: string; qty: number; role?: string }[],
  personalizationText: string,
): Promise<Plan> {
  const historyText = history
    .slice(-6)
    .map((m) => `${m.role === "user" ? "عميل" : "مساعد"}: ${String(m.text || "").slice(0, 240)}`)
    .join("\n");
  const basketText = basket.length
    ? basket.map((b) => `- ${b.qty}× ${b.name}${b.role ? ` (${b.role})` : ""}`).join("\n")
    : "لا توجد سلة حالياً";

  const systemText = [
    "أنت مساعد تسوق سنام داخل تطبيق بقالة في السعودية.",
    "مهمتك فهم احتياج العميل باللغة الطبيعية وتحويله إلى قائمة مشتريات من سوبرماركت.",
    "لا تشتري ولا تتخذ قراراً بدل العميل. أنت توصي فقط.",
    "لا تقدّم توصيات طبية أو علاجية، ولا تدّعي أن منتجاً يعالج أو يشفي.",
    "الاستفسارات الغذائية تُجاب بخصائص تسوق عامة (مثل: مكتوب عليه قليل السكر / عالي البروتين في الاسم) دون ادعاءات صحية غير موثقة.",
    "افهم اللهجة السعودية والخليجية والإنجليزية.",
    "إذا طلب العميل وصفة: حوّلها إلى مكونات متكاملة (أساسية + إضافات اختيارية).",
    "إذا طلب مناسبة (ضيوف، فطور، رحلة، ليلة فيلم): حوّلها إلى قائمة مناسبة.",
    "إذا ذكر ميزانية: احترمها عبر needed_items أقل أو اختياري.",
    "إذا كانت الرسالة تعديلاً على السلة الحالية: أعد بناء needed_items كاملة بعد التعديل.",
    "إذا كانت مجرد تحية أو سؤال بدون طلب شراء: intent=chat و needed_items فارغة و keep_existing_basket=true.",
    "إذا طلب العميل إعادة المعتاد / مقاضي الأسبوع بدون تفاصيل: استخدم سجل مشترياته إن وُجد.",
    "يمكن ذكر المنتجات المعتادة في followups واطلب تأكيده قبل إضافتها.",
    "queries لكل صنف: كلمات بحث عربية وإنجليزية قصيرة تطابق أسماء منتجات بقالة (مثال: موزاريلا، جبنة بيتزا، mozzarella).",
    "أجب بنفس لغة العميل، بجمل قصيرة وهادئة بدون إيموجي وبدون حشو تسويقي.",
    "اجعل followups قصيرة جداً (سؤال واحد أو اثنين كحد أقصى) أو فارغة إن لم تكن ضرورية.",
  ].join("\n");

  const model = "gemini-flash-lite-latest";
  const aiResp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemText }] },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: [
                  `لغة الواجهة: ${lang}`,
                  `تفضيل الجودة الحالي: ${style}`,
                  `سجل المحادثة:\n${historyText || "—"}`,
                  `السلة الحالية:\n${basketText}`,
                  personalizationText ? `سجل العميل (لا تضف شيئاً دون أن يطلبه):\n${personalizationText}` : "لا يوجد سجل مشتريات.",
                  `رسالة العميل:\n${query}`,
                ].join("\n\n"),
              },
            ],
          },
        ],
        tools: [
          {
            functionDeclarations: [
              {
                name: "plan_shopping",
                description: "حوّل احتياج العميل إلى خطة مشتريات",
                parameters: {
                  type: "object",
                  properties: {
                    reply: { type: "string" },
                    intent: {
                      type: "string",
                      enum: ["recipe", "occasion", "budget", "discovery", "search", "modify", "chat"],
                    },
                    style: { type: "string", enum: ["economic", "balanced", "premium"] },
                    servings: { type: "integer" },
                    budget_sar: { type: "number" },
                    basket_title: { type: "string" },
                    keep_existing_basket: { type: "boolean" },
                    needed_items: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          role: { type: "string" },
                          queries: { type: "array", items: { type: "string" } },
                          qty: { type: "number" },
                          optional: { type: "boolean" },
                        },
                        required: ["role", "queries", "qty"],
                      },
                    },
                    followups: { type: "array", items: { type: "string" } },
                  },
                  required: ["reply", "intent", "needed_items"],
                },
              },
            ],
          },
        ],
        toolConfig: {
          functionCallingConfig: {
            mode: "ANY",
            allowedFunctionNames: ["plan_shopping"],
          },
        },
        generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
      }),
    },
  );

  if (!aiResp.ok) {
    const errText = await aiResp.text();
    console.error("Gemini error:", aiResp.status, errText);
    throw new Error("gemini_failed");
  }

  const aiData = await aiResp.json();
  return normalizePlan(extractFnArgs(aiData), query, style);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const query = String(body?.query || "").trim();
    if (!query || query.length < 2) {
      return json({
        reply: "اكتب أو احكِ لي وش تحتاج اليوم.",
        intent: "chat",
        basket: null,
        followups: [],
        keep_existing_basket: true,
        matches: [],
      });
    }

    const branchId = body?.branch_id ? String(body.branch_id) : null;
    const lang = body?.lang === "en" ? "en" : "ar";
    const preferredStyle = (["economic", "balanced", "premium"].includes(body?.style) ? body.style : "balanced") as Style;
    const history = Array.isArray(body?.history) ? body.history : [];
    const currentBasket = Array.isArray(body?.basket) ? body.basket : [];

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const prefs = { names: [] as string[], brands: [] as string[] };
    const fromClient = body?.personalization || {};
    if (Array.isArray(fromClient.frequent_items)) {
      prefs.names = fromClient.frequent_items.map((n: unknown) => String(n || "").trim()).filter(Boolean).slice(0, 8);
    }
    try {
      const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (jwt) {
        const { data: userData } = await supabase.auth.getUser(jwt);
        const uid = userData?.user?.id;
        if (uid) {
          const { data: orders } = await supabase
            .from("orders")
            .select("total, order_items(product_name, quantity)")
            .eq("user_id", uid)
            .order("created_at", { ascending: false })
            .limit(12);
          const counts = new Map<string, number>();
          const totals: number[] = [];
          for (const order of orders || []) {
            totals.push(Number((order as any).total) || 0);
            for (const item of (order as any).order_items || []) {
              const name = String(item.product_name || "").trim();
              if (name.length < 2) continue;
              counts.set(name, (counts.get(name) || 0) + Number(item.quantity || 1));
            }
          }
          const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n]) => n);
          if (top.length) prefs.names = top;
          if (!fromClient.avg_order_sar && totals.length) {
            fromClient.avg_order_sar = Math.round(totals.reduce((s: number, n: number) => s + n, 0) / totals.length);
          }
        }
      }
    } catch (e) {
      console.error("personalization lookup", e);
    }
    const personalizationText = [
      prefs.names.length ? `منتجات متكررة: ${prefs.names.join("، ")}` : "",
      fromClient.avg_order_sar ? `متوسط الطلب تقريباً ${fromClient.avg_order_sar} ر.س` : "",
    ].filter(Boolean).join("\n");

    let plan: Plan;
    if (GEMINI_API_KEY) {
      try {
        plan = await planWithGemini(GEMINI_API_KEY, query, lang, preferredStyle, history, currentBasket, personalizationText);
      } catch (e) {
        console.error("plan fallback", e);
        plan = normalizePlan(
          {
            reply: "لقيت منتجات قريبة من طلبك. تقدر تعدّل الكمية أو تحذف قبل الإضافة للسلة.",
            intent: "search",
            needed_items: [{ role: query, queries: tokenize(query).slice(0, 6), qty: 1 }],
          },
          query,
          preferredStyle,
        );
      }
    } else {
      plan = normalizePlan(
        {
          reply: "هذي أقرب المنتجات المتوفرة. تقدر تضيفها أو تعدّل الكمية.",
          intent: "search",
          needed_items: [{ role: query, queries: tokenize(query).slice(0, 6), qty: 1 }],
        },
        query,
        preferredStyle,
      );
    }

    if (plan.keep_existing_basket || plan.needed_items.length === 0) {
      return json({
        reply: plan.reply,
        intent: plan.intent,
        basket: null,
        followups: plan.followups,
        keep_existing_basket: true,
        matches: [],
      });
    }

    const searches = await Promise.all(
      plan.needed_items.map(async (item) => ({
        item,
        candidates: await searchProducts(supabase, item.queries, branchId),
      })),
    );

    type Slot = {
      item: NeededItem;
      selected: ProductRow;
      cheaper: ProductRow | null;
      premium: ProductRow | null;
      substituted: boolean;
    };

    const slots: Slot[] = [];
    const missing: { query: string; note: string }[] = [];
    const usedIds = new Set<string>();

    for (const { item, candidates } of searches) {
      const unused = candidates.filter((c) => !usedIds.has(c.id));
      const pool = unused.length ? unused : candidates;
      const picked = pickVariant(pool, item.queries, plan.style, item.role, prefs);
      if (!picked) {
        missing.push({
          query: item.role,
          note: lang === "en" ? "Not found in the current catalog." : "غير متوفر في الكتالوج الحالي.",
        });
        continue;
      }
      usedIds.add(picked.selected.id);
      const substituted = scoreProduct(picked.selected, item.queries, plan.style, item.role, prefs.names, prefs.brands) < 16;
      slots.push({
        item,
        selected: picked.selected,
        cheaper: picked.cheaper,
        premium: picked.premium,
        substituted,
      });
    }

    const budgeted = plan.budget_sar ? fitBudget(slots, plan.budget_sar) : slots;

    const items = budgeted.map((slot) => {
      const p = publicProduct(slot.selected);
      return {
        ...p,
        qty: slot.item.qty,
        role: slot.item.role,
        reason: slot.item.role,
        optional: !!slot.item.optional,
        substituted: slot.substituted,
        substitution_note: slot.substituted
          ? (lang === "en" ? `Closest available match for ${slot.item.role}` : `أقرب بديل متوفر لـ ${slot.item.role}`)
          : null,
        original_query: slot.item.queries[0] || slot.item.role,
        cheaper: slot.cheaper ? publicProduct(slot.cheaper) : null,
        premium: slot.premium ? publicProduct(slot.premium) : null,
      };
    });

    const total = items.reduce((s, it) => s + it.price * it.qty, 0);
    const overBudget = plan.budget_sar != null && total > plan.budget_sar + 1;
    const reply = overBudget
      ? `${plan.reply} الإجمالي التقريبي ${total.toFixed(0)} ر.س${plan.budget_sar ? ` (فوق الميزانية ${plan.budget_sar} ر.س — تقدر تحذف أو تختار الأرخص).` : "."}`
      : plan.reply;

    return json({
      reply,
      intent: plan.intent,
      basket: {
        title: plan.basket_title,
        servings: plan.servings,
        budget_sar: plan.budget_sar,
        style: plan.style,
        items,
        missing,
      },
      followups: plan.followups,
      keep_existing_basket: false,
      matches: items,
    });
  } catch (e) {
    console.error("ai-quick-order error:", e);
    return json({ error: String(e), reply: "تعذر تجهيز السلة حالياً. حاول مرة أخرى.", intent: "chat", basket: null, followups: [], matches: [] }, 500);
  }
});
