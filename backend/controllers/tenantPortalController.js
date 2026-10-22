// File: backend/controllers/tenantPortalController.js
// The tenant-facing API. Everything a logged-in tenant can see about their OWN
// tenancy — their home, their dues, their payment history, their maintenance
// requests — derived from the landlord's records via the tenant_users -> tenants
// link. Every query is scoped to the caller's own linked tenant id, so one tenant
// can never read another's data.
//
// Auth: the `protect` middleware attaches req.user = { id, email, role }. `id` is
// the tenant_users row id; the linked landlord `tenants.id` is resolved here.
const db = require('../config/db');
// Aliased: rentDates exports a toSqlDate of its own and this file already uses it.
const { stayState, toSqlDate: stayDate } = require('../utils/guestStay');
const { getFileUrl } = require('../middleware/uploadMiddleware');
// Message reads/writes are shared with the owner side so a thread behaves
// identically whichever end of it you are standing at.
const { fetchThread, insertMessage, cleanBody } = require('./requestController');
// The ID-proof summary rides along with /me so the portal knows on its first call
// whether this account still owes a document — one source of that answer, not two.
const { fetchDocuments, summarise } = require('./documentController');
// The tenant's own payment record, scored by the same code the landlord's copy uses.
// Sharing it is the point: a tenant who is shown a different number from the one their
// landlord is looking at has no way to argue with either.
const { scoreForTenant } = require('../services/scoreService');
// Notice-period arithmetic. Pure and tested, because "the soonest you can leave" has
// boundaries — the day the notice runs out, an agreed end one day either side of it —
// that are impossible to test against live rows.
const { planNotice, NOTICE_DAYS } = require('../utils/noticePeriod');
// Date formatting shared with the confirmation side, so a declared payment and the
// due date it eventually moves are written by the same code.
const { toSqlDate } = require('../utils/rentDates');
// Paying online goes through the landlord's OWN gateway, and settles through the SAME
// function the landlord's Confirm tap uses — see the note above startOnlinePayment for
// why that matters more than it sounds.
const { credentialsFor } = require('../services/gatewayService');
const { settlePayment } = require('./paymentController');

// Three things a tenant does here reach the landlord and nothing else does: declaring a
// payment, raising a repair, giving notice. All three sit in a queue the landlord has
// to think to open, and all three are worse the later they are read.
const { notify } = require('../services/pushService');

// Resolves the logged-in tenant_users account to its linked landlord tenant row,
// with the unit, property and the owner's UPI settings joined in. Returns null if
// the account isn't a tenant, doesn't exist, or hasn't been linked to a unit yet —
// each of which the caller reports differently.
const loadTenantContext = async (userId) => {
    const [rows] = await db.query(
        `SELECT
            tu.id            AS user_id,
            tu.status        AS link_status,
            tu.name          AS account_name,
            tu.email         AS account_email,
            tu.phone         AS account_phone,
            tu.is_guest      AS is_guest,
            tu.guest_code    AS guest_code,
            tu.alerts_seen_at AS alerts_seen_at,
            t.id             AS tenant_id,
            t.name, t.phone, t.email, t.company, t.image_url,
            t.deposit, t.rent_share, t.credit_score, t.move_in_date,
            t.billing_cycle, t.next_rent_due, t.status AS tenancy_status, t.stay_until,
            t.notice_given_on, t.leave_on,
            u.id AS unit_id, u.unit_number, u.room_type, u.base_rent,
            p.id AS property_id, p.name AS property_name, p.address, p.locality, p.city, p.image_url AS property_image,
            p.property_type, p.latitude AS property_lat, p.longitude AS property_lon,
            o.id AS owner_id, o.name AS owner_name, o.phone AS owner_phone, o.email AS owner_email,
            ps.upi_id, ps.upi_number, ps.qr_code_url,
            -- The landlord's gateway, for paying by card or netbanking. The sealed
            -- secret is selected because this file is where a payment link gets made
            -- and the credential is needed to make one. It is never put in a response:
            -- getMe sends payment.online, which carries whether the option exists and
            -- nothing about how it works. The ONLY reason that holds is that nothing in
            -- this file spreads ctx into a response -- every handler names its fields.
            ps.gateway, ps.gateway_key_id, ps.gateway_secret, ps.gateway_enabled
         FROM tenant_users tu
         LEFT JOIN tenants t   ON tu.tenant_id = t.id
         LEFT JOIN units u     ON t.unit_id = u.id
         LEFT JOIN properties p ON u.property_id = p.id
         LEFT JOIN owners o    ON t.owner_id = o.id
         LEFT JOIN payment_settings ps ON o.id = ps.owner_id
         WHERE tu.id = ?`,
        [userId]
    );
    return rows[0] || null;
};

// Days until (positive) or since (negative) the next rent due date, at day
// granularity. Null when there is no due date on file.
const daysUntilDue = (dueDate) => {
    if (!dueDate) return null;
    const due = new Date(dueDate);
    const today = new Date();
    due.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return Math.round((due - today) / 86400000);
};

