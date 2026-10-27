// File: mobile/src/redesign/api.js
// The redesign's backend service layer — one typed function per endpoint of the
// TenantPro API, grouped by domain. Self-contained (its own axios instance, no
// import of any v1 file) so the flag-gated separation stays clean. The JWT is
// held in memory and attached by a request interceptor; AppContext calls
// setToken() after login / on session load.
//
// Base URL comes from EXPO_PUBLIC_API_URL (mobile/.env), falling back to the
// hosted backend so installed APKs always reach a live server.
import axios from 'axios';

const FALLBACK_URL = 'https://tenantpro-backend.onrender.com';
export const SERVER_URL = process.env.EXPO_PUBLIC_API_URL || FALLBACK_URL;

// Resolve a backend image/file path: absolute (Cloudinary) as-is, relative
// (/uploads/...) prefixed with SERVER_URL. Use everywhere an image URL is shown.
export const mediaUrl = (p) => (!p ? null : (/^https?:\/\//i.test(p) ? p : `${SERVER_URL}${p}`));

const http = axios.create({
    baseURL: `${SERVER_URL}/api`,
    timeout: 60000, // free hosting can cold-start ~50s
    headers: { 'Content-Type': 'application/json' }
});

// In-memory bearer token, set on login / session restore.
let TOKEN = null;
export function setToken(t) { TOKEN = t || null; }
export function getToken() { return TOKEN; }

http.interceptors.request.use((cfg) => {
    if (TOKEN) cfg.headers.Authorization = `Bearer ${TOKEN}`;
    return cfg;
});

// ── An expired session ────────────────────────────────────────────────────────
// Tokens are signed with a 7-day life, so every signed-in user's token dies once a
// week whether or not they did anything wrong. Nothing here noticed: a 401 fell
// through to the same handler as a flaky network, and the app showed "Couldn't load
// your data" above a Try again button that re-sent the same dead token and could
// never succeed. The only way out was a small grey SIGN OUT the user had to spot.
//
// A 401 is not a retryable condition. It means the credential is finished, and the
// app knows it — so it ends the session rather than pretending another attempt
// might help.
let onAuthFailure = null;
export function setOnAuthFailure(fn) { onAuthFailure = typeof fn === 'function' ? fn : null; }

// The sign-in endpoints answer 401 for a WRONG PASSWORD. Signing somebody out for
// mistyping their password on the login screen — which is where they already are —
// would be absurd, so the public auth routes are exempt: their 401 is an answer to a
// question, not an expired credential.
const PUBLIC_AUTH = /\/(auth|tenant-auth)\/(login|register|forgot-password|reset-password|google)/;

// Guarded so a burst of parallel calls — the dashboard fires eleven at once — raises
// one sign-out, not eleven.
let handlingAuthFailure = false;

// ── A session that renews itself ──────────────────────────────────────────────
// Raising the token's life from 7 days to 30 did not stop people being logged out, it
// just made it monthly. A fixed lifetime counts from the last SIGN IN, which says
// nothing about whether somebody is still using the app — so the daily user was being
// thrown out on day 30 exactly like somebody who had not opened it since February.
//
// The server now hands back a fresh token on any authenticated request once the
// current one is past halfway through its life. This stores it, so an active user
// never reaches an expiry at all. The full argument is at the top of
// backend/config/session.js.
//
// `onSessionRenewed` lets AppContext persist it, because a token kept only in memory
// is lost the moment the app is killed — which would leave the phone still holding the
// OLD token on disk and quietly undo the whole mechanism.
let onSessionRenewed = null;
export function setOnSessionRenewed(fn) { onSessionRenewed = typeof fn === 'function' ? fn : null; }

// Header names are case-insensitive per the HTTP spec, and axios lowercases them on
// the way in — but a direct index is one normalisation away from silently reading
// undefined for ever, so both spellings are tried.
const renewedToken = (res) => {
    const h = (res && res.headers) || {};
    const t = h['x-session-token'] || h['X-Session-Token'] || (typeof h.get === 'function' ? h.get('x-session-token') : null);
    return typeof t === 'string' && t.length > 20 ? t : null;
};

const adoptRenewal = (res) => {
    const fresh = renewedToken(res);
    if (!fresh || fresh === TOKEN) return;
    TOKEN = fresh;
    // Persisted outside this module, and never allowed to break the response it rode
    // in on: a failed write means the user keeps the token they already had.
    if (onSessionRenewed) {
        try { onSessionRenewed(fresh); } catch (e) { /* the request still succeeded */ }
    }
};

http.interceptors.response.use(
    (res) => { adoptRenewal(res); return res; },
    (error) => {
        // A renewed token can ride back on an error response too — a 404 or a 409 is
        // still an authenticated request, and dropping the renewal there would make
        // whether your session survives depend on whether your last call happened to
        // succeed.
        if (error && error.response) adoptRenewal(error.response);
        const status = error && error.response && error.response.status;
        const url = (error && error.config && error.config.url) || '';
        if (status === 401 && !PUBLIC_AUTH.test(url) && onAuthFailure && !handlingAuthFailure) {
            handlingAuthFailure = true;
            try { onAuthFailure(); } catch (e) { /* never mask the original error */ }
            // Released on the next tick: the flag exists to collapse one burst, not to
            // stop the NEXT expiry from being noticed.
            setTimeout(() => { handlingAuthFailure = false; }, 0);
        }
        return Promise.reject(error);
    }
);

const body = (p) => p.then((r) => r.data);
const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } };
// FormData is only defined at runtime; guard so this is safe in any environment.
const isForm = (v) => typeof FormData !== 'undefined' && v instanceof FormData;

