// File: tests/ratelimit.test.js
//
// The limiter still limits.
//
// This guards a security control, and it exists because that control was made
// configurable. Sign-in and password reset in this app tell you plainly whether
// an account is registered — a deliberate choice, because "wrong email or
// password" sends somebody with no account round in circles — and the price of
// that choice is that the endpoints will confirm whether an address exists.
// Confirming it five times is support. Confirming it ten thousand times is a
// mailing list. The limiter is the entire difference, so "the default is
// unchanged" cannot be left as a claim in a commit message.
//
// Four things are checked, in this order of importance:
//   1. with no environment set, a scope stops at its own max — the production
//      behaviour, which is the only one that ships;
//   2. an override raises it, which is what the test suites need;
//   3. a scope's own override does not unlock its neighbours, so opening up one
//      endpoint for a test cannot quietly open the rest;
//   4. each scope and each IP counts separately, which is what makes the limit
//      about an attacker rather than about everybody at once.
//
//   node tests/ratelimit.test.js
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
    if (c) { pass += 1; console.log(`  ok   ${n}`); }
    else { fail += 1; console.log(`  FAIL ${n}${extra ? '  <- ' + extra : ''}`); }
};

const MOD = path.join(__dirname, '..', 'backend', 'middleware', 'rateLimit.js');

// Each scenario needs the module to see a different environment. Two things
// read it at two different moments, and getting that wrong is how the first
// version of this file reported the overrides as broken when they worked:
//
//   · WINDOW_MS is read once, when the module is required;
//   · a scope's allowance is read when rateLimit({...}) BUILDS the middleware.
//
// So the environment has to stay in place across both, which means running the
// whole scenario inside it rather than handing back a function and tidying up
// first.
const withEnv = (env, fn) => {
    const saved = {};
    for (const k of Object.keys(env)) { saved[k] = process.env[k]; process.env[k] = env[k]; }
    delete require.cache[require.resolve(MOD)];
    const { rateLimit } = require(MOD);
    try {
        return fn(rateLimit);
    } finally {
        for (const k of Object.keys(env)) {
            if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
        }
        delete require.cache[require.resolve(MOD)];
    }
};

// Drive the middleware without a server: a request is an IP, a response is
// whatever status it ends up with.
const hit = (mw, ip) => {
    let status = 0, body = null;
    const req = { ip, socket: {} };
    const res = {
        set: () => {},
        status(s) { status = s; return this; },
        json(j) { body = j; return this; }
    };
    let passed = false;
    mw(req, res, () => { passed = true; });
    return { allowed: passed, status, body };
};

// How many calls get through before the first refusal.
const through = (mw, ip, cap = 2000) => {
    let n = 0;
    for (let i = 0; i < cap; i += 1) {
        if (!hit(mw, ip).allowed) return n;
        n += 1;
    }
    return n;
};

console.log('='.repeat(60));
console.log('THE RATE LIMITER STILL LIMITS');
console.log('='.repeat(60));

console.log('\nWITH NOTHING SET, THE PRODUCTION NUMBERS APPLY');
withEnv({}, (rateLimit) => {
    ok('the reset scope stops after 5, as it always has',
        through(rateLimit({ max: 5, scope: 'reset' }), '1.1.1.1') === 5);
    ok('the login scope stops after 20',
        through(rateLimit({ max: 20, scope: 'login' }), '1.1.1.2') === 20);
    const mw = rateLimit({ max: 1, scope: 'solo' });
    hit(mw, '1.1.1.5');
    const r = hit(mw, '1.1.1.5');
    ok('...and a refusal is a 429 that says to try later',
        r.status === 429 && r.body && r.body.code === 'RATE_LIMITED' && /try again/i.test(r.body.message),
        JSON.stringify(r));
});

console.log('\nAN OVERRIDE RAISES IT — THAT IS WHAT THE SUITES NEED');
withEnv({ RATE_LIMIT_MAX: '1000' }, (rateLimit) => {
    ok('a blanket override lifts the reset scope',
        through(rateLimit({ max: 5, scope: 'reset' }), '2.2.2.1') === 1000);
});
withEnv({ RATE_LIMIT_RESET_MAX: '50' }, (rateLimit) => {
    ok('a scope override lifts that scope', through(rateLimit({ max: 5, scope: 'reset' }), '3.3.3.1') === 50);
    // The point of a per-scope override: opening up the endpoint under test must
    // not open the others. If this ever fails, one test's convenience has turned
    // into a hole everywhere.
    ok('...and leaves its neighbours exactly where they were',
        through(rateLimit({ max: 20, scope: 'login' }), '3.3.3.2') === 20);
});
withEnv({ RATE_LIMIT_MAX: '1000', RATE_LIMIT_RESET_MAX: '7' }, (rateLimit) => {
    ok('a scope override beats the blanket one',
        through(rateLimit({ max: 5, scope: 'reset' }), '4.4.4.1') === 7);
});

console.log('\nNONSENSE IN THE ENVIRONMENT CANNOT DISABLE IT');
for (const [label, v] of [['empty', ''], ['words', 'yes'], ['zero', '0'], ['negative', '-1']]) {
    withEnv({ RATE_LIMIT_MAX: v }, (rateLimit) => {
        ok(`${label} falls back to the real limit`,
            through(rateLimit({ max: 5, scope: 'reset' }), `5.5.5.${label.length}`) === 5);
    });
}

console.log('\nTHE COUNT IS PER IP AND PER SCOPE');
withEnv({}, (rateLimit) => {
    const login = rateLimit({ max: 3, scope: 'login' });
    const reset = rateLimit({ max: 3, scope: 'reset' });
    through(login, '6.6.6.1');
    ok('a spent IP on one scope is untouched on another', through(reset, '6.6.6.1') === 3);
    ok('...and another IP still has its full allowance', through(login, '6.6.6.2') === 3);
});

console.log('\n' + '='.repeat(60));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
