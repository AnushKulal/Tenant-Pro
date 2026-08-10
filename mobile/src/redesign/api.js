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
    // ── Guests ────────────────────────────────────────────────────────────────
    // Joining with a phone number and a photo of a government ID, no account. The
    // one unauthenticated write in the tenant API: it creates the account, files the
    // document and sends the join request in a single call, and answers with a
    // normal tenant token plus the randomised guest ID. Always FormData — the
    // document is the point of it.
    joinAsGuest: (form) => body(http.post('/tenant-auth/guest', form, MULTIPART)),
    // A guest has no password, so the guest ID and the phone number are the
    // credential. Only useful while the stay lasts: the ID is retired with it.
    guestLogin: (code, phone) => body(http.post('/tenant-auth/guest-login', { code, phone }))
};

// ── Owner ─────────────────────────────────────────────────────────────────────
export const owner = {
    dashboard: (propertyId = 'all') => body(http.get('/owner/dashboard', { params: { property_id: propertyId } })),
    transactions: (propertyId = 'all') => body(http.get('/owner/transactions', { params: { property_id: propertyId } })),
    updateProfile: (form) => body(http.put('/owner/profile', form, MULTIPART)),
    // The maintenance queue: every request the owner's tenants have raised, with
    // the tenant/unit/property joined in so a row can be rendered on its own.
    requests: (propertyId = 'all') => body(http.get('/owner/requests', { params: { property_id: propertyId } })),
    setRequestStatus: (id, status) => body(http.put(`/owner/requests/${id}/status`, { status })),
    requestMessages: (id) => body(http.get(`/owner/requests/${id}/messages`)),
    sendRequestMessage: (id, text) => body(http.post(`/owner/requests/${id}/messages`, { body: text })),
    // People asking to be let into one of this owner's properties.
    joinRequests: (status = 'all') => body(http.get('/owner/join-requests', { params: { status } })),
    decideJoinRequest: (id, decision, unitId) => body(
        http.put(`/owner/join-requests/${id}`, { decision, ...(unitId != null ? { unit_id: unitId } : {}) })
    ),
    // ID proofs. Two read paths because there are two moments a landlord needs to
    // see one: for somebody already their tenant, and for a stranger asking to be.
    tenantDocuments: (tenantId) => body(http.get(`/owner/tenants/${tenantId}/documents`)),
    applicantDocuments: (joinId) => body(http.get(`/owner/join-requests/${joinId}/documents`)),
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
    )
};

// ── Tenant portal (tenant JWT) ────────────────────────────────────────────────
export const portal = {
    me: () => body(http.get('/tenant-portal/me')),
    // Counts and a stamp, polled while the app is open. See `owner.pulse` for why.
    pulse: () => body(http.get('/tenant-portal/pulse')),
    payments: () => body(http.get('/tenant-portal/payments')),
    // "I have paid this." Records a CLAIM, not money received — the landlord confirms
    // it, and only that clears the month. The server validates the amount against the
    // rent, refuses future dates, and allows one outstanding claim at a time.
    declarePayment: ({ amount, method, reference, date }) => body(
        http.post('/tenant-portal/payments', { amount, method, reference, date })
    ),
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
        locality: p.district || p.suburb || '',
        street: [p.housenumber, p.street].filter(Boolean).join(' ')
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