// ── Auth (public) ─────────────────────────────────────────────────────────────
export const auth = {
    // `mode` is which side of the EMAIL/MOBILE switch the user chose. The server
    // scopes its lookup to that column, so picking MOBILE and typing an email
    // address cannot sign you in. Omitted (older server) → matches either.
    loginOwner: (identifier, password, mode) => body(http.post('/auth/login', { identifier, password, ...(mode ? { mode } : {}) })),
    registerOwner: (payload) => body(http.post('/auth/register', payload)),
    forgotPassword: (payload) => body(http.post('/auth/forgot-password', payload)),
    resetPassword: (payload) => body(http.post('/auth/reset-password', payload)),
    loginTenant: (identifier, password, mode) => body(http.post('/tenant-auth/login', { identifier, password, ...(mode ? { mode } : {}) })),
    registerTenant: (payload) => body(http.post('/tenant-auth/register', payload)),
    // ── Google ────────────────────────────────────────────────────────────────
    // The whole OAuth handshake happens on the server; the app only opens a URL and
    // then asks whether it worked. See backend/config/googleAuth.js for why — the
    // short version is that the in-app alternative needs a native module AND a URL
    // scheme, so it could not reach an installed build over the air.
    //
    // `claim` comes back from start and is the ONLY thing that can collect the
    // result. It is never put in a URL, which is what makes it safe when the state
    // that went to Google is sitting in browser history.
    googleStart: (role) => body(http.post('/auth/google/start', { role })),
    googlePoll: (claim) => body(http.post('/auth/google/poll', { claim })),
    // First-ever Google sign-in: the account does not exist yet and Google has no
    // phone number. Only the number is sent — the email and name are re-read
    // server-side from the verified session, never trusted from here.
    googleComplete: (claim, phone) => body(http.post('/auth/google/complete', { claim, phone }))
};

