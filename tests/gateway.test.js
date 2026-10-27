// Paying rent through the landlord's own gateway, driven through the REAL controllers
// with only the database and `fetch` stubbed.
//
// `fetch` is the interesting stub. Every request this code makes to Razorpay is captured
// and asserted on — the amount in paise, accept_partial, the reference in the notes, the
// Basic auth header — because those are the four things that, if wrong, charge somebody
// the wrong amount or settle the wrong row, and none of them would show up as an error.
const path = require('path');
const Module = require('module');
const B = '/home/user/Tenant-Pro/backend/';

let ok = 0, bad = 0;
const chk = (n, c, got) => { if (c) { ok++; console.log('  ok   ' + n); } else { bad++; console.log('  FAIL ' + n + '  -> ' + JSON.stringify(got)); } };

// A real key, so seal/open genuinely round-trip rather than being stubbed past.
process.env.CREDENTIALS_KEY = 'a'.repeat(64);

// ── The fake world ────────────────────────────────────────────────────────────
const store = {
    // The landlord's row, as payment_settings holds it.
    settings: null,
    // tenant 7 belongs to owner 1, tenant_users 70.
    payments: [],
    tenants: { 7: { id: 7, owner_id: 1, next_rent_due: '2026-11-05', move_in_date: '2025-02-05', name: 'Rahul', rent_share: 14500 } }
};
let nextPaymentId = 100;
const queries = [];

const rowFor = (p) => ({ ...p });

