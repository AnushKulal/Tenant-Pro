// File: mobile/src/redesign/session.js
// JWT session storage for the redesign. Uses the SAME AsyncStorage keys as v1
// (userToken/ownerData for the landlord side, tenantToken/tenantData for the
// tenant side) so a session started in either UI is recognised by the other and
// sign-out clears both. Owner takes precedence when both exist, mirroring v1's
// SplashScreen routing.
import AsyncStorage from '@react-native-async-storage/async-storage';

const K = {
    ownerToken: 'userToken',
    ownerData: 'ownerData',
    tenantToken: 'tenantToken',
    tenantData: 'tenantData',
    // v2-only: the redesign's first-run intro. Namespaced so it never collides
    // with anything v1 stores, and deliberately NOT cleared on sign-out — the
    // intro explains the product, so a returning user should not sit through it
    // again just because they signed out.
    onboarded: 'v2_onboarded',
    // v2-only: whether the one-time "what TenantPro uses" primer has been shown.
    // Separate from `onboarded` so it can be added to installs that already
    // finished the intro, and so it survives sign-out for the same reason.
    permits: 'v2_permits'
};

export async function saveOwnerSession(token, owner) {
    await AsyncStorage.multiSet([[K.ownerToken, token], [K.ownerData, JSON.stringify(owner || {})]]);
}

export async function saveTenantSession(token, tenant) {
    await AsyncStorage.multiSet([[K.tenantToken, token], [K.tenantData, JSON.stringify(tenant || {})]]);
}

// Replace the stored TOKEN only, leaving the stored user untouched.
//
// Called when the server hands back a renewed token (see the note on renewal in
// api.js). It deliberately does not take a role: at renewal time the app knows which
// token it is holding but has no reason to re-derive whose it is, and asking it to
// would be one more thing to get wrong on a path that runs silently in the background.
// Whichever key already holds a token is the one updated.
//
// Writing the wrong key here would be the worst kind of bug — a session that looks
// fine until the app is next killed, then signs the user out with nothing to connect
// it to — so this reads first and writes only where a token already lives.
export async function saveRenewedToken(token) {
    if (!token) return;
    try {
        const pairs = await AsyncStorage.multiGet([K.ownerToken, K.tenantToken]);
        const map = Object.fromEntries(pairs);
        // Owner takes precedence, matching loadSession above: if both somehow exist,
        // the owner session is the live one and must be the one kept fresh.
        const key = map[K.ownerToken] ? K.ownerToken : map[K.tenantToken] ? K.tenantToken : null;
        if (key) await AsyncStorage.setItem(key, token);
    } catch (e) {
        // Best effort by design. A failed write leaves the user on the token they
        // already have, which still works — it only means they will not get the
        // benefit of this renewal.
    }
}

// Resolve the active session: { role: 'owner'|'tenant'|null, token, user }.
export async function loadSession() {
    const pairs = await AsyncStorage.multiGet([K.ownerToken, K.ownerData, K.tenantToken, K.tenantData]);
    const map = Object.fromEntries(pairs);
    if (map[K.ownerToken]) {
        return { role: 'owner', token: map[K.ownerToken], user: safeParse(map[K.ownerData]) };
    }
    if (map[K.tenantToken]) {
        return { role: 'tenant', token: map[K.tenantToken], user: safeParse(map[K.tenantData]) };
    }
    return { role: null, token: null, user: null };
}

export async function clearSession() {
    await AsyncStorage.multiRemove([
        K.ownerToken, K.ownerData, K.tenantToken, K.tenantData, 'guestId', 'selectedProperty'
    ]);
}

export async function hasOnboarded() {
    try { return (await AsyncStorage.getItem(K.onboarded)) === '1'; } catch (e) { return false; }
}

export async function setOnboarded() {
    try { await AsyncStorage.setItem(K.onboarded, '1'); } catch (e) { /* best effort */ }
}

export async function hasSeenPermits() {
    try { return (await AsyncStorage.getItem(K.permits)) === '1'; } catch (e) { return false; }
}

export async function setPermitsSeen() {
    try { await AsyncStorage.setItem(K.permits, '1'); } catch (e) { /* best effort */ }
}

function safeParse(s) {
    try { return s ? JSON.parse(s) : null; } catch (e) { return null; }
}
