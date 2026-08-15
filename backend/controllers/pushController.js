// File: backend/controllers/pushController.js
//
// Registering and forgetting a device for push notifications.
//
// One controller for both portals. The role is never taken from the request body — it
// comes from the token, which is what makes it impossible for a tenant to register
// themselves as an owner and start receiving other people's rent notifications.

const db = require('../config/db');
const { registerToken, forgetToken, sendTo } = require('../services/pushService');
const { normalisePhone, phoneSql } = require('../utils/tenantMatch');

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
        // The account comes from the token, never the body — the same rule as
        // registration, and here it is what stops one signed-in user unregistering
        // another's handset by presenting its push token.
        const removed = await forgetToken(req.body?.token, {
            role: roleOf(req),
            accountId: req.user.id
        });
        // 200 either way. "It was already gone" is the same outcome as "I removed it"
        // from the caller's side, and sign-out must never fail on this.
        res.status(200).json({ message: 'Notifications off for this device.', removed });
    } catch (error) {
        console.error('dropPushToken error:', error.message);
        res.status(200).json({ message: 'Notifications off for this device.', removed: 0 });
    }
};

// Who a test push is allowed to reach.
//
// A push goes to a DEVICE, and the only handle a person has on a device is the phone
// number of whoever signed in on it. So this takes a number — and that is exactly why
// it needs a rule, because a "send a test to any number" endpoint is a way to make a
// stranger's phone buzz on demand.
//
// The rule is the one already used everywhere else here: you may reach yourself, or
// somebody who is your tenant. Nothing else resolves, and a number that belongs to
// someone outside that relationship comes back as NOT_YOURS rather than as a send that
// quietly went nowhere — the difference matters when the point of the button is to
// find out whether delivery works.
//
// Matched on the normalised number, both sides, for the same reason the join flow is:
// a landlord types "+91 98765 43210" and their tenant registered as "9876543210".
const resolveTestTarget = async (req, phoneRaw) => {
    const role = roleOf(req);
    const phone = normalisePhone(phoneRaw);

    // No number, an unreadable one, or a tenant asking: send to the caller. A tenant
    // has nobody they are entitled to buzz, so their own devices are the only answer
    // and the field is ignored rather than refused.
    if (!phone || role === 'tenant') {
        return { ok: true, role, accountId: req.user.id, who: 'you' };
    }

    const [me] = await db.query(
        `SELECT id, name FROM owners WHERE id = ? AND ${phoneSql('phone')} = ?`,
        [req.user.id, phone]
    );
    if (me.length) return { ok: true, role: 'owner', accountId: req.user.id, who: 'you' };

    // A tenant of THIS landlord who has an app account. The join through `tenants` is
    // the whole authorisation check.
    const [tenant] = await db.query(
        `SELECT tu.id, tu.name
           FROM tenant_users tu
           JOIN tenants t ON tu.tenant_id = t.id
          WHERE t.owner_id = ? AND ${phoneSql('tu.phone')} = ?
          LIMIT 1`,
        [req.user.id, phone]
    );
    if (tenant.length) {
        return { ok: true, role: 'tenant', accountId: tenant[0].id, who: tenant[0].name || 'your tenant' };
    }

    // Their tenant on paper, but nobody has registered on that number. Said separately
    // from NOT_YOURS because it is a different fact and a different next step: there is
    // no app account to send to yet.
    const [onPaper] = await db.query(
        `SELECT name FROM tenants WHERE owner_id = ? AND ${phoneSql('phone')} = ? LIMIT 1`,
        [req.user.id, phone]
    );
    if (onPaper.length) {
        return { ok: false, code: 404, reason: 'NO_ACCOUNT', who: onPaper[0].name };
    }

    return { ok: false, code: 403, reason: 'NOT_YOURS' };
};

// POST /api/owner/push-test  ·  POST /api/tenant-portal/push-test
// Body: { phone? }
//
// A button that answers one question honestly: did a notification actually arrive on
// that handset. Every other push in the app is a side effect of something else
// happening, so without this the only way to test delivery is to stage a real event —
// declare a payment, give notice — against a real tenant.
//
// It reports what happened rather than always saying "sent". A device that is not
// registered, or an account with no devices at all, is the commonest outcome until an
// APK carrying the native notification module is installed, and a cheerful "sent" in
// that case is the one answer that makes the button worthless.
const sendTestPush = async (req, res) => {
    try {
        const target = await resolveTestTarget(req, req.body?.phone);
        if (!target.ok) {
            return res.status(target.code).json({
                code: target.reason,
                message: target.reason === 'NO_ACCOUNT'
                    ? `${target.who} has not registered on the app yet, so there is no device to send to.`
                    : 'You can only send a test to yourself or to one of your own tenants.'
            });
        }

        // Awaited, unlike every other send in the app. The caller is standing there
        // waiting to be told whether it worked, which is the one case where the result
        // is worth more than the latency.
        const result = await sendTo({
            role: target.role,
            accountId: target.accountId,
            kind: 'push_test'
        });

        // `to` on every answer, including the failures. Who it was aimed at is half of
        // what the button is being asked, and it is the half that survives a delivery
        // problem: "couldn't reach the service, aiming at Rahul" tells the landlord the
        // number resolved to the right person, where a bare failure tells them nothing.
        const to = target.who;
        const theirs = to === 'you' ? 'you' : to;

        if (!result.sent) {
            return res.status(200).json({
                sent: 0,
                to,
                code: result.reason || 'NOT_SENT',
                message: result.reason === 'NO_DEVICES'
                    ? `No device is signed in for ${theirs} with notifications turned on. Install the latest build, sign in, and allow notifications.`
                    : `Could not reach the notification service — nothing sent to ${theirs}. Try again in a moment.`
            });
        }

        res.status(200).json({
            sent: result.sent,
            pruned: result.pruned || 0,
            to,
            message: to === 'you'
                ? `Sent to ${result.sent} of your device(s).`
                : `Sent to ${to}'s device(s).`
        });
    } catch (error) {
        console.error('sendTestPush error:', error.message);
        res.status(500).json({ message: 'Could not send the test notification.' });
    }
};

module.exports = { savePushToken, dropPushToken, sendTestPush };