// GET /api/tenant-portal/me — the whole portal payload in one call.
const getMe = async (req, res) => {
    try {
        if (req.user?.role !== 'tenant') {
            return res.status(403).json({ message: 'Tenant access only.' });
        }
        const ctx = await loadTenantContext(req.user.id);
        if (!ctx) {
            return res.status(404).json({ message: 'Account not found.' });
        }

        // The ID state matters MORE before a tenancy exists than after: an unlinked
        // account is exactly the one about to ask a landlord to take them in.
        const documents = await fetchDocuments(req.user.id);
        const idProof = summarise(documents);

        // Who this account IS, independent of any tenancy. Sent in both branches
        // because a guest needs it in both: their guest code is their name before a
        // landlord accepts them and their identity after, and the prompt to finish
        // the profile has to appear either way.
        //
        // `ctx.name` is the TENANTS row's name and is NULL until a landlord accepts
        // them, which is why the account's own name is now selected separately. The
        // old code fell back to req.user.email — fine for a registered tenant, but a
        // guest has no email at all, so an unlinked guest had a blank name.
        const guest = {
            is_guest: !!ctx.is_guest,
            code: ctx.guest_code || null,
            // What finishing the profile actually buys, said once, here, so the app
            // does not invent its own version of the reason.
            why: 'Add your name, email and a password so you can sign in from any phone, recover your account, and your landlord sees who you are.'
        };

        // When this stay ends, and therefore when the guest ID stops working. Computed
        // on the server so the app and the middleware cannot disagree about whether
        // somebody is expired — the app would otherwise be free to draw a live-looking
        // portal for an account every request is about to be refused for.
        const stay = stayState({ stayUntil: ctx.stay_until, isGuest: ctx.is_guest });
        guest.stay = {
            ends_on: stayDate(stay.endsOn),
            days_left: stay.daysLeft,
            open_ended: stay.open,
            expired: stay.expired,
            ends_soon: stay.endsSoon
        };

        // Not yet linked to a unit by a landlord: the portal shows a friendly
        // "ask your landlord to link you" state rather than empty data.
        if (!ctx.tenant_id) {
            return res.status(200).json({
                linked: false,
                account: {
                    name: ctx.name || ctx.account_name || req.user.email,
                    email: ctx.account_email || null,
                    phone: ctx.account_phone || null
                },
                guest,
                id_proof: idProof,
                documents,
                // Carried on the UNLINKED branch too, and it is not an afterthought:
                // somebody waiting to be linked is the tenant with the most to be
                // alerted about — a join request pending a landlord's answer, a guest
                // account that expires, an ID being asked for. Omitting it here meant
                // their bell could never clear, which the e2e test caught.
                alerts_seen_at: ctx.alerts_seen_at ? new Date(ctx.alerts_seen_at).toISOString() : null
            });
        }

        const days = daysUntilDue(ctx.next_rent_due);
        const dueState = days === null ? 'none' : days < 0 ? 'overdue' : days === 0 ? 'due_today' : 'upcoming';

        const score = await scoreForTenant(ctx.tenant_id, {
            nextRentDue: ctx.next_rent_due,
            moveInDate: ctx.move_in_date
        });

        // Notice to leave, if any has been given. On /me because the portal has to
        // know on its FIRST paint: a tenant who has given notice must not be shown a
        // "Leave this property" button, and must be told the date they settled on
        // without having to go looking for it.
        const notice = ctx.leave_on ? {
            given: true,
            given_on: toSqlDate(ctx.notice_given_on),
            leaving_on: toSqlDate(ctx.leave_on),
            notice_days: NOTICE_DAYS
        } : { given: false, notice_days: NOTICE_DAYS };

        res.status(200).json({
            linked: true,
            profile: {
                name: ctx.name,
                phone: ctx.phone,
                email: ctx.email,
                company: ctx.company,
                image_url: ctx.image_url,
                credit_score: ctx.credit_score,
                // Whether they are on their way out, and when.
                notice,
                // What the landlord sees, sent to the tenant unchanged — including
                // `known: false` and the reason for it, so "we have not got enough of
                // your history to say" is a thing the app can say out loud instead of
                // drawing a dial over nothing.
                score,
                move_in_date: ctx.move_in_date,
                billing_cycle: ctx.billing_cycle
            },
            home: {
                // The id matters, not just the name: the app has to be able to tell
                // "this is the property I already live in" from a code lookup, and a
                // name is not an identifier.
                property_id: ctx.property_id,
                unit_id: ctx.unit_id,
                unit_number: ctx.unit_number,
                room_type: ctx.room_type,
                base_rent: ctx.base_rent,
                property_name: ctx.property_name,
                address: ctx.address,
                locality: ctx.locality,
                city: ctx.city,
                property_image: ctx.property_image,
                // Sent so the tenant can get DIRECTIONS to their own front door.
                // Null until the landlord pins it; the app shows nothing rather than
                // routing somebody to a guess.
                property_type: ctx.property_type,
                latitude: ctx.property_lat,
                longitude: ctx.property_lon,
                deposit: ctx.deposit
            },
            rent: {
                amount: ctx.rent_share,
                next_due: ctx.next_rent_due,
                days_until_due: days,
                state: dueState
            },
            landlord: {
                name: ctx.owner_name,
                phone: ctx.owner_phone,
                email: ctx.owner_email
            },
            // Everything the tenant needs to actually pay. The QR is served relative
            // to the API host, so the client prefixes it with mediaUrl.
            payment: {
                upi_id: ctx.upi_id,
                upi_number: ctx.upi_number,
                qr_code_url: ctx.qr_code_url,
                // Whether paying online is on the table at all, and what it is called.
                //
                // A boolean and a brand name — nothing about the credentials behind it.
                // The tenant does not pay a gateway fee and is not told about one: the
                // amount they are charged is the rent, and the landlord's gateway takes
                // its cut from the landlord's settlement.
                //
                // UPI stays first in the screen regardless. It is free for everyone and
                // it already works; this is the option for a tenant who wants to put
                // rent on a card, or who would rather not wait for a landlord to notice
                // a claim.
                online: {
                    available: !!(ctx.gateway && ctx.gateway_enabled && ctx.gateway_key_id),
                    provider: ctx.gateway && ctx.gateway_enabled ? ctx.gateway : null
                }
            },
            guest,
            id_proof: idProof,
            documents,
            // When this tenant last opened their alerts, so the app can tell an alert
            // that is NEWS from one that is merely still true. Sent as an ISO string
            // (or null for "never opened") rather than a computed unread count: the
            // alert list is derived on the client from this same payload, so counting
            // here would mean deriving it twice and letting the two answers drift.
            alerts_seen_at: ctx.alerts_seen_at ? new Date(ctx.alerts_seen_at).toISOString() : null
        });
    } catch (err) {
        console.error('Tenant portal getMe error:', err.message);
        res.status(500).json({ message: 'Could not load your account.' });
    }
};

