// File: mobile/src/appInfo.js
// One place the app learns its own version, read from the build config rather than
// written by hand.
//
// VERSIONING SCHEME — MAJOR.MINOR, and each part means something concrete:
//
//   MAJOR = the APK generation. It changes only when a NEW native binary is built
//           and sideloaded (a native dependency, a permission, an Expo SDK bump).
//           Generation 1 is the APK you have now; the next one you build is v2.0,
//           the one after that v3.0.
//
//   MINOR = the over-the-air patch within that generation. Every OTA update ticks
//           it: 1.0 → 1.1 → 1.2 …, and after a new APK, 2.0 → 2.1 → 2.2 …
//
// This is not just a naming habit — it mirrors how delivery actually works.
// `runtimeVersion` in app.json is pinned per generation ("1.0.0", then "2.0.0" for
// the next APK, …), and an OTA update only reaches a build whose runtimeVersion
// matches. So MAJOR is literally the runtimeVersion generation, and MINOR is how
// many patches have shipped onto it. If the display version drove runtimeVersion
// (the Expo "appVersion" policy, which was removed here), every minor bump would
// orphan the installed APK from updates — the exact opposite of the intent.
//
// Bumping rule, kept simple so it is never forgotten:
//   • shipping an OTA update  → raise MINOR in app.json  (1.1 → 1.2)
//   • building a new APK       → raise MAJOR, reset MINOR to 0, AND set
//                                runtimeVersion to "<MAJOR>.0.0"          (→ 2.0)
//
// Because the number is read from config, changing it in app.json updates every
// place it appears — there is no separate string to hunt down.
import Constants from 'expo-constants';

// expoConfig is the modern path; `manifest` is a fallback so this never returns
// undefined and renders a blank version.
const cfg = Constants.expoConfig ?? Constants.manifest ?? {};

// Full semver as written in app.json, e.g. "1.1.0".
export const APP_VERSION = cfg.version ?? '1.0.0';

// MAJOR.MINOR only, which is what the scheme above is expressed in: "1.1".
export const APP_VERSION_SHORT = APP_VERSION.split('.').slice(0, 2).join('.');

export const APP_VERSION_LABEL = `TenantPro v${APP_VERSION_SHORT}`;
