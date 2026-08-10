import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { Capacitor } from "@capacitor/core";

// Native-only initialization (status bar, splash hide, keyboard handling)
if (Capacitor.isNativePlatform()) {
  const nativePlatform = Capacitor.getPlatform();
  document.documentElement.classList.add("capacitor-native", `capacitor-${nativePlatform}`);

  (async () => {
    try {
      const { StatusBar, Style } = await import("@capacitor/status-bar");
      // Dark content (dark icons) on our white background. Style.Light = WHITE icons (invisible on white).
      await StatusBar.setStyle({ style: Style.Dark });
      if (nativePlatform === "android") {
        await StatusBar.setBackgroundColor({ color: "#ffffff" });
        await StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
      } else {
        // iOS: let the WebView extend behind the status bar so the safe-area
        // fill can match the current app surface instead of staying native white.
        await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
      }
    } catch {}
    try {
      const { SplashScreen } = await import("@capacitor/splash-screen");
      // Hide once the web layer is ready
      setTimeout(() => SplashScreen.hide({ fadeOutDuration: 300 }).catch(() => {}), 800);
    } catch {}
    try {
      const { Keyboard } = await import("@capacitor/keyboard");
      Keyboard.addListener("keyboardWillShow", () => {
        document.body.classList.add("keyboard-open");
      });
      Keyboard.addListener("keyboardWillHide", () => {
        document.body.classList.remove("keyboard-open");
      });
    } catch {}
  })();
}

createRoot(document.getElementById("root")!).render(<App />);
