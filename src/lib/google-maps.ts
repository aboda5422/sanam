import { supabase } from "@/integrations/supabase/client";

const SCRIPT_ID = "google-maps-script";
// Do NOT load "drawing" — DrawingManager was removed in Maps JS API v3.65
const LIBRARIES = "places";

let mapsKey: string | null = null;
let mapsKeyPromise: Promise<string | null> | null = null;
let loadPromise: Promise<boolean> | null = null;

async function getMapsKey(): Promise<string | null> {
  if (mapsKey) return mapsKey;
  if (mapsKeyPromise) return mapsKeyPromise;
  mapsKeyPromise = (async () => {
    const { data, error } = await supabase.functions.invoke("get-maps-key");
    if (error) {
      console.error("[google-maps] get-maps-key error:", error);
      return null;
    }
    mapsKey = data?.key || null;
    return mapsKey;
  })();
  const key = await mapsKeyPromise;
  mapsKeyPromise = null;
  return key;
}

declare global {
  interface Window {
    google?: any;
  }
}

/** Load Google Maps JS API (shared across the app). */
export function loadGoogleMaps(): Promise<boolean> {
  if (typeof window !== "undefined" && window.google?.maps) {
    return Promise.resolve(true);
  }

  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
      if (existing) {
        if (window.google?.maps) return true;
        await new Promise<void>((resolve, reject) => {
          existing.addEventListener("load", () => resolve(), { once: true });
          existing.addEventListener("error", () => reject(new Error("maps script failed")), { once: true });
        });
        return !!window.google?.maps;
      }

      const key = await getMapsKey();
      if (!key) {
        console.error("[google-maps] no key returned");
        return false;
      }

      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.id = SCRIPT_ID;
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=${LIBRARIES}&language=ar&v=weekly`;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("maps script failed"));
        document.head.appendChild(script);
      });

      return !!window.google?.maps;
    } catch (e) {
      console.error("[google-maps] load failed:", e);
      loadPromise = null;
      return false;
    }
  })();

  return loadPromise;
}

type GeoHit = { lat: number; lng: number; formatted?: string };

function locFrom(result: any): GeoHit | null {
  const loc = result?.geometry?.location ?? result?.location;
  if (!loc) return null;
  const lat = typeof loc.lat === "function" ? loc.lat() : loc.lat;
  const lng = typeof loc.lng === "function" ? loc.lng() : loc.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    formatted:
      result.formatted_address ||
      result.formattedAddress ||
      result.displayName ||
      result.name ||
      undefined,
  };
}

async function searchByText(query: string): Promise<GeoHit | null> {
  const Place = window.google?.maps?.places?.Place;
  if (!Place?.searchByText) return null;
  try {
    const { places } = await Place.searchByText({
      textQuery: query,
      fields: ["location", "formattedAddress", "displayName"],
      region: "SA",
      maxResultCount: 1,
    });
    return places?.[0] ? locFrom(places[0]) : null;
  } catch {
    return null;
  }
}

function placesService(): any | null {
  const g = window.google?.maps?.places;
  if (!g?.PlacesService) return null;
  const host = document.createElement("div");
  return new g.PlacesService(host);
}

function findPlace(query: string): Promise<GeoHit | null> {
  const svc = placesService();
  if (!svc) return Promise.resolve(null);
  return new Promise((resolve) => {
    svc.findPlaceFromQuery(
      {
        query,
        fields: ["geometry", "formatted_address", "name"],
      },
      (results: any[], status: string) => {
        if (status !== "OK" || !results?.[0]) {
          resolve(null);
          return;
        }
        resolve(locFrom(results[0]));
      }
    );
  });
}

function textSearch(query: string): Promise<GeoHit | null> {
  const svc = placesService();
  if (!svc) return Promise.resolve(null);
  return new Promise((resolve) => {
    svc.textSearch({ query }, (results: any[], status: string) => {
      if (status !== "OK" || !results?.[0]) {
        resolve(null);
        return;
      }
      resolve(locFrom(results[0]));
    });
  });
}

function autocompletePlace(query: string): Promise<GeoHit | null> {
  const g = window.google?.maps?.places;
  if (!g?.AutocompleteService || !g?.PlacesService) return Promise.resolve(null);
  const ac = new g.AutocompleteService();
  const svc = placesService();
  return new Promise((resolve) => {
    ac.getPlacePredictions(
      { input: query, componentRestrictions: { country: "sa" } },
      (preds: any[], status: string) => {
        if (status !== "OK" || !preds?.[0]?.place_id || !svc) {
          resolve(null);
          return;
        }
        svc.getDetails(
          { placeId: preds[0].place_id, fields: ["geometry", "formatted_address", "name"] },
          (place: any, st: string) => {
            if (st !== "OK") {
              resolve(null);
              return;
            }
            resolve(locFrom(place));
          }
        );
      }
    );
  });
}

async function geocodeQuery(address: string, restrictSa: boolean): Promise<GeoHit | null> {
  if (!window.google?.maps?.Geocoder) return null;
  const geocoder = new window.google.maps.Geocoder();
  try {
    const req: any = { address };
    if (restrictSa) req.componentRestrictions = { country: "SA" };
    const result = await geocoder.geocode(req);
    return locFrom(result.results?.[0]);
  } catch {
    return null;
  }
}

function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** City centroids / Maps default view — not a real short-code pin. */
const GENERIC_SA_POINTS = [
  { lat: 21.3891, lng: 39.8579 },
  { lat: 21.4225, lng: 39.8262 },
  { lat: 21.495808, lng: 39.190528 },
  { lat: 24.7136, lng: 46.6753 },
  { lat: 21.4858, lng: 39.1925 },
];

function isCredibleNationalHit(hit: GeoHit, code: string, provider?: string): boolean {
  const compact = (hit.formatted || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (compact.includes(code.toUpperCase())) return true;
  // Nominatim rarely embeds SPL short codes; accept non-generic SA pins from the edge function.
  if (provider === "nominatim" || (hit as any).provider === "nominatim") {
    return !GENERIC_SA_POINTS.some((p) => kmBetween(hit, p) < 4);
  }
  return !GENERIC_SA_POINTS.some((p) => kmBetween(hit, p) < 4);
}

async function geocodeRest(query: string): Promise<GeoHit | null> {
  const key = await getMapsKey();
  if (!key) return null;
  try {
    const url =
      "https://maps.googleapis.com/maps/api/geocode/json" +
      `?address=${encodeURIComponent(query)}&region=sa&key=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== "OK" || !data.results?.[0]) return null;
    return locFrom(data.results[0]);
  } catch {
    return null;
  }
}

