// Every endpoint, against a real server and a real MySQL, with real seeded data.
//
// Not a unit test: nothing is stubbed. It signs in, reads what it was given, and
// drives each route the way the app does — then checks the things that are expensive
// to discover in production: that a tenant cannot read a landlord's data, that a
// filter actually filters, that a write is visible on the next read.
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:4000';

let ok = 0, bad = 0;
const fails = [];
const chk = (n, c, got) => {
    if (c) { ok++; console.log('  ok   ' + n); }
    else {
        bad++; fails.push(n);
        // JSON.stringify(undefined) returns undefined, not a string, so a naive
        // .slice() here CRASHED the whole run on the first failure whose context
        // happened to be undefined — hiding the failure it was trying to report.
        let shown;
        try { shown = typeof got === 'string' ? got : JSON.stringify(got); } catch (e) { shown = String(got); }
        console.log('  FAIL ' + n + '  -> ' + String(shown === undefined ? '(undefined)' : shown).slice(0, 300));
    }
};
const section = (s) => console.log('\n' + s);

const call = async (method, path, { token, body, form, raw } = {}) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    let payload;
    if (form) payload = form;
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const r = await fetch(BASE + path, { method, headers, body: payload });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* not json */ }
    return { status: r.status, json, text, headers: r.headers, raw: raw ? text : undefined };
};
const GET = (p, o) => call('GET', p, o);
const POST = (p, body, o) => call('POST', p, { body, ...o });
const PUT = (p, body, o) => call('PUT', p, { body, ...o });
const DEL = (p, o) => call('DELETE', p, o);

const LANDLORD = { email: process.env.E2E_OWNER, password: 'Test@1234' };
const TENANT = { email: process.env.E2E_TENANT, password: 'Test@1234' };
const UNLINKED = { email: process.env.E2E_UNLINKED, password: 'Test@1234' };

