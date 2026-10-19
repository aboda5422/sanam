import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_GUIDE = {
  admin_pages: {
    dashboard: "/admin — لوحة التحكم: طلبات اليوم، الإيراد، الزوار، السلات المهجورة",
    orders: "/admin/orders — إدارة الطلبات وتغيير الحالة والتعيين للمناديب",
    products: "/admin/products — إضافة/تعديل المنتجات والمخزون والأسعار",
    categories: "/admin/categories — أقسام المتجر",
    branches: "/admin/branches — الفروع ومناطق التغطية",
    customers: "/admin/customers — العملاء",
    drivers: "/admin/drivers — المناديب والتوفر",
    delivery: "/admin/delivery — إعدادات التوصيل والرسوم",
    complaints: "/admin/complaints — الشكاوى وطلبات الإرجاع",
    pos: "/admin/pos — نظام الكاشير والمحطات والمبيعات",
    sales: "/admin/sales — الحسابات والمبيعات",
    payments: "/admin/payments — سجل المدفوعات",
    announcements: "/admin/announcements — الشعارات والإعلانات والواتساب والإشعارات",
    settings: "/admin/settings — إعدادات المتجر والكاشير والمحضّر والمساعد",
  },
  portals: {
    cashier: "/cashier — واجهة الكاشير",
    preparer: "/preparer — محضّر الطلبات",
    driver: "/driver — تطبيق المندوب",
  },
  tips: [
    "فلتر الفرع في أعلى لوحة الإدارة يضيّق كل الإحصائيات لفرع واحد أو الكل",
    "مبيعات الكاشير منفصلة عن طلبات التوصيل عبر الموقع",
    "الزوار تُحسب من جدول page_views (زيارات صفحة + جلسات فريدة)",
  ],
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

function sum(rows: any[], key = "total") {
  return (rows || []).reduce((s, o) => s + Number(o?.[key] || 0), 0);
}

function statusCounts(rows: any[]) {
  const map: Record<string, number> = {};
  for (const r of rows || []) {
    const k = r.status || "unknown";
    map[k] = (map[k] || 0) + 1;
  }
  return map;
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

    const { question, branch_id } = await req.json();
    const q = String(question || "").trim();
    if (q.length < 2) {
      return new Response(JSON.stringify({ error: "اكتب سؤالاً واضحاً" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayISO = yesterday.toISOString();
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const prevWeekStart = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

    const scope = (builder: any) => (branch_id ? builder.eq("branch_id", branch_id) : builder);
    const countScoped = async (table: string, apply?: (q: any) => any) => {
      let qy = supabase.from(table).select("id", { count: "exact", head: true });
      qy = scope(qy);
      if (apply) qy = apply(qy);
      const { count, error } = await qy;
      if (error) return 0;
      return count || 0;
    };

    // --- Targeted lookups from the question ---
    const phoneMatch = q.match(/0?\d{9,12}/);
    const orderNumMatch = q.match(/(?:#|طلب|order)\s*(\d{1,8})\b/i) || q.match(/\b(\d{4,8})\b/);
    let customerOrders: any[] = [];
    let orderLookup: any[] = [];
    let productLookup: any[] = [];

    if (phoneMatch) {
      let cq = supabase
        .from("orders")
        .select("order_number, status, total, created_at, customer_name, customer_phone, payment_method")
        .ilike("customer_phone", `%${phoneMatch[0].slice(-9)}%`)
        .order("created_at", { ascending: false })
        .limit(15);
      cq = scope(cq);
      const { data } = await cq;
      customerOrders = data || [];
    }

    if (orderNumMatch) {
      let oq = supabase
        .from("orders")
        .select(
          "order_number, status, total, created_at, customer_name, customer_phone, payment_method, payment_status, delivery_address, driver_id",
        )
        .eq("order_number", Number(orderNumMatch[1]))
        .limit(5);
      oq = scope(oq);
      const { data } = await oq;
      orderLookup = data || [];
    }

    // Product name search: Arabic tokens length >= 3 not in stopwords
    const stop = new Set([
      "كم", "ما", "هل", "في", "من", "على", "عن", "هذا", "هذه", "اليوم", "أمس", "طلب", "طلبات",
      "منتج", "منتجات", "فرع", "فروع", "زوار", "الموقع", "إيراد", "مبيعات", "كاشير", "مندوب",
      "مناديب", "شكوى", "شكاوى", "كيف", "أين", "اشرح", "عدد", "حالة", "حالات",
    ]);
    const tokens = q
      .replace(/[؟?!,.\-_/\\]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !stop.has(w) && /[\u0600-\u06FFA-Za-z]/.test(w));
    if (tokens.length && !phoneMatch) {
      const hint = tokens.slice(0, 2).join("%");
      let pq = supabase
        .from("products")
        .select("id, name, price, stock_quantity, is_active, barcode")
        .ilike("name", `%${hint}%`)
        .order("stock_quantity", { ascending: true })
        .limit(12);
      pq = scope(pq);
      const { data } = await pq;
      productLookup = data || [];
      if (!productLookup.length && tokens[0]) {
        let pq2 = supabase
          .from("products")
          .select("id, name, price, stock_quantity, is_active, barcode")
          .ilike("name", `%${tokens[0]}%`)
          .limit(12);
        pq2 = scope(pq2);
        const { data: d2 } = await pq2;
        productLookup = d2 || [];
      }
      if (!customerOrders.length && /[\u0600-\u06FF]/.test(tokens[0])) {
        let cq = supabase
          .from("orders")
          .select("order_number, status, total, created_at, customer_name, customer_phone")
          .ilike("customer_name", `%${tokens[0]}%`)
          .order("created_at", { ascending: false })
          .limit(10);
        cq = scope(cq);
        const { data } = await cq;
        customerOrders = data || [];
      }
    }

    let lowStockQ = supabase
      .from("products")
      .select("id, name, stock_quantity, price, is_active")
      .eq("is_active", true)
      .lt("stock_quantity", 10)
      .order("stock_quantity", { ascending: true })
      .limit(30);
    lowStockQ = scope(lowStockQ);

    let ordersTodayQ = supabase
      .from("orders")
      .select("id, order_number, status, total, customer_name, customer_phone, payment_method, payment_status, created_at")
      .gte("created_at", todayISO)
      .order("created_at", { ascending: false })
      .limit(200);
    ordersTodayQ = scope(ordersTodayQ);

    let ordersYesterdayQ = supabase
      .from("orders")
      .select("id, status, total, created_at")
      .gte("created_at", yesterdayISO)
      .lt("created_at", todayISO)
      .limit(500);
    ordersYesterdayQ = scope(ordersYesterdayQ);

    let ordersMonthQ = supabase
      .from("orders")
      .select("id, status, total, created_at")
      .gte("created_at", monthStart)
      .limit(3000);
    ordersMonthQ = scope(ordersMonthQ);

    let stuckQ = supabase
      .from("orders")
      .select("id, order_number, status, customer_name, created_at")
      .in("status", ["pending", "assigned", "preparing", "ready", "on_the_way"])
      .lt("created_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: true })
      .limit(40);
    stuckQ = scope(stuckQ);

    let openOrdersQ = supabase
      .from("orders")
      .select("id, order_number, status, total, created_at")
      .in("status", ["pending", "assigned", "preparing", "ready", "on_the_way"])
      .order("created_at", { ascending: false })
      .limit(80);
    openOrdersQ = scope(openOrdersQ);

    let driversQ = supabase.from("drivers").select("id, is_available, user_id");
    if (branch_id) {
      const { data: links } = await supabase
        .from("driver_branches")
        .select("driver_id")
        .eq("branch_id", branch_id);
      const ids = (links || []).map((l: any) => l.driver_id);
      driversQ = ids.length
        ? driversQ.in("id", ids)
        : driversQ.eq("id", "00000000-0000-0000-0000-000000000000");
    }

    let weekOrdersQ = supabase
      .from("orders")
      .select("total, created_at, status")
      .gte("created_at", prevWeekStart)
      .limit(3000);
    weekOrdersQ = scope(weekOrdersQ);

    let todayViewsQ = supabase
      .from("page_views")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayISO);
    todayViewsQ = scope(todayViewsQ);

    let abandonedQ = supabase
      .from("abandoned_carts")
      .select("id, total, items_count, reached_checkout")
      .eq("converted", false)
      .gt("items_count", 0)
      .gte("updated_at", weekAgo)
      .limit(500);
    abandonedQ = scope(abandonedQ);

    let posSalesQ = supabase
      .from("pos_sales")
      .select("id, total, created_at, status, invoice_number")
      .gte("created_at", todayISO)
      .limit(500);
    posSalesQ = scope(posSalesQ);

    let posOpenShiftsQ = supabase
      .from("pos_shifts")
      .select("id, opened_at, opening_cash, branch_id, status")
      .eq("status", "open")
      .limit(50);
    posOpenShiftsQ = scope(posOpenShiftsQ);

    let complaintsQ = supabase
      .from("complaints")
      .select("id, status, type, message, created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    complaintsQ = scope(complaintsQ);

    let paymentsTodayQ = supabase
      .from("payments")
      .select("id, amount, status, created_at, method")
      .gte("created_at", todayISO)
      .limit(200);
    // payments may not have branch_id — leave unscoped unless column exists via join later
    // paymentsTodayQ = scope(paymentsTodayQ);

    let announcementsQ = supabase
      .from("announcements")
      .select("id, title, is_active, created_at")
      .order("created_at", { ascending: false })
      .limit(15);

    let branchesQ = supabase.from("branches").select("id, name, is_active").order("name");
    if (branch_id) branchesQ = branchesQ.eq("id", branch_id);

    let settingsQ = supabase
      .from("store_settings")
      .select("key, value")
      .in("key", [
        "pos_features",
        "preparer_features",
        "admin_assistant",
        "delivery_settings",
        "store_info",
      ]);

    const countUniqueSessionsToday = async () => {
      const PAGE = 1000;
      const ids = new Set<string>();
      let from = 0;
      while (true) {
        let pq = supabase
          .from("page_views")
          .select("session_id")
          .gte("created_at", todayISO)
          .range(from, from + PAGE - 1);
        pq = scope(pq);
        const { data, error } = await pq;
        if (error) throw error;
        if (!data?.length) break;
        for (const row of data) {
          if (row.session_id) ids.add(row.session_id);
        }
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return ids.size;
    };

    const [
      { data: lowStock },
      { data: todayOrders },
      { data: yesterdayOrders },
      { data: monthOrders },
      { data: stuckOrders },
      { data: openOrders },
      { data: drivers },
      { data: weekOrders },
      todayViewsRes,
      uniqueVisitors,
      { data: abandonedCarts },
      { data: posSalesToday },
      { data: openShifts },
      { data: complaints },
      { data: paymentsToday },
      { data: announcements },
      { data: branches },
      { data: settingsRows },
      activeProducts,
      totalProducts,
      categoriesCount,
      stationsCount,
    ] = await Promise.all([
      lowStockQ,
      ordersTodayQ,
      ordersYesterdayQ,
      ordersMonthQ,
      stuckQ,
      openOrdersQ,
      driversQ,
      weekOrdersQ,
      todayViewsQ,
      countUniqueSessionsToday(),
      abandonedQ,
      posSalesQ,
      posOpenShiftsQ,
      complaintsQ,
      paymentsTodayQ,
      announcementsQ,
      branchesQ,
      settingsQ,
      countScoped("products", (qy) => qy.eq("is_active", true)),
      countScoped("products"),
      countScoped("categories"),
      countScoped("pos_stations"),
    ]);

    const thisWeek = (weekOrders || []).filter((o) => o.created_at >= weekAgo);
    const lastWeek = (weekOrders || []).filter((o) => o.created_at < weekAgo);
    const abandonedList = abandonedCarts || [];
    const posList = posSalesToday || [];
    const complaintList = complaints || [];
    const openComplaints = complaintList.filter((c: any) =>
      ["open", "in_progress"].includes(String(c.status || "").toLowerCase()),
    );
    const paymentList = paymentsToday || [];
    const settingsMap: Record<string, unknown> = {};
    for (const row of settingsRows || []) {
      settingsMap[row.key] = row.value;
    }

    // Try order_returns if table exists (ignore errors)
    let returnsSummary: any = null;
    try {
      let rq = supabase
        .from("order_returns")
        .select("id, status, created_at")
        .order("created_at", { ascending: false })
        .limit(40);
      rq = scope(rq);
      const { data: returns, error } = await rq;
      if (!error) {
        returnsSummary = {
          recent_count: (returns || []).length,
          by_status: statusCounts(returns || []),
        };
      }
    } catch {
      returnsSummary = null;
    }

    const context = {
      site_guide: SITE_GUIDE,
      scope: {
        branch_scoped: !!branch_id,
        branch_id: branch_id || null,
        branches: (branches || []).map((b: any) => ({ id: b.id, name: b.name, active: b.is_active })),
      },
      catalog: {
        active_products: activeProducts,
        total_products: totalProducts,
        categories: categoriesCount,
        low_stock_count: (lowStock || []).length,
        low_stock_products: lowStock || [],
        product_lookup: productLookup,
      },
      orders: {
        today_count: (todayOrders || []).length,
        today_revenue: sum(todayOrders || []),
        today_by_status: statusCounts(todayOrders || []),
        today_sample: (todayOrders || []).slice(0, 25),
        yesterday_count: (yesterdayOrders || []).length,
        yesterday_revenue: sum(yesterdayOrders || []),
        month_count: (monthOrders || []).length,
        month_revenue: sum(monthOrders || []),
        open_orders_count: (openOrders || []).length,
        open_by_status: statusCounts(openOrders || []),
        stuck_orders: stuckOrders || [],
        order_lookup: orderLookup,
        customer_orders_lookup: customerOrders,
        this_week_revenue: sum(thisWeek),
        last_week_revenue: sum(lastWeek),
        this_week_orders: thisWeek.length,
        last_week_orders: lastWeek.length,
      },
      traffic: {
        today_page_views: todayViewsRes.count || 0,
        today_unique_visitors: uniqueVisitors,
        abandoned_carts_7d: abandonedList.length,
        abandoned_carts_value_7d: sum(abandonedList),
        checkout_drop_7d: abandonedList.filter((c: any) => c.reached_checkout).length,
      },
      drivers: {
        total: (drivers || []).length,
        available: (drivers || []).filter((d: any) => d.is_available).length,
      },
      pos: {
        stations: stationsCount,
        open_shifts: (openShifts || []).length,
        today_sales_count: posList.length,
        today_revenue: sum(posList),
        today_sample: posList.slice(0, 15).map((s: any) => ({
          invoice: s.invoice_number,
          total: s.total,
          at: s.created_at,
        })),
      },
      complaints: {
        recent: complaintList.slice(0, 15).map((c: any) => ({
          id: c.id,
          status: c.status,
          type: c.type,
          message: String(c.message || "").slice(0, 120),
          created_at: c.created_at,
        })),
        open_count: openComplaints.length,
        by_status: statusCounts(complaintList),
      },
      returns: returnsSummary,
      payments_today: {
        count: paymentList.length,
        amount: sum(paymentList, "amount"),
        by_status: statusCounts(paymentList),
      },
      announcements: {
        recent: (announcements || []).slice(0, 10),
        active_count: (announcements || []).filter((a: any) => a.is_active).length,
      },
      feature_flags: {
        pos_enabled: !!(settingsMap.pos_features as any)?.enabled,
        preparer_enabled: !!(settingsMap.preparer_features as any)?.enabled,
        assistant_enabled: (settingsMap.admin_assistant as any)?.enabled !== false,
        delivery_settings: settingsMap.delivery_settings || null,
        store_info: settingsMap.store_info || null,
      },
      generated_at: now.toISOString(),
    };

    if (!GEMINI_API_KEY) {
      const lines = [
        `طلبات اليوم: ${context.orders.today_count} — إيراد ${context.orders.today_revenue.toFixed(0)} ر.س`,
        `زوار اليوم: ${context.traffic.today_unique_visitors} فريد · ${context.traffic.today_page_views} زيارة`,
        `كاشير اليوم: ${context.pos.today_sales_count} فاتورة — ${context.pos.today_revenue.toFixed(0)} ر.س`,
        `مخزون منخفض: ${context.catalog.low_stock_count} · منتجات نشطة: ${context.catalog.active_products}`,
        `مناديب: ${context.drivers.available}/${context.drivers.total} · طلبات مفتوحة: ${context.orders.open_orders_count}`,
        `شكاوى حديثة: ${context.complaints.recent.length}`,
      ];
      if (orderLookup.length) lines.push(`طلب #${orderLookup[0].order_number}: ${orderLookup[0].status} — ${orderLookup[0].total}`);
      if (productLookup.length) lines.push(`منتجات مطابقة: ${productLookup.map((p) => p.name).slice(0, 5).join("، ")}`);
      return new Response(
        JSON.stringify({ answer: lines.join("\n"), context_used: true, model: "fallback" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const model = "gemini-flash-lite-latest";
    const systemText = [
      "أنت Sanam AI، المساعد الإداري الرسمي لمنصة سنام (بقالة وتوصيل وكاشير في السعودية).",
      "أجب بالعربية باختصار ووضوح.",
      "لديك لقطة بيانات حية للمتجر + دليل صفحات الإدارة (site_guide).",
      "قواعد:",
      "1) استخدم الأرقام من السياق عند توفرها — لا تختلق أرقاماً.",
      "2) لأسئلة «كيف / أين / ماذا أفعل» استخدم site_guide وfeature_flags ووجّه الإدمن للصفحة المناسبة.",
      "3) لا تقل «خارج السياق» إلا إذا كان السؤال خارج المنصة تماماً (طقس، سياسة، أخبار عامة...).",
      "4) إن نقص تفصيل دقيق، أعطِ أفضل إجابة ممكنة مما لديك واذكر ما يمكن مشاهدته من لوحة الإدارة.",
      "5) احترم نطاق الفرع إن branch_scoped=true.",
      "6) فرّق بين طلبات التوصيل (orders) ومبيعات الكاشير (pos).",
      "7) الزوار: today_unique_visitors و today_page_views.",
    ].join("\n");

    const aiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemText }] },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `سؤال الإدمن:\n${q}\n\nبيانات السياق (JSON):\n${JSON.stringify(context).slice(0, 45000)}`,
                },
              ],
            },
          ],
          generationConfig: { temperature: 0.25, maxOutputTokens: 1200 },
        }),
      },
    );

    const aiJson = await aiResp.json();
    const answer =
      aiJson?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ||
      "تعذر توليد إجابة حالياً.";

    return new Response(
      JSON.stringify({
        answer,
        model,
        context_summary: {
          today_orders: context.orders.today_count,
          visitors: context.traffic.today_unique_visitors,
          low_stock: context.catalog.low_stock_count,
          open_orders: context.orders.open_orders_count,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("sanam-ai-chat", e);
    return new Response(JSON.stringify({ error: e.message || "خطأ" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
