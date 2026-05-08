// File: backend/src/middleware/uploadMiddleware.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let subfolder = 'misc'; 

        // --- UPDATED: Route files to specific folders based on their fieldname ---
        if (file.fieldname === 'profile_pic' || file.fieldname === 'tenant_image') {
            subfolder = 'profiles';
        } else if (file.fieldname === 'property_image') {
            subfolder = 'property';
        } else if (file.fieldname === 'document') { 
            subfolder = 'documents';
        } else if (file.fieldname === 'room_image') {
            subfolder = 'rooms';
        } else if (file.fieldname === 'qr_code') { // <-- NEW: Route QR codes to payments
            subfolder = 'payments';
        }

        const uploadPath = path.join(process.cwd(), 'uploads', subfolder);

        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }

        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        let prefix = 'file-';
        
        if (file.fieldname === 'profile_pic') prefix = 'profile-';
        else if (file.fieldname === 'property_image') prefix = 'property-';
        else if (file.fieldname === 'document') prefix = 'doc-';
        else if (file.fieldname === 'room_image') prefix = 'room-';
        else if (file.fieldname === 'tenant_image') prefix = 'tenant-';
        else if (file.fieldname === 'qr_code') prefix = 'qr-'; // <-- NEW: Add 'qr-' prefix

        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, prefix + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Not an image! Please upload an image file.'), false);
    }
};

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: fileFilter
});

module.exports = upload;