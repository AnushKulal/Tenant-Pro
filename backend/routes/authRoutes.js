// File: backend/routes/authRoutes.js
const express = require('express');
const router = express.Router();

// Destructure the specific functions from the controller
const {
    registerOwner,
    loginOwner,
    forgotPassword,
    resetPassword,
    refreshToken,
    logout
} = require('../controllers/authController');
const {
    startGoogle,
    googleCallback,
    pollGoogle,
    completeGoogle
} = require('../controllers/googleAuthController');
const { rateLimit } = require('../middleware/rateLimit');

// These endpoints answer whether an account exists, so they are the ones worth
// bounding. Reset is tighter than sign-in: a legitimate person needs one or two
// codes, and each attempt costs an email.
const loginLimit = rateLimit({ max: 20, scope: 'login' });
const resetLimit = rateLimit({ max: 5, scope: 'reset' });

// Public Route: Register a new owner
router.post('/register', registerOwner);

// Public Route: Login an existing owner
router.post('/login', loginLimit, loginOwner);

// Public Route: Request a password reset code by email
router.post('/forgot-password', resetLimit, forgotPassword);

// Public Route: Reset the password using the emailed code
router.post('/reset-password', resetLimit, resetPassword);

// ── Session lifecycle ──────────────────────────────────────────────────────────
//
// Both PUBLIC on purpose. /refresh is called precisely when the access token has
// expired, so requiring a valid one would make it useful only to callers who do not
// need it; the refresh token is the credential, and it is single-use.
//
// /refresh is bounded generously rather than tightly: a legitimate app refreshes once
// every couple of hours, but a phone coming back from a flaky connection can fire
// several at once, and cutting those off would log somebody out for having bad signal
// — the exact failure this area exists to prevent. Reuse detection, not a rate limit,
// is what guards this endpoint.
router.post('/refresh', rateLimit({ max: 60, scope: 'refresh' }), refreshToken);

// Unbounded, because it only ever DESTROYS a session. There is nothing here worth
// brute-forcing, and refusing a sign-out because somebody signed out too often would
// be an odd way to protect them.
router.post('/logout', logout);

// ── Google sign-in ─────────────────────────────────────────────────────────────
// Both roles share these: the app says which one it wants at /start, and the role
// is stored server-side from that moment. It is NOT re-read from the client later,
// because the role decides which table the account lives in.
router.post('/google/start', loginLimit, startGoogle);

// Google redirects a BROWSER here, so it is a GET and it answers with HTML.
//
// Deliberately NOT behind loginLimit. The rate limiter keys on IP, and this request
// arrives from the person's phone browser rather than from the app — but more
// importantly, a limiter here would reject Google's redirect after a legitimate
// person retried twice, stranding them on an error page with no way back. The
// single-use `state` is what protects this endpoint, and it is a stronger guard than
// a request count.
router.get('/google/callback', googleCallback);

// Polled every couple of seconds while the browser is open, so it needs a much
// higher ceiling than a login attempt — the default 20 would cut a legitimate
// sign-in off after forty seconds of the person reading Google's consent screen.
router.post('/google/poll', rateLimit({ max: 200, scope: 'google-poll' }), pollGoogle);

// Creates the account on a first-ever Google sign-in. Bounded like a registration,
// because that is what it is.
router.post('/google/complete', loginLimit, completeGoogle);

module.exports = router;