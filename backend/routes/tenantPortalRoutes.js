// File: backend/routes/tenantPortalRoutes.js
// Tenant-facing data API. All routes require a valid tenant token; the controller
// additionally checks role === 'tenant' and scopes every query to the caller's own
// linked tenant record.
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const {
    getMe,
    getPayments,
    getRequests,
    createRequest,
    getRequestMessages,
    createRequestMessage
} = require('../controllers/tenantPortalController');

router.use(protect);

router.get('/me', getMe);
router.get('/payments', getPayments);
router.get('/requests', getRequests);
// `request_image` is optional — multer's .single() passes a request with no file
// straight through, so a JSON body still works exactly as before.
router.post('/requests', upload.single('request_image'), createRequest);

// The tenant's half of a request's conversation — the same rows the landlord
// reads at /api/owner/requests/:id/messages.
router.get('/requests/:id/messages', getRequestMessages);
router.post('/requests/:id/messages', createRequestMessage);

module.exports = router;
