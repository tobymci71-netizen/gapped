# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Native config is generated — do not edit ios/ or android/

`ios/` and `android/` are gitignored build artifacts (Continuous Native Generation). `app.json` is
the source of truth. Editing the Xcode project directly is always wrong here: the next
`npx expo prebuild` discards it.

## Never "clean up" NSLocalNetworkUsageDescription

The generated `Info.plist` contains a dev-launcher local-network string that looks like
boilerplate worth tidying. It is not. `expo-dev-launcher` injects a build phase that strips the
key from non-Debug builds, but **only when the description still matches its own default text**
(`grep -q "Expo Dev Launcher"`). Rewriting the string defeats the strip and ships a local-network
permission to production. Leave it exactly as generated. Full explanation in README, "Native
config (iOS)".