// What the receipts screen puts at the top. `paid` counts only money the landlord
// has acknowledged, because that is the number the tenant is judged by; `awaiting` is
// kept separate rather than added in, so the screen can say "8,000 waiting on your
// landlord" instead of implying it is settled.
const paymentSummary = (rows) => {
    const sum = (state) => rows
        .filter((r) => r.status === state)
        .reduce((n, r) => n + Number(r.amount_paid || 0), 0);
    const declared = rows.filter((r) => r.status === 'Declared');
    return {
        paid_total: sum('Confirmed'),
        paid_count: rows.filter((r) => r.status === 'Confirmed').length,
        awaiting_total: sum('Declared'),
        awaiting_count: declared.length,
        rejected_count: rows.filter((r) => r.status === 'Rejected').length,
        // The screen blocks a second "Pay rent" while one is outstanding, so it needs
        // to be able to point at the one that is waiting.
        oldest_awaiting_id: declared.length ? declared[declared.length - 1].id : null
    };
};

// GET /api/tenant-portal/payments — the tenant's own payment history.
const getPayments = async (req, res) => {
    try {
        if (req.user?.role !== 'tenant') {
            return res.status(403).json({ message: 'Tenant access only.' });
        }
        const ctx = await loadTenantContext(req.user.id);
        // Shape stays the same when there is nothing to show, so the screen has one
        // code path rather than a special case for "not linked yet".
        if (!ctx?.tenant_id) return res.status(200).json({ payments: [], summary: paymentSummary([]) });

        // Every state is returned, INCLUDING Rejected. A tenant whose claimed payment
        // was refused needs to see that it was refused and why — a claim that quietly
        // disappears is the version of this that generates a phone call.
        const [payments] = await db.query(
            `SELECT id, amount_paid, payment_date, payment_method, reference_id,
                    status, declared_by, decided_at, decision_note, created_at
             FROM payments WHERE tenant_id = ?
             ORDER BY payment_date DESC, id DESC
             LIMIT 50`,
            [ctx.tenant_id]
        );
        res.status(200).json({ payments, summary: paymentSummary(payments) });
    } catch (err) {
        console.error('Tenant portal getPayments error:', err.message);
        res.status(500).json({ message: 'Could not load payments.' });
    }
};

// GET /api/tenant-portal/pulse — the tenant's side of the same idea.
//
// A tenant is waiting on two things the landlord does elsewhere: being accepted into
// a property, and having a declared payment confirmed. Neither produces any signal
// on this phone today, which is why the screen goes stale until you pull it down.
//
// The counts differ from the landlord's because the interesting events differ.
// `linked` is in the stamp because going from unlinked to linked changes the WHOLE
// portal — it is the difference between "ask to join somewhere" and "here is your
// room" — and that transition must never need a manual refresh.
const getPulse = async (req, res) => {
    try {
        if (req.user?.role !== 'tenant') {
            return res.status(403).json({ message: 'Tenant access only.' });
        }
        const ctx = await loadTenantContext(req.user.id);

        // Not linked yet: the only thing worth watching is whether that changed, plus
        // how their join requests are going. Scoped to tenant_users, since there is no
        // tenants row to scope to.
        if (!ctx?.tenant_id) {
            const [j] = await db.query(
                `SELECT
                    SUM(status = 'Pending')  AS pending,
                    SUM(status = 'Accepted') AS accepted,
                    SUM(status = 'Rejected') AS rejected
                 FROM join_requests WHERE tenant_user_id = ?`,
                [req.user.id]
            );
            const p = {
                linked: 0,
                joins_pending: Number(j[0]?.pending) || 0,
                joins_accepted: Number(j[0]?.accepted) || 0,
                joins_rejected: Number(j[0]?.rejected) || 0
            };
            return res.status(200).json({
                ...p,
                stamp: ['0', p.joins_pending, p.joins_accepted, p.joins_rejected, 0, 0, 0].join('.')
            });
        }

        const [rows] = await db.query(
            `SELECT
                (SELECT COUNT(*) FROM payments
                  WHERE tenant_id = ? AND status = 'Confirmed')                 AS payments_confirmed,
                (SELECT COUNT(*) FROM payments
                  WHERE tenant_id = ? AND status = 'Declared')                  AS payments_awaiting,
                (SELECT COUNT(*) FROM payments
                  WHERE tenant_id = ? AND status = 'Rejected')                  AS payments_rejected,
                (SELECT COUNT(*) FROM maintenance_requests
                  WHERE tenant_id = ?)                                          AS requests,
                (SELECT COUNT(*) FROM maintenance_messages m
                    JOIN maintenance_requests r ON m.request_id = r.id
                  WHERE r.tenant_id = ?)                                        AS messages,
                (SELECT COUNT(*) FROM tenant_documents
                  WHERE tenant_user_id = ? AND status = 'Verified')             AS docs_verified`,
            [ctx.tenant_id, ctx.tenant_id, ctx.tenant_id, ctx.tenant_id, ctx.tenant_id, req.user.id]
        );
        const p = { linked: 1, ...rows[0] };
        const stamp = [
            1, p.payments_confirmed, p.payments_awaiting, p.payments_rejected,
            p.requests, p.messages, p.docs_verified
        ].map((n) => Number(n) || 0).join('.');
        res.status(200).json({ ...p, stamp });
    } catch (err) {
        // Quiet, like the owner's: it runs on a timer and the next tick retries.
        console.error('Tenant portal pulse error:', err.message);
        res.status(500).json({ message: 'Could not read updates.' });
    }
};

