import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Public webhook — no JWT required
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const MOYASAR_SECRET = Deno.env.get("MOYASAR_SECRET_KEY")!;

    const body = await req.json();
    console.log("Moyasar webhook:", JSON.stringify(body));

    const paymentData = body.data || body;
    const moyasarId = paymentData.id;
    if (!moyasarId) {
      return new Response(JSON.stringify({ error: "no payment id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Re-fetch from Moyasar to verify (don't trust webhook body alone)
    const verifyRes = await fetch(`https://api.moyasar.com/v1/payments/${moyasarId}`, {
      headers: { "Authorization": `Basic ${btoa(MOYASAR_SECRET + ":")}` },
    });
    const verified = await verifyRes.json();
    if (!verifyRes.ok) {
      console.error("Verify failed:", verified);
      return new Response(JSON.stringify({ error: "verify failed" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const orderId = verified.metadata?.order_id;
    const newStatus = verified.status === "paid" ? "paid"
      : verified.status === "failed" ? "failed"
      : verified.status === "refunded" ? "refunded" : "pending";

    await supabase.from("payments").update({
      status: newStatus,
      raw_response: verified,
    }).eq("moyasar_payment_id", moyasarId);

    if (orderId) {
      const updates: any = { payment_status: newStatus };
      if (newStatus === "paid") {
        updates.status = "preparing"; // auto-confirm order
      }
      await supabase.from("orders").update(updates).eq("id", orderId);

      // Send payment receipt by email when status flips to paid
      if (newStatus === "paid") {
        try {
          const { data: order } = await supabase
            .from("orders")
            .select("id, order_number, customer_name, customer_phone, user_id, subtotal, delivery_fee, total")
            .eq("id", orderId)
            .maybeSingle();

          let recipientEmail: string | null = null;
          if (order?.user_id) {
            const { data: userRes } = await supabase.auth.admin.getUserById(order.user_id);
            recipientEmail = userRes?.user?.email ?? null;
          }

          if (order && recipientEmail) {
            const { data: items } = await supabase
              .from("order_items")
              .select("product_name, quantity, unit_price")
              .eq("order_id", orderId);

            await supabase.functions.invoke("send-transactional-email", {
              body: {
                templateName: "payment-receipt",
                recipientEmail,
                idempotencyKey: `receipt-${orderId}`,
                templateData: {
                  customerName: order.customer_name,
                  orderNumber: order.order_number,
                  subtotal: Number(order.subtotal),
                  deliveryFee: Number(order.delivery_fee),
                  total: Number(order.total),
                  paymentMethod: verified.source?.type || "دفع إلكتروني",
                  paymentId: moyasarId,
                  items: (items || []).map((it: any) => ({
                    name: it.product_name,
                    quantity: it.quantity,
                    price: Number(it.unit_price),
                  })),
                },
              },
            });
          }
        } catch (e) {
          console.error("Failed to send payment receipt:", e);
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
