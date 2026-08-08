// File: backend/controllers/requestController.js
// The landlord's side of maintenance requests: the queue every tenant request
// lands in, the status the landlord moves it through, and the message thread on
// each one. The thread helpers at the bottom are shared with the tenant portal so
// both sides read and write the same conversation through identical SQL.
//
// Auth: these handlers hang off the owner router, so `protect` has already put
// req.user on the request and every query is scoped by req.user.id as owner_id.
const db = require('../config/db');

// The statuses the schema's enum accepts. Anything else is rejected rather than
// handed to MySQL, which would either truncate it to '' or error out depending on
// the server's strict-mode setting.
const ALLOWED_STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'];

// Owner tokens carry no `role`; tenant tokens carry role: 'tenant'. Owners and
// tenant logins live in separate tables, so their ids overlap — without this a
// tenant whose account id happens to match an owner's would read that landlord's
// queue. We reject the tenant role rather than requiring an 'owner' role because
// existing owner tokens (7-day expiry) were issued without one.
const isTenantToken = (req) => req.user?.role === 'tenant';

// GET /api/owner/requests — the whole maintenance queue for this landlord.
const getRequests = async (req, res) => {
    try {
        if (isTenantToken(req)) {
            return res.status(403).json({ message: 'Owner access only.' });
        }
        const ownerId = req.user.id;
        const { property_id } = req.query; // 'all' or a specific ID

        // Same sentinels the dashboard filter accepts — the client sends the
        // literal strings 'all'/'null' when no single property is selected.
        let propertyFilter = '';
        const queryParams = [ownerId];

        if (property_id && property_id !== 'all' && property_id !== 'null') {
            propertyFilter = ' AND p.id = ?';
            queryParams.push(property_id);
        }

        // LEFT JOINs throughout: a request must never vanish from the queue just
        // because the tenant who raised it has since been moved out of their unit
        // (tenants.unit_id goes NULL), which is exactly when the landlord still
        // needs to see the open items.
        const [requests] = await db.query(`
            SELECT
                mr.*,
                -- tenant_image lets the queue row show the same face as the
                -- Tenants tab, so a request reads as coming from a person.
                t.name AS tenant_name, t.image_url AS tenant_image,
                u.unit_number, p.name AS property_name
            FROM maintenance_requests mr
            LEFT JOIN tenants t ON mr.tenant_id = t.id
            LEFT JOIN units u ON t.unit_id = u.id
            LEFT JOIN properties p ON u.property_id = p.id
            WHERE mr.owner_id = ? ${propertyFilter}
            ORDER BY mr.created_at DESC, mr.id DESC
        `, queryParams);

        res.status(200).json({ requests });
    } catch (error) {
        console.error('Owner getRequests error:', error);
        res.status(500).json({ message: 'Failed to load maintenance requests.' });
    }
};

// PUT /api/owner/requests/:id/status — move a request along the queue.
const updateStatus = async (req, res) => {
    try {
        if (isTenantToken(req)) {
            return res.status(403).json({ message: 'Owner access only.' });
        }
        const ownerId = req.user.id;
        const requestId = req.params.id;
        const { status } = req.body;

        if (!ALLOWED_STATUSES.includes(status)) {
            return res.status(400).json({
                message: `Status must be one of: ${ALLOWED_STATUSES.join(', ')}.`
            });
        }

        // Verify ownership before touching the row — matching on owner_id in the
        // check (rather than only in the UPDATE) is what makes a request that
        // belongs to someone else a clean 404 instead of a silent no-op. The
        // current status comes back from this same query: the timeline event needs
        // the value being moved away from, and reading it here costs nothing.
        const [check] = await db.query(
            'SELECT id, status FROM maintenance_requests WHERE id = ? AND owner_id = ?',
            [requestId, ownerId]
        );
        if (check.length === 0) {
            return res.status(404).json({ message: 'Request not found or unauthorized.' });
        }

        const previous = check[0].status;

        // Re-sending the status the request already has is not an error — clients
        // retry, and a double-tap on "Resolved" should not look like a failure. But
        // it must not leave a trail either: a timeline reading "Marked Resolved"
        // three times over would be describing the network, not the tenancy.
        if (previous === status) {
            return res.status(200).json({ message: 'Status unchanged.', status });
        }

        // updated_at is ON UPDATE current_timestamp, so it moves on its own here.
        await db.query('UPDATE maintenance_requests SET status = ? WHERE id = ?', [status, requestId]);

        // Record the move in the request's thread so both sides can see WHEN it
        // happened. Attributed to 'owner' rather than 'system' because a landlord
        // decided it — from the tenant's side this is the landlord acting, and it
        // belongs on the same side of the conversation as their replies.
        // Written after the UPDATE and not wrapped with it: an event with no state
        // change behind it would be a lie, whereas a state change whose event
        // failed to write is merely an incomplete history.
        await insertStatusEvent(requestId, previous, status);

        res.status(200).json({ message: 'Status updated.', status });
    } catch (error) {
        console.error('Owner updateStatus error:', error);
        res.status(500).json({ message: 'Failed to update the request status.' });
    }
};

