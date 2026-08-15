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

export type RecaptchaResult = { ok: true } | { ok: false; message: string };

function isLocalPreviewHost(host: string) {
  return (
    /localhost|127\.0\.0\.1/i.test(host) ||
    host.endsWith(".local") ||
    /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)
  );
}

function explainFailure(payload: any, invokeError?: { message?: string } | null): string {
  const pageHost = typeof window !== "undefined" ? window.location.hostname : "";
  if (isLocalPreviewHost(pageHost)) {
    return `التحقق الأمني لا يُستخدم على السيرفر المحلي (${pageHost}).`;
  }

  const codes: string[] = Array.isArray(payload?.errorCodes)
    ? payload.errorCodes
    : Array.isArray(payload?.["error-codes"])
      ? payload["error-codes"]
      : [];
  const hostname = typeof payload?.hostname === "string" ? payload.hostname : "";
  const score = typeof payload?.score === "number" ? payload.score : null;
  const minScore = typeof payload?.minScore === "number" ? payload.minScore : null;
  const err = payload?.error || invokeError?.message || "";

  if (codes.includes("timeout-or-duplicate")) {
    return "انتهت صلاحية رمز التحقق أو استُخدم مسبقاً. حدّث الصفحة ثم أعد المحاولة.";
  }
  if (codes.includes("invalid-input-response") || codes.includes("missing-input-response")) {
    return "رمز التحقق غير صالح. حدّث الصفحة ثم أعد المحاولة.";
  }
  if (codes.includes("browser-error")) {
    return "المتصفح منع أداة التحقق. جرّب Chrome، أو عطّل حاجب الإعلانات، أو افتح الموقع من الرابط الرسمي وليس من المعاينة الداخلية.";
  }
  const host = hostname || pageHost;
  if (isLocalPreviewHost(host)) {
    return `التحقق الأمني لا يقبل عنوان المعاينة (${host}). أضف هذا النطاق في إعدادات Google reCAPTCHA، أو افتح الموقع المنشور.`;
  }
  if (err === "server not configured") {
    return "خدمة التحقق غير مُعدّة على الخادم. تواصل مع الدعم.";
  }
  if (err === "low_score" || (score != null && payload?.success === false && !codes.length)) {
    const extra = minScore != null ? ` (درجتك ${score.toFixed(2)} والحد الأدنى ${minScore})` : score != null ? ` (الدرجة ${score.toFixed(2)})` : "";
    return `لم يجتز التحقق أنك لست روبوتاً${extra}. أعد المحاولة بدون VPN أو من شبكة أخرى.`;
  }
  if (codes.length) {
    return `فشل التحقق الأمني: ${codes.join(", ")}.`;
  }
  if (err) {
    return `فشل التحقق الأمني: ${String(err)}`;
  }
  return "فشل التحقق الأمني. حدّث الصفحة ثم أعد المحاولة.";
}

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

  const verify = useCallback(async (action: string): Promise<RecaptchaResult> => {
    try {
      if (Capacitor.isNativePlatform()) return { ok: true };
      if (typeof window !== "undefined" && isLocalPreviewHost(window.location.hostname)) {
        return { ok: true };
      }
      const key = cachedSiteKey;
      if (!key || !window.grecaptcha) {
        return { ok: true };
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
      let payload = data as any;
      if (!payload && error) {
        try {
          const ctx = (error as any).context;
          if (ctx && typeof ctx.json === "function") payload = await ctx.json();
        } catch {
          /* ignore */
        }
      }
      if (payload?.success) return { ok: true };
      return { ok: false, message: explainFailure(payload, error) };
    } catch (e: any) {
      return { ok: false, message: explainFailure(null, e) };
    }
  }, []);

  return { ready, verify };
};