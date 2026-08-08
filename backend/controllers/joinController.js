// File: backend/controllers/joinController.js
// The handshake that starts a tenancy. A tenant who has a property's code asks to
// be let in; the landlord accepts (optionally placing them in a room) or rejects.
// Accepting is what creates the landlord's `tenants` record and points the tenant's
// login at it — the link that every other tenant-portal endpoint depends on and
// that until now only the landlord could ever create.
//
// Auth: both halves hang off routers that have already run `protect`, so req.user
// is present. The tenant handlers additionally assert role === 'tenant' and scope
// everything to req.user.id as the tenant_users id; the owner handlers reject
// tenant tokens and scope everything to req.user.id as owner_id.
const db = require('../config/db');

const JOIN_STATUSES = ['Pending', 'Accepted', 'Rejected'];

// Owner tokens carry no `role`; tenant tokens carry role: 'tenant'. Owners and
// tenant logins live in separate tables, so their ids overlap — without this a
// tenant whose account id happens to match an owner's would read that landlord's
// inbox and could accept requests into their property. We reject the tenant role
// rather than requiring an 'owner' role because existing owner tokens (7-day
// expiry) were issued without one.
const isTenantToken = (req) => req.user?.role === 'tenant';

// The property code the mobile client shows ("TP-SUN-8412"). There is no such
// column: the client derives it in mobile/src/redesign/mapping.js and this is a
// deliberate duplicate of that one function, because the tenant types back the
// only identifier the app ever showed them. Kept character-for-character identical
// to `propCode` there — if that changes, this must change with it, or codes handed
// out by the app stop resolving here.
const propCode = (name, id) => {
    const letters = String(name || 'PROP').toUpperCase().replace(/[^A-Z]/g, '');
    return `TP-${(letters.slice(0, 3) || 'PRP')}-${String(1000 + (Number(id) || 0) * 7).slice(0, 4)}`;
};

// Resolves a typed code to a property by computing every property's code and
// comparing. The code mixes a slice of the name with a slice of an arithmetic
// expression on the id, which cannot be inverted in SQL without reimplementing it
// there — a second copy of the rule that would drift from the client's. Reading
// three narrow columns for the whole table is the cheaper mistake: this runs once,
// only when a tenant submits a code, and the row count here is properties (tens),
// not tenants or payments. First match wins: codes are unique while ids stay under
// 1286, above which `String(1000 + id*7).slice(0,4)` starts dropping a digit and
// two properties can share a code — a flaw in the client's algorithm, not here,
// and the reason a code should never be the only way to identify a property
// (property_id is accepted alongside it).
const findPropertyByCode = async (code) => {
    const wanted = String(code || '').trim().toUpperCase();
    if (!wanted) return null;
    const [rows] = await db.query('SELECT id, name, owner_id FROM properties');
    return rows.find((p) => propCode(p.name, p.id) === wanted) || null;
};

// The dates an accepted tenant starts on. This mirrors the "SMART BILLING ENGINE"
// in tenantController's assign handlers rather than inventing a second rule: an
// Anniversary cycle bills on the day the tenant moves in and pointedly does NOT
// add a month ("they owe rent on the day they move in"). Two different answers to
// "when is their first rent due" depending on which screen created the tenancy
// would be a reporting bug nobody could explain.
const acceptanceDates = () => {
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { moveIn: stamp, nextRentDue: stamp };
};

// What one bed in a room costs. An 'Equal' room's base_rent is the RENT FOR THE
// WHOLE ROOM, and unitController divides it by capacity — its "magic
// auto-calculator" rewrites every tenant in the room to that share whenever the
// unit is edited. Charging a joiner the undivided base_rent would therefore give
// someone in a 3-bed ₹30,000 room a ₹30,000 rent share, and it would silently
// correct itself to ₹10,000 the next time the landlord touched the unit — with the
// dues and the collected totals in between simply wrong. Rounded the same way
// (toFixed(0)) so the two paths cannot differ by a rupee.
const shareOf = (unit) => {
    const base = Number(unit.base_rent) || 0;
    const capacity = Math.max(1, Number(unit.capacity) || 1);
    return unit.rent_split_type === 'Custom' ? base : Number((base / capacity).toFixed(0));
};

