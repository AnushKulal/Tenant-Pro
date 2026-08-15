// File: backend/routes/tenantPortalRoutes.js
// Tenant-facing data API. All routes require a valid tenant token; the controller
// additionally checks role === 'tenant' and scopes every query to the caller's own
// linked tenant record.
const express = require('express');
const router = express.Router();
const { protect, requireLiveStay } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const {
    getMe,
    getLeavePlan,
    giveNotice,
    withdrawNotice,
    getPulse,
    getPayments,
    declarePayment,
    getRequests,
    createRequest,
    getRequestMessages,
    createRequestMessage
} = require('../controllers/tenantPortalController');
const {
    lookupProperty,
    createJoinRequest,
    getMyJoinRequests
} = require('../controllers/joinController');
const {
    getMyDocuments,
    addMyDocument,
    deleteMyDocument
} = require('../controllers/documentController');
const { claimAccount } = require('../controllers/guestController');
const { savePushToken, dropPushToken, sendTestPush } = require('../controllers/pushController');

router.use(protect);

router.get('/me', getMe);

// Upgrading a guest to a full account. Registered HERE, above the expiry guard, and
// the reason is in the note below: an expired guest must be able to take the one
// action that restores their access.
router.post('/claim-account', claimAccount);

// This device's push token. ABOVE the expiry guard, and above the live-stay guard,
// for the same class of reason: the notification a tenant most needs is "you're in at
// Sunrise Residency" — which by definition fires while they have no tenancy yet.
router.post('/push-token', savePushToken);
router.delete('/push-token', dropPushToken);
// A tenant's test can only ever reach their own devices — see resolveTestTarget. Above
// the expiry guard with the others, because "are notifications working" is a question
// about the handset and not about the tenancy.
router.post('/push-test', sendTestPush);

// ── Guest stay expiry ─────────────────────────────────────────────────────────
// Applied to everything BELOW this line, which deliberately leaves two routes above
// it reachable by an expired guest:
//
//   GET  /me            so the app can say WHY they are locked out and offer the fix
//   POST /claim-account so taking that fix is possible — locking a guest out of the
//                       one action that restores their access would make the message
//                       "add an email to keep your account" a dead end.
//
// Everything else — the room, the tickets, the payment history, raising a request —
// belongs to a live stay.
router.use(requireLiveStay);

// The tenant's equivalent of the owner's pulse: cheap counts so the portal can notice
// being accepted into a property, or a payment being confirmed, without a manual pull.
router.get('/pulse', getPulse);
router.get('/payments', getPayments);
// "I have paid this." Records a CLAIM, not money received -- the landlord confirms it
// at PUT /api/payments/declared/:id, and only that advances the due date.
router.post('/payments', declarePayment);
// ── Leaving a property ────────────────────────────────────────────────────────
// Below requireLiveStay: an expired guest has no live tenancy to give notice on.
// GET is separate from POST so the confirmation screen can state the real dates
// before anything is written — the old button had no preview and no write either.
router.get('/leave', getLeavePlan);
router.post('/leave', giveNotice);
// Withdrawable. A mis-tap on something this consequential must not be a one-way door.
router.delete('/leave', withdrawNotice);
router.get('/requests', getRequests);
// `request_image` is optional — multer's .single() passes a request with no file
// straight through, so a JSON body still works exactly as before.
router.post('/requests', upload.single('request_image'), createRequest);

// The tenant's half of a request's conversation — the same rows the landlord
// reads at /api/owner/requests/:id/messages.
router.get('/requests/:id/messages', getRequestMessages);
router.post('/requests/:id/messages', createRequestMessage);

// --- Join requests ---
// The one thing here that works BEFORE the account is linked to a tenant record:
// asking a landlord to link it. Mounted on this router so it inherits the same
// tenant token check; the landlord decides at /api/owner/join-requests/:id.
// Resolve a scanned or typed invite code to the property it belongs to, so the
// tenant can see what they are about to ask to join. Lookup by code only — there is
// no browse-all, which would let any account enumerate every landlord's portfolio.
router.get('/property-lookup', lookupProperty);
router.post('/join-requests', createJoinRequest);
router.get('/join-requests', getMyJoinRequests);

// --- ID documents ---
// Like join requests, these work BEFORE the account is linked to a tenant record:
// a landlord is expected to look at an ID as part of deciding whether to link it.
router.get('/documents', getMyDocuments);
router.post('/documents', upload.single('document'), addMyDocument);
router.delete('/documents/:id', deleteMyDocument);

// --- Finishing a guest profile ---
// A guest joined with a phone number and an ID and nothing else. This is where they
// become a full account: a real name in the landlord's roster instead of
// "Guest 7K2QFH", and an email and password so they can sign in from anywhere and
// recover the account. Authenticated because it upgrades the CALLER's own account —
// the guest token they already hold is the proof of which account that is.
// claim-account is registered ABOVE the expiry guard — see there. Moving it back down
// here would lock an expired guest out of the fix the lock-out message offers them.

module.exports = router;
