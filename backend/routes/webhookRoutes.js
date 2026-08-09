// File: backend/routes/webhookRoutes.js
// Inbound events from payment providers. No `protect` here and none wanted: the
// caller is a machine with no account, and its HMAC signature is the credential.
// See controllers/webhookController.js — every request is refused unless the
// provider's secret is configured AND the signature over the raw body matches.
const express = require('express');
const router = express.Router();
const { handlePaymentWebhook } = require('../controllers/webhookController');

// POST /api/webhooks/payments/razorpay  (or /cashfree)
// Dormant until the matching *_WEBHOOK_SECRET is set; answers 404 otherwise, so an
// unconfigured provider looks like nothing at all from the outside.
router.post('/payments/:provider', handlePaymentWebhook);

module.exports = router;