// POST /api/tenant-portal/payments — "I have paid this."
//
// This does NOT record money received. It records a CLAIM, which the landlord then
// confirms or refuses (paymentController.decidePayment). Nothing here touches
// next_rent_due: if it did, a tenant could clear their own month by typing a number
// into a form, which is the entire reason the status column exists.
//
// The app cannot verify a UPI transfer either, so the honest framing — in the API and
// in the screen — is that the tenant is telling their landlord something.
const declarePayment = async (req, res) => {
    try {
        if (req.user?.role !== 'tenant') {
            return res.status(403).json({ message: 'Tenant access only.' });
        }
        const ctx = await loadTenantContext(req.user.id);
        if (!ctx?.tenant_id) {
            return res.status(400).json({ message: 'Your account is not linked to a unit yet.' });
        }

        // Amount, rounded to paise. A zero or negative "payment" is not a typo worth
        // guessing at.
        const amount = Math.round(Number(req.body?.amount) * 100) / 100;
        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({ message: 'Enter the amount you paid.' });
        }
        // An upper bound no real rent payment reaches, so a fat-fingered extra digit is
        // caught here rather than sitting in the landlord's queue as 80,00,000. Ten
        // months' rent still allows paying several months at once or clearing arrears.
        const ceiling = Math.max(Number(ctx.rent_share || 0) * 10, 500000);
        if (amount > ceiling) {
            return res.status(400).json({ message: 'That amount looks too large — check it and try again.' });
        }

        const METHODS = ['UPI', 'Card', 'Net Banking', 'Cash', 'Bank Transfer', 'Cheque', 'Other'];
        const method = METHODS.find((m) => m.toLowerCase() === String(req.body?.method || '').trim().toLowerCase())
            || 'UPI';
        const reference = String(req.body?.reference || '').trim().slice(0, 100) || null;

        // The date they say they paid. A future date is refused, and anything older
        // than a year is almost certainly a mistyped year.
        const today = new Date(); today.setHours(0, 0, 0, 0);
        let when = req.body?.date ? new Date(req.body.date) : today;
        if (isNaN(when.getTime())) when = today;
        when.setHours(0, 0, 0, 0);
        if (when > today) {
            return res.status(400).json({ message: 'You cannot record a payment for a future date.' });
        }
        if (when < new Date(today.getTime() - 366 * 86400000)) {
            return res.status(400).json({ message: 'That date is more than a year ago — check the year.' });
        }

        // One claim at a time. Without this, tapping "Pay" twice on a slow connection
        // leaves the landlord two identical rows and no way to tell a double-tap from
        // a tenant who genuinely paid twice.
        const [pending] = await db.query(
            "SELECT id, amount_paid FROM payments WHERE tenant_id = ? AND status = 'Declared' LIMIT 1",
            [ctx.tenant_id]
        );
        if (pending.length) {
            return res.status(409).json({
                message: 'You already have a payment waiting for your landlord to confirm.',
                existing_id: pending[0].id
            });
        }

        // due_date records WHICH rent this claim is for, captured at declaration rather
        // than at confirmation. Both moments read the same value — next_rent_due only
        // moves once the landlord confirms — but recording it here means a claim that is
        // never decided still carries what it was for, and the two insert paths stay
        // symmetrical instead of one of them quietly relying on the other.
        const [result] = await db.query(
            `INSERT INTO payments
                (tenant_id, amount_paid, payment_date, payment_method, reference_id, status, declared_by, due_date)
             VALUES (?, ?, ?, ?, ?, 'Declared', ?, ?)`,
            [ctx.tenant_id, amount, toSqlDate(when), method, reference, ctx.user_id, ctx.next_rent_due || null]
        );

        // Tell the landlord. This claim does nothing at all until they confirm it —
        // the tenant's month is not cleared, the due date has not moved — and the queue
        // it lands in is a sheet they have to think to open. A tenant who has paid and
        // is waiting for a receipt is the person most poorly served by that.
        if (ctx.owner_id) {
            notify({
                role: 'owner',
                accountId: ctx.owner_id,
                kind: 'payment_declared',
                data: {
                    tenantName: ctx.name || ctx.account_name,
                    amount,
                    method,
                    unit: ctx.unit_number,
                    id: result.insertId
                }
            });
        }

        res.status(201).json({
            message: 'Sent to your landlord. It clears the month once they confirm it.',
            payment: {
                id: result.insertId,
                amount_paid: amount,
                payment_date: toSqlDate(when),
                payment_method: method,
                reference_id: reference,
                status: 'Declared'
            }
        });
    } catch (err) {
        console.error('Tenant portal declarePayment error:', err.message);
        res.status(500).json({ message: 'Could not send that to your landlord.' });
    }
};

// ── PAYING ONLINE, THROUGH THE LANDLORD'S OWN GATEWAY ────────────────────────
//
// Two handlers, and the split between them is the point.
//
// `startOnlinePayment` creates the claim and the payment link together. `checkOnlinePayment`
// asks the GATEWAY whether that link was paid, and settles only on its word.
//
// What the tenant's phone can do is trigger the question. It cannot answer it. That is
// the same rule the rest of this file lives by — a payment is real once something other
// than the tenant vouches for it — with the gateway standing in for the landlord's tap.
// It is strictly better than the UPI flow for the tenant, because the voucher answers in
// seconds rather than whenever their landlord next opens the app.
//
// The amount charged is the rent. The gateway's fee comes out of the landlord's
// settlement, at the landlord's own account, and is never added to what the tenant pays.

// How much rent is outstanding, rounded to paise, with the same ceiling declarePayment
// uses. Shared so the two routes cannot disagree about what a plausible amount is.
const payableAmount = (ctx, raw) => {
    const amount = Math.round(Number(raw) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
        return { ok: false, message: 'Enter the amount you want to pay.' };
    }
    // A gateway's own floor. Razorpay refuses anything under ₹1, and its error for that
    // is not one a tenant should have to read.
    if (amount < 1) {
        return { ok: false, message: 'The smallest online payment is ₹1.' };
    }
    const ceiling = Math.max(Number(ctx.rent_share || 0) * 10, 500000);
    if (amount > ceiling) {
        return { ok: false, message: 'That amount looks too large — check it and try again.' };
    }
    return { ok: true, amount };
};

