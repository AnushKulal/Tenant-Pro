// File: backend/controllers/webhookController.js
// Where a payment provider tells us money arrived.
//
// THIS IS DORMANT. No gateway is connected, and without a configured secret every
// request here is refused. It exists now so that the day a gateway IS connected, the
// only work is pasting a secret into the environment — not designing a settlement
// path under time pressure with real money moving.
//
// The whole point of the confirmation model is that a payment is only real once
// something other than the tenant vouches for it. Today that is the landlord tapping
// Confirm. A gateway is the second such voucher, and it goes through exactly the same
// function the landlord's tap does (paymentController.settlePayment), so the two can
// never disagree about what confirming means or about when the due date moves.
//
// SECURITY: this route is deliberately OUTSIDE the authenticated API. There is no
// user token — the caller is a machine — so the only thing standing between a
// stranger and "mark this rent paid" is the signature. That makes the checks below
// the entire security boundary, and why each one refuses rather than warns.
const crypto = require('crypto');
const db = require('../config/db');
const { settlePayment } = require('./paymentController');

// One secret per provider, from the environment. A provider with no secret set is
// simply not enabled — which is the state of every provider right now.
const SECRETS = {
    razorpay: process.env.RAZORPAY_WEBHOOK_SECRET || '',
    cashfree: process.env.CASHFREE_WEBHOOK_SECRET || ''
};

// Signature comparison must not leak how much of the digest matched, so it goes
// through timingSafeEqual. That needs equal-length buffers, hence the length check
// first — an unequal length is itself a mismatch, and saying so early is fine because
// the length of a hex digest is not a secret.
const signatureMatches = (secret, rawBody, provided) => {
    if (!secret || !provided) return false;
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(String(provided), 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
};

// Which payment does this event mean? Two ways in, tried in order:
//
//   1. the provider's own transaction id, if we have already seen and stored it, and
//   2. our reference, which we put in the UPI note when the tenant paid.
//
// Only a Declared row is eligible. A gateway cannot conjure a payment that the tenant
// never claimed — that would let anyone who guesses a reference create money in
// somebody's ledger.
//
// ── Why the gateway's id is tried FIRST, and why a repeated reference settles nothing
//
// `reference_id` is free text the TENANT typed. It is not unique, not scoped to a
// landlord, and not ours to trust. Matching it globally and taking the first row meant
// a tenant could declare a payment quoting a reference they expect somebody else to
// use, and let that person's real money confirm their own invented one — a free month,
// charged to a stranger's transfer, in a different landlord's ledger.
//
// So: the gateway's transaction id wins, because the provider issues it and nobody
// else can choose it. And a reference that matches MORE THAN ONE outstanding claim
// settles none of them — two claims on one payment is precisely the case where we
// cannot know which is real, and guessing is how the wrong tenant gets a free month.
// The event is then ignored rather than misapplied; the landlord still has both claims
// in their queue and confirms the right one by hand, which is the status quo today.
const findDeclaredPayment = async (reference, gatewayRef) => {
    if (gatewayRef) {
        const [byGw] = await db.query(
            "SELECT id FROM payments WHERE gateway_ref = ? AND status = 'Declared' LIMIT 1",
            [gatewayRef]
        );
        if (byGw.length) return byGw[0].id;
    }
    if (reference) {
        // LIMIT 2 rather than 1: one row is an answer, two is a refusal, and we only
        // ever need to know which of those it is.
        const [byRef] = await db.query(
            "SELECT id FROM payments WHERE reference_id = ? AND status = 'Declared' LIMIT 2",
            [reference]
        );
        if (byRef.length > 1) {
            console.warn(`webhook: reference "${reference}" matches ${byRef.length} outstanding claims — settling none`);
            return null;
        }
        if (byRef.length === 1) return byRef[0].id;
    }
    return null;
};

// POST /api/webhooks/payments/:provider
//
// Answers 200 for anything it has legitimately handled OR legitimately ignored,
// because providers retry non-2xx responses. An event about an unknown payment is not
// an error on our side — replying 500 to it would earn us the same event every few
// minutes forever.
const handlePaymentWebhook = async (req, res) => {
    const provider = String(req.params.provider || '').toLowerCase();
    const secret = SECRETS[provider];

    // No secret configured means this provider is not switched on. 404 rather than
    // 401: from the outside there is nothing here.
    if (!secret) {
        return res.status(404).json({ message: 'No such webhook.' });
    }

    // express.json() with a verify hook leaves the exact bytes on req.rawBody. The
    // signature covers those bytes, not the re-serialised object — JSON.stringify of a
    // parsed body reorders keys and drops whitespace, so it would never match.
    const raw = req.rawBody;
    if (!raw) {
        console.error('Webhook rejected: raw body missing (is the verify hook mounted?)');
        return res.status(400).json({ message: 'Bad request.' });
    }

    const provided = req.get('x-razorpay-signature') || req.get('x-webhook-signature') || '';
    if (!signatureMatches(secret, raw, provided)) {
        // Deliberately terse. An attacker probing this should learn nothing about
        // whether the reference existed, only that the signature was wrong.
        return res.status(401).json({ message: 'Bad signature.' });
    }

    try {
        const body = req.body || {};
        // Providers differ in shape; both of these are read defensively so a missing
        // branch yields undefined rather than throwing on a nested read.
        const entity = body?.payload?.payment?.entity || body?.data || {};
        const reference = String(entity.notes?.reference || entity.reference_id || body.reference || '').trim() || null;
        const gatewayRef = String(entity.id || body.payment_id || '').trim() || null;
        const event = String(body.event || body.type || '').toLowerCase();

        // Only a captured/successful payment settles anything. An 'authorized' event
        // means the money is promised, not taken.
        const isSuccess = /captur|success|paid|completed/.test(event);
        if (!isSuccess) {
            return res.status(200).json({ ok: true, ignored: `event '${event}' is not a capture` });
        }

        const paymentId = await findDeclaredPayment(reference, gatewayRef);
        if (!paymentId) {
            // Genuinely fine: a payment the landlord already confirmed by hand, or one
            // for a different system entirely. 200 so the provider stops retrying.
            return res.status(200).json({ ok: true, ignored: 'no matching declared payment' });
        }

        const r = await settlePayment({
            paymentId,
            status: 'Confirmed',
            source: 'gateway',
            gatewayRef,
            note: `Confirmed automatically by ${provider}.`
        });

        // A 409 here means someone confirmed it between our lookup and the write —
        // most likely the landlord, tapping at the same moment. Nothing went wrong and
        // there is nothing to retry.
        if (!r.ok) {
            return res.status(200).json({ ok: true, ignored: r.message });
        }

        console.log(`💰 ${provider} confirmed payment ${paymentId} (${r.tenant_name}, ₹${r.amount}).`);
        res.status(200).json({ ok: true, payment_id: paymentId, next_rent_due: r.next_rent_due });
    } catch (error) {
        // A real failure on our side. 500 so the provider DOES retry, because the
        // money is real and the ledger is currently wrong.
        console.error('Payment webhook error:', error.message);
        res.status(500).json({ message: 'Could not process the event.' });
    }
};

module.exports = { handlePaymentWebhook, signatureMatches };