// ── Owner ─────────────────────────────────────────────────────────────────────
export const owner = {
    dashboard: (propertyId = 'all') => body(http.get('/owner/dashboard', { params: { property_id: propertyId } })),
    transactions: (propertyId = 'all') => body(http.get('/owner/transactions', { params: { property_id: propertyId } })),
    updateProfile: (form) => body(http.put('/owner/profile', form, MULTIPART)),
    // The other half of a profile save. A changed phone number or email address does
    // not land on the account when it is typed — both are sign-in identifiers, so the
    // server sends a code to the new value and only moves it when this confirms.
    verifyProfile: (channel, code) => body(http.put('/owner/profile/verify', { channel, code })),
    // The maintenance queue: every request the owner's tenants have raised, with
    // the tenant/unit/property joined in so a row can be rendered on its own.
    requests: (propertyId = 'all') => body(http.get('/owner/requests', { params: { property_id: propertyId } })),
    setRequestStatus: (id, status) => body(http.put(`/owner/requests/${id}/status`, { status })),
    requestMessages: (id) => body(http.get(`/owner/requests/${id}/messages`)),
    sendRequestMessage: (id, text) => body(http.post(`/owner/requests/${id}/messages`, { body: text })),
    // People asking to be let into one of this owner's properties.
    joinRequests: (status = 'all') => body(http.get('/owner/join-requests', { params: { status } })),
    decideJoinRequest: (id, decision, unitId, stayUntil = null) => body(
        http.put(`/owner/join-requests/${id}`, {
            decision,
            ...(unitId != null ? { unit_id: unitId } : {}),
            // Only sent on an accept, and only when there is one: the endpoint treats a
            // missing value as open-ended, and sending null on a reject would read like
            // the rejection had dates.
            ...(decision === 'accept' && stayUntil ? { stay_until: stayUntil } : {})
        })
    ),
    // Move a guest's end date. Sending null clears it, which is open-ended again.
    updateStay: (tenantId, stayUntil) => body(
        http.put(`/tenants/${tenantId}/stay`, { stay_until: stayUntil })
    ),
    // ID proofs. Two read paths because there are two moments a landlord needs to
    // see one: for somebody already their tenant, and for a stranger asking to be.
    tenantDocuments: (tenantId) => body(http.get(`/owner/tenants/${tenantId}/documents`)),
    applicantDocuments: (joinId) => body(http.get(`/owner/join-requests/${joinId}/documents`)),
    // Ask for an ID that is not there yet, and withdraw the ask. Scoped by tenant
    // rather than by portal account: the landlord is asking a person, and one they
    // typed in by hand can be asked before they have ever opened the app.
    requestId: (tenantId, payload) => body(http.post(`/owner/tenants/${tenantId}/id-request`, payload || {})),
    // This device, so a join request or a declared payment reaches the landlord without
    // them having to open the app and look.
    savePushToken: (payload) => body(http.post('/owner/push-token', payload)),
    dropPushToken: (token) => body(http.delete('/owner/push-token', { data: { token } })),
    // "Did that actually arrive?" — with no number it goes to this landlord's own
    // devices; with one it may reach them or one of their own tenants, and nobody else.
    // The server decides that, not the app.
    testPush: (phone) => body(http.post('/owner/push-test', phone ? { phone } : {})),
    cancelIdRequest: (tenantId) => body(http.delete(`/owner/tenants/${tenantId}/id-request`)),
    decideDocument: (id, decision, note) => body(
        http.put(`/owner/documents/${id}`, { decision, ...(note ? { note } : {}) })
    ),
    // The demo account. `demoStatus` answers for every landlord — `is_demo` is how the
    // app knows whether to offer the reset at all, so a real customer is never shown a
    // button that deletes their data. The server refuses the reset for anyone else too.
    // What has changed since we last looked. Deliberately tiny (~94 bytes vs 1.4kB
    // for the dashboard) because it is polled every few seconds on someone's mobile
    // data; the caller reloads the real data only when `stamp` differs.
    pulse: () => body(http.get('/owner/pulse')),
    demoStatus: () => body(http.get('/owner/demo')),
    resetDemo: () => body(http.post('/owner/demo/reset'))
};

