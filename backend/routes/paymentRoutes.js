const express = require('express');
const router = express.Router();
const {
    getPaymentSettings,
    savePaymentSettings,
    connectGateway,
    toggleGateway,
    disconnectGateway,
    recordPayment,
    getDeclaredPayments,
    decidePayment
} = require('../controllers/paymentController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware'); 

// Fetch settings
router.get('/settings', protect, getPaymentSettings);

// Save settings (expects 'qr_code' form-data key matching your frontend)
router.post('/settings', protect, upload.single('qr_code'), savePaymentSettings);

// The landlord's own payment gateway. Separate from /settings on purpose: these three
// handle a credential, so they take JSON only (no multer, nothing multipart) and the
// read above never returns what they store.
//
// Above '/:id/payments' for the same reason '/declared' is — Express matches in order,
// and 'gateway' must not be readable as a tenant id.
router.post('/gateway', protect, connectGateway);
router.put('/gateway', protect, toggleGateway);
router.delete('/gateway', protect, disconnectGateway);

// Payments a tenant SAYS they have made, waiting on the landlord.
//
// Declared before '/:id/payments' below: Express matches in order, and although the
// two differ by method today, a future GET on '/:id/payments' would otherwise
// swallow '/declared' as an id.
router.get('/declared', protect, getDeclaredPayments);
router.put('/declared/:id', protect, decidePayment);

// Record a rent payment and update due date
router.post('/:id/payments', protect, recordPayment);

module.exports = router;