// POST /api/tenant-portal/payments/online   { amount }
const startOnlinePayment = async (req, res) => {
    try {
        if (req.user?.role !== 'tenant') {
            return res.status(403).json({ message: 'Tenant access only.' });
        }
        const ctx = await loadTenantContext(req.user.id);
        if (!ctx?.tenant_id) {
            return res.status(400).json({ message: 'Your account is not linked to a unit yet.' });
        }

        const creds = credentialsFor(ctx);
        if (!creds.ok) {
            // Said in the tenant's terms, not ours. They cannot fix any of these and
            // should not be shown a reason code — but "pay by UPI instead" is a real
            // instruction and the UPI details are already on the same screen.
            const message = creds.reason === 'unreadable'
                ? 'Online payments are temporarily unavailable. Please pay by UPI, or ask your landlord to reconnect their gateway.'
                : 'Your landlord is not taking online payments. You can still pay by UPI.';
            return res.status(409).json({ message, fallback: 'upi' });
        }

        const want = payableAmount(ctx, req.body?.amount ?? ctx.rent_share);
        if (!want.ok) return res.status(400).json({ message: want.message });
        const { amount } = want;

        // One claim at a time, exactly as declarePayment enforces — but here an existing
        // claim is usually the tenant coming BACK, not a double tap. Three cases, and
        // conflating any two of them is a bug with money in it:
        //
        //   · it already has a link, and the gateway says paid  → settle it now
        //   · it already has a link, still open                 → hand back the SAME url
        //   · its link has expired or was cancelled             → drop it, make a new one
        //   · it is a hand-typed UPI claim with no link          → refuse, as before
        //
        // Handing back the same url matters more than it looks: a tenant who closed the
        // browser and tapped Pay again would otherwise get a second live link for the
        // same rent, and both of them work.
        //
        // And dropping a dead one matters just as much in the other direction. Razorpay
        // links expire; a tenant who starts a payment, wanders off, and comes back next
        // week holds a Declared row pointing at a page that will never be paid. Leaving
        // it there blocks the one-claim-at-a-time slot — which would cost them the free
        // UPI route as well — over a payment that provably did not happen.
        const [pending] = await db.query(
            "SELECT id, amount_paid, gateway_ref FROM payments WHERE tenant_id = ? AND status = 'Declared' LIMIT 1",
            [ctx.tenant_id]
        );
        if (pending.length) {
            const row = pending[0];
            if (!row.gateway_ref) {
                return res.status(409).json({
                    message: 'You already have a payment waiting for your landlord to confirm.',
                    existing_id: row.id
                });
            }
            const link = await creds.provider.readLink(creds.creds, row.gateway_ref);
            if (!link.ok) {
                // The gateway will not talk about a link we are holding. Nothing good
                // comes of creating a second one against a claim we cannot read, so this
                // stops rather than guessing: a wrong guess here is a tenant paying the
                // same rent twice.
                return res.status(502).json({
                    message: 'Could not reach the payment gateway. Try again in a minute, or pay by UPI.',
                    fallback: 'upi'
                });
            }
            if (link.paid) {
                const settled = await settleFromGateway(row.id, link, creds.provider.id);
                return res.status(200).json({
                    message: settled.ok ? 'That payment already went through.' : settled.message,
                    paid: true,
                    payment_id: row.id,
                    next_rent_due: settled.ok ? settled.next_rent_due : undefined
                });
            }
            if (link.status === 'expired' || link.status === 'cancelled') {
                // Safe to delete only because the gateway has just told us this page can
                // never be paid. The DELETE re-checks the status so a confirmation that
                // landed in between — a webhook, a landlord's tap — is not thrown away.
                await db.query("DELETE FROM payments WHERE id = ? AND status = 'Declared'", [row.id]);
            } else if (link.url) {
                return res.status(200).json({
                    message: 'Picking up where you left off.',
                    payment_id: row.id,
                    amount: Number(row.amount_paid),
                    provider: creds.provider.id,
                    url: link.url
                });
            } else {
                // Readable, not paid, not dead, and no url to send them back to. Should
                // not happen; refusing beats inventing a second link for the same rent.
                return res.status(502).json({
                    message: 'Could not reopen that payment. Try again in a minute, or pay by UPI.',
                    fallback: 'upi'
                });
            }
        }

        // The claim comes FIRST, and the link second, against our own row id.
        //
        // That ordering is deliberate: the reference we hand the gateway has to be
        // unique and ours, and `TP<id>` is both. The old free-text reference was
        // whatever the tenant typed, which is exactly the ambiguity webhookController
        // has to refuse to settle on.
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const [inserted] = await db.query(
            `INSERT INTO payments
                (tenant_id, amount_paid, payment_date, payment_method, status, declared_by, due_date)
             VALUES (?, ?, ?, 'Online', 'Declared', ?, ?)`,
            [ctx.tenant_id, amount, toSqlDate(today), ctx.user_id, ctx.next_rent_due || null]
        );
        const paymentId = inserted.insertId;
        const reference = `TP${paymentId}`;

        const link = await creds.provider.createLink(creds.creds, {
            amount,
            description: `Rent${ctx.unit_number ? ` · Unit ${ctx.unit_number}` : ''}${ctx.property_name ? ` · ${ctx.property_name}` : ''}`,
            reference,
            customer: {
                name: ctx.name || ctx.account_name,
                email: ctx.email || ctx.account_email,
                phone: ctx.phone || ctx.account_phone
            }
        });

        if (!link.ok) {
            // The claim is deleted, not left behind. A Declared row with no link is a
            // payment the tenant never made, sitting in the landlord's confirm queue AND
            // blocking the tenant's one-claim-at-a-time slot — so the failure would cost
            // them the UPI route as well as this one.
            await db.query("DELETE FROM payments WHERE id = ? AND status = 'Declared'", [paymentId]);
            console.error(`Gateway link failed for owner ${ctx.owner_id}: ${link.reason}`);
            return res.status(502).json({
                message: 'Could not start that payment. Try again, or pay by UPI.',
                fallback: 'upi'
            });
        }

        await db.query('UPDATE payments SET gateway_ref = ?, reference_id = ? WHERE id = ?',
            [link.ref, reference, paymentId]);

        // The landlord is NOT notified here, and that is the difference from
        // declarePayment. There is nothing for them to do: either the gateway confirms
        // this in the next few minutes and they get a receipt, or the tenant abandoned a
        // link and there was never a payment. Telling them about a claim they must not
        // act on would train them to confirm rows by hand that the gateway is about to
        // confirm properly.
        res.status(201).json({
            message: 'Opening the payment page.',
            payment_id: paymentId,
            amount,
            provider: creds.provider.id,
            url: link.url
        });
    } catch (err) {
        console.error('Tenant portal startOnlinePayment error:', err.message);
        res.status(500).json({ message: 'Could not start that payment.' });
    }
};