export const properties = {
    list: () => body(http.get('/properties')),
    add: (form) => body(http.post('/properties', form, MULTIPART)),
    update: (id, form) => body(http.put(`/properties/${id}`, form, MULTIPART)),
    remove: (id) => body(http.delete(`/properties/${id}`))
};

export const units = {
    list: (propertyId = 'all') => body(http.get('/units', { params: { property_id: propertyId } })),
    available: () => body(http.get('/units/available')),
    add: (form) => body(http.post('/units', form, MULTIPART)),
    update: (id, form) => body(http.put(`/units/${id}`, form, MULTIPART)),
    remove: (id) => body(http.delete(`/units/${id}`)),
    settings: (id, payload) => body(http.put(`/units/${id}/settings`, payload))
};

export const tenants = {
    list: () => body(http.get('/tenants')),
    byUnit: (unitId) => body(http.get(`/tenants/unit/${unitId}`)),
    unassigned: () => body(http.get('/tenants/unassigned')),
    add: (form) => body(http.post('/tenants', form, MULTIPART)),
    update: (id, form) => body(http.put(`/tenants/${id}`, form, MULTIPART)),
    assign: (payload) => body(http.put('/tenants/assign', payload)),
    assignToRoom: (id, unitId) => body(http.put(`/tenants/${id}/assign`, { unit_id: unitId })),
    moveOut: (id) => body(http.put(`/tenants/${id}/move-out`)),
    remove: (id) => body(http.delete(`/tenants/${id}`)),
    financials: (id, payload) => body(http.put(`/tenants/${id}/financials`, payload))
};

export const payments = {
    getSettings: () => body(http.get('/payments/settings')),
    saveSettings: (form) => body(http.post('/payments/settings', form, MULTIPART)),
    record: (tenantId, payload) => body(http.post(`/payments/${tenantId}/payments`, payload)),
    // Payments a tenant SAYS they made, waiting on the landlord. Until this was
    // wired the tenant end existed and the landlord end did not: someone could
    // declare a payment and nobody could act on it, so the claim sat in the table
    // for ever and the tenant's month never cleared.
    declared: () => body(http.get('/payments/declared')),
    // Confirming is the moment the money becomes real — it counts toward every
    // total AND advances next_rent_due, which is what clears the month. Rejecting
    // keeps the row so the tenant can see it was refused and why, rather than
    // watching their claim silently disappear.
    decide: (id, decision, note) => body(
        http.put(`/payments/declared/${id}`, { decision, ...(note ? { note } : {}) })
    ),
    // ── The landlord's OWN payment gateway ────────────────────────────────────
    // Connecting one lets tenants pay by card, netbanking or a UPI app that
    // confirms itself. The merchant account is the landlord's, so the money goes
    // straight to them and the gateway's fee is charged by their gateway to them —
    // this app never holds anybody's rent and bills nobody.
    //
    // The secret goes UP and never comes back down. `getSettings` returns only
    // whether a gateway is connected and the last four of the (public) Key ID, so
    // there is nothing here to read it back with.
    connectGateway: ({ provider, key_id, key_secret }) => body(
        http.post('/payments/gateway', { provider, key_id, key_secret })
    ),
    // Pausing without surrendering the keys — for a gateway between KYC states, or a
    // month the landlord would simply rather be paid by UPI.
    setGatewayEnabled: (enabled) => body(http.put('/payments/gateway', { enabled })),
    disconnectGateway: () => body(http.delete('/payments/gateway'))
};

