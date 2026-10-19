import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const MOYASAR_SECRET = Deno.env.get("MOYASAR_SECRET_KEY") || "";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { return_id } = await req.json();
    if (!return_id) {
      return new Response(JSON.stringify({ error: "return_id مطلوب" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    const roleSet = new Set((roles || []).map((r: any) => r.role));
    const isAdmin = roleSet.has("site_admin") || roleSet.has("store_admin") || roleSet.has("support");
    const isDriver = roleSet.has("driver");

    const { data: ret, error: retErr } = await supabase
      .from("order_returns")
      .select("*, orders:order_id(id, total, payment_method, payment_status, order_number)")
      .eq("id", return_id)
      .maybeSingle();

    if (retErr || !ret) {
      return new Response(JSON.stringify({ error: "طلب الإرجاع غير موجود" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isAdmin) {
      if (!isDriver) {
        return new Response(JSON.stringify({ error: "صلاحيات غير كافية" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: driver } = await supabase.from("drivers").select("id").eq("user_id", user.id).maybeSingle();
      if (!driver || driver.id !== ret.driver_id) {
        return new Response(JSON.stringify({ error: "هذه المهمة ليست لك" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Ensure marked picked_up
    if (ret.status === "assigned") {
      const { error: pickErr } = await supabase.rpc("driver_mark_return_picked_up", {
        p_return_id: return_id,
      });
      // Prefer direct update with service role if RPC auth context fails from service client
      if (pickErr) {
        await supabase
          .from("order_returns")
          .update({ status: "picked_up", picked_up_at: new Date().toISOString() })
          .eq("id", return_id)
          .eq("status", "assigned");
      }
    } else if (!["picked_up", "refund_failed"].includes(ret.status) && ret.status !== "refunded") {
      return new Response(JSON.stringify({ error: `حالة غير صالحة: ${ret.status}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (ret.status === "refunded") {
      return new Response(JSON.stringify({ success: true, already: true, refund_amount: ret.refund_amount }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const order = Array.isArray(ret.orders) ? ret.orders[0] : ret.orders;
    const refundAmount = Number(ret.refund_amount);

    // Cash / cash_adjust: no Moyasar — mark settled for accounting follow-up
    if (ret.refund_mode === "cash_adjust" || order?.payment_method === "cash") {
      await supabase.rpc("mark_order_return_refunded", {
        p_return_id: return_id,
        p_ok: true,
        p_error: null,
      });
      return new Response(
        JSON.stringify({
          success: true,
          refund_amount: refundAmount,
          mode: "cash_adjust",
          message: "تم تأكيد الاستلام. الاسترداد النقدي يُسوّى محاسبياً مع العميل.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Online: Moyasar refund
    const { data: payment } = await supabase
      .from("payments")
      .select("*")
      .eq("order_id", ret.order_id)
      .eq("status", "paid")
      .maybeSingle();

    if (!payment?.moyasar_payment_id) {
      // No gateway payment — treat as manual settle
      await supabase.rpc("mark_order_return_refunded", {
        p_return_id: return_id,
        p_ok: true,
        p_error: null,
      });
      return new Response(
        JSON.stringify({
          success: true,
          refund_amount: refundAmount,
          mode: "manual",
          message: "لا يوجد دفع إلكتروني؛ تم إغلاق الإرجاع يدوياً.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!MOYASAR_SECRET) {
      await supabase.rpc("mark_order_return_refunded", {
        p_return_id: return_id,
        p_ok: false,
        p_error: "مفتاح Moyasar غير مضبوط",
      });
      return new Response(JSON.stringify({ error: "مفتاح Moyasar غير مضبوط" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const refundHalalas = Math.round(refundAmount * 100);
    const refundRes = await fetch(
      `https://api.moyasar.com/v1/payments/${payment.moyasar_payment_id}/refund`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(MOYASAR_SECRET + ":")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount: refundHalalas }),
      },
    );
    const refundData = await refundRes.json();
    if (!refundRes.ok) {
      await supabase.rpc("mark_order_return_refunded", {
        p_return_id: return_id,
        p_ok: false,
        p_error: refundData.message || "فشل استرداد Moyasar",
      });
      return new Response(JSON.stringify({ error: refundData.message || "فشل الاسترداد" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const previousRefund = Number(payment.refund_amount || 0);
    const totalRefunded = previousRefund + refundAmount;
    const isFull = totalRefunded >= Number(payment.amount);
    await supabase
      .from("payments")
      .update({
        status: isFull ? "refunded" : payment.status,
        refund_amount: totalRefunded,
        refunded_at: new Date().toISOString(),
        raw_response: refundData,
      })
      .eq("id", payment.id);

    await supabase.rpc("mark_order_return_refunded", {
      p_return_id: return_id,
      p_ok: true,
      p_error: null,
    });

    return new Response(
      JSON.stringify({ success: true, refund_amount: refundAmount, mode: "moyasar" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
