/** Register the storefront service worker (web only; skipped on Capacitor native). */

export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  // Native shells ship their own asset cache; skip SW there.
  try {
    const w = window as Window & { Capacitor?: { isNativePlatform?: () => boolean } };
    if (w.Capacitor?.isNativePlatform?.()) return;
  } catch {
    /* ignore */
  }

  const register = () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* silent — SW must never break storefront */
    });
  };

  if (document.readyState === "complete") {
    setTimeout(register, 1200);
  } else {
    window.addEventListener("load", () => setTimeout(register, 1200), { once: true });
  }
}
