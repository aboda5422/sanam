# App Icons & Splash Screens

Source assets for iOS & Android app icons (used by `@capacitor/assets`).

## Files
- `icon.png` — 1024×1024, opaque (no alpha) — official app icon
- `icon-foreground.png` — 1024×1024, logo on white with padding (Android adaptive)
- `icon-background.png` — 1024×1024 solid white (Android adaptive background)
- `splash.png` — 2732×2732 splash source

## Regenerate all native icons (after `npx cap add ios/android`)
```bash
npm i -D @capacitor/assets
npx capacitor-assets generate --iconBackgroundColor '#ffffff' --iconBackgroundColorDark '#ffffff' --splashBackgroundColor '#ffffff' --splashBackgroundColorDark '#ffffff'
npx cap sync
```
This populates:
- iOS: `ios/App/App/Assets.xcassets/AppIcon.appiconset/*` (all sizes for App Store)
- Android: `android/app/src/main/res/mipmap-*/` + adaptive icon XML (Google Play ready)

The 1024×1024 iOS App Store icon (`AppIcon-512@2x.png`) is already in place.
