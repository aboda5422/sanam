import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const MOYASAR_SECRET = Deno.env.get("MOYASAR_SECRET_KEY")!;
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

    // Verify admin role
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    const isAdmin = roles?.some(r => r.role === "store_admin" || r.role === "site_admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "صلاحيات إدارية مطلوبة" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { order_id, amount } = await req.json();
    if (!order_id) {
      return new Response(JSON.stringify({ error: "order_id مطلوب" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find paid payment for the order
    const { data: payment } = await supabase
      .from("payments").select("*").eq("order_id", order_id).eq("status", "paid").maybeSingle();
    if (!payment || !payment.moyasar_payment_id) {
      return new Response(JSON.stringify({ error: "لا يوجد دفع مكتمل لهذا الطلب" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const refundAmount = amount ? Number(amount) : Number(payment.amount);
    const refundHalalas = Math.round(refundAmount * 100);
    const isFullRefund = refundAmount >= Number(payment.amount);

    // Call Moyasar refund API
    const refundRes = await fetch(`https://api.moyasar.com/v1/payments/${payment.moyasar_payment_id}/refund`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${btoa(MOYASAR_SECRET + ":")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amount: refundHalalas }),
    });

    const refundData = await refundRes.json();
    if (!refundRes.ok) {
      console.error("Moyasar refund error:", refundData);
      return new Response(JSON.stringify({ error: refundData.message || "فشل الاسترداد" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update payment & order (mark as refunded only when fully refunded)
    const previousRefund = Number(payment.refund_amount || 0);
    const totalRefunded = previousRefund + refundAmount;
    await supabase.from("payments").update({
      status: isFullRefund ? "refunded" : payment.status,
      refund_amount: totalRefunded,
      refunded_at: new Date().toISOString(),
      raw_response: refundData,
    }).eq("id", payment.id);

    const orderUpdate: any = { payment_status: isFullRefund ? "refunded" : "paid" };
    if (isFullRefund) orderUpdate.status = "cancelled";
    await supabase.from("orders").update(orderUpdate).eq("id", order_id);

    return new Response(JSON.stringify({
      success: true,
      refund_amount: refundAmount,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});