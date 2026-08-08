// File: backend/controllers/demoController.js
// Restoring the demo account's rich picture, on demand.
//
// The demo is a real landlord account (see config/seedDemo.js) and it now KEEPS
// whatever a demo does to it. That is the behaviour we want — but it means the
// account also drifts: after a walkthrough where you accepted an applicant, deleted a
// room and confirmed three payments, the next client sees the aftermath rather than a
// convincing property business.
//
// So the rebuild moved from "silently, on every boot" to "when the landlord asks".
// Run it before a client meeting and every date is recomputed from today, so the
// six-month chart and the dues read as current.
//
// Only the demo account can do this, and only to itself. A reset deletes payments,
// expenses, requests and join decisions, which is exactly what nobody wants happening
// to their real portfolio, so the guard checks the caller's own row rather than
// trusting an id in the request.
const db = require('../config/db');
const { resetDemoData, readDemoState, DEMO_EMAIL } = require('../config/seedDemo');

// Is the caller the demo landlord? Resolved from the token's id to that owner's email,
// so there is no way to ask for somebody else's account to be reset.
const callerIsDemo = async (ownerId) => {
    const [rows] = await db.query('SELECT email FROM owners WHERE id = ?', [ownerId]);
    return rows.length > 0 && rows[0].email === DEMO_EMAIL;
};

// What the account currently holds. Shown next to the reset button so the landlord can
// see whether the demo is worth resetting before they wipe it.
const demoCounts = async (ownerId) => {
    const [rows] = await db.query(
        `SELECT
            (SELECT COUNT(*) FROM properties WHERE owner_id = ?)                          AS properties,
            (SELECT COUNT(*) FROM units u JOIN properties p ON u.property_id = p.id
              WHERE p.owner_id = ?)                                                       AS units,
            (SELECT COUNT(*) FROM tenants WHERE owner_id = ? AND status = 'Active')       AS tenants,
            (SELECT COUNT(*) FROM payments pay JOIN tenants t ON pay.tenant_id = t.id
              WHERE t.owner_id = ? AND pay.status = 'Confirmed')                          AS payments,
            (SELECT COUNT(*) FROM payments pay JOIN tenants t ON pay.tenant_id = t.id
              WHERE t.owner_id = ? AND pay.status = 'Declared')                           AS payments_awaiting,
            (SELECT COUNT(*) FROM maintenance_requests WHERE owner_id = ?)                AS requests,
            (SELECT COUNT(*) FROM join_requests WHERE owner_id = ? AND status = 'Pending') AS join_requests`,
        [ownerId, ownerId, ownerId, ownerId, ownerId, ownerId, ownerId]
    );
    return rows[0];
};

// GET /api/owner/demo
// Answers for EVERY landlord, not just the demo one: the app uses `is_demo` to decide
// whether to show the reset control at all, so a real customer never sees a button
// offering to delete their data.
const getDemoStatus = async (req, res) => {
    try {
        const isDemo = await callerIsDemo(req.user.id);
        if (!isDemo) {
            return res.status(200).json({ is_demo: false });
        }
        const state = await readDemoState();
        res.status(200).json({
            is_demo: true,
            last_reset_at: state?.last_reset_at || null,
            reset_count: state?.reset_count || 0,
            counts: await demoCounts(req.user.id)
        });
    } catch (error) {
        console.error('Error reading demo status:', error);
        res.status(500).json({ message: 'Could not read the demo account status.' });
    }
};

// A reset is a few dozen writes. This is not a security control — `apiLimiter` and the
// demo-only guard already cover that — it stops a double-tap on a slow connection from
// running two rebuilds at once, which would interleave deletes with inserts and could
// leave the account half-built.
let resetInFlight = false;
let lastResetAt = 0;
const RESET_COOLDOWN_MS = 10000;

// POST /api/owner/demo/reset
const resetDemo = async (req, res) => {
    try {
        if (!(await callerIsDemo(req.user.id))) {
            // 403 rather than 404: the endpoint exists, it just is not for this
            // account. Saying so plainly is better than pretending it is missing,
            // because a real landlord reaching this has hit a bug in the app, not an
            // authorisation boundary they were probing.
            return res.status(403).json({
                message: 'Only the demo account can be reset. Your own data is never rebuilt.'
            });
        }

        if (resetInFlight) {
            return res.status(409).json({ message: 'A reset is already running — give it a moment.' });
        }
        if (Date.now() - lastResetAt < RESET_COOLDOWN_MS) {
            return res.status(429).json({ message: 'Just reset. Try again in a few seconds.' });
        }

        resetInFlight = true;
        try {
            const built = await resetDemoData();
            lastResetAt = Date.now();
            const state = await readDemoState();
            res.status(200).json({
                message: `Demo rebuilt — ${built.properties} properties, ${built.tenants} tenants, six months of history dated to today.`,
                last_reset_at: state?.last_reset_at || null,
                reset_count: state?.reset_count || 0,
                counts: await demoCounts(req.user.id)
            });
        } finally {
            // Cleared even if the rebuild threw, or one bad reset would wedge the
            // endpoint until the next deploy.
            resetInFlight = false;
        }
    } catch (error) {
        console.error('Error resetting the demo account:', error);
        res.status(500).json({ message: 'Could not rebuild the demo data.' });
    }
};

module.exports = { getDemoStatus, resetDemo };
