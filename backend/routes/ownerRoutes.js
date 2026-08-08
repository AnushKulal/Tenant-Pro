// File: backend/src/routes/ownerRoutes.js
const express = require('express');
const router = express.Router();
const { updateProfile, getDashboardStats, getAllTransactions } = require('../controllers/ownerController');
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
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// PUT /api/owner/profile
// 1. Check Token (protect)
// 2. Parse Form Data and save Image (upload.single)
// 3. Execute logic (updateProfile)
router.put('/profile', protect, upload.single('profile_pic'), updateProfile);

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

module.exports = router;