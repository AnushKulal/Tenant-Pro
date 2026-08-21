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