const db = {
    async query(sql, args = []) {
        const q = sql.replace(/\s+/g, ' ').trim();
        queries.push(q);
        if (/^SELECT tu\.id AS user_id/i.test(q)) {
            const t = store.tenants[7];
            return [[{
                user_id: 70, link_status: 'active', account_name: 'Rahul', account_email: 'r@x.com',
                account_phone: '9480000000', is_guest: 0, guest_code: null, alerts_seen_at: null,
                tenant_id: t.id, name: t.name, phone: '9480000000', email: 'r@x.com',
                rent_share: t.rent_share, next_rent_due: t.next_rent_due, move_in_date: t.move_in_date,
                unit_number: '4B', property_name: 'Sunrise Residency', owner_id: 1,
                upi_id: 'anush@okaxis', upi_number: null, qr_code_url: null,
                gateway: store.settings?.gateway ?? null,
                gateway_key_id: store.settings?.gateway_key_id ?? null,
                gateway_secret: store.settings?.gateway_secret ?? null,
                gateway_enabled: store.settings?.gateway_enabled ?? 0
            }]];
        }
        if (/^SELECT id, amount_paid, gateway_ref, reference_id FROM payments/i.test(q)) {
            return [store.payments.filter((p) => p.tenant_id === args[0] && p.status === 'Declared').slice(0, 1).map(rowFor)];
        }
        if (/^SELECT id, status, gateway_ref, amount_paid FROM payments WHERE id = \? AND tenant_id = \?/i.test(q)) {
            return [store.payments.filter((p) => p.id === Number(args[0]) && p.tenant_id === Number(args[1])).map(rowFor)];
        }
        if (/^INSERT INTO payments/i.test(q)) {
            const id = nextPaymentId++;
            store.payments.push({
                id, tenant_id: args[0], amount_paid: args[1], payment_date: args[2],
                payment_method: 'Online', status: 'Declared', declared_by: args[3],
                due_date: args[4], gateway_ref: null, reference_id: null
            });
            return [{ insertId: id }];
        }
        if (/^UPDATE payments SET gateway_ref = \?, reference_id = \? WHERE id = \?/i.test(q)) {
            const p = store.payments.find((x) => x.id === args[2]);
            if (p) { p.gateway_ref = args[0]; p.reference_id = args[1]; }
            return [{ affectedRows: 1 }];
        }
        if (/^DELETE FROM payments WHERE id = \?/i.test(q)) {
            store.payments = store.payments.filter((p) => p.id !== args[0]);
            return [{ affectedRows: 1 }];
        }
        if (/^SELECT gateway, gateway_key_id FROM payment_settings/i.test(q)) {
            return [store.settings ? [{ gateway: store.settings.gateway, gateway_key_id: store.settings.gateway_key_id }] : []];
        }
        if (/^SELECT id, owner_id, upi_id/i.test(q)) {
            return [store.settings ? [{ id: 1, owner_id: 1, upi_id: 'anush@okaxis', upi_number: null, qr_code_url: null, updated_at: null, ...store.settings }] : []];
        }
        if (/^INSERT INTO payment_settings/i.test(q)) {
            store.settings = { gateway: args[1], gateway_key_id: args[2], gateway_secret: args[3], gateway_enabled: 1 };
            return [{ affectedRows: 1 }];
        }
        if (/^UPDATE payment_settings SET gateway_enabled = \?/i.test(q)) {
            if (store.settings) store.settings.gateway_enabled = args[0];
            return [{ affectedRows: 1 }];
        }
        if (/^UPDATE payment_settings SET gateway = NULL/i.test(q)) {
            store.settings = { gateway: null, gateway_key_id: null, gateway_secret: null, gateway_enabled: 0 };
            return [{ affectedRows: 1 }];
        }
        if (/^SELECT name FROM owners/i.test(q)) return [[{ name: 'Anush' }]];
        throw new Error('UNEXPECTED QUERY: ' + q.slice(0, 140));
    },
    // settlePayment takes a connection and a transaction.
    async getConnection() {
        return {
            async beginTransaction() {},
            async commit() {},
            async rollback() {},
            release() {},
            async query(sql, args = []) {
                const q = sql.replace(/\s+/g, ' ').trim();
                queries.push(q);
                if (/FOR UPDATE/i.test(q)) {
                    const p = store.payments.find((x) => x.id === Number(args[0]));
                    if (!p) return [[]];
                    const t = store.tenants[p.tenant_id];
                    return [[{
                        id: p.id, status: p.status, amount_paid: p.amount_paid, payment_date: p.payment_date,
                        tenant_id: p.tenant_id, next_rent_due: t.next_rent_due, move_in_date: t.move_in_date,
                        tenant_name: t.name, owner_id: t.owner_id
                    }]];
                }
                if (/^UPDATE payments SET status = \?/i.test(q)) {
                    const p = store.payments.find((x) => x.id === args[4]);
                    if (p) { p.status = args[0]; p.confirmation_source = args[2]; p.gateway_ref = args[3] || p.gateway_ref; }
                    return [{ affectedRows: 1 }];
                }
                if (/^UPDATE tenants SET next_rent_due/i.test(q)) {
                    store.tenants[args[1]].next_rent_due = args[0];
                    return [{ affectedRows: 1 }];
                }
                throw new Error('UNEXPECTED TXN QUERY: ' + q.slice(0, 140));
            }
        };
    }
};

// ── The fake gateway ──────────────────────────────────────────────────────────
// Every call is recorded. `plan` decides what Razorpay says next.
const calls = [];
let plan = {};
const links = {};
global.fetch = async (url, opts = {}) => {
    const body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ url: String(url), method: opts.method || 'GET', auth: opts.headers?.Authorization || '', body });

    if (/\/payment_links\?count=1$/.test(url)) {
        const s = plan.verifyStatus ?? 200;
        return { ok: s === 200, status: s, json: async () => (s === 200 ? { payment_links: [] } : { error: { description: 'bad key' } }) };
    }
    if (opts.method === 'POST' && /\/payment_links$/.test(url)) {
        if (plan.createFails) {
            return { ok: false, status: 400, json: async () => ({ error: { description: 'Amount exceeds maximum' } }) };
        }
        const id = `plink_${Object.keys(links).length + 1}`;
        links[id] = { id, status: 'created', short_url: `https://rzp.io/i/${id}`, amount_paid: 0, payments: null };
        return { ok: true, status: 200, json: async () => links[id] };
    }
    const m = String(url).match(/\/payment_links\/(plink_\w+)$/);
    if (m) {
        if (plan.readFails) return { ok: false, status: 500, json: async () => ({ error: { description: 'oops' } }) };
        return { ok: true, status: 200, json: async () => links[m[1]] };
    }
    throw new Error('UNEXPECTED FETCH: ' + url);
};

