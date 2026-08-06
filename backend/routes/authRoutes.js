// File: backend/routes/authRoutes.js
const express = require('express');
const router = express.Router();

// Destructure the specific functions from the controller
const {
    registerOwner,
    loginOwner,
    forgotPassword,
    resetPassword
} = require('../controllers/authController');
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

module.exports = router;