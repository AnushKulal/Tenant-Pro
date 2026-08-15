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
            t.id             AS tenant_id,
            t.name, t.phone, t.email, t.company, t.image_url,
            t.deposit, t.rent_share, t.credit_score, t.move_in_date,
            t.billing_cycle, t.next_rent_due, t.status AS tenancy_status, t.stay_until,
            t.notice_given_on, t.leave_on,
            u.id AS unit_id, u.unit_number, u.room_type, u.base_rent,
            p.id AS property_id, p.name AS property_name, p.address, p.locality, p.city, p.image_url AS property_image,
            p.property_type, p.latitude AS property_lat, p.longitude AS property_lon,
            o.id AS owner_id, o.name AS owner_name, o.phone AS owner_phone, o.email AS owner_email,
            ps.upi_id, ps.upi_number, ps.qr_code_url
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
                documents
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
                qr_code_url: ctx.qr_code_url
            },
            guest,
            id_proof: idProof,
            documents
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

// GET /api/tenant-portal/requests — the tenant's maintenance requests.
const getRequests = async (req, res) => {
    try {
        if (req.user?.role !== 'tenant') {
            return res.status(403).json({ message: 'Tenant access only.' });
        }
        const ctx = await loadTenantContext(req.user.id);
        if (!ctx?.tenant_id) return res.status(200).json({ requests: [] });

        const [requests] = await db.query(
            `SELECT id, category, title, description, priority, status, image_url, created_at
             FROM maintenance_requests WHERE tenant_id = ?
             ORDER BY created_at DESC LIMIT 50`,
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

module.exports = {
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
};