// Trims and length-caps the requester's optional note to the column width, or
// returns null when there is nothing but whitespace.
const cleanNote = (note) => {
    const text = typeof note === 'string' ? note.trim() : '';
    return text ? text.slice(0, 300) : null;
};

// --- Tenant side (mounted on the tenant-portal router) ---

// GET /api/tenant-portal/property-lookup?code=TP-SUN-8412
//
// Why this exists: the app let a tenant scan an invite QR or type a code and then
// looked the code up in its OWN in-memory list of properties. On a real tenancy
// that list is the demo bundle, so a genuine landlord's code matched nothing and
// the screen said "no property matches that code" for a code that was perfectly
// valid. The tenant could still blind-fire a join request at it — createJoinRequest
// resolves the code server-side — but they had no way to see WHAT they were asking
// to join, which is the entire point of the screen.
//
// What it returns is bounded to what somebody already holding the invite code is
// entitled to see before asking: the property, roughly where it is, whether there
// is a bed, and who the landlord is. Deliberately NOT included: the other tenants,
// their rents, or anything about the landlord beyond a name — a code is a weak
// secret that gets forwarded around, and this endpoint needs no login-specific
// trust to be safe.
//
// There is no search-by-name here on purpose. Listing or searching every property
// in the database would let anyone with a tenant account enumerate every landlord's
// portfolio; you find a property because someone gave you its code.
const lookupProperty = async (req, res) => {
    try {
        if (req.user?.role !== 'tenant') {
            return res.status(403).json({ message: 'Tenant access only.' });
        }
        const code = String(req.query.code || '').trim().toUpperCase();
        if (!code) return res.status(400).json({ message: 'A property code is required.' });

        const property = await findPropertyByCode(code);
        if (!property) {
            return res.status(404).json({
                message: 'No property matches that code. Please check it with your landlord.',
                code
            });
        }

        // One row per unit with its capacity and how many active tenants are in it,
        // so "is there a bed" is answered from the same numbers the landlord's own
        // occupancy figures use rather than a second rule.
        const [rows] = await db.query(
            `SELECT p.id, p.name, p.address, p.locality, p.city, p.property_type, p.image_url,
                    o.name AS owner_name,
                    (SELECT COUNT(*) FROM units u WHERE u.property_id = p.id) AS unit_count,
                    (SELECT COALESCE(SUM(u.capacity), 0) FROM units u WHERE u.property_id = p.id) AS bed_count,
                    (SELECT COUNT(*) FROM tenants t
                      JOIN units u ON t.unit_id = u.id
                      WHERE u.property_id = p.id AND t.status = 'Active') AS taken
             FROM properties p
             LEFT JOIN owners o ON p.owner_id = o.id
             WHERE p.id = ?`,
            [property.id]
        );
        const row = rows[0];
        if (!row) return res.status(404).json({ message: 'No property matches that code.' });

        const beds = Number(row.bed_count) || 0;
        const taken = Number(row.taken) || 0;

        res.status(200).json({
            property: {
                id: row.id,
                code,
                name: row.name,
                locality: row.locality,
                city: row.city,
                property_type: row.property_type,
                image_url: row.image_url,
                unit_count: Number(row.unit_count) || 0,
                // Never negative, even if a room is over-filled by a manual edit.
                free_beds: Math.max(0, beds - taken),
                // First name only: enough to recognise "yes, that is who gave me the
                // code", without handing out a full contact record to a code holder.
                owner_first_name: String(row.owner_name || '').trim().split(/\s+/)[0] || ''
            }
        });
    } catch (error) {
        console.error('lookupProperty error:', error);
        res.status(500).json({ message: 'Could not look up that code.' });
    }
};

