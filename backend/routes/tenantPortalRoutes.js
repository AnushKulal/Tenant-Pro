// File: backend/routes/tenantPortalRoutes.js
// Tenant-facing data API. All routes require a valid tenant token; the controller
// additionally checks role === 'tenant' and scopes every query to the caller's own
// linked tenant record.
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
    getMe,
    getPayments,
    getRequests,
    createRequest
} = require('../controllers/tenantPortalController');

router.use(protect);

router.get('/me', getMe);
router.get('/payments', getPayments);
router.get('/requests', getRequests);
router.post('/requests', createRequest);

module.exports = router;