// Settle a row because the GATEWAY said it was paid. One place, so the two callers
// above and below cannot differ on what that means — and it goes through the same
// settlePayment the landlord's tap uses, which is what keeps due dates consistent.
const settleFromGateway = (paymentId, link, providerId) => settlePayment({
    paymentId,
    status: 'Confirmed',
    source: 'gateway',
    // The underlying payment id if the gateway gave us one, so the row carries the
    // reference a landlord can actually search for in their own dashboard. COALESCE in
    // settlePayment keeps the link id when it did not.
    gatewayRef: link.paymentId || null,
    note: `Paid online and confirmed by ${providerId}.`
});

// POST /api/tenant-portal/payments/:id/check
//
// Called when the tenant comes back from the gateway's page. It settles nothing on their
// word — it asks the gateway and acts on the answer — so there is no harm in the app
// calling it eagerly, or twice.
const checkOnlinePayment = async (req, res) => {
    try {
        if (req.user?.role !== 'tenant') {
            return res.status(403).json({ message: 'Tenant access only.' });
        }
        const ctx = await loadTenantContext(req.user.id);
        if (!ctx?.tenant_id) {
            return res.status(400).json({ message: 'Your account is not linked to a unit yet.' });
        }

        // Scoped to the caller's own tenancy. Without the tenant_id clause any tenant
        // could ask us to go and settle any payment id in the database.
        const [rows] = await db.query(
            'SELECT id, status, gateway_ref, amount_paid FROM payments WHERE id = ? AND tenant_id = ?',
            [req.params.id, ctx.tenant_id]
        );
        if (!rows.length) {
            return res.status(404).json({ message: 'Payment not found.' });
        }
        const row = rows[0];

        // Already decided — by the landlord, a webhook, or an earlier call to this very
        // route. Reported as the settled truth rather than re-asked, because asking
        // again cannot change it and a second settle is refused anyway.
        if (row.status !== 'Declared') {
            return res.status(200).json({
                status: row.status,
                paid: row.status === 'Confirmed',
                message: row.status === 'Confirmed' ? 'Payment confirmed.' : 'That payment was rejected.'
            });
        }
        if (!row.gateway_ref) {
            return res.status(200).json({
                status: 'Declared',
                paid: false,
                message: 'Waiting for your landlord to confirm this.'
            });
        }

        const creds = credentialsFor(ctx);
        if (!creds.ok) {
            // The landlord disconnected the gateway between the link being made and the
            // tenant coming back. The money may well have arrived; what is gone is our
            // ability to ask. The claim stays and the landlord can confirm it by hand,
            // which is what the queue is for.
            return res.status(200).json({
                status: 'Declared',
                paid: false,
                message: 'Waiting for your landlord to confirm this.'
            });
        }

        const link = await creds.provider.readLink(creds.creds, row.gateway_ref);
        if (!link.ok) {
            return res.status(502).json({ message: 'Could not reach the payment gateway. We will keep trying.' });
        }
        if (!link.paid) {
            return res.status(200).json({
                status: 'Declared',
                paid: false,
                // 'created' means the link was never opened or never completed. Said
                // plainly, because the alternative is a spinner that never resolves.
                message: link.status === 'expired' || link.status === 'cancelled'
                    ? 'That payment page is no longer valid. Start again when you are ready.'
                    : 'No payment on that page yet.'
            });
        }

        const settled = await settleFromGateway(row.id, link, creds.provider.id);
        if (!settled.ok) {
            // 409: somebody else settled it in the last few seconds. Not a failure —
            // the tenant's month is cleared either way, which is all they asked.
            return res.status(200).json({ status: 'Confirmed', paid: true, message: settled.message });
        }
        res.status(200).json({
            status: 'Confirmed',
            paid: true,
            message: `₹${Number(row.amount_paid).toLocaleString('en-IN')} received. Your rent is up to date.`,
            next_rent_due: settled.next_rent_due
        });
    } catch (err) {
        console.error('Tenant portal checkOnlinePayment error:', err.message);
        res.status(500).json({ message: 'Could not check that payment.' });
    }
};

// GET /api/tenant-portal/requests — the tenant's maintenance requests.
const getRequests = async (req, res) => {
    try {
        if (req.user?.role !== 'tenant') {
            return res.status(403).json({ message: 'Tenant access only.' });
        }
        const ctx = await loadTenantContext(req.user.id);
        if (!ctx?.tenant_id) return res.status(200).json({ requests: [] });

        // Last activity, and WHO caused it.
        //
        // Without these, "your landlord replied" is underivable: the row carries only
        // when the tenant raised it, so a request answered an hour ago and one ignored
        // for a fortnight look identical. The role matters as much as the time — a
        // tenant's own last message must never come back to them as a notification.
        //
        // GROUP_CONCAT + SUBSTRING_INDEX is the portable way to take "the value from
        // the newest row per group" without a window function, which this MariaDB
        // version cannot be assumed to have.
        const [requests] = await db.query(
            `SELECT r.id, r.category, r.title, r.description, r.priority, r.status,
                    r.image_url, r.created_at,
                    COALESCE(m.last_at, r.created_at) AS last_activity_at,
                    m.last_role AS last_message_role,
                    m.last_kind AS last_message_kind
             FROM maintenance_requests r
             LEFT JOIN (
                 SELECT request_id,
                        MAX(created_at) AS last_at,
                        SUBSTRING_INDEX(GROUP_CONCAT(sender_role ORDER BY created_at DESC), ',', 1) AS last_role,
                        SUBSTRING_INDEX(GROUP_CONCAT(kind ORDER BY created_at DESC), ',', 1) AS last_kind
                 FROM maintenance_messages
                 GROUP BY request_id
             ) m ON m.request_id = r.id
             WHERE r.tenant_id = ?
             ORDER BY r.created_at DESC LIMIT 50`,
            [ctx.tenant_id]
        );
        res.status(200).json({ requests });
    } catch (err) {
        console.error('Tenant portal getRequests error:', err.message);
        res.status(500).json({ message: 'Could not load requests.' });
    }
};

