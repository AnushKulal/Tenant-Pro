// The CLIENT half of refresh tokens: the real axios interceptor from api.js, against
// a stub adapter.
//
// These assertions are all about not logging somebody out. The server half is tested
// against a real database elsewhere; what can only be tested here is the behaviour
// that turns a recoverable situation into a sign-out, which is the failure this whole
// area exists to prevent.
//
// The one that matters most is concurrency. An app firing eight parallel calls on a
// cold start, all 401ing on the same expired token, must send ONE refresh. Eight
// would mean seven presenting a token the first had already spent — and the server
// reads a spent token as theft and ends every session on the account. The feature
// meant to stop people being logged out would log them out, at scale, on cold start.
const path = require('path');
const axios = require(path.join(__dirname, 'node_modules/axios'));
const fs = require('fs');

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

// ── The interceptor, rebuilt exactly as api.js defines it ────────────────────
// Kept honest by the source check at the bottom, which fails if api.js drifts.
const SERVER_URL = 'http://stub';
const PUBLIC_AUTH = /\/(auth|tenant-auth)\/(login|register|forgot-password|reset-password|google)/;

let TOKEN, REFRESH, refreshing, signOuts, persisted, refreshCalls, serverRefreshMode;
const build = () => {
    TOKEN = 'access-0'; REFRESH = 'r0'; refreshing = null;
    signOuts = 0; persisted = []; refreshCalls = 0; serverRefreshMode = 'ok';

    const http = axios.create({ baseURL: `${SERVER_URL}/api` });
    http.interceptors.request.use((cfg) => {
        if (TOKEN) cfg.headers.Authorization = `Bearer ${TOKEN}`;
        return cfg;
    });

    const doRefresh = async () => {
        if (!REFRESH) return { ok: false, fatal: true };
        refreshCalls += 1;
        try {
            const res = await axios.post(`${SERVER_URL}/api/auth/refresh`, { refresh: REFRESH }, { timeout: 30000 });
            const token = res && res.data && res.data.token;
            const next = res && res.data && res.data.refresh;
            if (!token || !next) return { ok: false, fatal: true };
            TOKEN = token; REFRESH = next;
            persisted.push({ token, refresh: next });
            return { ok: true };
        } catch (e) {
            const status = e && e.response && e.response.status;
            return { ok: false, fatal: status === 401 };
        }
    };
    const refreshOnce = () => {
        if (!refreshing) refreshing = doRefresh().finally(() => { refreshing = null; });
        return refreshing;
    };

    http.interceptors.response.use((res) => res, async (error) => {
        const status = error && error.response && error.response.status;
        const url = (error && error.config && error.config.url) || '';
        const cfg = error && error.config;
        if (status === 401 && !PUBLIC_AUTH.test(url) && cfg && !cfg._retried && REFRESH) {
            cfg._retried = true;
            const r = await refreshOnce();
            if (r.ok) return http(cfg);
            if (!r.fatal) return Promise.reject(error);
        }
        if (status === 401 && !PUBLIC_AUTH.test(url)) signOuts += 1;
        return Promise.reject(error);
    });

    // The stub server: an access token works only if it is the CURRENT one.
    let issued = 0;
    const adapter = async (config) => {
        const full = `${config.baseURL || ''}${config.url}`;
        if (full.endsWith('/auth/refresh')) {
            if (serverRefreshMode === '401') {
                const e = new Error('401'); e.config = config;
                e.response = { status: 401, data: { message: 'Please sign in again.' }, config };
                throw e;
            }
            if (serverRefreshMode === '500') {
                const e = new Error('500'); e.config = config;
                e.response = { status: 500, data: { message: 'Could not refresh your session.' }, config };
                throw e;
            }
            if (serverRefreshMode === 'network') {
                const e = new Error('Network Error'); e.config = config;
                throw e;
            }
            issued += 1;
            return { status: 200, data: { token: `access-${issued}`, refresh: `r${issued}` }, headers: {}, config };
        }
        // A protected route: 401 unless the bearer is the newest access token.
        const bearer = String(config.headers.Authorization || '').replace('Bearer ', '');
        if (bearer !== TOKEN || bearer === 'access-0') {
            const e = new Error('401'); e.config = config;
            e.response = { status: 401, data: { message: 'Not authorized, token failed' }, config };
            throw e;
        }
        return { status: 200, data: { ok: true }, headers: {}, config };
    };
    http.defaults.adapter = adapter;
    axios.defaults.adapter = adapter;
    return http;
};

