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
const ownerRoutes = require('./routes/ownerRoutes');
const propertyRoutes = require('./routes/propertyRoutes');
const unitRoutes = require('./routes/unitRoutes');
const tenantRoutes = require('./routes/tenantRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const { initCronJobs, checkAndSendRentReminders } = require('./services/cronService');
const initDb = require('./config/initDb');
const seedDemo = require('./config/seedDemo');

// --- Mount Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/tenant-auth', tenantAuthRoutes);
app.use('/api/owner', ownerRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/units', unitRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/payments', paymentRoutes);

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
        res.status(200).json({ status: 'ok', db: 'up', time: new Date().toISOString() });
    } catch (e) {
        // Surface the real driver error so connection problems can be diagnosed
        // (wrong host/port/SSL/credentials, IP allowlist, etc.).
        res.status(500).json({
            status: 'degraded',
            db: 'down',
            code: e.code,
            errno: e.errno,
            message: e.message,
            // Echo which host/port/SSL the server is actually trying (no secrets).
            using: {
                host: process.env.DB_HOST || '(unset)',
                port: process.env.DB_PORT || '(unset→3306)',
                database: process.env.DB_NAME || '(unset)',
                user_set: !!process.env.DB_USER,
                password_set: !!process.env.DB_PASSWORD,
                db_ssl: process.env.DB_SSL || '(unset)'
            }
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

(async () => {
    // 1. Create database tables automatically on first run (safe to run every boot).
    try {
        await initDb();
    } catch (err) {
        console.error('❌ Database schema init failed:', err.message);
    }

    // 1b. Seed the demo account with sample data (only if it doesn't exist yet).
    try {
        await seedDemo();
    } catch (err) {
        console.error('❌ Demo seed failed:', err.message);
    }

    // 2. Start the reminder automation engine.
    initCronJobs();

    // 3. Start listening.
    app.listen(PORT, () => {
        console.log(`✅ Server is running on port ${PORT}`);
    });
})();