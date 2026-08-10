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

    const { payment_id } = await req.json();
    if (!payment_id) {
      return new Response(JSON.stringify({ error: "payment_id مطلوب" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const verifyRes = await fetch(`https://api.moyasar.com/v1/payments/${payment_id}`, {
      headers: { "Authorization": `Basic ${btoa(MOYASAR_SECRET + ":")}` },
    });
    const verified = await verifyRes.json();
    if (!verifyRes.ok) {
      return new Response(JSON.stringify({ error: verified.message || "فشل التحقق" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const orderId = verified.metadata?.order_id;
    const newStatus = verified.status === "paid" ? "paid"
      : verified.status === "failed" ? "failed" : "pending";

    await supabase.from("payments").update({
      status: newStatus,
      raw_response: verified,
    }).eq("moyasar_payment_id", payment_id);

    if (orderId) {
      const updates: any = { payment_status: newStatus };
      if (newStatus === "paid") updates.status = "preparing";
      await supabase.from("orders").update(updates).eq("id", orderId);
    }

    return new Response(JSON.stringify({
      status: verified.status,
      order_id: orderId,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