(async () => {
section('AN EXPIRED ACCESS TOKEN REFRESHES AND REPLAYS');
let http = build();
let r = await http.get('/owner/dashboard');
chk('the request eventually succeeds', r.status === 200, r.status);
chk('...after exactly one refresh', refreshCalls === 1, refreshCalls);
chk('...and nobody was signed out', signOuts === 0, signOuts);
chk('...the new pair was persisted', persisted.length === 1 && !!persisted[0].refresh, persisted);
chk('...and the refresh token ROTATED', REFRESH !== 'r0', REFRESH);

section('EIGHT PARALLEL CALLS SEND ONE REFRESH');
// The cold-start case. Eight refreshes would mean seven spent-token replays, which
// the server reads as theft and answers by ending every session on the account.
http = build();
const all = await Promise.all([
    http.get('/owner/dashboard'), http.get('/properties'), http.get('/units'),
    http.get('/tenants'), http.get('/owner/transactions'), http.get('/owner/requests'),
    http.get('/payments/settings'), http.get('/owner/pulse')
]);
chk('all eight succeed', all.every((x) => x.status === 200), all.map((x) => x.status));
chk('...with ONE refresh between them', refreshCalls === 1, refreshCalls);
chk('...and nobody signed out', signOuts === 0, signOuts);

section('A DEAD REFRESH TOKEN SIGNS OUT — ONCE');
http = build();
serverRefreshMode = '401';
try { await http.get('/owner/dashboard'); } catch (e) { /* expected */ }
chk('the session ends', signOuts === 1, signOuts);

section('A SERVER STUMBLE DOES **NOT** SIGN ANYONE OUT');
// The distinction the whole design turns on. The server answers 500 rather than 401
// on its own failures precisely so this branch can tell them apart — a database
// hiccup must not read to the app as "your session is over".
http = build();
serverRefreshMode = '500';
let threw = null;
try { await http.get('/owner/dashboard'); } catch (e) { threw = e; }
chk('the request fails', !!threw, 'did not fail');
chk('...but the session SURVIVES', signOuts === 0, signOuts);
chk('...and the refresh token is untouched, ready to try again', REFRESH === 'r0', REFRESH);

section('A DEAD NETWORK DOES NOT SIGN ANYONE OUT EITHER');
http = build();
serverRefreshMode = 'network';
try { await http.get('/owner/dashboard'); } catch (e) { /* expected */ }
chk('the session survives a network failure', signOuts === 0, signOuts);
chk('...with the refresh token kept', REFRESH === 'r0', REFRESH);

section('A WRONG PASSWORD IS NOT A SESSION FAILURE');
http = build();
try { await http.post('/auth/login', { email: 'a@b.com', password: 'wrong' }); } catch (e) { /* expected */ }
chk('no refresh was attempted on a sign-in 401', refreshCalls === 0, refreshCalls);
chk('...and nobody was signed out', signOuts === 0, signOuts);

section('A REQUEST IS RETRIED ONCE, NEVER IN A LOOP');
http = build();
// The server keeps 401ing even after a successful refresh: a broken token would
// otherwise bounce between retry and refresh for ever.
let hits = 0;
const loopAdapter = async (config) => {
    const full = `${config.baseURL || ''}${config.url}`;
    // NOT incrementing refreshCalls here: doRefresh already does, and counting it in
    // both places made this read 2 and look like a loop that was not happening.
    if (full.endsWith('/auth/refresh')) return { status: 200, data: { token: 'a', refresh: 'b' }, headers: {}, config };
    hits += 1;
    const e = new Error('401'); e.config = config;
    e.response = { status: 401, data: {}, config };
    throw e;
};
http.defaults.adapter = loopAdapter; axios.defaults.adapter = loopAdapter;
try { await http.get('/owner/dashboard'); } catch (e) { /* expected */ }
chk('the protected route was tried twice, not forever', hits === 2, hits);
chk('...and one refresh happened', refreshCalls === 1, refreshCalls);
chk('...then it gave up and signed out', signOuts === 1, signOuts);

section('AN INSTALL WITH NO REFRESH TOKEN BEHAVES AS BEFORE');
// Somebody who signed in before this shipped. Their access token still works until it
// expires; a 401 ends the session exactly as it used to, with no refresh attempted.
http = build();
REFRESH = null;
try { await http.get('/owner/dashboard'); } catch (e) { /* expected */ }
chk('no refresh is attempted', refreshCalls === 0, refreshCalls);
chk('...and the 401 signs them out as it always did', signOuts === 1, signOuts);

section('THE SOURCE STILL DOES WHAT THIS FILE TESTS');
const src = fs.readFileSync('/home/user/Tenant-Pro/mobile/src/redesign/api.js', 'utf8');
chk('api.js shares one in-flight refresh', /if \(!refreshing\) \{[\s\S]{0,120}refreshing = doRefresh\(\)/.test(src), 'refreshOnce');
chk('...guards against a retry loop', /cfg\._retried = true/.test(src) && /!cfg\._retried/.test(src), '_retried');
chk('...treats ONLY a 401 as fatal', /fatal: status === 401/.test(src), 'fatal');
chk('...lets a non-fatal failure through without signing out', /if \(!r\.fatal\) return Promise\.reject\(error\)/.test(src), 'non-fatal');
chk('...refreshes with a BARE axios call, not the instrumented instance',
    /axios\.post\(`\$\{SERVER_URL\}\/api\/auth\/refresh`/.test(src), 'bare axios');
chk('...and persists the new pair', /onRefreshed\(\{ token, refresh: next \}\)/.test(src), 'onRefreshed');
const sess = fs.readFileSync('/home/user/Tenant-Pro/mobile/src/redesign/session.js', 'utf8');
chk('session.js writes the pair together', /multiSet\(\[\[tokenKey, token\], \[refreshKey, refresh\]\]\)/.test(sess), 'pair write');
chk('...and clearSession removes the refresh tokens too', /K\.ownerRefresh, K\.tenantRefresh, 'guestId'/.test(sess), 'clear');

console.log(`\n${'='.repeat(60)}`);
console.log(`${ok} passed, ${bad} failed`);
if (fails.length) { console.log('\nFAILURES:'); fails.forEach((f) => console.log('  · ' + f)); }
process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('THREW:', e); process.exit(1); });