async function geocodeViaFunction(code: string): Promise<(GeoHit & { provider?: string }) | null> {
  try {
    const { data, error } = await supabase.functions.invoke("geocode-national", {
      body: { code },
    });
    if (error || !data?.hit) return null;
    const hit = data.hit;
    if (!Number.isFinite(hit.lat) || !Number.isFinite(hit.lng)) return null;
    return { ...hit, provider: data.provider || hit.provider };
  } catch {
    return null;
  }
}

/** Resolve a Saudi national short address (e.g. MEKD2885). Uses free Nominatim first via edge function. */
export async function geocodeNationalAddress(
  code: string
): Promise<GeoHit | null> {
  const q = code.trim().toUpperCase();
  const fromFn = await geocodeViaFunction(q);
  if (fromFn && isCredibleNationalHit(fromFn, q, fromFn.provider)) return fromFn;

  // Skip browser Google geocode when billing/key fails — Nominatim already tried server-side.
  const key = await getMapsKey();
  if (!key) return fromFn;

  const queries = [
    q,
    `${q} السعودية`,
    `${q} Saudi Arabia`,
    `short address ${q}`,
    `العنوان الوطني ${q}`,
  ];
  for (const query of queries) {
    const rest = await geocodeRest(query);
    if (rest && isCredibleNationalHit(rest, q)) return rest;
  }

  const ok = await loadGoogleMaps();
  if (!ok || !window.google?.maps) return fromFn;

  for (const query of queries) {
    const hit =
      (await searchByText(query)) ||
      (await findPlace(query)) ||
      (await textSearch(query)) ||
      (await autocompletePlace(query)) ||
      (await geocodeQuery(query, false)) ||
      (await geocodeQuery(query, true));
    if (hit && isCredibleNationalHit(hit, q)) return hit;
  }
  return fromFn;
}

/** Force Google Maps to recalculate size (needed inside dialogs/drawers). */
export function triggerMapResize(map: any) {
  if (!map || !window.google?.maps?.event) return;
  try {
    window.google.maps.event.trigger(map, "resize");
  } catch {
    /* ignore */
  }
}

/** Wait until an element has non-zero size (dialogs animate open). */
export function waitForElementSize(
  el: HTMLElement,
  timeoutMs = 3000
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      if (width > 0 && height > 0) {
        resolve({ width, height });
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error("map container has no size"));
        return;
      }
      requestAnimationFrame(check);
    };
    check();
  });
}