// POST /api/tenant-portal/join-requests — "let me into this property".
// Body: { code } or { property_id }, plus optional { note }.
const createJoinRequest = async (req, res) => {
    try {
        if (req.user?.role !== 'tenant') {
            return res.status(403).json({ message: 'Tenant access only.' });
        }
        const userId = req.user.id;
        const { code, property_id } = req.body || {};
        const note = cleanNote(req.body?.note);

        // property_id is the path the app takes when the tenant tapped a property
        // it already listed; `code` is the path when they typed one in.
        let property = null;
        if (property_id) {
            const [rows] = await db.query(
                'SELECT id, name, owner_id FROM properties WHERE id = ?',
                [property_id]
            );
            property = rows[0] || null;
        } else if (code) {
            property = await findPropertyByCode(code);
        } else {
            return res.status(400).json({ message: 'A property code is required.' });
        }

        // Said plainly on purpose: a mistyped code is the most likely failure here
        // and "not found" without saying what was not found sends people to support.
        if (!property) {
            return res.status(404).json({ message: 'No property matches that code. Please check it with your landlord.' });
        }

        // One Pending request per property. Decided requests are deliberately not
        // counted — a tenant who was rejected, or who moved out and is coming back,
        // must be able to ask again (which is also why the table carries no unique
        // key over (tenant_user_id, property_id, status)).
        const [pending] = await db.query(
            "SELECT id FROM join_requests WHERE tenant_user_id = ? AND property_id = ? AND status = 'Pending'",
            [userId, property.id]
        );
        if (pending.length > 0) {
            return res.status(409).json({ message: 'You already have a pending request for this property.' });
        }

        // Already one of this landlord's tenants: the request would be asking for
        // something they have. Checked against the OWNER rather than the property
        // because a landlord's tenant records are owner-scoped — being linked under
        // owner A already gives portal access to owner A's other properties.
        const [linked] = await db.query(
            `SELECT t.id FROM tenant_users tu
             JOIN tenants t ON tu.tenant_id = t.id
             WHERE tu.id = ? AND t.owner_id = ?`,
            [userId, property.owner_id]
        );
        if (linked.length > 0) {
            return res.status(409).json({ message: 'You are already a tenant of this landlord.' });
        }

        const [result] = await db.query(
            'INSERT INTO join_requests (tenant_user_id, owner_id, property_id, note) VALUES (?, ?, ?, ?)',
            [userId, property.owner_id, property.id, note]
        );

        // 'Pending' is what the account's status was always meant to mean, but only
        // for an account that is not yet anybody's tenant: `tenant_id IS NULL` keeps
        // a tenant who is Linked under another landlord from having an established
        // tenancy downgraded to "waiting" by asking about a second property.
        await db.query(
            "UPDATE tenant_users SET status = 'Pending' WHERE id = ? AND tenant_id IS NULL",
            [userId]
        );

        res.status(201).json({
            message: 'Request sent to the landlord.',
            request: {
                id: result.insertId,
                property_id: property.id,
                property_name: property.name,
                status: 'Pending',
                note,
                created_at: new Date().toISOString(),
                decided_at: null
            }
        });
    } catch (err) {
        console.error('Tenant createJoinRequest error:', err.message);
        res.status(500).json({ message: 'Could not send your request.' });
    }
};

// GET /api/tenant-portal/join-requests — the caller's own requests and where they
// stand. Newest first, because the one they just sent is the one they are looking
// for; the property name is joined in so the list reads without a second call.
const getMyJoinRequests = async (req, res) => {
    try {
        if (req.user?.role !== 'tenant') {
            return res.status(403).json({ message: 'Tenant access only.' });
        }

        const [requests] = await db.query(
            `SELECT jr.id, jr.property_id, jr.unit_id, jr.status, jr.note,
                    jr.created_at, jr.decided_at,
                    p.name AS property_name, p.locality, p.city,
                    u.unit_number
             FROM join_requests jr
             LEFT JOIN properties p ON jr.property_id = p.id
             LEFT JOIN units u ON jr.unit_id = u.id
             WHERE jr.tenant_user_id = ?
             ORDER BY jr.created_at DESC, jr.id DESC`,
            [req.user.id]
        );
        res.status(200).json({ requests });
    } catch (err) {
        console.error('Tenant getMyJoinRequests error:', err.message);
        res.status(500).json({ message: 'Could not load your requests.' });
    }
};

// --- Owner side (mounted on the owner router) ---

