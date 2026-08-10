import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check caller is site_admin
    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["site_admin"]);

    if (!callerRoles || callerRoles.length === 0) {
      return new Response(JSON.stringify({ error: "صلاحيات غير كافية - يتطلب مدير موقع" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { action, email, role, user_id } = await req.json();

    if (action === "add") {
      const normalizedEmail = (email || "").trim().toLowerCase();
      if (!normalizedEmail) {
        return new Response(JSON.stringify({ error: "البريد الإلكتروني مطلوب" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Search across all pages (listUsers default = 50/page)
      let targetUser: any = null;
      let page = 1;
      const perPage = 1000;
      while (true) {
        const { data, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
        if (listErr) throw listErr;
        const users = data?.users || [];
        targetUser = users.find((u: any) => (u.email || "").toLowerCase() === normalizedEmail);
        if (targetUser || users.length < perPage) break;
        page++;
        if (page > 50) break; // safety
      }

      if (!targetUser) {
        return new Response(JSON.stringify({ error: "المستخدم غير موجود. يجب أن يسجّل الدخول أولاً عبر صفحة تسجيل الحساب." }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const { error: insertErr } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: targetUser.id, role }, { onConflict: "user_id,role" });

      if (insertErr) throw insertErr;

      // If role is driver, ensure a drivers record exists
      if (role === "driver") {
        const { data: existingDriver } = await supabaseAdmin
          .from("drivers")
          .select("id")
          .eq("user_id", targetUser.id)
          .maybeSingle();

        if (!existingDriver) {
          await supabaseAdmin.from("drivers").insert({
            user_id: targetUser.id,
            full_name: targetUser.user_metadata?.full_name || normalizedEmail.split("@")[0],
            email: normalizedEmail,
            phone: targetUser.user_metadata?.phone || "0500000000",
            vehicle_type: "car",
            is_available: true,
            status: "active",
          });
        }
      }

      return new Response(JSON.stringify({ success: true, user_id: targetUser.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "remove") {
      // Prevent removing own site_admin
      if (user_id === user.id && role === "site_admin") {
        return new Response(JSON.stringify({ error: "لا يمكنك إزالة صلاحيتك الخاصة" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { error: delErr } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", user_id)
        .eq("role", role);

      if (delErr) throw delErr;

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "إجراء غير معروف" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
