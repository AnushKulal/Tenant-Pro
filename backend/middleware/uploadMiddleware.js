// File: backend/middleware/uploadMiddleware.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// -----------------------------------------------------------------------------
// STORAGE MODE
// -----------------------------------------------------------------------------
// Two modes, chosen automatically from the environment:
//
//   • Cloudinary (production / hosted): if CLOUDINARY_URL or
//     CLOUDINARY_CLOUD_NAME is set, uploads go to Cloudinary so images survive
//     redeploys on ephemeral hosts like Render's free tier.
//
//   • Local disk (default / development): files are saved under ./uploads and
//     served by express.static — exactly the original behaviour.
//
// The Cloudinary packages are only require()d when Cloudinary is configured, so
// local development keeps working even if those packages aren't installed.
// -----------------------------------------------------------------------------

const useCloudinary = !!(process.env.CLOUDINARY_URL || process.env.CLOUDINARY_CLOUD_NAME);

// Map an upload field name to a storage folder.
const folderFor = (fieldname) => {
    if (fieldname === 'profile_pic' || fieldname === 'tenant_image') return 'profiles';
    if (fieldname === 'property_image') return 'property';
    if (fieldname === 'document') return 'documents';
    if (fieldname === 'room_image') return 'rooms';
    if (fieldname === 'qr_code') return 'payments';
    if (fieldname === 'request_image') return 'requests';
    return 'misc';
};

// Map an upload field name to a filename prefix.
const prefixFor = (fieldname) => {
    if (fieldname === 'profile_pic') return 'profile-';
    if (fieldname === 'property_image') return 'property-';
    if (fieldname === 'document') return 'doc-';
    if (fieldname === 'room_image') return 'room-';
    if (fieldname === 'tenant_image') return 'tenant-';
    if (fieldname === 'qr_code') return 'qr-';
    if (fieldname === 'request_image') return 'request-';
    return 'file-';
};

let storage;

if (useCloudinary) {
    // ---- Cloudinary storage (custom multer engine — only needs the `cloudinary` pkg) ----
    const { v2: cloudinary } = require('cloudinary');

    // cloudinary auto-reads CLOUDINARY_URL. If the separate vars are used, wire them up.
    if (process.env.CLOUDINARY_CLOUD_NAME) {
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET
        });
    }

    // Minimal multer StorageEngine that streams the upload straight to Cloudinary.
    storage = {
        _handleFile(req, file, cb) {
            const stream = cloudinary.uploader.upload_stream(
                {
                    folder: `tenantpro/${folderFor(file.fieldname)}`,
                    public_id: `${prefixFor(file.fieldname)}${Date.now()}-${Math.round(Math.random() * 1e9)}`,
                    resource_type: 'image'
                },
                (err, result) => {
                    if (err) return cb(err);
                    // file.path becomes the Cloudinary secure URL (read by getFileUrl).
                    cb(null, { path: result.secure_url, filename: result.public_id, size: result.bytes });
                }
            );
            file.stream.pipe(stream);
        },
        _removeFile(req, file, cb) {
            cb(null);
        }
    };
    console.log('🖼️  Uploads: Cloudinary mode');
} else {
    // ---- Local disk storage (default) ----
    storage = multer.diskStorage({
        destination: function (req, file, cb) {
            const uploadPath = path.join(process.cwd(), 'uploads', folderFor(file.fieldname));
            if (!fs.existsSync(uploadPath)) {
                fs.mkdirSync(uploadPath, { recursive: true });
            }
            cb(null, uploadPath);
        },
        filename: function (req, file, cb) {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
            cb(null, prefixFor(file.fieldname) + uniqueSuffix + path.extname(file.originalname));
        }
    });
}

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

// -----------------------------------------------------------------------------
// getFileUrl(file) — returns the URL to store in the database for an upload.
//   • Cloudinary mode: the full https:// secure URL (file.path).
//   • Disk mode: a relative "/uploads/<folder>/<filename>" path (unchanged).
// Returns null when no file was uploaded.
// -----------------------------------------------------------------------------
const getFileUrl = (file) => {
    if (!file) return null;
    if (useCloudinary) return file.path; // Cloudinary secure URL
    const subfolder = path.basename(file.destination);
    return `/uploads/${subfolder}/${file.filename}`;
};

module.exports = upload;
module.exports.getFileUrl = getFileUrl;
module.exports.useCloudinary = useCloudinary;
