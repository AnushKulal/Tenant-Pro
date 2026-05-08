const express = require('express');
const router = express.Router();

// Destructure our controller functions
const { addProperty, getProperties, updateProperty, deleteProperty } = require('../controllers/propertyController'); 

// IMPORT PROTECT EXACTLY LIKE OWNER ROUTES
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware'); 

// Route: GET /api/properties -> Fetches all properties
router.get('/', protect, getProperties);

// Route: POST /api/properties -> Adds a new property (supports image upload)
router.post('/', protect, upload.single('property_image'), addProperty);

// Update a property (Make sure to include your multer upload middleware for 'property_image')
router.put('/:id', protect, upload.single('property_image'), updateProperty);

// Delete a property
router.delete('/:id', protect, deleteProperty);

module.exports = router;