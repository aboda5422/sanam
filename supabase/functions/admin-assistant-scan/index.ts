import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Settings = {
  enabled: boolean;
  low_stock_threshold: number;
  stuck_order_hours: number;
  scan_interval_minutes: number;
  alert_low_stock: boolean;
  alert_stuck_orders: boolean;
  alert_daily_report: boolean;
  alert_monthly_report: boolean;
  alert_sales_drop: boolean;
  sales_drop_percent: number;
  notify_system: boolean;
};

const DEFAULTS: Settings = {
  enabled: true,
  low_stock_threshold: 5,
  stuck_order_hours: 3,
  scan_interval_minutes: 15,
  alert_low_stock: true,
  alert_stuck_orders: true,
  alert_daily_report: true,
  alert_monthly_report: true,
  alert_sales_drop: true,
  sales_drop_percent: 15,
  notify_system: true,
};

async function requireAdmin(supabase: any, jwt: string) {
  const { data: { user }, error } = await supabase.auth.getUser(jwt);
  if (error || !user) throw new Error("غير مصرح");
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  const ok = (roles || []).some((r: any) =>
    ["site_admin", "store_admin", "accountant", "inventory", "support"].includes(r.role),
  );
  if (!ok) throw new Error("صلاحيات غير كافية");
  return user;
}

