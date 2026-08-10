import { initializeApp, getApps, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";
import { supabase } from "@/integrations/supabase/client";

let app: FirebaseApp | null = null;
let analytics: Analytics | null = null;
let cachedConfig: FirebaseOptions | null = null;

async function fetchFirebaseConfig(): Promise<FirebaseOptions | null> {
  if (cachedConfig) return cachedConfig;
  try {
    const { data, error } = await supabase.functions.invoke("get-firebase-config");
    if (error) {
      console.warn("[firebase] get-firebase-config error:", error.message);
      return null;
    }
    if (!data?.apiKey || !data?.appId) {
      console.warn("[firebase] incomplete config from edge function");
      return null;
    }
    cachedConfig = {
      apiKey: data.apiKey,
      authDomain: data.authDomain,
      projectId: data.projectId,
      storageBucket: data.storageBucket,
      messagingSenderId: data.messagingSenderId,
      appId: data.appId,
      measurementId: data.measurementId,
    };
    return cachedConfig;
  } catch (e) {
    console.warn("[firebase] failed to load config:", e);
    return null;
  }
}

export function getFirebaseApp(): FirebaseApp | null {
  return app;
}

/** Call once at app startup (web). Loads apiKey from Supabase secrets via edge function. */
export async function initFirebase(): Promise<FirebaseApp | null> {
  if (app) return app;

  const config = await fetchFirebaseConfig();
  if (!config) return null;

  app = getApps().length ? getApps()[0]! : initializeApp(config);

  try {
    if (typeof window !== "undefined" && (await isSupported())) {
      analytics = getAnalytics(app);
    }
  } catch (e) {
    console.warn("[firebase] Analytics init skipped:", e);
  }

  return app;
}

export function getFirebaseAnalytics(): Analytics | null {
  return analytics;
}
