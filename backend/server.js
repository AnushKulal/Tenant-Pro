// TenantPro backend.
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const db = require('./config/db');

const app = express();

// Render/hosts run behind a proxy; trust the first proxy so client IPs
// (used by rate limiting) are read correctly from X-Forwarded-For.
app.set('trust proxy', 1);

// --- Security middleware ---
app.use(helmet());

// --- Middleware ---
// CORS: open by default (needed for the mobile app, which sends no browser origin).
// Set CORS_ORIGIN to a comma-separated allowlist to restrict browser access.
const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors(corsOrigin ? { origin: corsOrigin.split(',').map((s) => s.trim()) } : {}));
// Webhooks are signed over the EXACT bytes sent. express.json() re-serialises, and
// JSON.stringify of a parsed body reorders keys and drops whitespace, so a signature
// checked against it would never match. This parser keeps the raw buffer, and it is
// mounted BEFORE the global one because whichever runs first consumes the stream.
app.use('/api/webhooks', express.json({
    verify: (req, res, buf) => { req.rawBody = buf; },
    limit: '256kb'
}));
app.use(express.json());

// --- Rate limiting ---
// General API limit: guards against abuse/floods.
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,       // 1 minute
    max: 200,                  // 200 requests/min per IP
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api', apiLimiter);

// Stricter limit on auth: blunts brute-force login/registration attempts.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 30,                   // 30 attempts/15 min per IP
    message: { message: 'Too many attempts. Please try again in a few minutes.' },
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api/auth', authLimiter);
app.use('/api/tenant-auth', authLimiter);

// --- Serve Static Files (Images & Documents) ---
// This exposes your 'uploads' folder to the web. 
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- Route Imports ---
const authRoutes = require('./routes/authRoutes');
const tenantAuthRoutes = require('./routes/tenantAuthRoutes');
const { logFeatures } = require('./config/features');
const ownerRoutes = require('./routes/ownerRoutes');
const propertyRoutes = require('./routes/propertyRoutes');
const unitRoutes = require('./routes/unitRoutes');
const tenantRoutes = require('./routes/tenantRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const tenantPortalRoutes = require('./routes/tenantPortalRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const { protect, requireOwner } = require('./middleware/authMiddleware');
const { initCronJobs, checkAndSendRentReminders } = require('./services/cronService');
const initDb = require('./config/initDb');
const { ensureDemoAccount } = require('./config/seedDemo');
const { mailProvider, isMailConfigured, verifyMail } = require('./config/mailer');
// Which storage the uploader chose. Reported by /healthz because the difference is
// otherwise invisible until it hurts: in disk mode every uploaded photo and ID lives on
// the host's ephemeral filesystem and is DELETED by the next deploy, and there is no
// symptom until somebody opens an image that used to work. Only the mode is exposed,
// never the Cloudinary credential.
const { useCloudinary } = require('./middleware/uploadMiddleware');

// --- Mount Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/tenant-auth', tenantAuthRoutes);

// The landlord-facing API. `requireOwner` is mounted here, once, rather than left to
// each handler: these routers read req.user.id AS AN owners.id, and a tenant's token
// carries a tenant_users.id from an independent AUTO_INCREMENT. Without this, the
// first tenant to register (id 1) could read the first landlord's (id 1) dashboard,
// tenants, properties and payment settings. Every route inside these routers already
// runs `protect`, but `protect` only proves the token is ours -- not whose it is, so
// it runs again here to populate req.user before the role can be checked.
const ownerApi = [protect, requireOwner];
app.use('/api/owner', ownerApi, ownerRoutes);
app.use('/api/properties', ownerApi, propertyRoutes);
app.use('/api/units', ownerApi, unitRoutes);
app.use('/api/tenants', ownerApi, tenantRoutes);
app.use('/api/payments', ownerApi, paymentRoutes);

// The tenant-facing API scopes every query through tenant_users -> tenants and
// asserts role === 'tenant' in the handlers, so it needs no equivalent here.
app.use('/api/tenant-portal', tenantPortalRoutes);

// Machine callers, no user token. Mounted outside every auth guard on purpose: a
// payment provider has no account here. Its signature IS the authentication, which is
// why webhookController refuses anything it cannot verify.
app.use('/api/webhooks', webhookRoutes);

// --- Basic Health Check ---
app.get('/', (req, res) => {
    res.send('TenantPro Backend is running!');
});

// --- Keep-alive / deep health check ---
// Pinged on a schedule (GitHub Actions cron) so the free host never sleeps.
// It also runs a trivial DB query, which keeps the pooled MySQL connection
// warm — preventing the "dead socket after wake" login errors entirely.
app.get('/healthz', async (req, res) => {
    try {
        await db.query('SELECT 1');
        // `mail` is reported because a missing email configuration is invisible
        // otherwise: password reset simply never arrives and nothing on the client
        // can tell you why. Only the provider name is exposed, never a credential.
        res.status(200).json({
            status: 'ok',
            db: 'up',
            mail: isMailConfigured ? mailProvider : 'not-configured',
            uploads: useCloudinary ? 'cloudinary' : 'ephemeral-disk',
            time: new Date().toISOString()
        });
    } catch (e) {
        // Surface the real driver error so connection problems can be diagnosed
        // (wrong host/port/SSL/credentials, IP allowlist, etc.).
        // Expose only the driver error CODE (not host/credentials) so outages
        // are diagnosable without leaking connection details on a public URL.
        res.status(500).json({
            status: 'degraded',
            db: 'down',
            mail: isMailConfigured ? mailProvider : 'not-configured',
            uploads: useCloudinary ? 'cloudinary' : 'ephemeral-disk',
            code: e.code,
            errno: e.errno
        });
    }
});

// --- 🚨 TEST ROUTE (development only — disabled when NODE_ENV=production) ---
if (process.env.NODE_ENV !== 'production') {
    app.get('/api/test-cron', async (req, res) => {
        console.log("🛠️ Manual Cron Triggered via /api/test-cron");
        await checkAndSendRentReminders();
        res.send("Cron job executed! Check your backend terminal.");
    });
}

// --- Boot Server ---
const PORT = process.env.PORT || 5000;

// Start listening IMMEDIATELY so the server accepts requests the moment it
// wakes. Render's free tier cold-starts on every idle period, and previously
// we ran DB-heavy schema + seed BEFORE listening — against a flaky, distant
// database that could take many seconds, during which every request failed
// with "unable to connect". The tables already exist from prior boots, so
// requests don't need to wait for init; we run it in the background instead.
app.listen(PORT, () => {
    console.log(`✅ Server is running on port ${PORT}`);
    // A kill switch nobody can see is the one left on by accident.
    logFeatures();
    // Say at boot whether reset emails can actually be sent. Credentials that are
    // present but wrong look exactly like no credentials from the outside — the
    // request succeeds and the email never arrives — so this is the one place that
    // difference becomes visible. Never blocks serving.
    verifyMail().catch(() => {});
});

// Background init (non-blocking): create tables if missing, seed demo once,
// then start the reminder engine. Failures here never block serving traffic.
(async () => {
    try {
        await initDb();
    } catch (err) {
        console.error('❌ Database schema init failed:', err.message);
    }
    try {
        // Only ever CREATES the demo account, never rebuilds it. An account with data
        // in it is left alone, so a restart in the middle of a demo is invisible —
        // rebuilding it is POST /api/owner/demo/reset, on request.
        await ensureDemoAccount();
    } catch (err) {
        console.error('❌ Demo seed failed:', err.message);
    }
    initCronJobs();
})();