// POST /api/tenant-portal/requests — raise a maintenance request.
const createRequest = async (req, res) => {
    try {
        if (req.user?.role !== 'tenant') {
            return res.status(403).json({ message: 'Tenant access only.' });
        }
        const ctx = await loadTenantContext(req.user.id);
        if (!ctx?.tenant_id) {
            return res.status(400).json({ message: 'Your account is not linked to a unit yet.' });
        }

        const { title, description, category, priority } = req.body;
        if (!title || !title.trim()) {
            return res.status(400).json({ message: 'A short title is required.' });
        }
        const allowedPriority = ['Low', 'Medium', 'High'];
        const prio = allowedPriority.includes(priority) ? priority : 'Medium';

        // An optional photo of the problem, uploaded as `request_image`.
        const imageUrl = getFileUrl(req.file);

        // owner_id is denormalised onto the request so the landlord's queue can be
        // read without re-joining through the tenant every time.
        const [result] = await db.query(
            `INSERT INTO maintenance_requests (tenant_id, owner_id, category, title, description, priority, status, image_url)
             VALUES (?, ?, ?, ?, ?, ?, 'Open', ?)`,
            [ctx.tenant_id, ctx.owner_id, (category || 'General').slice(0, 50), title.trim().slice(0, 150), (description || '').trim() || null, prio, imageUrl]
        );

        // A repair is the one thing here where the delay is the damage — a leak reported
        // on Friday and read on Monday is a different repair by Monday.
        if (ctx.owner_id) {
            notify({
                role: 'owner',
                accountId: ctx.owner_id,
                kind: 'ticket_raised',
                data: {
                    tenantName: ctx.name || ctx.account_name,
                    subject: title.trim(),
                    unit: ctx.unit_number,
                    id: result.insertId
                }
            });
        }

        res.status(201).json({
            message: 'Request submitted.',
            request: {
                id: result.insertId,
                category: category || 'General',
                title: title.trim(),
                description: (description || '').trim() || null,
                priority: prio,
                status: 'Open',
                image_url: imageUrl,
                created_at: new Date().toISOString()
            }
        });
    } catch (err) {
        console.error('Tenant portal createRequest error:', err.message);
        res.status(500).json({ message: 'Could not submit your request.' });
    }
};

// Confirms a request id belongs to THIS tenant. Matching on tenant_id as well as
// id is the entire authorisation check: someone else's request simply does not
// exist as far as this caller is concerned, so guessing ids reveals nothing.
const ownsRequest = async (requestId, tenantId) => {
    const [rows] = await db.query(
        'SELECT id FROM maintenance_requests WHERE id = ? AND tenant_id = ?',
        [requestId, tenantId]
    );
    return rows.length > 0;
};

// GET /api/tenant-portal/requests/:id/messages — the conversation on one of the
// tenant's own requests.
const getRequestMessages = async (req, res) => {
    try {
        if (req.user?.role !== 'tenant') {
            return res.status(403).json({ message: 'Tenant access only.' });
        }
        const ctx = await loadTenantContext(req.user.id);
        if (!ctx?.tenant_id || !(await ownsRequest(req.params.id, ctx.tenant_id))) {
            return res.status(404).json({ message: 'Request not found.' });
        }

        res.status(200).json({ messages: await fetchThread(req.params.id) });
    } catch (err) {
        console.error('Tenant portal getRequestMessages error:', err.message);
        res.status(500).json({ message: 'Could not load the conversation.' });
    }
};

// POST /api/tenant-portal/requests/:id/messages — reply on your own request.
const createRequestMessage = async (req, res) => {
    try {
        if (req.user?.role !== 'tenant') {
            return res.status(403).json({ message: 'Tenant access only.' });
        }
        const text = cleanBody(req.body?.body);
        if (!text) {
            return res.status(400).json({ message: 'A message cannot be empty.' });
        }
        const ctx = await loadTenantContext(req.user.id);
        if (!ctx?.tenant_id || !(await ownsRequest(req.params.id, ctx.tenant_id))) {
            return res.status(404).json({ message: 'Request not found.' });
        }

        const item = await insertMessage(req.params.id, 'tenant', text);

        res.status(201).json({ message: 'Message sent.', item });
    } catch (err) {
        console.error('Tenant portal createRequestMessage error:', err.message);
        res.status(500).json({ message: 'Could not send your message.' });
    }
};

// ── Leaving a property ─────────────────────────────────────────────────────────
// Three endpoints, because giving notice is a decision and a decision needs to be
// previewable and reversible:
//
//   GET    /leave   what would happen — the dates and disclosures the confirmation
//                   screen prints. Without this the app would have to invent the
//                   rules locally, which is how it ended up promising "30 DAYS
//                   NOTICE APPLIES" under a button that did nothing.
//   POST   /leave   give notice.
//   DELETE /leave   withdraw it. People change their minds, and a mis-tap on
//                   something this consequential must not be a one-way door.

// Load the caller's tenancy for a notice decision. Scoped through tenant_users ->
// tenants like every other read here, so one tenant can never act on another's.
const loadForNotice = async (userId) => {
    const [rows] = await db.query(
        `SELECT t.id, t.owner_id, t.unit_id, t.status, t.stay_until, t.next_rent_due,
                t.rent_share, t.deposit, t.notice_given_on, t.leave_on, t.name AS tenant_name,
                u.unit_number, p.name AS property_name,
                o.name AS owner_name, o.phone AS owner_phone
           FROM tenant_users tu
           JOIN tenants t ON tu.tenant_id = t.id
           LEFT JOIN units u ON t.unit_id = u.id
           LEFT JOIN properties p ON u.property_id = p.id
           LEFT JOIN owners o ON t.owner_id = o.id
          WHERE tu.id = ? LIMIT 1`,
        [userId]
    );
    return rows[0] || null;
};

// Shared shape for all three, so the app reads one contract whichever call it made.
const noticeState = (ctx) => {
    const plan = planNotice({
        stayUntil: ctx.stay_until,
        nextRentDue: ctx.next_rent_due,
        rentShare: ctx.rent_share,
        deposit: ctx.deposit
    });
    return {
        property_name: ctx.property_name || null,
        unit_number: ctx.unit_number || null,
        owner_name: ctx.owner_name || null,
        owner_phone: ctx.owner_phone || null,
        // Whether notice has ALREADY been given, and for when. The app needs this to
        // stop offering "Leave this property" to somebody who already has.
        notice_given_on: toSqlDate(ctx.notice_given_on),
        leaving_on: toSqlDate(ctx.leave_on),
        plan
    };
};

