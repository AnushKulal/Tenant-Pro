// File: backend/routes/tenantRoutes.js
const express = require('express');
const router = express.Router();
const { 
    addTenant, 
    getTenantsByUnit, 
    moveOutTenant, 
    getAllTenants,
    assignUnit,
    updateTenant,
    deleteTenant,
    updateFinancials,
    getUnassignedTenants, 
    assignTenantToRoom
} = require('../controllers/tenantController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

router.post('/', protect, upload.single('tenant_image'), addTenant);

// --- NEW ROUTE: Assign unassigned tenant to a unit ---
router.put('/assign', protect, assignUnit);

// --- Get Tenants By Unit ---
router.get('/unit/:unit_id', protect, getTenantsByUnit);

// --- Get Tenant List ---
router.get('/', protect, getAllTenants);

// --- NEW ROUTE: Update Tenant ---
router.put('/:id', protect, upload.single('tenant_image'), updateTenant);

router.put('/:id/move-out', protect, moveOutTenant); // Moves them out (Soft Delete)
router.delete('/:id', protect, deleteTenant);        // Erases them (Hard Delete)

// --- New Route: Update Financial Details (Rent) ---
router.put('/:id/financials', protect, updateFinancials);

// --- Fetch the unassigned tenant list 
router.get('/unassigned', protect, getUnassignedTenants);

// Assign a tenant to a room
router.put('/:id/assign', protect, assignTenantToRoom);

module.exports = router;