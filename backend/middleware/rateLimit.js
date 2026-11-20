// Fixed-window rate limiter for the auth endpoints.
//
// Why it exists: sign-in and password reset now tell you plainly whether an account
// is registered. That is a deliberate product choice — "wrong email or password"
// sends someone with no account round in circles — but it does mean the endpoints
// will confirm whether a given address exists. Confirming it a handful of times is
// support; confirming it ten thousand times is a mailing list. Rate limiting is what
// separates the two, and it is the standard answer to enumeration for apps that
// choose clear errors.
//
// In-memory on purpose: this runs as a single Render instance, so a shared store
// would be infrastructure with no benefit. If the service is ever scaled to more
// than one instance, each would count separately and the effective limit multiplies
// — that is the point to move this to Redis, not before.
// The window, and every scope's allowance, can be raised by environment
// variable. The defaults are the production numbers and are what runs when
// nothing is set — see the same note on the express limiters in server.js.
//
// This one needs it for a reason of its own: the reset scope allows FIVE
// attempts per fifteen minutes, which is right for a stranger probing whether
// an address is registered and far too few for a suite that exercises the
// reset flow properly. Two assertions in api.e2e — that an unknown address
// does not reveal itself, and that a wrong reset code is refused — failed on a
// 429 rather than on anything the endpoint did.
//
//   RATE_LIMIT_MAX=100000          raises every scope
//   RATE_LIMIT_RESET_MAX=100       raises one (scope name, upper case)
//   RATE_LIMIT_WINDOW_MS=1000      shortens the window
//
// A deployment sets none of them and behaves exactly as it did before.
const num = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
};

const WINDOW_MS = num(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);

// A scope's own override wins over the blanket one, so a test can open up the
// endpoint it is exercising without unlocking the rest.
const allowanceFor = (scope, max) => {
    const key = 'RATE_LIMIT_' + String(scope).toUpperCase().replace(/[^A-Z0-9]+/g, '_') + '_MAX';
    return num(process.env[key], num(process.env.RATE_LIMIT_MAX, max));
};

const buckets = new Map();

// Old entries would otherwise accumulate for every IP that ever called. Unref'd so
// it never holds the process open.
const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of buckets) {
        if (now > entry.resetAt) buckets.delete(key);
    }
}, WINDOW_MS);
sweeper.unref?.();

/**
 * @param {object} opts
 * @param {number} opts.max      attempts allowed per window
 * @param {string} opts.scope    keeps separate endpoints from sharing a budget
 */
const rateLimit = ({ max, scope, countOnly }) => {
    const allowed = allowanceFor(scope, max);
    // What this counts, and why "every request" was the wrong answer on sign-in.
    //
    // An attacker's currency on a credential endpoint is a REFUSED reply. Every
    // enumeration probe, every stuffed pair, every guess comes back 400, 401, 404
    // or 409. A 200 means the caller already held the password and learned nothing
    // by asking. So counting refusals bounds the attack exactly as counting
    // requests did, and stops bounding the one thing that was never an attack:
    // somebody signing in correctly.
    //
    // That is not cosmetic. The key is `scope:ip`, and on carrier NAT or office
    // wifi one address is many people — so counting successes meant a stranger's
    // ordinary sign-ins could refuse yours, with your password correct and never
    // checked. That is the shape of the bug this was reported as.
    //
    // Deliberately NOT the default, and the exceptions are the security argument.
    // On /forgot-password the 200 IS the enumeration signal — "that address exists
    // and I have just emailed it" — and each one costs an email, so a success
    // there is precisely what must be counted. On /register the success IS the
    // abuse. Those keep counting every request.
    const refundSuccess = countOnly === 'failures';
    return (req, res, next) => {
    // Render sits behind a proxy, so req.ip is only meaningful with 'trust proxy'
    // set (see server.js). Falling back to the socket address keeps this working
    // locally too.
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `${scope}:${ip}`;
    const now = Date.now();

    let entry = buckets.get(key);
    if (!entry || now > entry.resetAt) {
        entry = { count: 0, resetAt: now + WINDOW_MS };
        buckets.set(key, entry);
    }

    entry.count += 1;

    if (entry.count > allowed) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        res.set('Retry-After', String(retryAfter));
        return res.status(429).json({
            code: 'RATE_LIMITED',
            message: `Too many attempts. Try again in ${Math.ceil(retryAfter / 60)} minute(s).`
        });
    }

    // `res.on` is always there under Express; the guard is for the unit tests,
    // which drive this with a minimal response object, and means a caller that
    // cannot report an outcome simply keeps counting every request rather than
    // throwing.
    if (refundSuccess && typeof res.on === 'function') {
        // Counted on ARRIVAL above and handed back here, rather than counted once
        // the answer is known. That ordering is load-bearing: deferring the
        // increment would let a thousand simultaneous guesses all find a count of
        // zero and all go through, handing an attacker the whole window in one
        // burst. Counting first and refunding after keeps the ceiling exact.
        //
        // Only 2xx and 3xx are refunded. Everything else keeps its cost, and that
        // INCLUDES 5xx: a payload that makes the handler throw would otherwise be
        // an unmetered probe, which is the opposite of the point.
        let settled = false;
        res.on('finish', () => {
            if (settled) return;
            settled = true;
            if (res.statusCode >= 200 && res.statusCode < 400) {
                // Only if this is still the same window. A refund into a bucket
                // that has already rolled over would credit the next window with
                // an attempt that was never made in it.
                if (buckets.get(key) === entry && entry.count > 0) entry.count -= 1;
            }
        });
    }

    next();
    };
};

module.exports = { rateLimit };