// ── Tenant portal (tenant JWT) ────────────────────────────────────────────────
export const portal = {
    me: () => body(http.get('/tenant-portal/me')),
    // Counts and a stamp, polled while the app is open. See `owner.pulse` for why.
    pulse: () => body(http.get('/tenant-portal/pulse')),
    payments: () => body(http.get('/tenant-portal/payments')),
    // Clearing the bell. Takes no timestamp on purpose — the server stamps NOW(), so a
    // phone with a wrong clock (or a curious one) cannot silence its own alerts by
    // claiming to have read them in the year 3000.
    markAlertsSeen: () => body(http.post('/tenant-portal/alerts/seen', {})),
    // "I have paid this." Records a CLAIM, not money received — the landlord confirms
    // it, and only that clears the month. The server validates the amount against the
    // rent, refuses future dates, and allows one outstanding claim at a time.
    declarePayment: ({ amount, method, reference, date }) => body(
        http.post('/tenant-portal/payments', { amount, method, reference, date })
    ),
    // ── Paying online, through the landlord's own gateway ─────────────────────
    // Only offered when `me.payment.online.available` is true. Returns an https url
    // for the gateway's hosted page, opened with Linking — no native SDK, which is
    // what lets this ship over the air like everything else here.
    //
    // Calling it twice hands back the SAME link rather than a second live one, so a
    // tenant who closes the browser and taps Pay again cannot end up with two valid
    // pages for one month's rent.
    startOnlinePayment: (amount) => body(http.post('/tenant-portal/payments/online', { amount })),
    // "Did that go through?" — answered by the server ASKING the gateway, never by
    // this app's word, which is why it is safe to call eagerly and repeatedly.
    checkOnlinePayment: (id) => body(http.post(`/tenant-portal/payments/${id}/check`, {})),
    // ── Leaving a property ────────────────────────────────────────────────────
    // Three calls, because giving notice is a decision. `leavePlan` is what the
    // confirmation sheet prints — the real dates and disclosures, computed on the
    // server. The old button had neither a preview nor a write: it flashed "You have
    // left this property" and changed nothing.
    leavePlan: () => body(http.get('/tenant-portal/leave')),
    giveNotice: () => body(http.post('/tenant-portal/leave')),
    // Withdrawable while the tenancy is still live.
    withdrawNotice: () => body(http.delete('/tenant-portal/leave')),
    requests: () => body(http.get('/tenant-portal/requests')),
    // Accepts either a plain object or a FormData carrying `request_image`; axios
    // needs the multipart header set explicitly for the latter.
    createRequest: (payload) => body(
        http.post('/tenant-portal/requests', payload, isForm(payload) ? MULTIPART : undefined)
    ),
    requestMessages: (id) => body(http.get(`/tenant-portal/requests/${id}/messages`)),
    sendRequestMessage: (id, text) => body(http.post(`/tenant-portal/requests/${id}/messages`, { body: text })),
    // Ask a landlord to be let into a property, by its code, and see the answer.
    // Resolve a scanned/typed invite code to the property it belongs to. Lookup by
    // code only — there is no browse-all endpoint, by design.
    lookupProperty: (code) => body(http.get('/tenant-portal/property-lookup', { params: { code } })),
    joinRequests: () => body(http.get('/tenant-portal/join-requests')),
    // Registered above the live-stay guard on the server, because the notification a
    // new tenant most needs — "you're in" — fires while they have no tenancy yet.
    savePushToken: (payload) => body(http.post('/tenant-portal/push-token', payload)),
    dropPushToken: (token) => body(http.delete('/tenant-portal/push-token', { data: { token } })),
    // A tenant's test can only ever reach their own devices — the server ignores any
    // number they send, which is why this takes none.
    testPush: () => body(http.post('/tenant-portal/push-test', {})),
    requestJoin: (payload) => body(http.post('/tenant-portal/join-requests', payload)),
    // The tenant's own ID proofs. `addDocument` always carries a file, so it is
    // always multipart.
    documents: () => body(http.get('/tenant-portal/documents')),
    addDocument: (form) => body(http.post('/tenant-portal/documents', form, MULTIPART)),
    removeDocument: (id) => body(http.delete(`/tenant-portal/documents/${id}`)),
    // Turn a guest into a full account: a real name in the landlord's roster, and an
    // email and password so this identity outlives the current stay. Answers with a
    // fresh token, because the guest one carries no email in its payload.
    claimAccount: ({ name, email, password }) => body(
        http.post('/tenant-portal/claim-account', { name, email, password })
    )
};

