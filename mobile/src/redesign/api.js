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
    loginOwner: (identifier, password) => body(http.post('/auth/login', { identifier, password })),
    registerOwner: (payload) => body(http.post('/auth/register', payload)),
    forgotPassword: (payload) => body(http.post('/auth/forgot-password', payload)),
    resetPassword: (payload) => body(http.post('/auth/reset-password', payload)),
    loginTenant: (identifier, password) => body(http.post('/tenant-auth/login', { identifier, password })),
    registerTenant: (payload) => body(http.post('/tenant-auth/register', payload))
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
    sendRequestMessage: (id, text) => body(http.post(`/owner/requests/${id}/messages`, { body: text }))
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
    record: (tenantId, payload) => body(http.post(`/payments/${tenantId}/payments`, payload))
};

// ── Tenant portal (tenant JWT) ────────────────────────────────────────────────
export const portal = {
    me: () => body(http.get('/tenant-portal/me')),
    payments: () => body(http.get('/tenant-portal/payments')),
    requests: () => body(http.get('/tenant-portal/requests')),
    // Accepts either a plain object or a FormData carrying `request_image`; axios
    // needs the multipart header set explicitly for the latter.
    createRequest: (payload) => body(
        http.post('/tenant-portal/requests', payload, isForm(payload) ? MULTIPART : undefined)
    ),
    requestMessages: (id) => body(http.get(`/tenant-portal/requests/${id}/messages`)),
    sendRequestMessage: (id, text) => body(http.post(`/tenant-portal/requests/${id}/messages`, { body: text }))
};

export default http;
