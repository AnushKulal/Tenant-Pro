// File: tests/authlimits.test.js
//
// Every auth route carries its own budget, and nothing re-pools them.
//
// tests/ratelimit.test.js already proves the middleware counts correctly. This
// file guards the other half, which is where the bug actually was: WHERE the
// limiters are attached.
//
// server.js used to mount ONE express-rate-limit instance at both /api/auth and
// /api/tenant-auth. One instance is one counter keyed on IP alone — no path, no
// method — so the two prefixes shared a single 30-per-15-minutes budget that
// every route under both of them spent from. The consequences were not subtle:
//
//   · it ran first and counted everything, so no inner budget above 30 could be
//     reached — refresh's 60 and the Google poll's 200 were unreachable numbers;
//   · it covered logout, token refresh and Google's browser redirect, the three
//     routes the route files argue in comments must NOT be bounded;
//   · it pooled the landlord and tenant portals, which is the exact thing
//     tenantAuthRoutes.js uses a separate scope to prevent.
//
// In practice: a Google sign-in poll fires every 2.5s, so about 75 seconds of a
// legitimate Google attempt emptied the shared budget and the TENANT password
// form then refused a correct password for the rest of the window.
//
// The invariant this file encodes is therefore: auth rate limiting lives in the
// route files, per endpoint, and server.js does not put a second one in front.
// Checked by reading the source rather than by booting a server, so it runs
// offline and fails loudly the moment someone re-adds a blanket mount.
//
//   node tests/authlimits.test.js
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
    if (c) { pass += 1; console.log(`  ok   ${n}`); }
    else { fail += 1; console.log(`  FAIL ${n}${extra ? '  <- ' + extra : ''}`); }
};

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', 'backend', ...p), 'utf8');
const server = read('server.js');
const ownerRoutes = read('routes', 'authRoutes.js');
const tenantRoutes = read('routes', 'tenantAuthRoutes.js');

// Comments explain the history, so only real code counts.
const code = (src) => src
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');

console.log('NO BLANKET LIMITER IN FRONT OF THE AUTH PREFIXES');
const serverCode = code(server);

// Mounting the ROUTER on a prefix is required and fine:
//   app.use('/api/auth', authRoutes)
// Mounting a LIMITER on one is the bug:
//   app.use('/api/auth', authLimiter)
// So the check is about what is passed, not about whether a mount exists. Any
// argument whose name mentions a limit, or an inline rateLimit(...) call, fails.
for (const prefix of ['/api/auth', '/api/tenant-auth']) {
    const re = new RegExp(`app\\.use\\(\\s*['"\`]${prefix.replace(/\//g, '\\/')}['"\`]\\s*,([^;]*)\\)`, 'g');
    let offending = [];
    let m;
    while ((m = re.exec(serverCode))) {
        if (/limit/i.test(m[1]) || /rateLimit\s*\(/.test(m[1])) offending.push(m[1].trim().slice(0, 60));
    }
    ok(`nothing limiter-shaped is mounted on ${prefix}`, offending.length === 0,
        offending.length ? 'found: ' + offending.join(' | ') : '');
}
ok('no authLimiter instance survives in server.js', !/authLimiter/.test(serverCode));
// One limiter in this file, and it is the flood guard. A second one appearing
// here is how the shared-counter bug would come back.
const limiterCount = (serverCode.match(/=\s*rateLimit\s*\(/g) || []).length;
ok('server.js builds exactly one limiter', limiterCount === 1, 'built ' + limiterCount);
ok('the general /api flood guard is still mounted', /app\.use\(\s*['"`]\/api['"`]\s*,\s*apiLimiter/.test(serverCode));

console.log('\nEVERY AUTH ROUTE IS EITHER BUDGETED OR DELIBERATELY EXEMPT');
// The three the route files argue must stay unbounded, each with its reason:
//   logout   — only ever DESTROYS a session; nothing to brute-force.
//   refresh  — has its own generous scope; reuse detection is its real guard.
//   callback — Google redirects a BROWSER here; a limiter strands the person.
// `refresh` does carry an inner limiter, so it is listed as budgeted below; only
// the two that genuinely carry none are exempt.
const EXEMPT = new Set(['/logout', '/google/callback']);

const routesOf = (src) => {
    const out = [];
    const re = /router\.(get|post|put|delete)\(\s*['"`]([^'"`]+)['"`]\s*,([^\n]*)/g;
    let m;
    while ((m = re.exec(code(src)))) out.push({ verb: m[1], route: m[2], rest: m[3] });
    return out;
};

const budgeted = (rest) => /rateLimit\(|Limit\b/.test(rest);

for (const [label, src] of [['authRoutes.js', ownerRoutes], ['tenantAuthRoutes.js', tenantRoutes]]) {
    const routes = routesOf(src);
    ok(`${label}: found routes to check`, routes.length > 0, 'the regex found none, so this file proves nothing');
    for (const r of routes) {
        if (EXEMPT.has(r.route)) {
            ok(`${label}: ${r.route} is intentionally unbounded`, !budgeted(r.rest),
                'it gained a limiter — if that is deliberate, take it off the exempt list');
        } else {
            ok(`${label}: ${r.route} carries its own limiter`, budgeted(r.rest),
                'an auth route with no budget and no blanket mount in front of it is unprotected');
        }
    }
}

console.log('\nTHE TWO PORTALS DO NOT SHARE A SCOPE');
const scopesOf = (src) => {
    const out = [];
    const re = /scope:\s*['"`]([^'"`]+)['"`]/g;
    let m;
    while ((m = re.exec(code(src)))) out.push(m[1]);
    return out;
};
const ownerScopes = scopesOf(ownerRoutes);
const tenantScopes = scopesOf(tenantRoutes);
ok('both portals declare scopes', ownerScopes.length > 0 && tenantScopes.length > 0);
const shared = ownerScopes.filter((s) => tenantScopes.includes(s));
ok('no scope name is used by both portals', shared.length === 0,
    shared.length ? 'shared: ' + shared.join(', ') : '');

console.log('\nREGISTRATION IS BOUNDED ON BOTH SIDES');
// This is what the blanket limiter was the only thing guarding. Removing it
// without adding these would have widened the surface rather than fixed it.
ok('owner registration has a budget', /router\.post\(\s*['"`]\/register['"`]\s*,[^\n]*Limit/.test(code(ownerRoutes)));
ok('tenant registration has a budget', /router\.post\(\s*['"`]\/register['"`]\s*,[^\n]*Limit/.test(code(tenantRoutes)));

console.log('\n' + '='.repeat(60));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