// ── Wire it up ────────────────────────────────────────────────────────────────
const realResolve = Module._resolveFilename;
require.cache[realResolve.call(Module, B + 'config/db', module, false)] = { id: 'db', exports: db, loaded: true };
require.cache[realResolve.call(Module, B + 'services/pushService', module, false)] = {
    id: 'push', loaded: true, exports: { notify: async () => {}, notifyTenancy: async () => {}, pushMode: async () => 'off' }
};
require.cache[realResolve.call(Module, B + 'services/scoreService', module, false)] = {
    id: 'score', loaded: true, exports: { scoreForTenant: async () => ({ known: false }) }
};
require.cache[realResolve.call(Module, B + 'controllers/documentController', module, false)] = {
    id: 'docs', loaded: true, exports: { fetchDocuments: async () => [], summarise: () => ({ ok: true }) }
};

const pay = require(B + 'controllers/paymentController.js');
const portal = require(B + 'controllers/tenantPortalController.js');
const gw = require(B + 'services/gatewayService.js');
const { open } = require(B + 'utils/secretBox.js');

const call = async (fn, req) => {
    let status = 200, json = null;
    const res = { status(s) { status = s; return this; }, json(j) { json = j; return this; } };
    await fn({ params: {}, body: {}, ...req }, res);
    return { status, json };
};
const OWNER = { user: { id: 1 } };
const TENANT = { user: { id: 70, role: 'tenant' } };

