// File: backend/src/routes/ownerRoutes.js
const express = require('express');
const router = express.Router();
const { updateProfile, getDashboardStats, getAllTransactions, getPulse } = require('../controllers/ownerController');
const {
    getRequests,
    updateStatus,
    getMessages,
    createMessage
} = require('../controllers/requestController');
const {
    getJoinRequests,
    decideJoinRequest
} = require('../controllers/joinController');
const {
    getTenantDocuments,
    getApplicantDocuments,
    decideDocument
} = require('../controllers/documentController');
const { createIdRequest, cancelIdRequest } = require('../controllers/idRequestController');
const { savePushToken, dropPushToken, sendTestPush } = require('../controllers/pushController');
const { getDemoStatus, resetDemo } = require('../controllers/demoController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// PUT /api/owner/profile
// 1. Check Token (protect)
// 2. Parse Form Data and save Image (upload.single)
// 3. Execute logic (updateProfile)
router.put('/profile', protect, upload.single('profile_pic'), updateProfile);

// Polled every few seconds while the app is open, so it must stay cheap: counts and
// a stamp, nothing else. The client only reloads the real data when the stamp moves.
router.get('/pulse', protect, getPulse);

router.get('/dashboard', protect, getDashboardStats);

router.get('/transactions', protect, getAllTransactions);

// --- Maintenance queue ---
// Mounted on the owner router rather than a router of its own so these inherit
// the same owner token check as everything else under /api/owner.
router.get('/requests', protect, getRequests);
router.put('/requests/:id/status', protect, updateStatus);

// The landlord's half of a request's conversation. The tenant's half lives at
// /api/tenant-portal/requests/:id/messages and reads the same rows.
router.get('/requests/:id/messages', protect, getMessages);
router.post('/requests/:id/messages', protect, createMessage);

// --- Join requests ---
// Tenants ask to be let into a property at /api/tenant-portal/join-requests; this
// is the landlord's end of that — the inbox and the accept/reject decision. Same
// router as the maintenance queue for the same reason: one owner token check.
router.get('/join-requests', protect, getJoinRequests);
router.put('/join-requests/:id', protect, decideJoinRequest);

// --- ID documents ---
// Two ways in, because there are two moments a landlord needs to see an ID: when
// somebody is already their tenant, and when a stranger is asking to be. Both are
// scoped inside the controller — see its header for why nothing else grants access.
router.get('/tenants/:id/documents', protect, getTenantDocuments);
router.get('/join-requests/:id/documents', protect, getApplicantDocuments);
// The manual check itself: verified or rejected, with an optional note.
router.put('/documents/:id', protect, decideDocument);
// Asking for one that is not there yet. Scoped by tenant rather than by portal
// account: the landlord is asking a PERSON, and a tenant they typed in by hand can be
// asked before they have ever opened the app.
router.post('/tenants/:id/id-request', protect, createIdRequest);
// And withdrawing it — the only way to stop a prompt on somebody's home screen after
// asking by mistake, or after getting the document another way.
router.delete('/tenants/:id/id-request', protect, cancelIdRequest);

// --- Push notifications ---
// This device, so the landlord hears about a join request or a declared payment
// without having to open the app and look.
router.post('/push-token', protect, savePushToken);
router.delete('/push-token', protect, dropPushToken);

// "Did that actually arrive?" — the only way to answer it without staging a real event
// against a real tenant. Scoped in the controller to the caller and their own tenants.
router.post('/push-test', protect, sendTestPush);

// --- Demo account ---
// The demo is a real account that KEEPS whatever a demo does to it, so restoring its
// rich picture is an explicit action rather than something boot does behind your back.
// GET answers for every landlord (`is_demo` tells the app whether to show the control);
// POST refuses anyone but the demo account, since it deletes payments and history.
router.get('/demo', protect, getDemoStatus);
router.post('/demo/reset', protect, resetDemo);

module.exports = router;