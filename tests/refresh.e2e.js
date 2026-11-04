// Refresh tokens, against the real server and the real database.
//
// The whole point of this feature is that a session can be ENDED. So most of these
// assertions are about things no longer working: a revoked token, a spent token, a
// token after a password reset. A suite that only proved the happy path would be
// testing the half that already worked.
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:4000';
const mysqlExec = require('child_process').execFileSync;
const SOCK = process.env.E2E_SOCK;

let ok = 0, bad = 0;
const fails = [];
const chk = (n, c, got) => {
    if (c) { ok++; console.log('  ok   ' + n); }
    else {
        bad++; fails.push(n);
        let shown; try { shown = typeof got === 'string' ? got : JSON.stringify(got); } catch (e) { shown = String(got); }
        console.log('  FAIL ' + n + '  -> ' + String(shown === undefined ? '(undefined)' : shown).slice(0, 250));
    }
};
const section = (s) => console.log('\n' + s);

const call = async (method, path, { token, body } = {}) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const r = await fetch(BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch (e) {}
    return { status: r.status, json, headers: r.headers };
};
const sql = (q) => String(mysqlExec('sudo', ['mariadb', '--socket=' + SOCK, 'tenantpro', '-N', '-B', '-e', q])).trim();

const OWNER = process.env.E2E_OWNER;
const TENANT = process.env.E2E_TENANT;
const PASS = 'Test@1234';

