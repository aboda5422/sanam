import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";

/**
 * Firebase web config for project sanamapp (sanamapp-4cfc0).
 * Client apiKey is safe in the browser when domain-restricted in Google Cloud.
 */
const firebaseConfig = {
  apiKey:
    (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined) ||
    "AIzaSyDyvySk039DX_JvpIs7r7zDkP1IjYJo_0M",
  authDomain:
    (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) ||
    "sanamapp-4cfc0.firebaseapp.com",
  projectId:
    (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) || "sanamapp-4cfc0",
  storageBucket:
    (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined) ||
    "sanamapp-4cfc0.firebasestorage.app",
  messagingSenderId:
    (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined) ||
    "680062692468",
  appId:
    (import.meta.env.VITE_FIREBASE_APP_ID as string | undefined) ||
    "1:680062692468:web:0b998dea6b507ea4feb521",
  measurementId:
    (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined) ||
    (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined) ||
    "G-422LMMDEL2",
};

let app: FirebaseApp | null = null;
let analytics: Analytics | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  if (app) return app;
  if (!firebaseConfig.apiKey || !firebaseConfig.appId) {
    console.warn(
      "[firebase] Missing VITE_FIREBASE_API_KEY — copy it from Firebase Console SDK config."
    );
    return null;
  }
  app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);
  return app;
}

/** Call once at app startup (web only). Safe no-op if not configured. */
export async function initFirebase(): Promise<FirebaseApp | null> {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;

  try {
    if (typeof window !== "undefined" && (await isSupported())) {
      analytics = getAnalytics(firebaseApp);
    }
  } catch (e) {
    console.warn("[firebase] Analytics init skipped:", e);
  }

  return firebaseApp;
}

export function getFirebaseAnalytics(): Analytics | null {
  return analytics;
}

export { firebaseConfig };
