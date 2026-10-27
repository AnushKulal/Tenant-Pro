// A session that renews itself, driven through the REAL middleware and the REAL
// axios interceptor.
//
// This is the bug the user actually hit — "Your session expired. Please sign in
// again." on an app they use constantly — so the assertions are about the thing that
// matters: does somebody who keeps using the app ever get logged out.
//
// The clock is moved rather than waited on. Every case here is days or weeks wide.
const path = require('path');
const Module = require('module');
const B = '/home/user/Tenant-Pro/backend/';
const jwt = require(B + 'node_modules/jsonwebtoken');

let ok = 0, bad = 0;
const chk = (n, c, got) => { if (c) { ok++; console.log('  ok   ' + n); } else { bad++; console.log('  FAIL ' + n + '  -> ' + JSON.stringify(got)); } };

process.env.JWT_SECRET = 'test-secret-for-this-file-only';

// db is reached only by requireLiveStay, which these cases do not exercise.
require.cache[Module._resolveFilename(B + 'config/db', module, false)] = {
    id: 'db', loaded: true, exports: { query: async () => [[]] }
};

const { protect } = require(B + 'middleware/authMiddleware.js');
const { SESSION_TTL, GUEST_SESSION_TTL, RENEW_AFTER_FRACTION, SESSION_HEADER } = require(B + 'config/session.js');

const DAY = 86400;
// A token as it would have been minted `agoDays` ago with a `lifeDays` lifetime.
const mint = (claims, lifeDays, agoDays) => {
    const iat = Math.floor(Date.now() / 1000) - Math.round(agoDays * DAY);
    return jwt.sign({ ...claims, iat, exp: iat + Math.round(lifeDays * DAY) }, process.env.JWT_SECRET);
};

// One trip through `protect`, reporting what came back.
const call = (token) => new Promise((resolve) => {
    const headers = {};
    const res = {
        set: (k, v) => { headers[k] = v; return res; },
        status(s) { this._s = s; return this; },
        json(j) { resolve({ status: this._s || 200, json: j, headers, passed: false }); return this; }
    };
    const req = { headers: token ? { authorization: `Bearer ${token}` } : {} };
    protect(req, res, () => resolve({ status: 200, headers, passed: true, user: req.user }));
});
const renewed = (r) => r.headers[SESSION_HEADER] || null;

