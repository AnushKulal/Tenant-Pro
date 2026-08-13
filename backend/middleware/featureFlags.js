// File: backend/middleware/featureFlags.js
//
// Refuse a route because the feature it belongs to is switched off.
//
// 403 rather than 404 or 503, deliberately: the route exists (404 would be a lie the
// app cannot act on), and nothing is broken or transient (503 invites a retry that will
// never succeed). 403 with a machine-readable code is the honest answer — "this is
// turned off, stop asking".
//
// Every guard carries its own sentence, because the two guest routes are refused for
// different reasons and "guest access is disabled" tells a person nothing about what to
// do instead. The `code` is shared so the app branches once.
const { guestJoinEnabled, guestLoginEnabled, GUEST_ACCESS_DISABLED } = require('../config/features');

const refuse = (res, message) => res.status(403).json({ code: GUEST_ACCESS_DISABLED, message });

// New guests. Must be mounted BEFORE multer and before the rate limiter — see the note
// in tenantAuthRoutes.js for why the order is load-bearing rather than stylistic.
const requireGuestJoin = (message) => (req, res, next) => (
    guestJoinEnabled() ? next() : refuse(res, message)
);

// Returning guests. Separate from the above so 'login-only' can keep this open while
// closing the door to new ones — the whole reason the flag has three states.
const requireGuestLogin = (message) => (req, res, next) => (
    guestLoginEnabled() ? next() : refuse(res, message)
);

module.exports = { requireGuestJoin, requireGuestLogin };
