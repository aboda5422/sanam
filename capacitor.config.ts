import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sanam.supermarket',
  appName: 'سنام',
  webDir: 'dist',
  // For production native app: load bundled files from dist/ (no server URL).
  // To re-enable hot-reload during development, uncomment the server block below
  // and use the published URL (not the preview URL which requires Lovable login).
  // server: {
  //   url: 'https://bazarmawasim.lovable.app',
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
    // signInWithIdToken can verify. The same Web Client ID + Secret must
    // be configured in Lovable Cloud → Users → Auth Settings → Google.
  },
};

export default config;
