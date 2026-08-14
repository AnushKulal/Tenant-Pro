// File: backend/routes/tenantAuthRoutes.js
const express = require('express');
const router = express.Router();
const { registerTenant, loginTenant } = require('../controllers/tenantAuthController');
const { rateLimit } = require('../middleware/rateLimit');

// Separate scope from the landlord login so one portal cannot exhaust the other's
// budget for the same IP.
const loginLimit = rateLimit({ max: 20, scope: 'tenant-login' });

// Public: tenant registration and login
router.post('/register', registerTenant);
router.post('/login', loginLimit, loginTenant);

// Guests can no longer be CREATED. The two public routes that did it — POST /guest
// and POST /guest-login — are gone along with their controllers, their rate-limit
// budgets and the GUEST_ACCESS_ENABLED flag that gated them. Nothing reached them:
// both screens were deleted, so they were an unauthenticated write and a credential
// endpoint with no caller, which is attack surface and nothing else.
//
// EXISTING guests are untouched and deliberately so. Someone may be holding a guest
// account right now: their token keeps working, `requireLiveStay` still enforces the
// end of their stay, the landlord can still read their code back, and
// POST /tenant-portal/claim-account is still there so they can turn it into a full
// account. Removing the door is not the same as evicting the people already through it.

module.exports = router;
