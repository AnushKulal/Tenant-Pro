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
const {
    lookupProperty,
    createJoinRequest,
    getMyJoinRequests
} = require('../controllers/joinController');
const {
    getMyDocuments,
    addMyDocument,
    deleteMyDocument
} = require('../controllers/documentController');

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

// --- Join requests ---
// The one thing here that works BEFORE the account is linked to a tenant record:
// asking a landlord to link it. Mounted on this router so it inherits the same
// tenant token check; the landlord decides at /api/owner/join-requests/:id.
// Resolve a scanned or typed invite code to the property it belongs to, so the
// tenant can see what they are about to ask to join. Lookup by code only — there is
// no browse-all, which would let any account enumerate every landlord's portfolio.
router.get('/property-lookup', lookupProperty);
router.post('/join-requests', createJoinRequest);
router.get('/join-requests', getMyJoinRequests);

// --- ID documents ---
// Like join requests, these work BEFORE the account is linked to a tenant record:
// a landlord is expected to look at an ID as part of deciding whether to link it.
router.get('/documents', getMyDocuments);
router.post('/documents', upload.single('document'), addMyDocument);
router.delete('/documents/:id', deleteMyDocument);

module.exports = router;
