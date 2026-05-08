// File: backend/src/routes/ownerRoutes.js
const express = require('express');
const router = express.Router();
const { updateProfile, getDashboardStats, getAllTransactions } = require('../controllers/ownerController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// PUT /api/owner/profile
// 1. Check Token (protect)
// 2. Parse Form Data and save Image (upload.single)
// 3. Execute logic (updateProfile)
router.put('/profile', protect, upload.single('profile_pic'), updateProfile);

router.get('/dashboard', protect, getDashboardStats);

router.get('/transactions', protect, getAllTransactions);

module.exports = router;