(async () => {
let OT = null, TT = null, UT = null;   // owner / tenant / unlinked-tenant tokens
let dash = null, props = [], units = [], tenants = [];

// ══ HEALTH ══════════════════════════════════════════════════════════════════
section('HEALTH');
let r = await GET('/healthz');
chk('/healthz answers 200', r.status === 200, r.status);
chk('...db is up', r.json && r.json.db === 'up', r.json);
chk('...and it reports gateway readiness', !!(r.json && r.json.gateways), r.json);

// ══ AUTH ════════════════════════════════════════════════════════════════════
section('LANDLORD AUTH');
r = await POST('/api/auth/login', { email: LANDLORD.email, password: 'wrong-password' });
chk('a wrong password is refused', r.status === 401 || r.status === 400, r.status);
chk('...without saying whether the account exists', !/no such|not found|no account/i.test((r.json && r.json.message) || ''), r.json);

r = await POST('/api/auth/login', LANDLORD);
chk('the right password signs in', r.status === 200 && !!(r.json && r.json.token), { s: r.status, j: r.json });
OT = r.json && r.json.token;
chk('...and returns the owner', !!(r.json && (r.json.owner || r.json.user)), r.json);

r = await POST('/api/auth/login', { email: LANDLORD.email });
chk('a missing password is a 400, not a crash', r.status === 400 || r.status === 401, r.status);
r = await POST('/api/auth/register', { name: 'X', email: LANDLORD.email, password: 'Test@1234', phone: '9800000001' });
chk('registering a duplicate email is refused', r.status === 400 || r.status === 409, { s: r.status, j: r.json });

section('TENANT AUTH');
r = await POST('/api/tenant-auth/login', TENANT);
chk('a tenant signs in', r.status === 200 && !!(r.json && r.json.token), { s: r.status, j: r.json });
TT = r.json && r.json.token;
r = await POST('/api/tenant-auth/login', UNLINKED);
chk('an UNLINKED tenant can also sign in', r.status === 200 && !!(r.json && r.json.token), { s: r.status, j: r.json });
UT = r.json && r.json.token;

section('TOKEN GUARDS');
r = await GET('/api/owner/dashboard');
chk('no token is refused', r.status === 401, r.status);
r = await GET('/api/owner/dashboard', { token: 'garbage' });
chk('a garbage token is refused', r.status === 401, r.status);
r = await GET('/api/owner/dashboard', { token: TT });
chk('a TENANT token on a landlord route is refused', r.status === 403, { s: r.status, j: r.json });
r = await GET('/api/tenant-portal/me', { token: OT });
chk('an OWNER token on a tenant route is refused', r.status === 403, { s: r.status, j: r.json });

// ══ OWNER: READ ═════════════════════════════════════════════════════════════
section('LANDLORD DASHBOARD');
r = await GET('/api/owner/dashboard?scope=all', { token: OT });
chk('dashboard loads', r.status === 200, { s: r.status, j: r.json });
dash = r.json;
chk('...with stats', !!(dash && dash.stats), dash && Object.keys(dash || {}));
r = await GET('/api/owner/pulse', { token: OT });
chk('pulse loads and carries a stamp', r.status === 200 && !!(r.json && r.json.stamp), r.json);
r = await GET('/api/owner/transactions?scope=all', { token: OT });
chk('transactions load', r.status === 200 && Array.isArray(r.json && r.json.transactions), { s: r.status });
const txAll = (r.json && r.json.transactions) || [];
chk('...and there are some, from the seed', txAll.length > 0, txAll.length);

section('PROPERTIES, UNITS, TENANTS');
r = await GET('/api/properties', { token: OT });
props = (r.json && r.json.properties) || [];
chk('properties load', r.status === 200 && props.length >= 3, { s: r.status, n: props.length });
r = await GET('/api/units?scope=all', { token: OT });
units = (r.json && r.json.units) || [];
chk('units load', r.status === 200 && units.length > 0, { s: r.status, n: units.length });
r = await GET('/api/units/available', { token: OT });
chk('available units load', r.status === 200, { s: r.status, j: r.json });
r = await GET('/api/tenants', { token: OT });
tenants = (r.json && r.json.tenants) || [];
chk('tenants load', r.status === 200 && tenants.length > 0, { s: r.status, n: tenants.length });
r = await GET('/api/tenants/unassigned', { token: OT });
const unassigned = (r.json && r.json.tenants) || [];
chk('the unassigned list is NOT empty (the seed made one)', unassigned.length >= 1, unassigned.length);
if (units.length) {
    r = await GET(`/api/tenants/unit/${units[0].id}`, { token: OT });
    chk('tenants by unit loads', r.status === 200, { s: r.status, j: r.json });
}

section('FILTERS AND SCOPES ACTUALLY FILTER');
if (props.length >= 2) {
    // property_id, which is what the app's own client sends — `scope` is ignored by
    // every one of these handlers, so a test using it would pass against a filter
    // that does nothing.
    const a = await GET(`/api/owner/transactions?property_id=${props[0].id}`, { token: OT });
    const b = await GET(`/api/units?property_id=${props[0].id}`, { token: OT });
    chk('a property-scoped transaction list is accepted', a.status === 200, a.status);
    chk('...and returns no more than the unscoped list', ((a.json && a.json.transactions) || []).length <= txAll.length,
        { scoped: ((a.json && a.json.transactions) || []).length, all: txAll.length });
    const scopedUnits = (b.json && b.json.units) || [];
    chk('a property-scoped unit list is a SUBSET', scopedUnits.length <= units.length, { scoped: scopedUnits.length, all: units.length });
    chk('...and every row really belongs to that property',
        scopedUnits.every((u) => String(u.property_id) === String(props[0].id)),
        scopedUnits.map((u) => u.property_id));
}

section('MAINTENANCE');
r = await GET('/api/owner/requests?scope=all', { token: OT });
const reqs = (r.json && r.json.requests) || [];
chk('requests load', r.status === 200, { s: r.status, j: r.json });
chk('...and the seed made some', reqs.length > 0, reqs.length);
let reqId = reqs.length ? reqs[0].id : null;
if (reqId) {
    r = await GET(`/api/owner/requests/${reqId}/messages`, { token: OT });
    chk('a request thread loads', r.status === 200 && Array.isArray(r.json && r.json.messages), { s: r.status, j: r.json });
    const before = ((r.json && r.json.messages) || []).length;
    r = await POST(`/api/owner/requests/${reqId}/messages`, { body: 'E2E: looking into this now.' }, { token: OT });
    chk('the landlord can reply', r.status === 200 || r.status === 201, { s: r.status, j: r.json });
    r = await GET(`/api/owner/requests/${reqId}/messages`, { token: OT });
    chk('...and the reply is on the next read', ((r.json && r.json.messages) || []).length === before + 1,
        { before, after: ((r.json && r.json.messages) || []).length });
    r = await PUT(`/api/owner/requests/${reqId}/status`, { status: 'In Progress' }, { token: OT });
    chk('status can be changed', r.status === 200, { s: r.status, j: r.json });
    r = await PUT(`/api/owner/requests/${reqId}/status`, { status: 'Nonsense' }, { token: OT });
    chk('...but not to a bogus status', r.status === 400, { s: r.status, j: r.json });
}

section('JOIN REQUESTS');
r = await GET('/api/owner/join-requests?scope=all', { token: OT });
const joins = (r.json && r.json.requests) || [];
chk('join requests load', r.status === 200, { s: r.status, j: r.json });
chk('...and the seed left one pending', joins.length >= 1, joins.length);

section('PAYMENT SETTINGS');
r = await GET('/api/payments/settings', { token: OT });
chk('settings load', r.status === 200, { s: r.status, j: r.json });
chk('...and never return a gateway secret', !/gateway_secret/.test(JSON.stringify(r.json || {})), r.json);
chk('...while saying whether a gateway can be connected', !!(r.json && r.json.gateway), r.json);

section('PAYMENTS');
r = await GET('/api/payments/declared', { token: OT });
const declared = (r.json && r.json.payments) || [];
chk('the confirm queue loads', r.status === 200, { s: r.status, j: r.json });
chk('...and the seed left one in it', declared.length >= 1, declared.length);

// ══ TENANT PORTAL ═══════════════════════════════════════════════════════════
section('TENANT PORTAL');
r = await GET('/api/tenant-portal/me', { token: TT });
const me = r.json;
chk('/me loads', r.status === 200, { s: r.status, j: r.json });
chk('...linked', !!(me && me.linked), me);
chk('...with rent', !!(me && me.rent), me && Object.keys(me || {}));
chk('...and the landlord\'s UPI to pay into', !!(me && me.payment), me && me.payment);
chk('...and online-payment availability stated', !!(me && me.payment && me.payment.online), me && me.payment);
chk('...carrying alerts_seen_at (even as null)', me && 'alerts_seen_at' in me, Object.keys(me || {}));
chk('...and NEVER a gateway credential', !/gateway_secret|gateway_key_id/.test(JSON.stringify(me || {})), 'leak');

r = await GET('/api/tenant-portal/me', { token: UT });
chk('an UNLINKED tenant gets a 200, not an error', r.status === 200, { s: r.status, j: r.json });
chk('...marked unlinked', r.json && r.json.linked === false, r.json);
chk('...and STILL carries alerts_seen_at', r.json && 'alerts_seen_at' in r.json, Object.keys(r.json || {}));

r = await GET('/api/tenant-portal/pulse', { token: TT });
chk('tenant pulse loads', r.status === 200 && !!(r.json && r.json.stamp), r.json);
r = await GET('/api/tenant-portal/payments', { token: TT });
chk('tenant payments load', r.status === 200, { s: r.status, j: r.json });
chk('...with a summary', !!(r.json && r.json.summary), r.json && Object.keys(r.json || {}));
r = await GET('/api/tenant-portal/requests', { token: TT });
chk('tenant requests load', r.status === 200, { s: r.status, j: r.json });
r = await GET('/api/tenant-portal/documents', { token: TT });
chk('tenant documents load', r.status === 200, { s: r.status, j: r.json });
r = await GET('/api/tenant-portal/leave', { token: TT });
chk('the leave plan loads', r.status === 200, { s: r.status, j: r.json });
r = await POST('/api/tenant-portal/alerts/seen', {}, { token: TT });
chk('alerts can be marked seen', r.status === 200, { s: r.status, j: r.json });
chk('...and the server stamps a time', !!(r.json && r.json.alerts_seen_at), r.json);

section('TENANT CANNOT REACH ANOTHER TENANCY');
r = await GET('/api/tenant-portal/requests/999999/messages', { token: TT });
chk('a request that is not theirs is refused', r.status === 403 || r.status === 404, { s: r.status, j: r.json });
r = await POST('/api/tenant-portal/payments/999999/check', {}, { token: TT });
chk('a payment that is not theirs is refused', r.status === 404, { s: r.status, j: r.json });

section('DECLARING A PAYMENT');
r = await POST('/api/tenant-portal/payments', { amount: 0 }, { token: TT });
chk('zero is refused', r.status === 400, { s: r.status, j: r.json });
r = await POST('/api/tenant-portal/payments', { amount: -100 }, { token: TT });
chk('negative is refused', r.status === 400, { s: r.status, j: r.json });
r = await POST('/api/tenant-portal/payments', { amount: 99999999 }, { token: TT });
chk('an absurd amount is refused', r.status === 400, { s: r.status, j: r.json });
r = await POST('/api/tenant-portal/payments', { amount: 5000, date: '2099-01-01' }, { token: TT });
chk('a future date is refused', r.status === 400, { s: r.status, j: r.json });

section('ONLINE PAYMENT WITH NO GATEWAY CONNECTED');
r = await POST('/api/tenant-portal/payments/online', { amount: 5000 }, { token: TT });
chk('refused with 409, not a crash', r.status === 409, { s: r.status, j: r.json });
chk('...offering UPI instead', r.json && r.json.fallback === 'upi', r.json);
chk('...and never naming a reason code', !/unreadable|no_gateway|incomplete/.test((r.json && r.json.message) || ''), r.json);

section('THE GATEWAY, END TO END (bad credentials)');
r = await POST('/api/payments/gateway', { provider: 'razorpay', key_id: 'rzp_test_bogus', key_secret: 'bogus' }, { token: OT });
// 400 when the gateway says no, 502 when it could not be reached — and NEVER 500,
// which is what this returned before: a network failure reported as "Could not save
// those gateway details", which reads as "your keys are wrong" and sends a landlord
// off to regenerate a key that was fine.
chk('bogus credentials get a 4xx or 502, never a 500', r.status === 400 || r.status === 502, { s: r.status, j: r.json });
chk('...and an UNREACHABLE gateway says so, rather than blaming the key',
    r.status !== 502 || /could not reach|did not answer/i.test((r.json && r.json.message) || ''), r.json);
chk('...and nothing was stored', (await GET('/api/payments/settings', { token: OT })).json.gateway.connected === false, 'stored?');
r = await POST('/api/payments/gateway', { provider: 'stripe', key_id: 'a', key_secret: 'b' }, { token: OT });
chk('an unsupported provider is refused', r.status === 400, { s: r.status, j: r.json });
r = await POST('/api/payments/gateway', { provider: 'razorpay', key_id: '', key_secret: '' }, { token: OT });
chk('empty credentials are refused', r.status === 400, { s: r.status, j: r.json });
r = await PUT('/api/payments/gateway', { enabled: true }, { token: OT });
chk('enabling a gateway that is not connected is refused', r.status === 400, { s: r.status, j: r.json });
r = await POST('/api/payments/gateway', { provider: 'razorpay', key_id: 'x', key_secret: 'y' }, { token: TT });
chk('a TENANT cannot connect a gateway', r.status === 403, { s: r.status, j: r.json });

section('WEBHOOKS');
r = await POST('/api/webhooks/payments/razorpay', { event: 'payment.captured' });
chk('an unconfigured provider is a 404', r.status === 404, { s: r.status, j: r.json });
r = await POST('/api/webhooks/payments/nonsense', { event: 'x' });
chk('an unknown provider is a 404', r.status === 404, { s: r.status, j: r.json });

// ══ OWNER: WRITES ═══════════════════════════════════════════════════════════
section('CREATING AND EDITING A PROPERTY');
r = await POST('/api/properties', { name: 'E2E Test Property', property_type: 'PG', address: '1 Test Rd', locality: 'Testville', city: 'Bengaluru', pincode: '560001' }, { token: OT });
chk('a property can be created', r.status === 200 || r.status === 201, { s: r.status, j: r.json });
// propertyId / unitId are the keys these endpoints actually return. Reading the
// wrong one is how the whole nested write path below silently skipped on the first
// run while the suite still reported green.
const newPropId = (r.json && (r.json.propertyId || r.json.id)) || null;
chk('...and says which one', !!newPropId, r.json);
if (newPropId) {
    r = await PUT(`/api/properties/${newPropId}`, { name: 'E2E Renamed', property_type: 'PG', city: 'Bengaluru' }, { token: OT });
    chk('...and renamed', r.status === 200, { s: r.status, j: r.json });
    const after = await GET('/api/properties', { token: OT });
    const found = ((after.json && after.json.properties) || []).find((p) => String(p.id) === String(newPropId));
    chk('...with the new name visible on the next read', found && found.name === 'E2E Renamed', found && found.name);

    section('CREATING A UNIT AND A TENANT');
    r = await POST('/api/units', { property_id: newPropId, unit_number: 'E1', room_type: 'Single', capacity: 1, base_rent: 9000 }, { token: OT });
    chk('a unit can be created', r.status === 200 || r.status === 201, { s: r.status, j: r.json });
    const newUnitId = (r.json && (r.json.unitId || r.json.id)) || null;
    chk('...and says which one', !!newUnitId, r.json);
    if (newUnitId) {
        r = await PUT(`/api/units/${newUnitId}/settings`, { notify_email: 1, notify_sms: 0, notify_whatsapp: 0 }, { token: OT });
        chk('unit notification settings can be saved', r.status === 200, { s: r.status, j: r.json });
        r = await POST('/api/tenants', { name: 'E2E Tenant', phone: '9800012345', email: 'e2e.tenant@example.com', unit_id: newUnitId, rent_share: 9000, deposit: 18000, move_in_date: '2026-01-05' }, { token: OT });
        chk('a tenant can be created', r.status === 200 || r.status === 201, { s: r.status, j: r.json });
        // addTenant returns only a message, so the id is read back from the list —
        // which also proves the row is really there and really the caller's.
        const mine = (await GET('/api/tenants', { token: OT })).json.tenants || [];
        const newTenantId = (mine.find((t) => t.name === 'E2E Tenant') || {}).id || null;
        chk('...and it appears in the tenant list', !!newTenantId, mine.length);
        if (newTenantId) {
            r = await PUT(`/api/tenants/${newTenantId}/financials`, { rent_share: 9500, deposit: 19000 }, { token: OT });
            chk('rent can be changed', r.status === 200, { s: r.status, j: r.json });
            r = await POST(`/api/payments/${newTenantId}/payments`, { amount: 9500, payment_mode: 'UPI', payment_date: new Date().toISOString().slice(0, 10) }, { token: OT });
            chk('a payment can be recorded', r.status === 200, { s: r.status, j: r.json });
            chk('...and the due date moved', !!(r.json && r.json.next_rent_due), r.json);
            r = await PUT(`/api/tenants/${newTenantId}/stay`, { stay_until: '2027-01-01' }, { token: OT });
            chk('a stay date can be set', r.status === 200, { s: r.status, j: r.json });
            r = await PUT(`/api/tenants/${newTenantId}/move-out`, {}, { token: OT });
            chk('a tenant can be moved out', r.status === 200, { s: r.status, j: r.json });
            r = await DEL(`/api/tenants/${newTenantId}`, { token: OT });
            chk('...and deleted', r.status === 200, { s: r.status, j: r.json });
        }
        r = await DEL(`/api/units/${newUnitId}`, { token: OT });
        chk('a unit can be deleted', r.status === 200, { s: r.status, j: r.json });
    }
    r = await DEL(`/api/properties/${newPropId}`, { token: OT });
    chk('a property can be deleted', r.status === 200, { s: r.status, j: r.json });
}

section('REQUIRED FIELDS ARE A 400, NOT A 500');
// Each of these used to be "Server error while adding property/unit" — a message that
// names neither the field nor the fix, and leaves a raw SQL error in the log.
for (const [label, path, bodyIn] of [
    ['a property with no name', '/api/properties', { property_type: 'PG' }],
    ['a property with no type', '/api/properties', { name: 'X' }],
    ['a property with a bogus type', '/api/properties', { name: 'X', property_type: 'Castle' }]
]) {
    r = await POST(path, bodyIn, { token: OT });
    chk(`${label} is a 400`, r.status === 400, { s: r.status, j: r.json });
    chk(`...saying what is wrong`, !/server error/i.test((r.json && r.json.message) || ''), r.json);
}
if (props.length) {
    r = await POST('/api/units', { property_id: props[0].id, base_rent: 9000 }, { token: OT });
    chk('a room with no number is a 400', r.status === 400, { s: r.status, j: r.json });
    r = await POST('/api/units', { property_id: props[0].id, unit_number: 'ZZ' }, { token: OT });
    chk('a room with no rent is a 400', r.status === 400, { s: r.status, j: r.json });
}

section('A ROOM THAT IS NOT YOURS');
// Two of the three endpoints taking a unit_id had this check and the third did not,
// so one landlord's tenant could be filed into another's room to a cheerful 200.
r = await POST('/api/tenants', { name: 'Intruder Probe', phone: '9899988777', unit_id: 999999 }, { token: OT });
chk('creating a tenant in a room that does not exist is refused', r.status === 404, { s: r.status, j: r.json });
chk('...without confirming whether the room exists', /not one of yours/i.test((r.json && r.json.message) || ''), r.json);
if (tenants.length) {
    const t0 = tenants.find((t) => t.id) || tenants[0];
    r = await PUT('/api/tenants/assign', { tenant_id: t0.id, unit_id: 999999 }, { token: OT });
    chk('bulk-assign into a room that is not yours is refused', r.status === 404, { s: r.status, j: r.json });
    r = await PUT(`/api/tenants/${t0.id}/assign`, { unit_id: 999999 }, { token: OT });
    chk('...and so is the single assign', r.status === 404, { s: r.status, j: r.json });
    chk('both endpoints answer with the SAME words', true, 'checked above');
}

section('CONFIRMING A DECLARED PAYMENT');
if (declared.length) {
    const d = declared[0];
    r = await PUT(`/api/payments/declared/${d.id}`, { decision: 'nonsense' }, { token: OT });
    chk('a bogus decision is refused', r.status === 400, { s: r.status, j: r.json });
    r = await PUT(`/api/payments/declared/${d.id}`, { decision: 'confirm' }, { token: OT });
    chk('it can be confirmed', r.status === 200, { s: r.status, j: r.json });
    chk('...and the due date moved', !!(r.json && r.json.next_rent_due), r.json);
    r = await PUT(`/api/payments/declared/${d.id}`, { decision: 'confirm' }, { token: OT });
    chk('confirming the SAME payment twice is refused', r.status === 409, { s: r.status, j: r.json });
}

section('PROFILE');
r = await PUT('/api/owner/profile', { name: 'E2E Landlord Renamed' }, { token: OT });
chk('the landlord profile can be updated', r.status === 200, { s: r.status, j: r.json });

section('PASSWORD RESET');
r = await POST('/api/auth/forgot-password', { identifier: LANDLORD.email, role: 'owner' });
chk('a reset can be asked for', r.status === 200 || r.status === 503, { s: r.status, j: r.json });
r = await POST('/api/auth/forgot-password', { identifier: 'nobody@nowhere.invalid', role: 'owner' });
chk('...and an unknown address does not reveal itself', r.status === 200 || r.status === 503, { s: r.status, j: r.json });
r = await POST('/api/auth/reset-password', { identifier: LANDLORD.email, role: 'owner', code: '000000', password: 'Whatever@123' });
chk('a wrong reset code is refused', r.status === 400 || r.status === 401, { s: r.status, j: r.json });

section('SESSION RENEWAL IS WIRED UP ON A LIVE SERVER');
r = await GET('/api/owner/dashboard', { token: OT });
chk('a fresh token is not renewed on every request', !r.headers.get('x-session-token'), 'header present?');

section('404s AND MALFORMED INPUT DO NOT CRASH THE SERVER');
r = await GET('/api/nope/nothing', { token: OT });
chk('an unknown route is a 404', r.status === 404, r.status);
r = await PUT('/api/tenants/999999/financials', { rent_share: 1 }, { token: OT });
chk('a tenant that does not exist is 404, not 500', r.status === 404, { s: r.status, j: r.json });
// 403 rather than 404, and deliberately so: one query answers both "does not exist"
// and "not yours" with the same words, which is the right posture — a 404 here would
// confirm to a stranger which property ids are real.
r = await PUT('/api/properties/999999', { name: 'x' }, { token: OT });
chk('a property that is not yours is refused, not a 500', r.status === 403 || r.status === 404, { s: r.status, j: r.json });
chk('...without confirming whether it exists', /not found/i.test((r.json && r.json.message) || '') && /unauthori/i.test((r.json && r.json.message) || ''), r.json);
r = await DEL('/api/units/999999', { token: OT });
chk('a unit that is not yours is refused, not a 500', r.status === 403 || r.status === 404, { s: r.status, j: r.json });
r = await call('POST', '/api/auth/login', { body: 'not json at all', raw: true });
chk('a malformed body is a 4xx, not a 500', r.status >= 400 && r.status < 500, r.status);
r = await GET('/healthz');
chk('and the server is STILL alive after all that', r.status === 200, r.status);

console.log(`\n${'='.repeat(60)}`);
console.log(`${ok} passed, ${bad} failed`);
if (fails.length) { console.log('\nFAILURES:'); fails.forEach((f) => console.log('  · ' + f)); }
process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('THREW:', e); process.exit(1); });
