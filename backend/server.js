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
//
// The numbers below are the production numbers and stay exactly as they were.
// What changed is that they can be raised by environment variable, for one
// reason: an end-to-end run signs in far more often than a person ever does.
//
// A full suite run does something like fifty sign-ins across eight files. The
// auth limiter allows thirty in fifteen minutes, so from the sixth suite onward
// every login came back 429 and every request after it came back 401 "no token"
// — which reads, in a test log, exactly like a broken endpoint. A run spent
// several hours reporting failures in discover, layout, sign-out, payments and
// the gateway that were all this one limiter doing its job.
//
// Raising the limit in production would be the wrong fix: brute-forcing a
// password is precisely what this is for. So the defaults are unchanged and a
// local test server opts out explicitly, e.g.
//
//   AUTH_RATE_MAX=100000 API_RATE_MAX=100000 node server.js
//
// Anything deployed sets neither and gets 200/min and 30/15min as before.
const num = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
};

// General API limit: guards against abuse/floods.
const apiLimiter = rateLimit({
    windowMs: num(process.env.API_RATE_WINDOW_MS, 60 * 1000),   // 1 minute
    max: num(process.env.API_RATE_MAX, 200),                    // 200 requests/min per IP
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api', apiLimiter);

// Stricter limit on auth: blunts brute-force login/registration attempts.
const authLimiter = rateLimit({
    windowMs: num(process.env.AUTH_RATE_WINDOW_MS, 15 * 60 * 1000),  // 15 minutes
    max: num(process.env.AUTH_RATE_MAX, 30),                         // 30 attempts/15 min per IP
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
const tenantPortalRoutes = require('./routes/tenantPortalRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const { protect, requireOwner } = require('./middleware/authMiddleware');
const { initCronJobs, checkAndSendRentReminders } = require('./services/cronService');
const initDb = require('./config/initDb');
const { ensureDemoAccount } = require('./config/seedDemo');
// Sample listed rooms, so discovery is not an empty screen on the day it ships.
const { ensureShowcaseListings } = require('./config/seedShowcase');
const { discoverEnabled } = require('./controllers/discoverController');
const { getAppVersion, storeRelease } = require('./controllers/appVersionController');

// For /healthz. "off" when DISCOVER_ENABLED=false — the whole feature is hidden and
// the room count would be misleading. Otherwise how many rooms a tenant can find:
// zero is a working feature with an empty screen, which is a different problem from
// a switched-off one and has to read differently.
const discoverStatus = async () => {
    if (!discoverEnabled()) return 'off (DISCOVER_ENABLED=false)';
    try {
        const [rows] = await db.query('SELECT COUNT(*) AS n FROM listings WHERE published = 1');
        const n = Number(rows[0] && rows[0].n) || 0;
        return n === 0 ? 'on (nothing listed yet)' : `on (${n} rooms listed)`;
    } catch (e) {
        return `on (count unavailable: ${e.code || e.message})`;
    }
};
const { isMailConfigured, verifyMail, mailStatus } = require('./config/mailer');
// Which storage the uploader chose. Reported by /healthz because the difference is
// otherwise invisible until it hurts: in disk mode every uploaded photo and ID lives on
// the host's ephemeral filesystem and is DELETED by the next deploy, and there is no
// symptom until somebody opens an image that used to work. Only the mode is exposed,
// never the Cloudinary credential.
const { uploadMode } = require('./middleware/uploadMiddleware');
// Whether "Continue with Google" can work. Same reasoning as `uploads`: the button
// either does something or dead-ends, and from the outside those look identical
// until somebody presses it. Reports only which variables are missing, never a value.
const { pushMode, sweepOrphanTokens } = require('./services/pushService');
const { smsMode } = require('./services/smsService');
const { sweepVerifications } = require('./services/verifyService');
// Dead refresh-token rows. Kept tidy for the same reason orphan push tokens are:
// a table that only ever grows turns an indexed read into a scan over years.
const { sweepSessions } = require('./services/sessionService');
const { googleConfigured, googleMissing } = require('./config/googleAuth');
// Whether a landlord can connect a payment gateway at all. Same reasoning as `uploads`
// and `google`: without CREDENTIALS_KEY the Connect button can only ever fail, and from
// outside the server that is indistinguishable from a broken feature. Reports the
// problem in words, never the key.
const { secretsReady, secretsProblem } = require('./utils/secretBox');

// WHICH COMMIT IS ACTUALLY RUNNING.
//
// Three times today the answer to "why is this broken" was "that code is not deployed",
// and each time it took a round of guessing to establish. An OTA update reaches a phone
// in two minutes while a backend deploy has to succeed first, so app and server drift
// apart routinely — and from the outside a missing endpoint is indistinguishable from a
// broken feature. Render sets RENDER_GIT_COMMIT on every deploy; reporting it turns that
// question into one HTTP request.
//
// A commit hash is not a secret: the repository is public, and knowing which commit is
// running is exactly what a deploy log already tells anyone who can see the dashboard.
const runningCommit = () => {
    const sha = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || process.env.SOURCE_VERSION || '';
    return sha ? sha.slice(0, 7) : 'unknown';
};

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

// "Is there a newer app than the one I am running?" Public and unauthenticated
// on purpose: somebody on a build too old to sign in is exactly who most needs
// telling. See controllers/appVersionController.js — the comparison lives on the
// server so a mistake in it can be fixed with a deploy rather than through the
// very update mechanism that is broken.
app.get('/api/app/version', getAppVersion);

// A blurred ID proof, streamed for a landlord whose tenant has moved out.
//
// Mounted OUTSIDE the owner guard on purpose: a React Native <Image> cannot send an
// Authorization header, so this carries its own short-lived token in the query string
// and re-checks the landlord/tenant relationship on every fetch. It exists because a
// Cloudinary transformation URL is not a restriction — strip the transform out of it
// and the original is public — so the address of the original is never disclosed to
// the app at all.
const { previewDocument } = require('./controllers/documentController');
app.get('/api/id-preview/:id', previewDocument);

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
        // can tell you why. Only the provider name and the MISSING variable names are
        // exposed — never a credential, and never a whole address.
        res.status(200).json({
            status: 'ok',
            db: 'up',
            mail: mailStatus(),
            commit: runningCommit(),
            uploads: uploadMode(),
            google: googleConfigured() ? 'ready' : `not-configured (missing ${googleMissing().join(', ')})`,
            // Whether anybody can actually be REACHED. The 8am rent reminder has been
            // firing daily into nothing because mail is unconfigured, and there was no
            // way to see that from outside — which is how it stayed unnoticed.
            push: await pushMode(),
            // Whether a new phone number can be PROVED before it becomes a sign-in
            // identifier. Without this, a profile phone change has to be refused.
            sms: smsMode(),
            // Whether landlords can connect their own payment gateway. 'ready' does not
            // mean anybody has — each landlord's credentials are their own — only that
            // there is a key to seal them with.
            gateways: secretsReady() ? 'ready' : `not-configured (${secretsProblem()})`,
            // Whether the Find screen has anything on it. Same reasoning as the
            // fields above: a switched-off feature and a feature with nothing to
            // show look identical from outside, and this URL is the only window
            // onto the running server from a machine that cannot reach it directly.
            // The count is of PUBLISHED rooms, which is exactly what a tenant sees.
            discover: await discoverStatus(),
            // Visible here so a misconfigured store release is findable in one
            // request, rather than inferred from a banner that never appears on
            // anybody's phone.
            storeBuild: (() => {
                const r = storeRelease();
                if (!r.latest) return 'not announced (no APP_LATEST_VERSION set)';
                return `${r.latest}${r.minimum ? ` (minimum ${r.minimum})` : ''}${r.url ? '' : ' — NO APP_DOWNLOAD_URL SET'}`;
            })(),
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
            mail: mailStatus(),
            commit: runningCommit(),
            uploads: uploadMode(),
            google: googleConfigured() ? 'ready' : `not-configured (missing ${googleMissing().join(', ')})`,
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
    // The rooms the Find screen shows before any real landlord has listed one.
    // Create-if-missing, scoped entirely to rows it made itself, and it swallows its
    // own failures — see config/seedShowcase.js. SHOWCASE_LISTINGS=false skips it.
    await ensureShowcaseListings();
    // push_tokens has no foreign key -- it points at one of two account tables -- so
    // nothing removes a token when its account is deleted. Once on boot is enough;
    // sends already ignore orphans, this stops them piling up for ever.
    try {
        await sweepOrphanTokens();
    } catch (err) {
        console.error('push: orphan sweep skipped -', err.message);
    }
    // Same treatment for finished verification codes: consumed or long expired, no
    // further purpose, and nothing else ever removes them.
    try {
        await sweepVerifications();
    } catch (err) {
        console.error('verify: sweep skipped -', err.message);
    }
    // And dead refresh-token rows: long expired, or revoked a month ago. Rows that
    // are spent but RECENT are deliberately kept — they are what makes a replayed
    // token detectable as theft rather than merely unknown.
    try {
        await sweepSessions();
    } catch (err) {
        console.error('sessions: sweep skipped -', err.message);
    }
    initCronJobs();
})();