(async () => {
console.log('THE CONSTANTS');
chk('an ordinary session is 30 days', SESSION_TTL === '30d', SESSION_TTL);
chk('a guest is 90', GUEST_SESSION_TTL === '90d', GUEST_SESSION_TTL);
chk('renewal kicks in at the halfway mark', RENEW_AFTER_FRACTION === 0.5, RENEW_AFTER_FRACTION);

console.log('\nA FRESH TOKEN IS LEFT ALONE');
let r = await call(mint({ id: 1, email: 'a@b.com' }, 30, 1));
chk('it is accepted', r.passed === true, r);
chk('...and NOT renewed, so renewal is not a per-request cost', renewed(r) === null, renewed(r));

console.log('\nJUST BEFORE THE HALFWAY MARK, STILL NOTHING');
r = await call(mint({ id: 1, email: 'a@b.com' }, 30, 14.9));
chk('accepted', r.passed === true, r);
chk('...not yet renewed', renewed(r) === null, renewed(r));

console.log('\nPAST HALFWAY, A FRESH TOKEN COMES BACK');
r = await call(mint({ id: 7, email: 'a@b.com', role: 'tenant' }, 30, 20));
chk('accepted', r.passed === true, r);
const fresh = renewed(r);
chk('...with a renewed token on the header', !!fresh, fresh && fresh.slice(0, 20));
chk('...that the browser is allowed to READ', /X-Session-Token/i.test(r.headers['Access-Control-Expose-Headers'] || ''), r.headers);

const before = jwt.decode(mint({ id: 7, email: 'a@b.com', role: 'tenant' }, 30, 20));
const after = jwt.verify(fresh, process.env.JWT_SECRET);
chk('the renewed token is the SAME user', after.id === 7 && after.email === 'a@b.com', after);
chk('...keeping the role, so a tenant does not come back as a landlord', after.role === 'tenant', after.role);
chk('...with a FULL fresh lifetime, not the remainder', Math.abs((after.exp - after.iat) - 30 * DAY) < 5, after.exp - after.iat);
chk('...issued now, not back-dated to the old token', Math.abs(after.iat - Math.floor(Date.now() / 1000)) < 5, after.iat);
chk('...so it expires about 30 days from TODAY', Math.abs(after.exp - (Math.floor(Date.now() / 1000) + 30 * DAY)) < 5, after.exp);

console.log('\nTHE RENEWED TOKEN DOES NOT IMMEDIATELY RENEW AGAIN');
// The trap: leaving `iat` in the payload re-stamps the new token with the OLD issue
// time, so it is born half-spent and renews on every single request, for ever.
const second = await call(fresh);
chk('it is accepted', second.passed === true, second);
chk('...and asks for no further renewal', renewed(second) === null, renewed(second));

console.log('\nEACH KIND OF SESSION KEEPS ITS OWN LIFETIME');
// Read from exp - iat rather than a constant, so a guest is not silently demoted to
// 30 days and a legacy 7-day token is not silently promoted.
const guest = jwt.verify(renewed(await call(mint({ id: 3, role: 'tenant' }, 90, 60))), process.env.JWT_SECRET);
chk('a guest renews to 90 days, not 30', Math.abs((guest.exp - guest.iat) - 90 * DAY) < 5, guest.exp - guest.iat);
const legacy = jwt.verify(renewed(await call(mint({ id: 4, email: 'c@d.com' }, 7, 5))), process.env.JWT_SECRET);
chk('a legacy 7-day token renews to 7 days', Math.abs((legacy.exp - legacy.iat) - 7 * DAY) < 5, legacy.exp - legacy.iat);
chk('...and a token with no role stays role-less, as requireOwner expects', legacy.role === undefined, legacy.role);

console.log('\nAN EXPIRED TOKEN IS STILL REFUSED');
// Renewal must not resurrect the dead. This is the whole security boundary.
r = await call(mint({ id: 1, email: 'a@b.com' }, 30, 31));
chk('401', r.status === 401 && r.passed === false, r);
chk('...and nothing was handed back', renewed(r) === null, renewed(r));
r = await call(mint({ id: 1 }, 7, 8));
chk('a legacy token past its 7 days is refused too', r.status === 401, r);

console.log('\nA FORGED TOKEN IS STILL REFUSED');
const forged = jwt.sign({ id: 1, email: 'a@b.com' }, 'not-our-secret', { expiresIn: '30d' });
r = await call(forged);
chk('401', r.status === 401, r);
chk('...and no renewal was minted for it', renewed(r) === null, renewed(r));
r = await call('garbage.not.a.token');
chk('garbage is refused', r.status === 401, r);
r = await call(null);
chk('no header at all is refused', r.status === 401, r);

console.log('\nTHE USER WHO OPENS THE APP EVERY FORTNIGHT IS NEVER LOGGED OUT');
// The actual scenario. Rent is monthly, so a fortnightly visit is a NORMAL user of
// this app — and the one a 30-day fixed expiry was quietly throwing out.
let token = mint({ id: 9, email: 'anush@x.com' }, 30, 0);
let loggedOut = false, renewals = 0;
for (let visit = 1; visit <= 26; visit += 1) { // a year of fortnightly visits
    // Re-mint to simulate 14 days passing on whatever token is currently held.
    const c = jwt.decode(token);
    const aged = jwt.sign(
        { ...stripTime(c), iat: c.iat - 14 * DAY, exp: c.exp - 14 * DAY },
        process.env.JWT_SECRET
    );
    const res = await call(aged);
    if (!res.passed) { loggedOut = true; break; }
    const next = renewed(res);
    if (next) { renewals += 1; token = next; } else { token = aged; }
}
chk('a year of fortnightly visits, never signed out', loggedOut === false, { loggedOut, renewals });
chk('...and it renewed along the way', renewals > 0, renewals);

console.log('\nTHE USER WHO DISAPPEARS IS STILL SIGNED OUT');
// The other half of the trade: renewal must not mean "signed in for ever".
r = await call(mint({ id: 9, email: 'anush@x.com' }, 30, 45));
chk('45 days of silence ends the session', r.status === 401, r);

// ── The client half ───────────────────────────────────────────────────────────
console.log('\nTHE APP ADOPTS A RENEWED TOKEN');
// The real axios interceptor from api.js, rebuilt here against a stub adapter. The
// source check at the bottom fails if api.js ever stops doing this.
const axios = require('/tmp/claude-0/-home-user-Tenant-Pro/3e770449-8676-5ed5-beec-0c3226347b75/scratchpad/node_modules/axios');
let TOKEN = 'old-token-value-aaaaaaaaaaaaaaaaaaaa';
let persisted = [];
const renewedTokenOf = (res) => {
    const h = (res && res.headers) || {};
    const t = h['x-session-token'] || h['X-Session-Token'] || (typeof h.get === 'function' ? h.get('x-session-token') : null);
    return typeof t === 'string' && t.length > 20 ? t : null;
};
const adopt = (res) => {
    const f = renewedTokenOf(res);
    if (!f || f === TOKEN) return;
    TOKEN = f;
    persisted.push(f);
};
const http = axios.create({ baseURL: 'http://x/api' });
http.interceptors.response.use((res) => { adopt(res); return res; }, (e) => { if (e && e.response) adopt(e.response); return Promise.reject(e); });

const NEW = 'brand-new-token-value-bbbbbbbbbbbbbbbbbbbb';
http.defaults.adapter = async (config) => {
    if (config.url === '/fail') {
        const err = new Error('409'); err.config = config;
        err.response = { status: 409, data: {}, headers: { 'x-session-token': NEW }, config };
        throw err;
    }
    return { status: 200, data: {}, headers: config.url === '/quiet' ? {} : { 'x-session-token': NEW }, config };
};

await http.get('/ok');
chk('a renewed token on a 200 is adopted', TOKEN === NEW, TOKEN);
chk('...and persisted exactly once', persisted.length === 1, persisted.length);
await http.get('/ok');
chk('the SAME token again is not re-persisted', persisted.length === 1, persisted.length);
TOKEN = 'old-token-value-aaaaaaaaaaaaaaaaaaaa'; persisted = [];
try { await http.get('/fail'); } catch (e) { /* expected */ }
chk('a renewal riding on a 409 is adopted too', TOKEN === NEW, TOKEN);
TOKEN = 'old-token-value-aaaaaaaaaaaaaaaaaaaa'; persisted = [];
await http.get('/quiet');
chk('a response with no header changes nothing', TOKEN === 'old-token-value-aaaaaaaaaaaaaaaaaaaa' && persisted.length === 0, [TOKEN, persisted]);

console.log('\nTHE SOURCE STILL DOES WHAT THIS FILE TESTS');
const fs = require('fs');
const apiSrc = fs.readFileSync('/home/user/Tenant-Pro/mobile/src/redesign/api.js', 'utf8');
chk('api.js reads the header case-insensitively', /x-session-token/.test(apiSrc) && /X-Session-Token/.test(apiSrc), 'header lookup');
chk('...adopts on success AND on error', /\(res\) => \{ adoptRenewal\(res\); return res; \}/.test(apiSrc) && /if \(error && error\.response\) adoptRenewal\(error\.response\)/.test(apiSrc), 'both paths');
chk('...and exposes a hook to persist it', /export function setOnSessionRenewed/.test(apiSrc), 'hook');
const sessSrc = fs.readFileSync('/home/user/Tenant-Pro/mobile/src/redesign/session.js', 'utf8');
chk('session.js writes only where a token already lives', /map\[K\.ownerToken\] \? K\.ownerToken : map\[K\.tenantToken\] \? K\.tenantToken : null/.test(sessSrc), 'key choice');
const mwSrc = fs.readFileSync('/home/user/Tenant-Pro/backend/middleware/authMiddleware.js', 'utf8');
chk('the middleware strips iat and exp before re-signing', /const \{ iat, exp, \.\.\.rest \} = claims/.test(mwSrc), 'strip');

function stripTime(c) { const { iat, exp, ...rest } = c; return rest; }

console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('THREW:', e); process.exit(1); });
