// File: backend/routes/tenantAuthRoutes.js
const express = require('express');
const router = express.Router();
const { registerTenant, loginTenant } = require('../controllers/tenantAuthController');
const { joinAsGuest, guestLogin } = require('../controllers/guestController');
const upload = require('../middleware/uploadMiddleware');
const { rateLimit } = require('../middleware/rateLimit');

// Separate scope from the landlord login so one portal cannot exhaust the other's
// budget for the same IP.
const loginLimit = rateLimit({ max: 20, scope: 'tenant-login' });

// Two budgets, because the two routes are abused differently and sharing one would
// mean a few mistyped guest IDs stopped anybody else in the building from joining.
//
// Signing in with a guest ID is a credential guess, so it is the tighter of the two.
// It does not need to be very tight to be safe: the code space is ~594 million and
// the attacker also needs the matching phone number, so 15 tries per 15 minutes is
// several thousand years of guessing. Its own scope, so brute-forcing a guest cannot
// exhaust the budget real tenants use to sign in with a password.
const guestLoginLimit = rateLimit({ max: 15, scope: 'guest-login' });

// Joining is looser: every attempt costs the caller a distinct phone number and an
// uploaded document, and the result lands visibly in a landlord's inbox for a
// decision. The real-world case that must not be blocked is several people moving
// into the same building on the same wifi on the same afternoon.
const guestJoinLimit = rateLimit({ max: 30, scope: 'guest-join' });

// Public: tenant registration and login
router.post('/register', registerTenant);
router.post('/login', loginLimit, loginTenant);

// Public: joining as a guest.
//
// This is the only unauthenticated write in the tenant API, and it is one on
// purpose: a guest has no account yet, so requiring a token to create one is the
// circular requirement that made the old "join as a guest" button a dead end.
// `document` is the multipart field carrying the government ID — required, and the
// entire basis on which a landlord is being asked to accept a stranger.
router.post('/guest', guestJoinLimit, upload.single('document'), joinAsGuest);
router.post('/guest-login', guestLoginLimit, guestLogin);

module.exports = router;
