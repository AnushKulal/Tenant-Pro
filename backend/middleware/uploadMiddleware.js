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
//
// ── A BAD CREDENTIAL MUST NOT TAKE THE SERVER DOWN ────────────────────────────
// The cloudinary SDK parses CLOUDINARY_URL when it is first required, and THROWS
// if the value does not begin with "cloudinary://" — the exact mistake somebody
// makes when they paste the API base URL from the dashboard, or paste the cloud
// name on its own, or leave the "CLOUDINARY_URL=" prefix on the value.
//
// That throw happened at module load, inside a require chain reached from
// server.js, so the process exited 1 BEFORE app.listen. On a host that decides a
// deploy succeeded by whether the service answers, that is a failed deploy and a
// total outage — every endpoint gone because a photo destination was misspelled.
// One misconfigured optional feature took down login, rent and everything else.
//
// So the whole handshake is wrapped, and anything that goes wrong DEGRADES to disk
// storage with a loud line in the log. Uploads on an ephemeral host will not
// survive the next deploy in that state, which is bad — but it is recoverable at
// leisure, whereas a server that will not boot is not. /healthz reports which mode
// actually took effect so this is visible from outside without reading the log.
// -----------------------------------------------------------------------------

const cloudinaryWanted = !!(process.env.CLOUDINARY_URL || process.env.CLOUDINARY_CLOUD_NAME);

// Resolve the SDK and prove the credential parses. Returns the configured client,
// or null when Cloudinary cannot be used — never throws.
const resolveCloudinary = () => {
    if (!cloudinaryWanted) return null;
    try {
        // eslint-disable-next-line global-require
        const { v2: cloudinary } = require('cloudinary');

        // cloudinary auto-reads CLOUDINARY_URL. If the separate vars are used, wire
        // them up.
        if (process.env.CLOUDINARY_CLOUD_NAME) {
            cloudinary.config({
                cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
                api_key: process.env.CLOUDINARY_API_KEY,
                api_secret: process.env.CLOUDINARY_API_SECRET
            });
        }

        // A URL can parse and still be unusable: "cloudinary://mycloud" is accepted
        // by the SDK and leaves no key or secret, so every upload would fail at
        // runtime with an auth error and no clue why. Checked here, once, at boot.
        const cfg = cloudinary.config();
        const missing = ['cloud_name', 'api_key', 'api_secret'].filter((k) => !cfg[k]);
        if (missing.length) {
            console.error(
                `⚠️  Uploads: CLOUDINARY_URL is set but incomplete (missing ${missing.join(', ')}). ` +
                'Falling back to local disk — uploaded files will NOT survive the next deploy. ' +
                'Expected form: cloudinary://<api_key>:<api_secret>@<cloud_name>'
            );
            return null;
        }
        console.log('🖼️  Uploads: Cloudinary mode');
        return cloudinary;
    } catch (e) {
        // Never log `e` with the raw value in it — CLOUDINARY_URL contains an API
        // secret, and a stack trace from a hosted log viewer is not a safe place
        // for it. The message alone says what is wrong.
        console.error(
            `⚠️  Uploads: Cloudinary could not be configured (${e.message}). ` +
            'Falling back to local disk — uploaded files will NOT survive the next deploy. ' +
            'Expected form: cloudinary://<api_key>:<api_secret>@<cloud_name>'
        );
        return null;
    }
};

const cloudinaryClient = resolveCloudinary();
// What actually took effect, which is not always what was asked for.
const useCloudinary = !!cloudinaryClient;

// WHY disk storage is in use, for /healthz. "ephemeral-disk" on its own is
// ambiguous in the one way that matters: it means either "no Cloudinary credential
// was provided" or "one was provided and it is wrong", and those need opposite
// actions. Distinguishing them from outside turns "go and read the deploy log" into
// refreshing a URL. Never includes the value — only the diagnosis.
const uploadMode = () => {
    if (useCloudinary) return 'cloudinary';
    if (cloudinaryWanted) return 'ephemeral-disk (CLOUDINARY_URL set but unusable — see deploy log)';
    return 'ephemeral-disk (no CLOUDINARY_URL set on this service)';
};

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
    // Already required and verified by resolveCloudinary() above, so nothing here can
    // throw on a bad credential.
    const cloudinary = cloudinaryClient;

    // Minimal multer StorageEngine that streams the upload straight to Cloudinary.
    storage = {
        _handleFile(req, file, cb) {
            const stream = cloudinary.uploader.upload_stream(
                {
                    folder: `tenantpro/${folderFor(file.fieldname)}`,
                    public_id: `${prefixFor(file.fieldname)}${Date.now()}-${Math.round(Math.random() * 1e9)}`,
                    // ID proofs are frequently PDFs, so let Cloudinary decide the
                    // resource type for that field rather than forcing 'image'
                    // (which rejects a PDF outright).
                    resource_type: file.fieldname === 'document' ? 'auto' : 'image'
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
    // The mode is announced by resolveCloudinary(), which is the only place that
    // knows whether the credential actually parsed.
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

// Images everywhere, plus PDF for the `document` field only — an Aadhaar or PAN
// scan is very often a PDF, and rejecting it would push people into
// screenshotting their own documents.
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    if (file.fieldname === 'document' && file.mimetype === 'application/pdf') return cb(null, true);
    const want = file.fieldname === 'document' ? 'an image or a PDF' : 'an image file';
    cb(new Error(`Please upload ${want}.`), false);
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
module.exports.uploadMode = uploadMode;
