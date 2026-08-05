// File: backend/routes/tenantAuthRoutes.js
const express = require('express');
const router = express.Router();
const { registerTenant, loginTenant } = require('../controllers/tenantAuthController');

// Public: tenant registration and login
router.post('/register', registerTenant);
router.post('/login', loginTenant);

module.exports = router;
