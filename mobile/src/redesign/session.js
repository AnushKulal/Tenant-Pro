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
    // The refresh token, one per role, alongside the access token it belongs to.
    // Namespaced v2_ because v1 never had one and must not try to read these.
    ownerRefresh: 'v2_ownerRefresh',
    tenantRefresh: 'v2_tenantRefresh',
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

export async function saveOwnerSession(token, owner, refresh) {
    const pairs = [[K.ownerToken, token], [K.ownerData, JSON.stringify(owner || {})]];
    if (refresh) pairs.push([K.ownerRefresh, refresh]);
    await AsyncStorage.multiSet(pairs);
}

export async function saveTenantSession(token, tenant, refresh) {
    const pairs = [[K.tenantToken, token], [K.tenantData, JSON.stringify(tenant || {})]];
    if (refresh) pairs.push([K.tenantRefresh, refresh]);
    await AsyncStorage.multiSet(pairs);
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
// A refreshed PAIR, written together.
//
// Both halves or neither matters more here than anywhere else in this file: a refresh
// token is single-use, so storing a new access token beside a STALE refresh token
// leaves the phone holding one the server has already spent. Presenting that is read
// as theft and ends every session on the account — the feature meant to stop people
// being logged out would log them out.
export async function saveRefreshedPair(token, refresh) {
    if (!token || !refresh) return;
    try {
        const pairs = await AsyncStorage.multiGet([K.ownerToken, K.tenantToken]);
        const map = Object.fromEntries(pairs);
        const isOwner = !!map[K.ownerToken];
        const tokenKey = isOwner ? K.ownerToken : map[K.tenantToken] ? K.tenantToken : null;
        if (!tokenKey) return;
        const refreshKey = isOwner ? K.ownerRefresh : K.tenantRefresh;
        await AsyncStorage.multiSet([[tokenKey, token], [refreshKey, refresh]]);
    } catch (e) {
        // Best effort. The in-memory pair is already swapped, so this session keeps
        // working; what is lost is the refresh surviving the app being killed.
    }
}

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
    const pairs = await AsyncStorage.multiGet([
        K.ownerToken, K.ownerData, K.tenantToken, K.tenantData, K.ownerRefresh, K.tenantRefresh
    ]);
    const map = Object.fromEntries(pairs);
    if (map[K.ownerToken]) {
        return {
            role: 'owner',
            token: map[K.ownerToken],
            // Null for anybody who signed in before refresh tokens existed. Their
            // access token still works until it expires, and the app falls back to the
            // renewal header exactly as it did before — so an existing install is not
            // broken by this, it simply does not gain revocation until the next
            // sign-in.
            refresh: map[K.ownerRefresh] || null,
            user: safeParse(map[K.ownerData])
        };
    }
    if (map[K.tenantToken]) {
        return {
            role: 'tenant',
            token: map[K.tenantToken],
            refresh: map[K.tenantRefresh] || null,
            user: safeParse(map[K.tenantData])
        };
    }
    return { role: null, token: null, refresh: null, user: null };
}

export async function clearSession() {
    await AsyncStorage.multiRemove([
        K.ownerToken, K.ownerData, K.tenantToken, K.tenantData,
        K.ownerRefresh, K.tenantRefresh, 'guestId', 'selectedProperty'
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
