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

function parseCoords(raw: string): { lat: number; lng: number } | null {
  const d3 = raw.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (d3) {
    const lat = Number(d3[1]);
    const lng = Number(d3[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  const at = raw.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (at) {
    const lat = Number(at[1]);
    const lng = Number(at[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  const q = raw.match(/[?&]q=(-?\d+(?:\.\d+)?)(?:%2C|,)(-?\d+(?:\.\d+)?)/i);
  if (q) {
    const lat = Number(q[1]);
    const lng = Number(q[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { url: input } = (await req.json()) as { url?: string };
    const start = String(input || "").trim();
    if (!start) return json({ error: "url required" }, 400);

    const direct = parseCoords(start);
    if (direct) return json({ ...direct, expanded: start });

    let current = start;
    let body = "";
    for (let i = 0; i < 8; i++) {
      const res = await fetch(current, {
        redirect: "manual",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
          Accept: "text/html",
        },
      });
      const loc = res.headers.get("location");
      if (loc && res.status >= 300 && res.status < 400) {
        current = new URL(loc, current).href;
        const fromLoc = parseCoords(current);
        if (fromLoc) return json({ ...fromLoc, expanded: current });
        continue;
      }
      body = await res.text();
      break;
    }

    const coords = parseCoords(current) || parseCoords(body);
    if (!coords) return json({ error: "تعذر قراءة الإحداثيات من الرابط" }, 422);
    return json({ ...coords, expanded: current });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "resolve failed" }, 500);
  }
});
