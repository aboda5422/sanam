import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { SignJWT, importPKCS8 } from "https://esm.sh/jose@5.9.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

async function requireAdmin(supabase: any, jwt: string) {
  const { data: { user }, error } = await supabase.auth.getUser(jwt);
  if (error || !user) throw new Error("غير مصرح");
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  const ok = (roles || []).some((r: any) =>
    ["site_admin", "store_admin", "support"].includes(r.role),
  );
  if (!ok) throw new Error("صلاحيات غير كافية");
  return user;
}

function loadServiceAccount(): ServiceAccount {
  const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON غير مضبوط");
  const sa = JSON.parse(raw) as ServiceAccount;
  if (!sa.project_id || !sa.client_email || !sa.private_key) {
    throw new Error("ملف خدمة Firebase غير مكتمل");
  }
  return sa;
}

let cachedToken: { value: string; exp: number } | null = null;

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp > now + 60) return cachedToken.value;

  const key = await importPKCS8(sa.private_key.replace(/\\n/g, "\n"), "RS256");
  const jwt = await new SignJWT({
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`OAuth token failed: ${JSON.stringify(json).slice(0, 300)}`);
  }
  cachedToken = { value: json.access_token, exp: now + Number(json.expires_in || 3600) };
  return cachedToken.value;
}

async function sendFcm(
  sa: ServiceAccount,
  accessToken: string,
  message: Record<string, unknown>,
) {
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    },
  );
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
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
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const user = await requireAdmin(supabase, jwt);

    const body = await req.json();
    const title = String(body.title || "").trim();
    const text = String(body.body || body.content || "").trim();
    const imageUrl = body.image_url ? String(body.image_url) : null;
    const deepLink = body.cta_url ? String(body.cta_url) : "/";
    const branchId = body.branch_id || null;
    const announcementId = body.announcement_id || null;
    const useTopic = body.use_topic !== false;

    if (!title) {
      return new Response(JSON.stringify({ error: "العنوان مطلوب" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sa = loadServiceAccount();
    const accessToken = await getAccessToken(sa);

    const dataPayload = {
      title,
      body: text,
      url: deepLink,
      announcement_id: announcementId || "",
    };

    const notification: Record<string, string> = { title };
    if (text) notification.body = text;
    if (imageUrl) notification.image = imageUrl;

    const android = {
      priority: "HIGH",
      notification: {
        channelId: "sanam_alerts",
        sound: "default",
        ...(imageUrl ? { image: imageUrl } : {}),
      },
    };
    const apns = {
      payload: {
        aps: {
          sound: "default",
          "mutable-content": 1,
          "content-available": 1,
        },
      },
      ...(imageUrl
        ? { fcm_options: { image: imageUrl } }
        : {}),
    };

    let success = 0;
    let failure = 0;
    const errors: string[] = [];
    let targetCount = 0;

    if (useTopic && !branchId) {
      targetCount = 1;
      const result = await sendFcm(sa, accessToken, {
        topic: "sanam_all",
        notification,
        data: dataPayload,
        android,
        apns,
      });
      if (result.ok) success++;
      else {
        failure++;
        errors.push(JSON.stringify(result.json).slice(0, 200));
      }
    } else {
      let q = supabase
        .from("device_push_tokens")
        .select("token, platform")
        .order("last_seen_at", { ascending: false })
        .limit(2000);
      if (branchId) q = q.eq("branch_id", branchId);
      const { data: tokens, error } = await q;
      if (error) throw error;

      const list = tokens || [];
      targetCount = list.length;

      // Also try branch topic when scoped
      if (branchId && useTopic) {
        targetCount += 1;
        const topicResult = await sendFcm(sa, accessToken, {
          topic: `branch_${String(branchId).replace(/-/g, "")}`,
          notification,
          data: dataPayload,
          android,
          apns,
        });
        if (topicResult.ok) success++;
        else {
          failure++;
          errors.push(`topic: ${JSON.stringify(topicResult.json).slice(0, 160)}`);
        }
      }

      const chunkSize = 25;
      for (let i = 0; i < list.length; i += chunkSize) {
        const chunk = list.slice(i, i + chunkSize);
        const results = await Promise.all(
          chunk.map((row: any) =>
            sendFcm(sa, accessToken, {
              token: row.token,
              notification,
              data: dataPayload,
              android,
              apns,
            }),
          ),
        );
        for (const r of results) {
          if (r.ok) success++;
          else {
            failure++;
            if (errors.length < 8) errors.push(JSON.stringify(r.json).slice(0, 160));
            // prune invalid tokens
            const code = r.json?.error?.details?.[0]?.errorCode || r.json?.error?.status;
            if (
              code === "UNREGISTERED" ||
              code === "INVALID_ARGUMENT" ||
              String(r.json?.error?.message || "").includes("not a valid FCM")
            ) {
              // best-effort cleanup handled below via matching token in chunk
            }
          }
        }
        // cleanup invalid
        for (let j = 0; j < results.length; j++) {
          const r = results[j];
          const msg = JSON.stringify(r.json || {});
          if (!r.ok && (msg.includes("UNREGISTERED") || msg.includes("not found"))) {
            await supabase.from("device_push_tokens").delete().eq("token", chunk[j].token);
          }
        }
      }
    }

    await supabase.from("push_send_logs").insert({
      announcement_id: announcementId,
      title,
      body: text || null,
      branch_id: branchId,
      target_count: targetCount,
      success_count: success,
      failure_count: failure,
      created_by: user.id,
      meta: { errors: errors.slice(0, 5), deep_link: deepLink },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        target_count: targetCount,
        success_count: success,
        failure_count: failure,
        errors: errors.slice(0, 5),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("send-fcm-push", e);
    return new Response(JSON.stringify({ error: e.message || "خطأ" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
