const express = require('express');
const router = express.Router();
const { getPaymentSettings, savePaymentSettings, recordPayment } = require('../controllers/paymentController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware'); 

// Fetch settings
router.get('/settings', protect, getPaymentSettings);

// Save settings (expects 'qr_code' form-data key matching your frontend)
router.post('/settings', protect, upload.single('qr_code'), savePaymentSettings);

// Record a rent payment and update due date
router.post('/:id/payments', protect, recordPayment);

module.exports = router;