// ── Places (open, keyless) ────────────────────────────────────────────────────
// Turning what a landlord types into a coordinate, and a dropped pin back into an
// address. Both go to Photon, which is Komoot's open geocoder over OpenStreetMap
// data: no key, no account, and — unlike Nominatim, the other obvious choice — its
// usage terms do not put distributed apps in a grey area.
//
// Deliberately NOT on `http`: that instance has our API's baseURL and attaches the
// user's bearer token to every request. Sending a TenantPro token to a third party
// because the axios instance happened to be in scope is exactly the kind of leak
// that never gets noticed. This uses bare fetch to a fully-qualified URL.
const PHOTON = 'https://photon.komoot.io';

// Photon returns GeoJSON; this is the shape the app wants. A result's name is
// assembled from whichever parts exist, because a house has a housenumber and a
// locality has none.
const asPlace = (f) => {
    const p = (f && f.properties) || {};
    const coords = (f && f.geometry && f.geometry.coordinates) || [];
    const line1 = [p.name, p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street]
        .filter(Boolean).join(', ');
    const line2 = [p.district, p.city || p.town || p.village, p.state].filter(Boolean).join(', ');
    return {
        // Photon has no stable id across queries; the coordinate pair is unique
        // enough to key a list by.
        id: `${coords[1]},${coords[0]}`,
        lat: coords[1],
        lon: coords[0],
        title: line1 || p.city || p.name || 'Unnamed place',
        subtitle: [line2, p.postcode, p.country].filter(Boolean).join(' · '),
        postcode: p.postcode || '',
        city: p.city || p.town || p.village || '',
        locality: p.district || p.suburb || p.locality || p.neighbourhood || '',
        street: [p.housenumber, p.street].filter(Boolean).join(' '),
        // The name of the thing itself — a road, a landmark, a building. `title`
        // above has always used it; the STRUCTURED fields did not, and those are
        // what the property form reads. Reverse-geocoding a pin dropped in an
        // Indian city almost always resolves to a road or a POI, which comes back
        // as name: "Walton Road" with no `street` key at all — so the form's
        // address box received an empty string, kept whatever was in it, and looked
        // like it had ignored the pin, while the screen directly above it had been
        // showing the road name the whole time.
        //
        // Kept separate from `street` rather than folded into it: a landmark name is
        // not a street, and the caller should decide which it prefers instead of
        // having one silently arrive dressed as the other.
        label: p.name || ''
    };
};

export const places = {
    // `near` biases results towards a point, which is what makes "MG Road" return
    // the one in this city rather than one four states away.
    search: async (q, near) => {
        const text = String(q || '').trim();
        if (text.length < 3) return [];
        const params = new URLSearchParams({ q: text, limit: '6', lang: 'en' });
        if (near && Number.isFinite(near.lat) && Number.isFinite(near.lon)) {
            params.set('lat', String(near.lat));
            params.set('lon', String(near.lon));
        }
        const res = await fetch(`${PHOTON}/api/?${params.toString()}`);
        if (!res.ok) throw new Error(`Search failed (${res.status})`);
        const data = await res.json();
        return (data.features || []).map(asPlace);
    },
    // A pin back into an address, so dropping one can fill the form in.
    reverse: async (lat, lon) => {
        const params = new URLSearchParams({ lat: String(lat), lon: String(lon), lang: 'en' });
        const res = await fetch(`${PHOTON}/reverse?${params.toString()}`);
        if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
        const data = await res.json();
        const f = (data.features || [])[0];
        return f ? asPlace(f) : null;
    }
};

export default http;
