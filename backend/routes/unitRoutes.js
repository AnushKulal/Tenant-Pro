// File: backend/routes/unitRoutes.js
const express = require('express');
const router = express.Router();
const { 
    addUnit, 
    getUnits, 
    updateUnit, 
    deleteUnit, 
    getAvailableUnits,
    updateUnitSettings
} = require('../controllers/unitController'); 
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware'); 

// --- NEW ROUTE: Fetch units with empty beds ---
// MUST BE ABOVE /:id so Express doesn't think "available" is an ID
router.get('/available', protect, getAvailableUnits);

// --- Get Rooms and Add New Room Routes ---
router.get('/', protect, getUnits);
router.post('/', protect, upload.single('room_image'), addUnit);

// --- Edit and Delete Routes ---
router.put('/:id', protect, upload.single('room_image'), updateUnit);
router.delete('/:id', protect, deleteUnit);

// --- Reminders Notifications ---
router.put('/:id/settings', protect, updateUnitSettings);

module.exports = router;