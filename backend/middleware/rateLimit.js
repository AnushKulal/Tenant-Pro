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
const WINDOW_MS = 15 * 60 * 1000;

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
const rateLimit = ({ max, scope }) => (req, res, next) => {
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

    if (entry.count > max) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        res.set('Retry-After', String(retryAfter));
        return res.status(429).json({
            code: 'RATE_LIMITED',
            message: `Too many attempts. Try again in ${Math.ceil(retryAfter / 60)} minute(s).`
        });
    }

    next();
};

module.exports = { rateLimit };
