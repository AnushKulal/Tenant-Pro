// File: backend/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

// A missing JWT_SECRET used to fall back to the literal string 'your_secret_key'
// — a value that is in this file, in the git history, and in every tutorial this
// line was copied from. Anyone could sign their own token with it and be admitted
// as any user. Verification now uses the real secret only, and its absence is
// shouted at boot rather than silently downgrading every account's security.
const SECRET = process.env.JWT_SECRET || '';
if (!SECRET) {
    console.error('🚨 JWT_SECRET is not set. Every authenticated request will be refused until it is.');
}

const protect = (req, res, next) => {
    // Rewritten because the original could answer the SAME REQUEST TWICE.
    //
    // It assigned `token` inside a try, responded 401 in the catch WITHOUT
    // returning, and then fell through to `if (!token)`. With a header of exactly
    // "Bearer" (no value) the split yields undefined, jwt.verify throws, the catch
    // sends a 401 — and then `!token` is true, so it sends a second one. Express
    // throws ERR_HTTP_HEADERS_SENT at that point, which is an unhandled error on a
    // path every single authenticated request goes through. Found in a server log,
    // not by a test.
    //
    // Every branch now returns, so exactly one response leaves this function.
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Not authorized, no token' });
    }

    const token = header.slice('Bearer '.length).trim();
    if (!token) {
        return res.status(401).json({ message: 'Not authorized, no token' });
    }
    if (!SECRET) {
        return res.status(500).json({ message: 'Server is not configured for sign-in yet.' });
    }

    try {
        req.user = jwt.verify(token, SECRET); // { id, email, role? }
        return next();
    } catch (error) {
        return res.status(401).json({ message: 'Not authorized, token failed' });
    }
};

// Rejects a tenant's token on a landlord's route.
//
// This is not belt-and-braces, it closes a real hole. `protect` only proves the token
// is signed by us; it does not say which KIND of account it belongs to. The landlord
// handlers then read `req.user.id` and use it as an owners.id -- so a tenant whose
// tenant_users.id happened to equal a real owners.id was reading that landlord's
// dashboard, transactions, tenant list, properties and payment settings. The two
// tables have independent AUTO_INCREMENTs, so the collision is not exotic: the first
// tenant to register collides with the first landlord to register.
//
// Applied once per owner-facing router in server.js rather than handler by handler,
// because the handler-by-handler version is the one that already went wrong -- a new
// endpoint gets written, the check is forgotten, and nothing fails visibly.
//
// Tenant tokens are identified by role === 'tenant' rather than by REQUIRING
// role === 'owner': owner tokens issued before roles existed carry no role at all and
// stay valid for seven days, and locking those people out on deploy would be a worse
// bug than the one being fixed.
const requireOwner = (req, res, next) => {
    if (req.user?.role === 'tenant') {
        return res.status(403).json({ message: 'This is a landlord endpoint. Sign in with your landlord account.' });
    }
    next();
};

module.exports = { protect, requireOwner };