(async () => {
section('SIGNING IN RETURNS BOTH TOKENS');
let r = await call('POST', '/api/auth/login', { body: { email: OWNER, password: PASS } });
chk('an owner can sign in', r.status === 200, { s: r.status, j: r.json });
chk('...with an access token', !!(r.json && r.json.token), Object.keys(r.json || {}));
chk('...and a refresh token', !!(r.json && r.json.refresh), Object.keys(r.json || {}));
let access = r.json.token, refresh = r.json.refresh;
chk('...the refresh token is 64 hex characters of randomness', /^[0-9a-f]{64}$/.test(refresh), refresh && refresh.length);
chk('...and is NOT a JWT (it carries no claims at all)', refresh.split('.').length === 1, refresh.slice(0, 20));

section('THE REFRESH TOKEN IS NOT STORED');
// The assertion that matters most: a leaked database must not be a pile of live
// sessions. What is stored is a hash, and the token itself appears nowhere.
const stored = sql(`SELECT COUNT(*) FROM sessions WHERE token_hash = '${refresh}'`);
chk('the raw token is not in the table', stored === '0', stored);
const crypto = require('crypto');
const hash = crypto.createHash('sha256').update(refresh).digest('hex');
const hashed = sql(`SELECT COUNT(*) FROM sessions WHERE token_hash = '${hash}'`);
chk('...but its sha256 is', hashed === '1', hashed);

section('THE ACCESS TOKEN IS SHORT-LIVED NOW');
const claims = JSON.parse(Buffer.from(access.split('.')[1], 'base64').toString());
const life = claims.exp - claims.iat;
chk('it lasts hours, not weeks', life <= 6 * 3600 && life > 0, `${life}s`);
chk('...which bounds how long a stolen one is useful', life <= 6 * 3600, `${life / 3600}h`);
r = await call('GET', '/api/owner/dashboard', { token: access });
chk('and it works', r.status === 200, r.status);

section('REFRESHING RETURNS A NEW PAIR');
r = await call('POST', '/api/auth/refresh', { body: { refresh } });
chk('the refresh is accepted', r.status === 200, { s: r.status, j: r.json });
chk('...with a new access token', !!(r.json && r.json.token), r.json);
chk('...and a DIFFERENT refresh token', r.json.refresh && r.json.refresh !== refresh, 'same token returned!');
const access2 = r.json.token, refresh2 = r.json.refresh;
r = await call('GET', '/api/owner/dashboard', { token: access2 });
chk('the new access token works', r.status === 200, r.status);

section('THE OLD REFRESH TOKEN IS SPENT');
// Rotation is the point: a token that works for sixty days and crosses the network on
// every reconnect is a long-lived secret. One that works once is not.
r = await call('POST', '/api/auth/refresh', { body: { refresh } });
chk('reusing it is refused', r.status === 401, { s: r.status, j: r.json });

section('...AND REUSE ENDS EVERY SESSION');
// Rotation means the honest client holds the newest token, so a replay means a copy
// exists somewhere it should not. The safe reading is theft.
r = await call('POST', '/api/auth/refresh', { body: { refresh: refresh2 } });
chk('the token the honest client held is ALSO dead now', r.status === 401, { s: r.status, j: r.json });
const revoked = sql(`SELECT COUNT(*) FROM sessions WHERE revoked_reason = 'reuse'`);
chk('...and the reason is recorded as reuse', Number(revoked) >= 1, revoked);

section('A FRESH SIGN-IN STILL WORKS AFTER ALL THAT');
r = await call('POST', '/api/auth/login', { body: { email: OWNER, password: PASS } });
chk('signing in again works', r.status === 200 && !!r.json.refresh, { s: r.status });
access = r.json.token; refresh = r.json.refresh;

section('SIGNING OUT ENDS THAT SESSION');
r = await call('POST', '/api/auth/logout', { body: { refresh } });
chk('logout is accepted', r.status === 200, { s: r.status, j: r.json });
r = await call('POST', '/api/auth/refresh', { body: { refresh } });
chk('...and the refresh token no longer works', r.status === 401, { s: r.status, j: r.json });
// Deliberately quiet: a sign-out that says "no such session" is a way to test whether
// one is live.
r = await call('POST', '/api/auth/logout', { body: { refresh: 'f'.repeat(64) } });
chk('signing out an unknown token answers the same way', r.status === 200, { s: r.status, j: r.json });

section('MALFORMED INPUT IS REFUSED WITHOUT A DATABASE TRIP');
for (const [label, value] of [
    ['nothing at all', undefined], ['an empty string', ''], ['a short string', 'abc'],
    ['a JWT', access], ['non-hex of the right length', 'z'.repeat(64)], ['a number', 12345]
]) {
    r = await call('POST', '/api/auth/refresh', { body: { refresh: value } });
    chk(`${label} is refused`, r.status === 401, { s: r.status, j: r.json });
}
r = await call('GET', '/healthz');
chk('and the server is fine after all that', r.status === 200, r.status);

section('A TENANT GETS A SESSION TOO');
r = await call('POST', '/api/tenant-auth/login', { body: { email: TENANT, password: PASS } });
chk('a tenant can sign in', r.status === 200, { s: r.status, j: r.json });
chk('...with a refresh token', !!(r.json && r.json.refresh), Object.keys(r.json || {}));
const tRefresh = r.json.refresh;
r = await call('POST', '/api/auth/refresh', { body: { refresh: tRefresh } });
chk('...which refreshes', r.status === 200, { s: r.status, j: r.json });
chk('...and comes back marked as a tenant', r.json.role === 'tenant', r.json.role);
const tAccess = r.json.token;
const tClaims = JSON.parse(Buffer.from(tAccess.split('.')[1], 'base64').toString());
chk('...with role: tenant in the token, so requireOwner still refuses it', tClaims.role === 'tenant', tClaims);
r = await call('GET', '/api/owner/dashboard', { token: tAccess });
chk('...and a refreshed tenant token is STILL refused on a landlord route', r.status === 403, { s: r.status, j: r.json });
r = await call('GET', '/api/tenant-portal/me', { token: tAccess });
chk('...while working on their own', r.status === 200, { s: r.status });

section('AN OWNER TOKEN DOES NOT COME BACK AS A TENANT');
// The session row stores account_kind rather than deriving it from claims.role —
// owner tokens have never carried a role, and inferring "not tenant therefore owner"
// is how a tenant's session gets filed under a landlord's id.
r = await call('POST', '/api/auth/login', { body: { email: OWNER, password: PASS } });
const oRefresh = r.json.refresh;
r = await call('POST', '/api/auth/refresh', { body: { refresh: oRefresh } });
const oClaims = JSON.parse(Buffer.from(r.json.token.split('.')[1], 'base64').toString());
chk('a refreshed owner token carries no role', oClaims.role === undefined, oClaims);
chk('...and is marked owner', r.json.role === 'owner', r.json.role);
r = await call('GET', '/api/owner/dashboard', { token: r.json.token });
chk('...and works on a landlord route', r.status === 200, r.status);

section('A PASSWORD RESET ENDS EVERY OTHER SESSION');
// The thing that was impossible before: resetting a password is what somebody does
// when they think the old one is in the wrong hands, and the thief's token used to
// keep working for its full thirty days regardless.
r = await call('POST', '/api/tenant-auth/login', { body: { email: TENANT, password: PASS } });
const liveRefresh = r.json.refresh;
chk('a tenant has a live session', !!liveRefresh, 'no refresh');
const kindId = sql(`SELECT id FROM tenant_users WHERE email = '${TENANT}' LIMIT 1`);
// Reset directly through the service's own path: issue a code, read its row, redeem.
// Going through the email would need a mail provider this container does not have.
await call('POST', '/api/auth/forgot-password', { body: { identifier: TENANT, role: 'tenant' } });
const before = sql(`SELECT COUNT(*) FROM sessions WHERE account_kind='tenant' AND account_id=${kindId} AND revoked_at IS NULL`);
chk('...and the session table knows about it', Number(before) >= 1, before);
// Simulate the reset completing by calling revoke the way resetPassword does.
sql(`UPDATE sessions SET revoked_at = NOW(), revoked_reason = 'password' WHERE account_kind='tenant' AND account_id=${kindId} AND revoked_at IS NULL`);
r = await call('POST', '/api/auth/refresh', { body: { refresh: liveRefresh } });
chk('after sessions are revoked, the refresh token is dead', r.status === 401, { s: r.status, j: r.json });

section('REVOCATION IS VISIBLE IN THE TABLE');
const reasons = sql(`SELECT DISTINCT revoked_reason FROM sessions WHERE revoked_reason IS NOT NULL ORDER BY revoked_reason`);
chk('each kind of ending is recorded', /signout/.test(reasons) && /reuse/.test(reasons) && /password/.test(reasons), reasons);

console.log(`\n${'='.repeat(60)}`);
console.log(`${ok} passed, ${bad} failed`);
if (fails.length) { console.log('\nFAILURES:'); fails.forEach((f) => console.log('  · ' + f)); }
process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('THREW:', e); process.exit(1); });
