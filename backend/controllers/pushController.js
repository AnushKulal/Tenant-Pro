// File: backend/controllers/pushController.js
//
// Registering and forgetting a device for push notifications.
//
// One controller for both portals. The role is never taken from the request body — it
// comes from the token, which is what makes it impossible for a tenant to register
// themselves as an owner and start receiving other people's rent notifications.

const { registerToken, forgetToken } = require('../services/pushService');

const roleOf = (req) => (req.user?.role === 'tenant' ? 'tenant' : 'owner');

// POST /api/owner/push-token  ·  POST /api/tenant-portal/push-token
// Body: { token, platform? }
//
// Idempotent by design: the app calls this on every sign-in and every cold start, so
// the row is refreshed rather than duplicated and `last_seen_at` stays current.
const savePushToken = async (req, res) => {
    try {
        const result = await registerToken({
            role: roleOf(req),
            accountId: req.user.id,
            token: req.body?.token,
            platform: req.body?.platform
        });
        if (!result.ok) {
            // 400 rather than a silent 200: a client sending a malformed token would
            // otherwise believe notifications are working and never say so.
            return res.status(400).json({
                code: result.reason,
                message: 'That does not look like a push token from this app.'
            });
        }
        res.status(200).json({ message: 'Notifications on for this device.' });
    } catch (error) {
        console.error('savePushToken error:', error.message);
        res.status(500).json({ message: 'Could not turn on notifications for this device.' });
    }
};

// DELETE /api/owner/push-token  ·  DELETE /api/tenant-portal/push-token
// Body: { token }
//
// Called on sign-out. Without it, the next person to sign in on the same handset keeps
// receiving the last person's notifications — which on a shared or resold phone means
// somebody else's rent, tenants and repairs.
const dropPushToken = async (req, res) => {
    try {
        const removed = await forgetToken(req.body?.token);
        // 200 either way. "It was already gone" is the same outcome as "I removed it"
        // from the caller's side, and sign-out must never fail on this.
        res.status(200).json({ message: 'Notifications off for this device.', removed });
    } catch (error) {
        console.error('dropPushToken error:', error.message);
        res.status(200).json({ message: 'Notifications off for this device.', removed: 0 });
    }
};

module.exports = { savePushToken, dropPushToken };
