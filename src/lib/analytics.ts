declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** Google Analytics 4 measurement ID */
export const GA_MEASUREMENT_ID =
  (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined) || "G-422LMMDEL2";

let initialized = false;

/** Load gtag.js and configure GA4 (idempotent). */
export function initGoogleAnalytics(): void {
  if (initialized || typeof window === "undefined") return;
  if (!GA_MEASUREMENT_ID || !GA_MEASUREMENT_ID.startsWith("G-")) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer.push(args);
  };

  window.gtag("js", new Date());
  // SPA: we send page_view manually on route changes
  window.gtag("config", GA_MEASUREMENT_ID, { send_page_view: false });

  if (!document.getElementById("ga-gtag")) {
    const script = document.createElement("script");
    script.id = "ga-gtag";
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(script);
  }

  initialized = true;
}

export function trackPageView(path: string, title?: string): void {
  if (!initialized || !window.gtag) return;
  window.gtag("event", "page_view", {
    page_path: path,
    page_title: title || document.title,
    page_location: window.location.href,
  });
}

export function trackEvent(
  name: string,
  params?: Record<string, string | number | boolean | undefined>
): void {
  if (!initialized || !window.gtag) return;
  window.gtag("event", name, params);
}