// --- Shared thread helpers (also used by tenantPortalController) ---

// Named once because a POST reads its own row back (see insertMessage) and must
// hand the client the same fields the following GET will — a client that renders a
// status event from `kind` breaks if one of the two shapes is missing it.
const THREAD_COLUMNS = 'id, sender_role, kind, body, status_from, status_to, created_at';

// The thread on one request, oldest-first: a conversation reads top-to-bottom,
// unlike the queue lists which are newest-first. Status events are interleaved
// with the messages by the same ordering, which is the point of storing them in
// this table — `kind` is how the client tells the two apart when drawing them.
const fetchThread = async (requestId) => {
    const [messages] = await db.query(
        `SELECT ${THREAD_COLUMNS}
         FROM maintenance_messages WHERE request_id = ?
         ORDER BY created_at ASC, id ASC`,
        [requestId]
    );
    return messages;
};

// Trims and length-caps a posted message, or returns null when there is nothing
// but whitespace to store. Callers turn null into a 400.
const cleanBody = (body) => {
    const text = typeof body === 'string' ? body.trim() : '';
    return text ? text.slice(0, 2000) : null;
};

// Appends one message to a request's thread and returns the stored row.
// The row is read back rather than assembled in JS so POST returns byte-identical
// values to the subsequent GET — created_at in particular comes from the DB clock,
// which is not necessarily this process's clock or timezone.
const insertMessage = async (requestId, senderRole, text) => {
    const [result] = await db.query(
        'INSERT INTO maintenance_messages (request_id, sender_role, body) VALUES (?, ?, ?)',
        [requestId, senderRole, text]
    );

    // Bump the parent so a reply counts as activity on the request; without it a
    // long conversation leaves updated_at frozen at the last status change.
    await db.query(
        'UPDATE maintenance_requests SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [requestId]
    );

    const [rows] = await db.query(
        `SELECT ${THREAD_COLUMNS} FROM maintenance_messages WHERE id = ?`,
        [result.insertId]
    );
    return rows[0];
};

// Appends a status change to a request's timeline. `body` carries a plain sentence
// as well as the two status columns so that a client which knows nothing about
// `kind` — an older build of the app, or a notification email — still shows
// something a person can read instead of an empty bubble.
const insertStatusEvent = async (requestId, from, to) => {
    await db.query(
        `INSERT INTO maintenance_messages (request_id, sender_role, kind, body, status_from, status_to)
         VALUES (?, 'owner', 'status', ?, ?, ?)`,
        [requestId, `Marked ${to}`, from || null, to]
    );
};

// Resolves whether a request is this landlord's, so the message endpoints can't
// be used to read or write into another owner's thread by guessing an id.
const ownsRequest = async (requestId, ownerId) => {
    const [rows] = await db.query(
        'SELECT id FROM maintenance_requests WHERE id = ? AND owner_id = ?',
        [requestId, ownerId]
    );
    return rows.length > 0;
};

// GET /api/owner/requests/:id/messages
const getMessages = async (req, res) => {
    try {
        if (isTenantToken(req)) {
            return res.status(403).json({ message: 'Owner access only.' });
        }
        if (!(await ownsRequest(req.params.id, req.user.id))) {
            return res.status(404).json({ message: 'Request not found or unauthorized.' });
        }

        res.status(200).json({ messages: await fetchThread(req.params.id) });
    } catch (error) {
        console.error('Owner getMessages error:', error);
        res.status(500).json({ message: 'Could not load the conversation.' });
    }
};

// POST /api/owner/requests/:id/messages — the landlord's reply.
const createMessage = async (req, res) => {
    try {
        if (isTenantToken(req)) {
            return res.status(403).json({ message: 'Owner access only.' });
        }
        const text = cleanBody(req.body?.body);
        if (!text) {
            return res.status(400).json({ message: 'A message cannot be empty.' });
        }
        if (!(await ownsRequest(req.params.id, req.user.id))) {
            return res.status(404).json({ message: 'Request not found or unauthorized.' });
        }

        const item = await insertMessage(req.params.id, 'owner', text);

        res.status(201).json({ message: 'Message sent.', item });
    } catch (error) {
        console.error('Owner createMessage error:', error);
        res.status(500).json({ message: 'Could not send your message.' });
    }
};

module.exports = {
    getRequests,
    updateStatus,
    getMessages,
    createMessage,
    // Exported for the tenant portal, so both sides of a thread share one
    // definition of how messages are read and written.
    fetchThread,
    insertMessage,
    cleanBody
};
