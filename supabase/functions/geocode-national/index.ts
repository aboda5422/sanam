const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type GeoHit = { lat: number; lng: number; formatted?: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function locFromGeocode(result: any): GeoHit | null {
  const loc = result?.geometry?.location;
  const lat = loc?.lat;
  const lng = loc?.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, formatted: result.formatted_address || undefined };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const key = Deno.env.get("GOOGLE_GEOCODING_API_KEY") || Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!key) return json({ error: "Geocoding API key not configured" }, 500);

  let code = "";
  try {
    const body = await req.json();
    code = String(body?.code || "").trim().toUpperCase();
  } catch {
    return json({ error: "invalid body" }, 400);
  }
  if (!/^[A-Z]{4,6}\d{4,5}$/.test(code)) return json({ hit: null });

  const queries = [
    code,
    `${code} Saudi Arabia`,
    `${code} السعودية`,
    `العنوان الوطني ${code}`,
  ];

  try {
    for (const q of queries) {
      const url =
        "https://maps.googleapis.com/maps/api/geocode/json" +
        `?address=${encodeURIComponent(q)}&region=sa&key=${encodeURIComponent(key)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === "OK" && data.results?.[0]) {
        const hit = locFromGeocode(data.results[0]);
        if (hit) return json({ hit, status: data.status });
      }
    }

    const placeUrl =
      "https://maps.googleapis.com/maps/api/place/findplacefromtext/json" +
      `?input=${encodeURIComponent(code + " Saudi Arabia")}` +
      "&inputtype=textquery&fields=geometry,formatted_address,name" +
      `&key=${encodeURIComponent(key)}`;
    const placeRes = await fetch(placeUrl);
    const placeData = await placeRes.json();
    const cand = placeData.candidates?.[0];
    const loc = cand?.geometry?.location;
    if (Number.isFinite(loc?.lat) && Number.isFinite(loc?.lng)) {
      return json({
        hit: {
          lat: loc.lat,
          lng: loc.lng,
          formatted: cand.formatted_address || cand.name,
        },
        status: placeData.status,
      });
    }

    return json({ hit: null, status: placeData.status || "ZERO_RESULTS" });
  } catch (e) {
    return json({ hit: null, error: String(e) }, 500);
  }
});
