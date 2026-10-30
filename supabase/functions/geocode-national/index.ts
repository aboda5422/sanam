const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type GeoHit = {
  lat: number;
  lng: number;
  formatted?: string;
  provider?: string;
  buildingNumber?: string;
  street?: string;
  district?: string;
  city?: string;
  postCode?: string;
};

const NOMINATIM_UA = "SanamGrocery/1.0 (https://sanam.sa; geocode-national)";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function inSaudi(lat: number, lng: number): boolean {
  return lat >= 16 && lat <= 32.5 && lng >= 34 && lng <= 56;
}

/** Parse ObjLatLng: "objectId lng lat ..." from SPL National Address API. */
function hitFromSplAddress(addr: any): GeoHit | null {
  const latDirect = Number(addr?.Latitude ?? addr?.latitude);
  const lngDirect = Number(addr?.Longitude ?? addr?.longitude);
  if (Number.isFinite(latDirect) && Number.isFinite(lngDirect) && inSaudi(latDirect, lngDirect)) {
    return {
      lat: latDirect,
      lng: lngDirect,
      formatted: [addr.Address1, addr.Address2].filter(Boolean).join(" — ") || undefined,
      provider: "spl",
      buildingNumber: addr.BuildingNumber,
      street: addr.Street,
      district: addr.District,
      city: addr.City,
      postCode: addr.PostCode,
    };
  }

  const parts = String(addr?.ObjLatLng || "").trim().split(/\s+/);
  // Common shape: objectId longitude latitude
  if (parts.length >= 3) {
    const lng = Number(parts[1]);
    const lat = Number(parts[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && inSaudi(lat, lng)) {
      return {
        lat,
        lng,
        formatted: [addr.Address1, addr.Address2].filter(Boolean).join(" — ") || undefined,
        provider: "spl",
        buildingNumber: addr.BuildingNumber,
        street: addr.Street,
        district: addr.District,
        city: addr.City,
        postCode: addr.PostCode,
      };
    }
  }
  return null;
}

/**
 * Official National Address API (requires subscription api_key).
 * Docs: https://api.address.gov.sa/freetextsearch
 */
async function splFreeText(code: string, apiKey: string): Promise<GeoHit | null> {
  const versions = ["v4", "v3.1"];
  for (const ver of versions) {
    const url =
      `https://apina.address.gov.sa/NationalAddress/${ver}/address/address-free-text` +
      `?language=A&format=JSON&encode=utf8&page=1` +
      `&addressstring=${encodeURIComponent(code)}` +
      `&api_key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (res.status === 401 || res.status === 403) {
      return null;
    }
    if (!res.ok) continue;
    const data = await res.json();
    const list = data?.Addresses || data?.addresses || [];
    if (!Array.isArray(list) || !list.length) continue;
    for (const addr of list) {
      const hit = hitFromSplAddress(addr);
      if (hit) return hit;
    }
  }
  return null;
}

async function nominatimSearch(query: string): Promise<GeoHit | null> {
  const url =
    "https://nominatim.openstreetmap.org/search" +
    `?q=${encodeURIComponent(query)}` +
    "&format=json&limit=3&countrycodes=sa&addressdetails=0";
  const res = await fetch(url, {
    headers: {
      "User-Agent": NOMINATIM_UA,
      Accept: "application/json",
    },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  if (!Array.isArray(rows) || !rows.length) return null;

  for (const row of rows) {
    const lat = Number(row.lat);
    const lng = Number(row.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (!inSaudi(lat, lng)) continue;
    return {
      lat,
      lng,
      formatted: row.display_name || undefined,
      provider: "nominatim",
    };
  }
  return null;
}

async function googleGeocode(query: string, apiKey: string): Promise<GeoHit | null> {
  const url =
    "https://maps.googleapis.com/maps/api/geocode/json" +
    `?address=${encodeURIComponent(query)}` +
    `&region=sa&components=country:SA&language=ar&key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.status !== "OK" || !data.results?.[0]) return null;
  const r = data.results[0];
  const lat = Number(r.geometry?.location?.lat);
  const lng = Number(r.geometry?.location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inSaudi(lat, lng)) return null;
  return {
    lat,
    lng,
    formatted: r.formatted_address || undefined,
    provider: "google",
  };
}

/** Places API (New) — works when legacy Geocoding is not activated. */
async function googlePlacesSearch(query: string, apiKey: string): Promise<GeoHit | null> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.location,places.formattedAddress,places.displayName",
    },
    body: JSON.stringify({
      textQuery: query,
      maxResultCount: 3,
      regionCode: "SA",
      languageCode: "ar",
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const places = Array.isArray(data?.places) ? data.places : [];
  for (const p of places) {
    const lat = Number(p?.location?.latitude);
    const lng = Number(p?.location?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inSaudi(lat, lng)) continue;
    return {
      lat,
      lng,
      formatted:
        p.formattedAddress ||
        p.displayName?.text ||
        undefined,
      provider: "google-places",
    };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let code = "";
  try {
    const body = await req.json();
    code = String(body?.code || "").trim().toUpperCase();
  } catch {
    return json({ error: "invalid body" }, 400);
  }
  if (!/^[A-Z]{4,6}\d{4,5}$/.test(code)) return json({ hit: null });

  try {
    // 1) Official SPL National Address API — only works with a real subscription key
    const splKey =
      Deno.env.get("SPL_NATIONAL_ADDRESS_API_KEY") ||
      Deno.env.get("ADDRESS_GOV_API_KEY") ||
      "";
    if (splKey.trim()) {
      const splHit = await splFreeText(code, splKey.trim());
      if (splHit) return json({ hit: splHit, status: "OK", provider: "spl" });
    }

    // 2) Google Places (New) + Geocoding — Places often works when Geocoding isn't activated
    const googleKey = Deno.env.get("GOOGLE_MAPS_API_KEY") || "";
    if (googleKey.trim()) {
      const googleQueries = [
        code,
        `${code} Saudi Arabia`,
        `${code} السعودية`,
        `العنوان الوطني ${code}`,
        `National Address ${code}`,
        `short address ${code}`,
      ];
      for (const q of googleQueries) {
        const placesHit = await googlePlacesSearch(q, googleKey.trim());
        if (placesHit) return json({ hit: placesHit, status: "OK", provider: "google-places" });
        const geoHit = await googleGeocode(q, googleKey.trim());
        if (geoHit) return json({ hit: geoHit, status: "OK", provider: "google" });
      }
    }

    // 3) Free Nominatim fallback (rarely knows SPL short codes)
    const nominatimQueries = [`${code} Saudi Arabia`, `العنوان الوطني ${code}`, code];
    for (let i = 0; i < nominatimQueries.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 1100));
      const hit = await nominatimSearch(nominatimQueries[i]);
      if (hit) return json({ hit, status: "OK", provider: "nominatim" });
    }

    return json({
      hit: null,
      status: "ZERO_RESULTS",
      provider: [
        splKey.trim() ? "spl" : null,
        googleKey.trim() ? "google" : null,
        "nominatim",
      ]
        .filter(Boolean)
        .join("+"),
      note:
        "رمز العنوان الوطني يحتاج مفتاح اشتراك من api.address.gov.sa لأفضل دقة. بدون المفتاح يمكن حفظ الرمز وتحريك الدبوس يدوياً على الخريطة.",
      needs_spl_key: !splKey.trim(),
    });
  } catch (e) {
    return json({ hit: null, error: String(e) }, 500);
  }
});
