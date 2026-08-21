// File: mobile/src/appConfig.js
// Build-time app configuration.
//
// UI_VERSION — the revert flag for the redesign.
//   'v1'  → the current, shipped UI (the default; nothing changes for anyone).
//   'v2'  → the "TenantPro redesign" (Space Grotesk + acid-lime, deck-dock nav).
//
// The two UIs live side by side: every v1 screen stays exactly as it is, and the
// redesign is built as a parallel set under src/redesign/. This constant is the
// ONLY switch between them, read once at the app root (App.js). Flipping it to
// 'v2' and shipping is the whole cutover; flipping it back to 'v1' is the whole
// revert — no data touched, no backend change, instant.
//
// It is a build-time constant on purpose (the chosen mechanism): a single value
// to diff in a commit, not a runtime setting that could strand a user on a
// half-migrated screen. The redesign also needs native modules (custom fonts,
// map/QR), so 'v2' ships in a fresh APK — the flag flips in that build.
export const UI_VERSION = 'v2';

export const isRedesign = () => UI_VERSION === 'v2';
