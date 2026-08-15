import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { email, password, full_name, phone } = await req.json();
    const normalized = String(email || "").trim().toLowerCase();
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return json({ error: "صيغة البريد الإلكتروني غير صحيحة" }, 400);
    }
    if (!password || String(password).length < 6) {
      return json({ error: "يجب أن تكون كلمة المرور 6 أحرف على الأقل" }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !service) return json({ error: "إعداد الخادم غير مكتمل" }, 500);

    const admin = createClient(url, service, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await admin.auth.admin.createUser({
      email: normalized,
      password: String(password),
      email_confirm: true,
      user_metadata: {
        full_name: String(full_name || "").trim(),
        phone: String(phone || "").trim(),
      },
    });

    if (error) {
      const already = /already|registered|exists/i.test(error.message);
      return json(
        { error: already ? "هذا البريد الإلكتروني مسجل مسبقاً" : error.message },
        400,
      );
    }

    return json({ success: true, user_id: data.user?.id || null });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
