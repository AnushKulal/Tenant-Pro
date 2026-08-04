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

// Public Route: Register a new owner
router.post('/register', registerOwner);

// Public Route: Login an existing owner
router.post('/login', loginOwner);

// Public Route: Request a password reset code by email
router.post('/forgot-password', forgotPassword);

// Public Route: Reset the password using the emailed code
router.post('/reset-password', resetPassword);

module.exports = router;