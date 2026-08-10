import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const MOYASAR_SECRET = Deno.env.get("MOYASAR_SECRET_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!MOYASAR_SECRET) throw new Error("MOYASAR_SECRET_KEY غير مُعد");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { order_id, source, callback_url } = await req.json();
    if (!order_id || !source || !callback_url) {
      return new Response(JSON.stringify({ error: "بيانات ناقصة" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch order & verify ownership
    const { data: order, error: orderErr } = await supabase
      .from("orders").select("*").eq("id", order_id).maybeSingle();
    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: "الطلب غير موجود" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (order.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "غير مصرح بهذا الطلب" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Amount in halalas (smallest unit). 1 SAR = 100 halalas
    const amountHalalas = Math.round(Number(order.total) * 100);

    // Create payment in Moyasar
    const moyasarRes = await fetch("https://api.moyasar.com/v1/payments", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${btoa(MOYASAR_SECRET + ":")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountHalalas,
        currency: "SAR",
        description: `طلب رقم ${order.order_number}`,
        callback_url,
        source,
        metadata: { order_id: order.id, user_id: user.id },
      }),
    });

    const moyasarData = await moyasarRes.json();
    if (!moyasarRes.ok) {
      console.error("Moyasar error:", moyasarData);
      return new Response(JSON.stringify({ error: moyasarData.message || "فشل إنشاء الدفع" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Store payment record
    const { data: payment } = await supabase.from("payments").insert({
      order_id: order.id,
      user_id: user.id,
      moyasar_payment_id: moyasarData.id,
      amount: order.total,
      currency: "SAR",
      method: source.type || "creditcard",
      status: moyasarData.status === "paid" ? "paid" : "pending",
      source,
      raw_response: moyasarData,
    }).select().single();

    await supabase.from("orders").update({
      payment_method: source.type || "creditcard",
      payment_id: payment?.id,
      payment_status: moyasarData.status === "paid" ? "paid" : "pending",
    }).eq("id", order.id);

    return new Response(JSON.stringify({
      payment_id: moyasarData.id,
      status: moyasarData.status,
      transaction_url: moyasarData.source?.transaction_url,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
