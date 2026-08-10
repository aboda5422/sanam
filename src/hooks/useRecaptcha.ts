import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, opts: { action: string }) => Promise<string>;
    };
  }
}

let cachedSiteKey: string | null = null;
let scriptLoading: Promise<void> | null = null;

const loadScript = (siteKey: string): Promise<void> => {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.grecaptcha) return Promise.resolve();
  if (scriptLoading) return scriptLoading;
  scriptLoading = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("recaptcha_load_failed"));
    document.head.appendChild(s);
  });
  return scriptLoading;
};

/**
 * useRecaptcha — loads Google reCAPTCHA v3 script and exposes an `execute(action)`
 * helper that returns a token, then verifies it via our edge function.
 * Returns { ready, verify } where verify() returns true|false.
 */
export const useRecaptcha = () => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // reCAPTCHA v3 does not work reliably inside Capacitor WebView
        // (hostname is capacitor://localhost which Google rejects).
        // Skip silently on native — server-side rules + RLS still protect us.
        if (Capacitor.isNativePlatform()) {
          setReady(true);
          return;
        }
        let key = cachedSiteKey;
        if (!key) {
          const { data } = await supabase.functions.invoke("get-recaptcha-key");
          key = (data as any)?.siteKey || "";
          cachedSiteKey = key;
        }
        if (!key) {
          console.warn("reCAPTCHA site key not configured");
          return;
        }
        await loadScript(key);
        if (!cancelled) setReady(true);
      } catch (e) {
        console.warn("reCAPTCHA init failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const verify = useCallback(async (action: string): Promise<boolean> => {
    try {
      // On native platforms, bypass reCAPTCHA (no DOM-bound siteverify host).
      if (Capacitor.isNativePlatform()) return true;
      const key = cachedSiteKey;
      if (!key || !window.grecaptcha) {
        // Fail-open if not configured to avoid blocking real users.
        return true;
      }
      const token: string = await new Promise((resolve, reject) => {
        window.grecaptcha!.ready(() => {
          window.grecaptcha!.execute(key, { action })
            .then(resolve)
            .catch(reject);
        });
      });
      const { data, error } = await supabase.functions.invoke("verify-recaptcha", {
        body: { token, action },
      });
      if (error) {
        console.warn("reCAPTCHA verify error", error);
        return false;
      }
      return !!(data as any)?.success;
    } catch (e) {
      console.warn("reCAPTCHA verify exception", e);
      return false;
    }
  }, []);

  return { ready, verify };
};