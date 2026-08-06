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

module.exports = router;
