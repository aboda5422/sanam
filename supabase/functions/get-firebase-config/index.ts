const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const apiKey = Deno.env.get("FIREBASE_API_KEY") || Deno.env.get("VITE_FIREBASE_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Firebase API key not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Non-secret project identifiers (safe defaults for this Sanam Firebase project)
  const config = {
    apiKey,
    authDomain: Deno.env.get("FIREBASE_AUTH_DOMAIN") || "sanamapp-4cfc0.firebaseapp.com",
    projectId: Deno.env.get("FIREBASE_PROJECT_ID") || "sanamapp-4cfc0",
    storageBucket:
      Deno.env.get("FIREBASE_STORAGE_BUCKET") || "sanamapp-4cfc0.firebasestorage.app",
    messagingSenderId: Deno.env.get("FIREBASE_MESSAGING_SENDER_ID") || "680062692468",
    appId:
      Deno.env.get("FIREBASE_APP_ID") || "1:680062692468:web:0b998dea6b507ea4feb521",
    measurementId: Deno.env.get("FIREBASE_MEASUREMENT_ID") || "G-422LMMDEL2",
  };

  return new Response(JSON.stringify(config), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