// GET /api/owner/join-requests — the landlord's inbox. ?status= filters it.
const getJoinRequests = async (req, res) => {
    try {
        if (isTenantToken(req)) {
            return res.status(403).json({ message: 'Owner access only.' });
        }
        const ownerId = req.user.id;
        const { status } = req.query;

        // An unrecognised status is rejected rather than silently ignored: quietly
        // returning the unfiltered list would look to the client like "there are no
        // Rejected ones" when it actually means "that word means nothing here".
        let statusFilter = '';
        const params = [ownerId];
        if (status && status !== 'all') {
            if (!JOIN_STATUSES.includes(status)) {
                return res.status(400).json({ message: `Status must be one of: ${JOIN_STATUSES.join(', ')}.` });
            }
            statusFilter = ' AND jr.status = ?';
            params.push(status);
        }

        // Pending first regardless of age — this list is a to-do, and a request that
        // needs a decision must never be pushed off the screen by newer decided ones.
        const [requests] = await db.query(
            `SELECT jr.id, jr.tenant_user_id, jr.property_id, jr.unit_id, jr.status,
                    jr.note, jr.created_at, jr.decided_at,
                    tu.name AS requester_name, tu.email AS requester_email, tu.phone AS requester_phone,
                    p.name AS property_name,
                    u.unit_number,
                    -- Whether this stranger has put an ID up, and whether anyone has
                    -- checked it. Subqueries rather than a join for the same reason as
                    -- the tenant list: one document per row would duplicate requests.
                    (SELECT COUNT(*) FROM tenant_documents d
                      WHERE d.tenant_user_id = jr.tenant_user_id) AS doc_count,
                    (SELECT COUNT(*) FROM tenant_documents d
                      WHERE d.tenant_user_id = jr.tenant_user_id AND d.status = 'Verified') AS doc_verified
             FROM join_requests jr
             LEFT JOIN tenant_users tu ON jr.tenant_user_id = tu.id
             LEFT JOIN properties p ON jr.property_id = p.id
             LEFT JOIN units u ON jr.unit_id = u.id
             WHERE jr.owner_id = ?${statusFilter}
             ORDER BY (jr.status = 'Pending') DESC, jr.created_at DESC, jr.id DESC`,
            params
        );
        res.status(200).json({ requests });
    } catch (error) {
        console.error('Owner getJoinRequests error:', error);
        res.status(500).json({ message: 'Failed to load join requests.' });
    }
};

// Rejecting is a single row plus a tidy-up, so it stays outside a transaction: the
// worst outcome of a failure between the two is an account still marked 'Pending'
// with nothing pending, which the next decision corrects.
const rejectRequest = async (request) => {
    await db.query(
        "UPDATE join_requests SET status = 'Rejected', decided_at = NOW() WHERE id = ?",
        [request.id]
    );

    // Only drop the account back to 'Unlinked' once nothing else is outstanding —
    // a tenant who asked two landlords must stay 'Pending' while the other still
    // has a decision to make. `tenant_id IS NULL` guards the same case as on the
    // way in: never un-link someone who is actually somebody's tenant.
    const [stillPending] = await db.query(
        "SELECT id FROM join_requests WHERE tenant_user_id = ? AND status = 'Pending'",
        [request.tenant_user_id]
    );
    if (stillPending.length === 0) {
        await db.query(
            "UPDATE tenant_users SET status = 'Unlinked' WHERE id = ? AND tenant_id IS NULL",
            [request.tenant_user_id]
        );
    }
};

