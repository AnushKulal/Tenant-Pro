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

// HEADER_LAYOUT — the revert flag for the header/content alignment rule.
//
//   'v1'  → how every screen laid itself out before: each one draws its own title
//           inside its own scroll view with its own top padding, the header region
//           exists on the landlord's side only, and the title scrolls away and is
//           gone.
//   'v2'  → the alignment rule, applied in one place (redesign/layout.js):
//             • the header sits directly below the system bars, above all content,
//               on EVERY screen rather than only the landlord's;
//             • content is anchored one consistent distance below it, instead of
//               each screen choosing a top padding between 12 and 26;
//             • the title is STICKY, not fixed: a screen keeps its full-size title
//               on arrival, and once that has scrolled away a compact copy fades
//               into the header, so context is never lost and never duplicated;
//             • a field you are typing in can never end up underneath the header
//               (WCAG 2.2: a sticky header must not cover the focused element).
//
// Same mechanism as UI_VERSION above and for the same reason: one value to diff in
// a commit rather than a runtime setting that could leave somebody half-migrated.
// This one is pure JavaScript with no native side, so flipping it back and running
// Actions → Publish OTA Update is the whole revert — about two minutes, no rebuild,
// no store, nothing on the server, no data touched.
export const HEADER_LAYOUT = 'v2';

export const isLayoutRule = () => HEADER_LAYOUT === 'v2';
