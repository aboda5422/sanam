import { supabase } from "@/integrations/supabase/client";

const SCRIPT_ID = "google-maps-script";
// Do NOT load "drawing" — DrawingManager was removed in Maps JS API v3.65
const LIBRARIES = "places";

let loadPromise: Promise<boolean> | null = null;

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

      const { data, error } = await supabase.functions.invoke("get-maps-key");
      if (error) {
        console.error("[google-maps] get-maps-key error:", error);
        return false;
      }
      const key = data?.key;
      if (!key) {
        console.error("[google-maps] no key returned", data);
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
