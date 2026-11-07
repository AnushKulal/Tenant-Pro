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

// GUIDED_TOUR — the off switch for the first-run tour.
//
//   'on'   → somebody signing in to a portal for the first time gets the guided
//            tour, and both Settings screens offer "Take the tour again".
//   'off'  → no tour starts by itself and the Settings rows are not drawn. The
//            tour's own code stays in the build and is simply never entered.
//
// This one earns a flag more than the other two do, because of what the tour IS:
// a modal that dims the screen and swallows every press until it is dismissed.
// If it starts at the wrong moment, or greets somebody who has used the app for
// months because a storage key changed name, it does not merely look wrong — it
// stands between that person and their rent. The cost of being wrong is high and
// the cost of the switch is nothing, so the switch exists.
//
// It is also the sharpest edge found while testing it: four existing test suites
// broke the day the tour landed, every one of them because a click meant for the
// app went to the tour instead. That is a harness problem when it happens to a
// test and a support ticket when it happens to a person.
//
// Pure JavaScript, no native side: flipping it to 'off' and running
// Actions → Publish OTA Update is the whole revert. About two minutes, no
// rebuild, no store review, nothing on the server, no data touched. Nobody who
// has already been shown the tour is shown it again either way.
export const GUIDED_TOUR = 'on';

export const isTourEnabled = () => GUIDED_TOUR === 'on';