(async () => {
// ── Connecting ────────────────────────────────────────────────────────────────
console.log('\nCONNECTING A GATEWAY');
let r = await call(pay.connectGateway, { ...OWNER, body: { provider: 'razorpay', key_id: 'rzp_test_abc123', key_secret: 'supersecret' } });
chk('it is accepted', r.status === 200, r);
chk('...after ASKING the gateway first', calls.some((c) => /count=1/.test(c.url)), calls.map((c) => c.url));
chk('...with HTTP Basic auth built from the pair',
    calls[0].auth === 'Basic ' + Buffer.from('rzp_test_abc123:supersecret').toString('base64'), calls[0].auth);
chk('...and the secret is stored SEALED, not plain',
    store.settings.gateway_secret !== 'supersecret' && /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/.test(store.settings.gateway_secret),
    store.settings.gateway_secret);
chk('...and it still opens back to the original', open(store.settings.gateway_secret) === 'supersecret', open(store.settings.gateway_secret));
chk('...the reply never contains the secret', !JSON.stringify(r.json).includes('supersecret'), r.json);

console.log('\nA REJECTED KEY IS REFUSED, AND NOT STORED');
const saved = { ...store.settings };
plan.verifyStatus = 401;
r = await call(pay.connectGateway, { ...OWNER, body: { provider: 'razorpay', key_id: 'rzp_test_wrong', key_secret: 'nope' } });
chk('400, which is the landlord\'s to fix', r.status === 400, r);
chk('...saying the gateway refused it', /did not accept/i.test(r.json.message), r.json);
chk('...and nothing was overwritten', store.settings.gateway_key_id === saved.gateway_key_id, store.settings.gateway_key_id);
plan.verifyStatus = 500;
r = await call(pay.connectGateway, { ...OWNER, body: { provider: 'razorpay', key_id: 'rzp_test_x', key_secret: 'y' } });
chk('a gateway OUTAGE is 502, not "check your key"', r.status === 502 && !/did not accept/i.test(r.json.message), r);
delete plan.verifyStatus;

console.log('\nTHE SETTINGS READ NEVER RETURNS THE CREDENTIAL');
r = await call(pay.getPaymentSettings, OWNER);
const dumped = JSON.stringify(r.json);
chk('the sealed secret is absent', !dumped.includes(store.settings.gateway_secret), dumped.slice(0, 200));
chk('...the plaintext even more so', !dumped.includes('supersecret'), dumped.slice(0, 200));
chk('...but it says WHICH key is connected', /••••c123/.test(dumped), r.json.gateway);
chk('...and that it is on', r.json.gateway.connected === true && r.json.gateway.enabled === true, r.json.gateway);
chk('...and the UPI details are untouched', r.json.settings.upi_id === 'anush@okaxis', r.json.settings);

// ── The tenant pays ───────────────────────────────────────────────────────────
console.log('\nSTARTING AN ONLINE PAYMENT');
calls.length = 0;
r = await call(portal.startOnlinePayment, { ...TENANT, body: { amount: 14500 } });
chk('a link comes back', r.status === 201 && /^https:\/\/rzp\.io\//.test(r.json.url || ''), r.json);
const created = calls.find((c) => c.method === 'POST');
chk('...for the amount IN PAISE', created.body.amount === 1450000, created.body.amount);
chk('...refusing partial payment', created.body.accept_partial === false, created.body);
chk('...carrying OUR reference, not the tenant\'s typing', created.body.notes.reference === `TP${r.json.payment_id}`, created.body.notes);
chk('...and the SAME reference comes back for the screen to print', r.json.reference === `TP${r.json.payment_id}`, r.json.reference);
chk('...with the gateway\'s own SMS and email off', created.body.notify.sms === false && created.body.notify.email === false, created.body.notify);
const row = store.payments.find((p) => p.id === r.json.payment_id);
chk('the row is Declared, not Confirmed', row.status === 'Declared', row.status);
chk('...and holds the link id so an event can find it', /^plink_/.test(row.gateway_ref), row.gateway_ref);
chk('...the tenant\'s due date has NOT moved', store.tenants[7].next_rent_due === '2026-11-05', store.tenants[7].next_rent_due);

console.log('\nCOMING BACK BEFORE PAYING GETS THE SAME LINK');
let firstUrl = r.json.url;
let firstId = r.json.payment_id;
r = await call(portal.startOnlinePayment, { ...TENANT, body: { amount: 14500 } });
chk('same payment', r.json.payment_id === firstId, r.json);
chk('...same url, not a second live link', r.json.url === firstUrl, r.json.url);
chk('...and the SAME reference, read off the row', r.json.reference === `TP${firstId}`, r.json.reference);
chk('...and only ONE link was ever created', Object.keys(links).length === 1, Object.keys(links));

console.log('\nAN EXPIRED LINK IS DROPPED, NOT A DEAD END');
links[Object.keys(links)[0]].status = 'expired';
r = await call(portal.startOnlinePayment, { ...TENANT, body: { amount: 14500 } });
chk('a NEW link is issued', r.status === 201 && r.json.payment_id !== firstId, r.json);
chk('...and the dead claim is gone', !store.payments.some((p) => p.id === firstId), store.payments.map((p) => p.id));
chk('...so exactly one claim is outstanding',
    store.payments.filter((p) => p.tenant_id === 7 && p.status === 'Declared').length === 1,
    store.payments.map((p) => [p.id, p.status]));
// Carry on with the replacement, and tidy the expired one out of the fake gateway so
// the "only one link" bookkeeping below still means something.
delete links[Object.keys(links)[0]];
firstUrl = r.json.url; firstId = r.json.payment_id;

console.log('\nCHECKING AN UNPAID LINK SETTLES NOTHING');
r = await call(portal.checkOnlinePayment, { ...TENANT, params: { id: String(firstId) } });
chk('it reports not paid', r.status === 200 && r.json.paid === false, r.json);
chk('...the row is still Declared', store.payments.find((p) => p.id === firstId).status === 'Declared', store.payments.find((p) => p.id === firstId).status);
chk('...and the due date still has not moved', store.tenants[7].next_rent_due === '2026-11-05', store.tenants[7].next_rent_due);

console.log('\nA PARTIALLY PAID LINK IS NOT PAID');
links[Object.keys(links)[0]].status = 'partially_paid';
links[Object.keys(links)[0]].amount_paid = 100000;
r = await call(portal.checkOnlinePayment, { ...TENANT, params: { id: String(firstId) } });
chk('still not paid', r.json.paid === false, r.json);
chk('...row untouched', store.payments.find((p) => p.id === firstId).status === 'Declared', r.json);

console.log('\nTHE GATEWAY SAYS PAID');
const linkId = Object.keys(links)[0];
links[linkId].status = 'paid';
links[linkId].amount_paid = 1450000;
links[linkId].payments = [{ payment_id: 'pay_XYZ9', status: 'captured' }];
r = await call(portal.checkOnlinePayment, { ...TENANT, params: { id: String(firstId) } });
chk('confirmed', r.status === 200 && r.json.paid === true, r.json);
const done = store.payments.find((p) => p.id === firstId);
chk('...the row is Confirmed', done.status === 'Confirmed', done.status);
chk('...sourced to the gateway, not the landlord', done.confirmation_source === 'gateway', done.confirmation_source);
chk('...carrying the gateway\'s OWN payment id for the dashboard', done.gateway_ref === 'pay_XYZ9', done.gateway_ref);
chk('...and the due date moved one month', store.tenants[7].next_rent_due === '2026-12-05', store.tenants[7].next_rent_due);
chk('...and the reply says the new due date', r.json.next_rent_due === '2026-12-05', r.json);

console.log('\nCHECKING AGAIN IS HARMLESS');
const before = store.tenants[7].next_rent_due;
r = await call(portal.checkOnlinePayment, { ...TENANT, params: { id: String(firstId) } });
chk('it reports the settled truth', r.json.paid === true && r.json.status === 'Confirmed', r.json);
chk('...the due date did NOT advance twice', store.tenants[7].next_rent_due === before, store.tenants[7].next_rent_due);

console.log('\nONE TENANT CANNOT CHECK ANOTHER\'S PAYMENT');
store.payments.push({ id: 999, tenant_id: 8, status: 'Declared', gateway_ref: 'plink_1', amount_paid: 9000 });
r = await call(portal.checkOnlinePayment, { ...TENANT, params: { id: '999' } });
chk('404', r.status === 404, r);
chk('...and it is still Declared', store.payments.find((p) => p.id === 999).status === 'Declared', r.json);
store.payments = store.payments.filter((p) => p.id !== 999);

// ── Failures ──────────────────────────────────────────────────────────────────
console.log('\nA FAILED LINK LEAVES NO ORPHAN CLAIM');
const n = store.payments.length;
plan.createFails = true;
r = await call(portal.startOnlinePayment, { ...TENANT, body: { amount: 14500 } });
chk('502, with UPI offered instead', r.status === 502 && r.json.fallback === 'upi', r.json);
chk('...no Declared row was left behind', store.payments.length === n, store.payments.map((p) => [p.id, p.status]));
chk('...so the UPI route is not blocked either',
    !store.payments.some((p) => p.tenant_id === 7 && p.status === 'Declared'), store.payments.map((p) => p.status));
delete plan.createFails;

console.log('\nA HAND-TYPED UPI CLAIM STILL BLOCKS A SECOND ONE');
store.payments.push({ id: 500, tenant_id: 7, status: 'Declared', gateway_ref: null, amount_paid: 14500 });
r = await call(portal.startOnlinePayment, { ...TENANT, body: { amount: 14500 } });
chk('409', r.status === 409, r);
chk('...pointing at the claim they already have', r.json.existing_id === 500, r.json);
store.payments = store.payments.filter((p) => p.id !== 500);

console.log('\nSWITCHED OFF MEANS THE TENANT IS TOLD, AND OFFERED UPI');
await call(pay.toggleGateway, { ...OWNER, body: { enabled: false } });
r = await call(portal.startOnlinePayment, { ...TENANT, body: { amount: 14500 } });
chk('409 rather than a crash', r.status === 409, r);
chk('...naming UPI as the way through', r.json.fallback === 'upi' && /UPI/.test(r.json.message), r.json);
r = await call(portal.getMe, TENANT);
chk('...and /me says the option is gone', r.json.payment.online.available === false, r.json.payment);
await call(pay.toggleGateway, { ...OWNER, body: { enabled: true } });
r = await call(portal.getMe, TENANT);
chk('back on, /me offers it again', r.json.payment.online.available === true && r.json.payment.online.provider === 'razorpay', r.json.payment);
chk('...and /me still never mentions the secret', !JSON.stringify(r.json).includes('supersecret') && !JSON.stringify(r.json).includes(store.settings.gateway_secret), 'leak');

console.log('\nA SEALED SECRET THIS SERVER CANNOT OPEN SAYS SO');
const goodSecret = store.settings.gateway_secret;
store.settings.gateway_secret = 'ff:ff:ff';
r = await call(portal.startOnlinePayment, { ...TENANT, body: { amount: 14500 } });
chk('409 with a reconnect instruction', r.status === 409 && /reconnect/i.test(r.json.message), r.json);
chk('...and no reason CODE leaked into the message', !/unreadable/.test(r.json.message), r.json.message);
store.settings.gateway_secret = goodSecret;

console.log('\nDISCONNECTING KEEPS THE UPI DETAILS');
r = await call(pay.disconnectGateway, OWNER);
chk('accepted', r.status === 200, r);
chk('...the secret is gone', store.settings.gateway_secret === null, store.settings);
chk('...and it says UPI is untouched', /UPI/.test(r.json.message), r.json.message);
r = await call(pay.toggleGateway, { ...OWNER, body: { enabled: true } });
chk('turning on a gateway that is not there is refused', r.status === 400, r);

// ── Amounts ───────────────────────────────────────────────────────────────────
console.log('\nAMOUNTS');
store.settings = { gateway: 'razorpay', gateway_key_id: 'rzp_test_abc123', gateway_secret: goodSecret, gateway_enabled: 1 };
for (const [amount, why] of [[0, 'zero'], [-5, 'negative'], [0.4, 'under ₹1'], [9999999, 'ten times the rent']]) {
    r = await call(portal.startOnlinePayment, { ...TENANT, body: { amount } });
    chk(`${why} is refused`, r.status === 400, { amount, r });
}
r = await call(portal.startOnlinePayment, { ...TENANT, body: {} });
chk('no amount at all defaults to the rent', r.status === 201 && r.json.amount === 14500, r.json);

// ── The provider table on its own ─────────────────────────────────────────────
console.log('\nTHE PROVIDER TABLE');
chk('the catalog names no secret field values', !JSON.stringify(gw.providerCatalog()).includes('supersecret'), 'ok');
chk('credentialsFor refuses a row with no gateway', gw.credentialsFor({ gateway: null }).reason === 'no_gateway', gw.credentialsFor({ gateway: null }));
chk('...a disabled one', gw.credentialsFor({ gateway: 'razorpay', gateway_enabled: 0 }).reason === 'disabled', 'ok');
chk('...one missing half the pair',
    gw.credentialsFor({ gateway: 'razorpay', gateway_enabled: 1, gateway_key_id: 'k' }).reason === 'incomplete', 'ok');
chk('...an unknown provider', gw.credentialsFor({ gateway: 'stripe' }).reason === 'unknown_provider', 'ok');

console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('THREW:', e); process.exit(1); });