function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") || "";
    const jwt = auth.replace("Bearer ", "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    await requireAdmin(supabase, jwt);

    const body = await req.json().catch(() => ({}));
    const branch_id = body.branch_id || null;

    const { data: settingRow } = await supabase
      .from("store_settings")
      .select("value")
      .eq("key", "admin_assistant")
      .maybeSingle();
    const settings: Settings = { ...DEFAULTS, ...((settingRow?.value as object) || {}) };

    if (!settings.enabled) {
      return new Response(JSON.stringify({ created: [], skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const created: any[] = [];
    const insertAlert = async (alert: {
      kind: string;
      severity: string;
      title: string;
      body: string;
      fingerprint: string;
      meta?: object;
    }) => {
      const { data, error } = await supabase
        .from("admin_assistant_alerts")
        .insert({
          branch_id,
          kind: alert.kind,
          severity: alert.severity,
          title: alert.title,
          body: alert.body,
          fingerprint: alert.fingerprint,
          meta: alert.meta || {},
        })
        .select("*")
        .maybeSingle();
      // unique violation = already alerted today
      if (!error && data) created.push(data);
    };

    const scope = (q: any) => (branch_id ? q.eq("branch_id", branch_id) : q);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const prevWeek = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const stuckBefore = new Date(
      Date.now() - (settings.stuck_order_hours || 3) * 60 * 60 * 1000,
    ).toISOString();

    if (settings.alert_low_stock) {
      let pq = supabase
        .from("products")
        .select("id, name, stock_quantity")
        .eq("is_active", true)
        .lt("stock_quantity", settings.low_stock_threshold)
        .order("stock_quantity", { ascending: true })
        .limit(20);
      pq = scope(pq);
      const { data: low } = await pq;
      for (const p of low || []) {
        await insertAlert({
          kind: "low_stock",
          severity: Number(p.stock_quantity) <= 1 ? "critical" : "warning",
          title: `${p.name} على وشك النفاذ`,
          body: `المتبقي في المخزون: ${p.stock_quantity} (حد التنبيه ${settings.low_stock_threshold})`,
          fingerprint: `low_stock:${p.id}:${dayKey()}`,
          meta: { product_id: p.id, stock: p.stock_quantity },
        });
      }
    }

    if (settings.alert_stuck_orders) {
      let oq = supabase
        .from("orders")
        .select("id, order_number, status, customer_name, created_at")
        .in("status", ["pending", "assigned", "preparing", "ready", "on_the_way"])
        .lt("created_at", stuckBefore)
        .limit(25);
      oq = scope(oq);
      const { data: stuck } = await oq;
      for (const o of stuck || []) {
        const hours = Math.round(
          (Date.now() - new Date(o.created_at).getTime()) / (60 * 60 * 1000),
        );
        await insertAlert({
          kind: "stuck_order",
          severity: hours >= 5 ? "critical" : "warning",
          title: `طلب #${o.order_number} متأخر`,
          body: `الطلب منذ حوالي ${hours} ساعة بحالة «${o.status}»${o.customer_name ? ` — ${o.customer_name}` : ""}`,
          fingerprint: `stuck:${o.id}:${dayKey()}`,
          meta: { order_id: o.id, hours },
        });
      }
    }

    // Sales drop week over week
    if (settings.alert_sales_drop) {
      let wq = supabase.from("orders").select("total, created_at").gte("created_at", prevWeek).limit(3000);
      wq = scope(wq);
      const { data: rows } = await wq;
      const thisW = (rows || []).filter((r) => r.created_at >= weekAgo);
      const lastW = (rows || []).filter((r) => r.created_at < weekAgo);
      const sum = (arr: any[]) => arr.reduce((s, r) => s + Number(r.total || 0), 0);
      const a = sum(thisW);
      const b = sum(lastW);
      if (b > 0) {
        const drop = ((b - a) / b) * 100;
        if (drop >= settings.sales_drop_percent) {
          let advice = `مبيعات هذا الأسبوع ${(a).toFixed(0)} ر.س مقابل ${(b).toFixed(0)} الأسبوع السابق (انخفاض ${drop.toFixed(0)}%). يُفضّل إطلاق حملة ترويجية.`;
          if (GEMINI_API_KEY) {
            try {
              const aiResp = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": GEMINI_API_KEY,
                  },
                  body: JSON.stringify({
                    contents: [
                      {
                        role: "user",
                        parts: [
                          {
                            text: `بصفتك مستشار متجر بقالة، اقترح جملة نصيحة عملية واحدةحدة بالعربية لحملة بعد انخفاض مبيعات ${drop.toFixed(0)}%. لا تزد عن سطرين.`,
                          },
                        ],
                      },
                    ],
                    generationConfig: { temperature: 0.4, maxOutputTokens: 120 },
                  }),
                },
              );
              const aiJson = await aiResp.json();
              const tip = aiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
              if (tip) advice = `${advice}\nنصيحة: ${tip.trim()}`;
            } catch {
              /* ignore */
            }
          }
          await insertAlert({
            kind: "sales_drop",
            severity: "warning",
            title: "انخفاض مبيعات الأسبوع",
            body: advice,
            fingerprint: `sales_drop:${dayKey()}`,
            meta: { this_week: a, last_week: b, drop },
          });
        }
      }
    }

    // Daily brief near evening (after 20:00 local approx — use UTC+3 evening window)
    if (settings.alert_daily_report) {
      const hourRiyadh = (new Date().getUTCHours() + 3) % 24;
      if (hourRiyadh >= 20) {
        let tq = supabase.from("orders").select("total, status").gte("created_at", todayISO).limit(2000);
        tq = scope(tq);
        const { data: todays } = await tq;
        const revenue = (todays || []).reduce((s, o) => s + Number(o.total || 0), 0);
        const delivered = (todays || []).filter((o) => o.status === "delivered").length;
        await insertAlert({
          kind: "daily_report",
          severity: "info",
          title: "تقرير مختصر — آخر اليوم",
          body: `طلبات اليوم: ${(todays || []).length} | المسلم: ${delivered} | المبيعات: ${revenue.toFixed(0)} ر.س`,
          fingerprint: `daily:${dayKey()}`,
          meta: { revenue, count: (todays || []).length },
        });
      }
    }

    // Monthly brief on last 2 days of month after 18:00
    if (settings.alert_monthly_report) {
      const now = new Date();
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const day = now.getUTCDate(); // approximate; ok for brief
      const hourRiyadh = (now.getUTCHours() + 3) % 24;
      if (day >= lastDay - 1 && hourRiyadh >= 18) {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        let mq = supabase.from("orders").select("total").gte("created_at", monthStart).limit(5000);
        mq = scope(mq);
        const { data: monthOrders } = await mq;
        const revenue = (monthOrders || []).reduce((s, o) => s + Number(o.total || 0), 0);
        await insertAlert({
          kind: "monthly_report",
          severity: "info",
          title: "تقرير مختصر — آخر الشهر",
          body: `طلبات الشهر: ${(monthOrders || []).length} | إجمالي المبيعات: ${revenue.toFixed(0)} ر.س`,
          fingerprint: `monthly:${now.getFullYear()}-${now.getMonth() + 1}`,
          meta: { revenue, count: (monthOrders || []).length },
        });
      }
    }

    return new Response(
      JSON.stringify({ created, count: created.length, settings }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("admin-assistant-scan", e);
    return new Response(JSON.stringify({ error: e.message || "خطأ" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