// PUT /api/owner/join-requests/:id — accept or reject.
// Body: { decision: 'accept' | 'reject', unit_id? }
const decideJoinRequest = async (req, res) => {
    try {
        if (isTenantToken(req)) {
            return res.status(403).json({ message: 'Owner access only.' });
        }
        const ownerId = req.user.id;
        const requestId = req.params.id;
        const { decision, unit_id } = req.body || {};

        if (decision !== 'accept' && decision !== 'reject') {
            return res.status(400).json({ message: "Decision must be 'accept' or 'reject'." });
        }

        // Ownership before anything else — matching on owner_id in the check (rather
        // than only in the UPDATE) is what makes another landlord's request a clean
        // 404 instead of a silent no-op that reports success.
        const [check] = await db.query(
            'SELECT id, tenant_user_id, property_id, status FROM join_requests WHERE id = ? AND owner_id = ?',
            [requestId, ownerId]
        );
        if (check.length === 0) {
            return res.status(404).json({ message: 'Request not found or unauthorized.' });
        }
        const request = check[0];

        // Deciding twice is refused rather than ignored: the second caller usually
        // believes they are the one who decided it, and for an accept they would be
        // wrong about which room the tenant is in.
        if (request.status !== 'Pending') {
            return res.status(409).json({ message: `This request was already ${request.status.toLowerCase()}.` });
        }

        if (decision === 'reject') {
            await rejectRequest(request);
            return res.status(200).json({ message: 'Request rejected.', status: 'Rejected' });
        }

        return await acceptRequest(res, ownerId, request, unit_id || null);
    } catch (error) {
        console.error('Owner decideJoinRequest error:', error);
        res.status(500).json({ message: 'Failed to update the join request.' });
    }
};

