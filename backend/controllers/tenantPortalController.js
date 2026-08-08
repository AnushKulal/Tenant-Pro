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
const { getFileUrl } = require('../middleware/uploadMiddleware');
// Message reads/writes are shared with the owner side so a thread behaves
// identically whichever end of it you are standing at.
const { fetchThread, insertMessage, cleanBody } = require('./requestController');
// The ID-proof summary rides along with /me so the portal knows on its first call
// whether this account still owes a document — one source of that answer, not two.
const { fetchDocuments, summarise } = require('./documentController');
// Date formatting shared with the confirmation side, so a declared payment and the
// due date it eventually moves are written by the same code.
const { toSqlDate } = require('../utils/rentDates');

// Resolves the logged-in tenant_users account to its linked landlord tenant row,
// with the unit, property and the owner's UPI settings joined in. Returns null if
// the account isn't a tenant, doesn't exist, or hasn't been linked to a unit yet —
// each of which the caller reports differently.
const loadTenantContext = async (userId) => {
    const [rows] = await db.query(
        `SELECT
            tu.id            AS user_id,
            tu.status        AS link_status,
            t.id             AS tenant_id,
            t.name, t.phone, t.email, t.company, t.image_url,
            t.deposit, t.rent_share, t.credit_score, t.move_in_date,
            t.billing_cycle, t.next_rent_due, t.status AS tenancy_status,
            u.id AS unit_id, u.unit_number, u.room_type, u.base_rent,
            p.id AS property_id, p.name AS property_name, p.address, p.locality, p.city, p.image_url AS property_image,
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

        // Not yet linked to a unit by a landlord: the portal shows a friendly
        // "ask your landlord to link you" state rather than empty data.
        if (!ctx.tenant_id) {
            return res.status(200).json({
                linked: false,
                account: { name: ctx.name || req.user.email, email: req.user.email },
                id_proof: idProof,
                documents
            });
        }

        const days = daysUntilDue(ctx.next_rent_due);
        const dueState = days === null ? 'none' : days < 0 ? 'overdue' : days === 0 ? 'due_today' : 'upcoming';

        res.status(200).json({
            linked: true,
            profile: {
                name: ctx.name,
                phone: ctx.phone,
                email: ctx.email,
                company: ctx.company,
                image_url: ctx.image_url,
                credit_score: ctx.credit_score,
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

        const [result] = await db.query(
            `INSERT INTO payments
                (tenant_id, amount_paid, payment_date, payment_method, reference_id, status, declared_by)
             VALUES (?, ?, ?, ?, ?, 'Declared', ?)`,
            [ctx.tenant_id, amount, toSqlDate(when), method, reference, ctx.user_id]
        );

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

module.exports = {
    getMe,
    getPayments,
    declarePayment,
    getRequests,
    createRequest,
    getRequestMessages,
    createRequestMessage
};
