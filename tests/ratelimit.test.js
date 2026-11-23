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
const hit = (mw, ip, outcome) => {
    let status = 0, body = null;
    const req = { ip, socket: {} };
    // `outcome` is the status the handler would have ended with. Supplying it
    // makes the response emit 'finish', which is what a failures-only limiter
    // listens for to hand a successful attempt back.
    const finishers = [];
    const res = {
        set: () => {},
        on(ev, fn) { if (ev === 'finish') finishers.push(fn); return this; },
        status(s) { status = s; return this; },
        json(j) { body = j; return this; }
    };
    let passed = false;
    mw(req, res, () => { passed = true; });
    if (outcome !== undefined && passed) {
        res.statusCode = outcome;
        finishers.forEach((fn) => fn());
    }
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


// ── Counting refusals rather than requests ────────────────────────────────────
//
// On a credential endpoint the attacker's currency is a REFUSED reply; a 200
// means the caller already held the password. So `countOnly: 'failures'` hands
// a successful attempt back, and the reported bug — a correct password refused
// because the budget had been spent by successes — stops being possible.
//
// The ordering matters more than the feature. The attempt is counted on arrival
// and refunded afterwards, never counted only on failure, because a burst that
// all arrived before any of them answered would otherwise all see an empty
// bucket and all go through.
console.log('\nCOUNTING REFUSALS RATHER THAN REQUESTS');
withEnv({}, (rateLimit) => {
    const mw = rateLimit({ max: 3, scope: 'login', countOnly: 'failures' });
    // Ten successes against a budget of three.
    let allowedCount = 0;
    for (let i = 0; i < 10; i += 1) if (hit(mw, '7.7.7.1', 200).allowed) allowedCount += 1;
    ok('a correct password never spends the budget', allowedCount === 10, `${allowedCount}/10 allowed`);

    // Failures still bite, on a fresh IP.
    ok('refusals are still counted', through(rateLimit({ max: 3, scope: 'login', countOnly: 'failures' }), '7.7.7.2') === 3);
});

withEnv({}, (rateLimit) => {
    // Everything arrives before anything answers: the ceiling must still hold.
    const mw = rateLimit({ max: 3, scope: 'login', countOnly: 'failures' });
    const inFlight = [];
    for (let i = 0; i < 20; i += 1) inFlight.push(hit(mw, '7.7.7.3'));
    const got = inFlight.filter((r) => r.allowed).length;
    ok('a burst that answers nothing cannot exceed the ceiling', got === 3, `${got} got through`);
});

withEnv({}, (rateLimit) => {
    const mw = rateLimit({ max: 3, scope: 'login', countOnly: 'failures' });
    // A 500 is not a success. Refunding one would make a payload that crashes
    // the handler into an unmetered probe.
    let n = 0;
    for (let i = 0; i < 10; i += 1) if (hit(mw, '7.7.7.4', 500).allowed) n += 1;
    ok('a server error keeps its cost', n === 3, `${n} allowed`);
});

withEnv({}, (rateLimit) => {
    // The scopes where the SUCCESS is the thing worth bounding keep counting it:
    // on /forgot-password a 200 is the enumeration signal and costs an email, and
    // on /register the success is the abuse.
    const reset = rateLimit({ max: 3, scope: 'reset' });
    let n = 0;
    for (let i = 0; i < 10; i += 1) if (hit(reset, '7.7.7.5', 200).allowed) n += 1;
    ok('reset still counts successes', n === 3, `${n} allowed`);
    const reg = rateLimit({ max: 3, scope: 'register' });
    let m = 0;
    for (let i = 0; i < 10; i += 1) if (hit(reg, '7.7.7.6', 201).allowed) m += 1;
    ok('register still counts successes', m === 3, `${m} allowed`);
});

console.log('\nTHE REVERT FLAG IS A REAL REVERT');

// The flag's whole promise is that setting one variable puts the OLD behaviour
// back, so both sides are driven here rather than only the new one. The pair
// below is the promise stated twice: same middleware, same ten successful
// sign-ins, and the only difference is the variable.
withEnv({}, (rateLimit) => {
    const mw = rateLimit({ max: 3, scope: 'login', countOnly: 'failures' });
    let n = 0;
    for (let i = 0; i < 10; i += 1) if (hit(mw, '9.9.9.1', 200).allowed) n += 1;
    ok('unset: ten correct sign-ins all go through', n === 10, `${n} allowed`);
});

withEnv({ RATE_LIMIT_REFUND: 'off' }, (rateLimit) => {
    const mw = rateLimit({ max: 3, scope: 'login', countOnly: 'failures' });
    let n = 0;
    for (let i = 0; i < 10; i += 1) if (hit(mw, '9.9.9.2', 200).allowed) n += 1;
    ok('off: a correct sign-in spends budget again, stopping at 3', n === 3, `${n} allowed`);
});

withEnv({ RATE_LIMIT_REFUND: 'off' }, (rateLimit) => {
    // The half that must NOT change. Reverting the refund is meant to restore
    // the old cost of a success, not to loosen what a wrong password costs.
    const mw = rateLimit({ max: 3, scope: 'login', countOnly: 'failures' });
    let n = 0;
    for (let i = 0; i < 10; i += 1) if (hit(mw, '9.9.9.3', 401).allowed) n += 1;
    ok('off: wrong passwords are still bounded at 3', n === 3, `${n} allowed`);
});

withEnv({ RATE_LIMIT_REFUND: 'off', RATE_LIMIT_LOGIN_MAX: '7' }, (rateLimit) => {
    // The flag and the allowances are separate dials; turning one must not move
    // the other, or a revert under test conditions would read as a pass.
    const mw = rateLimit({ max: 3, scope: 'login', countOnly: 'failures' });
    let n = 0;
    for (let i = 0; i < 12; i += 1) if (hit(mw, '9.9.9.4', 200).allowed) n += 1;
    ok("off: a scope's own override still applies, stopping at 7", n === 7, `${n} allowed`);
});

withEnv({ RATE_LIMIT_REFUND: 'off' }, (rateLimit) => {
    // Nothing to revert on these: they counted successes before the rewrite and
    // they count them after, because there the 200 IS the signal and the abuse.
    const reset = rateLimit({ max: 3, scope: 'reset' });
    let n = 0;
    for (let i = 0; i < 10; i += 1) if (hit(reset, '9.9.9.5', 200).allowed) n += 1;
    ok('off: the always-counting scopes are untouched by the flag', n === 3, `${n} allowed`);
});

// Whoever reaches for this will be typing it into a dashboard field under
// pressure, so the spelling is forgiving in the directions that are safe.
[['OFF', 'upper case'], [' off ', 'stray spaces'], ['Off', 'mixed case']].forEach(([v, why]) => {
    withEnv({ RATE_LIMIT_REFUND: v }, (rateLimit) => {
        const mw = rateLimit({ max: 3, scope: 'login', countOnly: 'failures' });
        let n = 0;
        for (let i = 0; i < 10; i += 1) if (hit(mw, '9.9.9.6', 200).allowed) n += 1;
        ok(`off survives ${why}`, n === 3, `${n} allowed`);
    });
});

// Forgiving in the safe directions only. A value that is not the word "off"
// leaves the shipped behaviour alone rather than guessing at an intention, so a
// typo cannot quietly half-revert a security control.
[['of', 'a typo'], ['false', 'the wrong word'], ['0', 'a zero'], ['', 'an empty value']].forEach(([v, why]) => {
    withEnv({ RATE_LIMIT_REFUND: v }, (rateLimit) => {
        const mw = rateLimit({ max: 3, scope: 'login', countOnly: 'failures' });
        let n = 0;
        for (let i = 0; i < 10; i += 1) if (hit(mw, '9.9.9.7', 200).allowed) n += 1;
        ok(`${why} does not revert anything`, n === 10, `${n} allowed`);
    });
});

withEnv({ RATE_LIMIT_REFUND: 'on' }, (rateLimit) => {
    const mw = rateLimit({ max: 3, scope: 'login', countOnly: 'failures' });
    let n = 0;
    for (let i = 0; i < 10; i += 1) if (hit(mw, '9.9.9.8', 200).allowed) n += 1;
    ok('on: says out loud what unset already does', n === 10, `${n} allowed`);
});

console.log('\n' + '='.repeat(60));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
