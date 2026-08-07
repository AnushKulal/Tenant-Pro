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

        // Not yet linked to a unit by a landlord: the portal shows a friendly
        // "ask your landlord to link you" state rather than empty data.
        if (!ctx.tenant_id) {
            return res.status(200).json({
                linked: false,
                account: { name: ctx.name || req.user.email, email: req.user.email }
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
            }
        });
    } catch (err) {
        console.error('Tenant portal getMe error:', err.message);
        res.status(500).json({ message: 'Could not load your account.' });
    }
};

// GET /api/tenant-portal/payments — the tenant's own payment history.
const getPayments = async (req, res) => {
    try {
        if (req.user?.role !== 'tenant') {
            return res.status(403).json({ message: 'Tenant access only.' });
        }
        const ctx = await loadTenantContext(req.user.id);
        if (!ctx?.tenant_id) return res.status(200).json({ payments: [] });

        const [payments] = await db.query(
            `SELECT id, amount_paid, payment_date, payment_method, reference_id
             FROM payments WHERE tenant_id = ?
             ORDER BY payment_date DESC, id DESC
             LIMIT 50`,
            [ctx.tenant_id]
        );
        res.status(200).json({ payments });
    } catch (err) {
        console.error('Tenant portal getPayments error:', err.message);
        res.status(500).json({ message: 'Could not load payments.' });
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
    getRequests,
    createRequest,
    getRequestMessages,
    createRequestMessage
};