// Accepting writes across four tables (tenants, tenant_users, units,
// join_requests) and half of it is worthless: a tenant_users row pointed at a
// tenants row that was never created is an account that can log in and see
// someone else's nothing, and a unit marked Occupied for a tenancy that failed is
// a bed the landlord can no longer fill. db.js exposes getConnection(), so this
// runs as one transaction on a single pooled connection — note that every query
// below must go through `conn`, since db.query() would grab a DIFFERENT connection
// and land outside the transaction.
const acceptRequest = async (res, ownerId, request, unitId) => {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // Re-read under a row lock. The status was already checked above, but two
        // taps on Accept arrive as two requests that both passed that check; this is
        // where the second one loses.
        const [locked] = await conn.query(
            'SELECT id, tenant_user_id, property_id, status FROM join_requests WHERE id = ? AND owner_id = ? FOR UPDATE',
            [request.id, ownerId]
        );
        if (locked.length === 0) {
            await conn.rollback();
            return res.status(404).json({ message: 'Request not found or unauthorized.' });
        }
        if (locked[0].status !== 'Pending') {
            await conn.rollback();
            return res.status(409).json({ message: `This request was already ${locked[0].status.toLowerCase()}.` });
        }

        // a. The room, if the landlord named one. Locking the units row is what
        // makes the capacity check mean anything: without it two accepts into the
        // last free bed both read the same count and both succeed.
        let unit = null;
        if (unitId) {
            const [units] = await conn.query(
                `SELECT id, unit_number, capacity, base_rent, rent_split_type
                 FROM units WHERE id = ? AND property_id = ? FOR UPDATE`,
                [unitId, locked[0].property_id]
            );
            // A room from a different property is treated as not existing rather
            // than as a validation error — it is the same class of mistake as
            // guessing an id, and the answer should not confirm the room is real.
            if (units.length === 0) {
                await conn.rollback();
                return res.status(404).json({ message: 'That room does not belong to this property.' });
            }
            unit = units[0];

            // Counted in its own statement rather than as a subquery on the locked
            // SELECT: FOR UPDATE also locks whatever a subquery scans, and locking
            // every Active tenant of the room to count them invites deadlocks with
            // ordinary tenant edits. The lock on the units row above is already what
            // serialises two accepts racing for the same last bed.
            const capacity = Number(unit.capacity || 1);
            const [beds] = await conn.query(
                "SELECT COUNT(*) AS occupied FROM tenants WHERE unit_id = ? AND status = 'Active'",
                [unit.id]
            );
            const occupied = Number(beds[0].occupied);
            if (occupied >= capacity) {
                await conn.rollback();
                return res.status(409).json({
                    message: `Room ${unit.unit_number} is full (${occupied}/${capacity} beds taken). Free a bed or pick another room.`
                });
            }
        }

        // Locked too, and not only read: a tenant may have requests pending with two
        // landlords, and both accepting at the same instant would otherwise each
        // create a tenants row and race to claim tenant_users.tenant_id. Locked in a
        // fixed order (request, then room, then account) so two accepts queue up
        // rather than deadlock.
        const [accounts] = await conn.query(
            'SELECT id, name, phone, email, tenant_id FROM tenant_users WHERE id = ? FOR UPDATE',
            [locked[0].tenant_user_id]
        );
        if (accounts.length === 0) {
            // The FK cascades on delete, so this means the account vanished between
            // the inbox load and the tap. Nothing to admit.
            await conn.rollback();
            return res.status(404).json({ message: 'That account no longer exists.' });
        }
        const account = accounts[0];

        const { moveIn, nextRentDue } = acceptanceDates();
        const rentShare = unit ? shareOf(unit) : 0;

        // b. The landlord's tenant record. Reuse before insert, keyed on phone
        // within this owner: landlords routinely add a tenant by hand first and
        // link the app account afterwards, and two rows for one person would split
        // their payments and their dues across both.
        const [existing] = await conn.query(
            'SELECT id, unit_id FROM tenants WHERE owner_id = ? AND phone = ? LIMIT 1',
            [ownerId, account.phone]
        );

        let tenantId;
        if (existing.length > 0) {
            tenantId = existing[0].id;
            if (unit) {
                await conn.query(
                    `UPDATE tenants
                     SET status = 'Active', unit_id = ?, rent_share = ?, deposit = 0,
                         move_in_date = ?, billing_cycle = 'Anniversary', next_rent_due = ?
                     WHERE id = ?`,
                    [unit.id, rentShare, moveIn, nextRentDue, tenantId]
                );
            } else {
                // No room named: only reactivate. Blanking unit_id/rent_share here
                // would evict an existing tenant from their room as a side effect of
                // accepting them into the property they already live in.
                await conn.query("UPDATE tenants SET status = 'Active' WHERE id = ?", [tenantId]);
            }
        } else {
            const [created] = await conn.query(
                `INSERT INTO tenants
                    (owner_id, unit_id, status, name, phone, email, deposit, rent_share, move_in_date, billing_cycle, next_rent_due)
                 VALUES (?, ?, 'Active', ?, ?, ?, 0, ?, ?, 'Anniversary', ?)`,
                [
                    ownerId,
                    unit ? unit.id : null,
                    account.name,
                    account.phone,
                    account.email || null,
                    rentShare,
                    unit ? moveIn : null,
                    unit ? nextRentDue : null
                ]
            );
            tenantId = created.insertId;
        }

        // c. The link itself — the whole point of the flow. Everything the tenant
        // portal shows is resolved through tenant_users.tenant_id.
        await conn.query(
            "UPDATE tenant_users SET tenant_id = ?, status = 'Linked' WHERE id = ?",
            [tenantId, account.id]
        );

        // d. A room with somebody in it is Occupied, the same rule tenantController
        // applies when a landlord assigns a room by hand.
        if (unit) {
            await conn.query("UPDATE units SET status = 'Occupied' WHERE id = ?", [unit.id]);
        }

        // e. Finally the decision, carrying the room so the tenant's own list can
        // show where they were placed.
        await conn.query(
            "UPDATE join_requests SET status = 'Accepted', unit_id = ?, decided_at = NOW() WHERE id = ?",
            [unit ? unit.id : null, locked[0].id]
        );

        await conn.commit();

        res.status(200).json({
            message: unit ? `Accepted into room ${unit.unit_number}.` : 'Accepted. Assign a room when you are ready.',
            status: 'Accepted',
            tenant_id: tenantId,
            unit_id: unit ? unit.id : null
        });
    } catch (error) {
        // Roll back before rethrowing so the caller's 500 handler does not leave a
        // half-written tenancy behind. A rollback that itself fails is swallowed —
        // the connection is being discarded anyway and the original error is the
        // one worth reporting.
        await conn.rollback().catch(() => {});
        throw error;
    } finally {
        // Always hand the connection back: a pool of 10 does not survive many leaks.
        conn.release();
    }
};

module.exports = {
    lookupProperty,
    createJoinRequest,
    getMyJoinRequests,
    getJoinRequests,
    decideJoinRequest
};
