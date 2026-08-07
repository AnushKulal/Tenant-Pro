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
    tenantData: 'tenantData'
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

function safeParse(s) {
    try { return s ? JSON.parse(s) : null; } catch (e) { return null; }
}