const getLeavePlan = async (req, res) => {
    try {
        if (req.user?.role !== 'tenant') return res.status(403).json({ message: 'Tenant access only.' });
        const ctx = await loadForNotice(req.user.id);
        // No tenancy means nothing to leave. Reported as a state rather than an error:
        // the app can legitimately ask this before a landlord has placed them.
        if (!ctx) return res.status(200).json({ can_leave: false, reason: 'You are not in a property yet.' });
        if (String(ctx.status) !== 'Active') {
            return res.status(200).json({ can_leave: false, reason: 'You have already moved out of this property.' });
        }
        res.status(200).json({ can_leave: true, ...noticeState(ctx) });
    } catch (error) {
        console.error('Leave plan failed:', error.message);
        res.status(500).json({ message: 'Could not work out your notice period.' });
    }
};

const giveNotice = async (req, res) => {
    try {
        if (req.user?.role !== 'tenant') return res.status(403).json({ message: 'Tenant access only.' });
        const ctx = await loadForNotice(req.user.id);
        if (!ctx) return res.status(404).json({ message: 'You are not in a property yet.' });
        if (String(ctx.status) !== 'Active') {
            return res.status(409).json({ message: 'You have already moved out of this property.' });
        }
        // Already given. NOT an error — a retry on a flaky connection would otherwise
        // look like a failure and tempt the person into pressing it again. Answer with
        // the existing notice, which is what a second press should show anyway.
        if (ctx.leave_on) {
            return res.status(200).json({ already: true, ...noticeState(ctx) });
        }

        const plan = planNotice({
            stayUntil: ctx.stay_until,
            nextRentDue: ctx.next_rent_due,
            rentShare: ctx.rent_share,
            deposit: ctx.deposit
        });

        // The date is computed HERE, never accepted from the request. A client-chosen
        // leave date would let a tenant serve one day's notice by editing a number.
        await db.query(
            'UPDATE tenants SET notice_given_on = CURDATE(), leave_on = ? WHERE id = ?',
            [plan.leaveOn, ctx.id]
        );

        // The landlord needs this one early or not at all: notice is how long they have
        // to re-let the room, and every day they do not know about it is a day of that
        // gone. It is also the only event here the tenant cannot follow up on — they
        // have given notice and the app tells them it is done, so if the landlord never
        // reads it, neither of them finds out until the move-out date.
        if (ctx.owner_id) {
            notify({
                role: 'owner',
                accountId: ctx.owner_id,
                kind: 'notice_given',
                data: {
                    tenantName: ctx.tenant_name,
                    leaveOn: plan.leaveOn,
                    unit: ctx.unit_number,
                    id: ctx.id
                }
            });
        }

        // The tenancy stays Active and the room stays occupied. Both are still true
        // until the leave date, and flipping them now would free a room the landlord
        // cannot let yet and erase who owed what while it mattered. The landlord
        // completes the move-out on or after the date.
        const after = await loadForNotice(req.user.id);
        res.status(200).json({ ...noticeState(after || ctx) });
    } catch (error) {
        console.error('Give notice failed:', error.message);
        res.status(500).json({ message: 'Could not give notice. Please try again.' });
    }
};

const withdrawNotice = async (req, res) => {
    try {
        if (req.user?.role !== 'tenant') return res.status(403).json({ message: 'Tenant access only.' });
        const ctx = await loadForNotice(req.user.id);
        if (!ctx) return res.status(404).json({ message: 'You are not in a property yet.' });
        if (!ctx.leave_on) {
            return res.status(200).json({ ...noticeState(ctx) });
        }
        // Only while the tenancy is still live. Once the landlord has completed the
        // move-out the room may already be re-let, so "changing your mind" is a
        // conversation with them, not a button.
        if (String(ctx.status) !== 'Active') {
            return res.status(409).json({ message: 'You have already moved out. Speak to your landlord about coming back.' });
        }
        await db.query('UPDATE tenants SET notice_given_on = NULL, leave_on = NULL WHERE id = ?', [ctx.id]);
        const after = await loadForNotice(req.user.id);
        res.status(200).json({ withdrawn: true, ...noticeState(after || ctx) });
    } catch (error) {
        console.error('Withdraw notice failed:', error.message);
        res.status(500).json({ message: 'Could not withdraw your notice. Please try again.' });
    }
};

// Mark this tenant's alerts as seen, right now.
//
// Deliberately takes no timestamp from the client. A caller could otherwise send a
// time in the future and permanently silence their own alerts — and more mundanely,
// a phone with a wrong clock would do the same by accident. The server's clock is the
// only one that can be trusted to move forward.
const markAlertsSeen = async (req, res) => {
    try {
        if (req.user.role !== 'tenant') {
            return res.status(403).json({ message: 'Tenants only.' });
        }
        const [r] = await db.query(
            'UPDATE tenant_users SET alerts_seen_at = NOW() WHERE id = ?',
            [req.user.id]
        );
        if (!r.affectedRows) return res.status(404).json({ message: 'Account not found.' });
        // The new stamp is returned so the app can update without another round trip
        // to /me — the bell clearing needs to feel immediate.
        const [[row]] = await db.query(
            'SELECT alerts_seen_at FROM tenant_users WHERE id = ?',
            [req.user.id]
        );
        res.status(200).json({
            alerts_seen_at: row && row.alerts_seen_at ? new Date(row.alerts_seen_at).toISOString() : null
        });
    } catch (err) {
        console.error('Tenant portal markAlertsSeen error:', err.message);
        res.status(500).json({ message: 'Could not update your alerts.' });
    }
};

module.exports = {
    getMe,
    markAlertsSeen,
    getLeavePlan,
    giveNotice,
    withdrawNotice,
    getPulse,
    getPayments,
    declarePayment,
    startOnlinePayment,
    checkOnlinePayment,
    getRequests,
    createRequest,
    getRequestMessages,
    createRequestMessage
};
