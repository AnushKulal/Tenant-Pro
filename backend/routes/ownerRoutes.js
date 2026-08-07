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

module.exports = router;