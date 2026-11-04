// File: mobile/src/redesign/shield.js
//
// Screenshots of an ID come out black.
//
// This is the GPay behaviour: while a sensitive screen is up, the OS refuses to put
// its pixels in a screenshot, a screen recording, or the recent-apps preview — you
// get a black rectangle instead. On Android that is one window flag, FLAG_SECURE,
// which is what expo-screen-capture sets.
//
// Three things about it are worth knowing before reading the code:
//
//   1. FLAG_SECURE is per WINDOW, not per view. While it is on, a screenshot of the
//      WHOLE app is black, not just the ID. That is why it is turned on when an ID
//      goes on screen and off again the moment it leaves, rather than being set once
//      at launch: a landlord screenshotting their ledger or a rent receipt is
//      completely reasonable, and blanket-blocking it would break something useful to
//      stop something that is not happening on that screen.
//
//   2. iOS has no equivalent. Apple provides no way to blank a screenshot of an
//      arbitrary view, so on iOS this is a no-op — the call succeeds and nothing is
//      prevented. Saying "screenshots are blocked" on iOS would be a lie, so
//      `shieldWorks` is false there and the UI must not claim protection.
//
//   3. It is native. A binary built before expo-screen-capture was added does not
//      contain it, and importing a missing native module throws at require time — so
//      the import is guarded and the whole thing degrades to a no-op rather than
//      taking down the screen it was meant to protect.
import React from 'react';
import { Platform } from 'react-native';

// Guarded require rather than a static import. Any binary older than the build that
// added this dependency has no such module, and an OTA update can reach exactly those
// binaries — the JS ships instantly, the native half never does. That combination is
// the one that crashes, so it is handled here rather than discovered in the wild.
let ScreenCapture = null;
try {
    // eslint-disable-next-line global-require
    ScreenCapture = require('expo-screen-capture');
} catch (e) {
    ScreenCapture = null;
}

// Whether blocking actually works here — as opposed to whether the call succeeds.
// Android with the module present is the only true case. Used to decide whether the
// UI may promise anything.
export const shieldWorks = !!(ScreenCapture && ScreenCapture.preventScreenCaptureAsync && Platform.OS === 'android');

// Every shielded screen passes its own tag. expo-screen-capture reference-counts by
// tag, so two shielded things open at once (the documents sheet with the full-screen
// viewer above it) do not fight: the flag stays on until BOTH have released it.
// Sharing one tag would let the first to close unshield the second.
const release = async (tag) => {
    if (!ScreenCapture || !ScreenCapture.allowScreenCaptureAsync) return;
    try { await ScreenCapture.allowScreenCaptureAsync(tag); } catch (e) { /* nothing to undo */ }
};

const engage = async (tag) => {
    if (!ScreenCapture || !ScreenCapture.preventScreenCaptureAsync) return;
    try { await ScreenCapture.preventScreenCaptureAsync(tag); } catch (e) { /* leave it unshielded rather than crash */ }
};

// Shield while `active`, release when it goes false or the component unmounts.
//
// The unmount release is the important half. Without it, closing an ID by navigating
// away — rather than by tapping the close button — would leave FLAG_SECURE set for the
// rest of the session, and every screenshot the user took afterwards would come out
// black for no visible reason. That is a much more annoying bug than the one this
// solves, and it is invisible until somebody tries to screenshot something else.
export function useIdShield(active, tag = 'tenantpro-id') {
    React.useEffect(() => {
        if (!active) return undefined;
        engage(tag);
        return () => { release(tag); };
    }, [active, tag]);
}
