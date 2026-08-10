import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sanam.supermarket',
  appName: 'سنام',
  webDir: 'dist',
  // For production native app: load bundled files from dist/ (no server URL).
  // To re-enable hot-reload during development, uncomment the server block below
  // and point it at your local Vite URL (e.g. http://YOUR_LAN_IP:8080).
  // server: {
  //   url: 'http://192.168.1.10:8080',
  //   cleartext: true,
  // },
  ios: {
    contentInset: 'never',
    backgroundColor: '#ffffff',
    scrollEnabled: true,
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#ffffff',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#ffffff',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      overlaysWebView: true,
      backgroundColor: '#ffffff',
    },
    Keyboard: {
      resize: 'native',
      style: 'LIGHT',
      resizeOnFullScreen: true,
    },
    Camera: {
      androidScaleType: 'CENTER_CROP',
    },
    // Google Sign-In is configured at runtime via
    // @capgo/capacitor-social-login (SocialLogin.initialize) in AuthPage.tsx.
    // The Web Client ID is used to obtain an idToken that Supabase
    // signInWithIdToken can verify. Configure the same Client ID + Secret
    // in Supabase Auth → Providers → Google.
  },
};

export default config;
