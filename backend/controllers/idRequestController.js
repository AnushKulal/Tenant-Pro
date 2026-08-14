// File: backend/controllers/idRequestController.js
//
// A landlord asking a tenant to upload an ID, and the tenant seeing that they were
// asked.
//
// The rules live in utils/idRequest.js, which is pure and tested. This file is the
// database and the permission checks around them.
//
// ── Two things this deliberately does not do ───────────────────────────────────
// It never marks a request Fulfilled on the landlord's say-so. Closing happens in the
// upload path, driven by a document that actually exists — a landlord able to close
// their own request could silence the prompt without ever receiving anything, and the
// tenant would have no way to tell.
//
// And it never returns another landlord's request to a tenant, or another tenant's to
// a landlord. Both directions are scoped by a join that proves the relationship, not
// by an id passed in.

const db = require('../config/db');
const { askability, normaliseType, fulfils, prompt } = require('../utils/idRequest');

const isTenantToken = (req) => req.user?.role === 'tenant';

// Same labels documentController uses. Imported would be circular — that controller
// will require this one for the close-on-upload hook — so they are stated here and
// pinned by a test that compares the two lists.
const DOC_LABELS = {
    aadhaar: 'Aadhaar card',
    pan: 'PAN card',
    voter: 'Voter ID',
    dl: 'Driving licence',
    passport: 'Passport',
    other: 'Other ID'
};

// The landlord's open ask for a tenancy, if there is one. Pending only: a fulfilled or
// cancelled row is history, and treating it as open would refuse a second, legitimate
// request for ever.
const pendingFor = async (ownerId, tenantId) => {
    const [rows] = await db.query(
        `SELECT id, owner_id, tenant_id, doc_type, note, status, created_at
         FROM document_requests
         WHERE owner_id = ? AND tenant_id = ? AND status = 'Pending'
         ORDER BY id DESC LIMIT 1`,
        [ownerId, tenantId]
    );
    return rows[0] || null;
};

// Everything the documents sheet needs to draw the button: whether asking is possible,
// what it should say, and the open ask if there is one. Exported because
// documentController calls it while assembling its own response — one answer, so the
// button and the row underneath it cannot disagree.
const askStateFor = async ({ ownerId, tenantId, tenancyStatus, hasAccount, summary }) => {
    const pending = await pendingFor(ownerId, tenantId);
    const state = askability({ tenancyStatus, hasAccount, pending, summary });
    return {
        ...state,
        request: pending
            ? {
                id: pending.id,
                doc_type: pending.doc_type,
                doc_label: pending.doc_type ? DOC_LABELS[pending.doc_type] : null,
                note: pending.note || '',
                created_at: pending.created_at
            }
            : null
    };
};

// Prove this tenancy belongs to this landlord, and gather what askability needs.
const loadTenancy = async (ownerId, tenantId) => {
    const [rows] = await db.query(
        `SELECT t.id, t.name, t.status,
                (SELECT COUNT(*) FROM tenant_users tu WHERE tu.tenant_id = t.id) AS account_count
         FROM tenants t WHERE t.id = ? AND t.owner_id = ?`,
        [tenantId, ownerId]
    );
    return rows[0] || null;
};

// POST /api/owner/tenants/:id/id-request   { doc_type?, note? }
const createIdRequest = async (req, res) => {
    try {
        if (isTenantToken(req)) return res.status(403).json({ message: 'Landlord access only.' });
        const ownerId = req.user.id;
        const tenancy = await loadTenancy(ownerId, req.params.id);
        // Same answer as "no such tenant": whether a given tenancy exists is not
        // something an unrelated landlord should learn from the difference.
        if (!tenancy) return res.status(404).json({ message: 'Tenant not found.' });

        const pending = await pendingFor(ownerId, tenancy.id);
        const state = askability({
            tenancyStatus: tenancy.status,
            hasAccount: Number(tenancy.account_count) > 0,
            pending
        });

        if (!state.allowed) {
            // 409 rather than 403: nothing is forbidden about the caller, the request
            // is at odds with the state of the world. The app shows `message` as-is.
            return res.status(409).json({
                code: state.reason,
                message: state.reason === 'ALREADY_ASKED'
                    ? 'You have already asked them for an ID. They can still see it.'
                    : `${tenancy.name} has moved out, so they can no longer be asked for documents.`,
                request: pending ? { id: pending.id } : null
            });
        }

        const docType = normaliseType(req.body?.doc_type);
        // Trimmed and capped rather than refused. This is the landlord explaining why
        // they need it, and a rejected form for being forty characters too long would
        // cost more than a truncated sentence does.
        const note = String(req.body?.note || '').trim().slice(0, 300) || null;

        const [result] = await db.query(
            'INSERT INTO document_requests (owner_id, tenant_id, doc_type, note) VALUES (?, ?, ?, ?)',
            [ownerId, tenancy.id, docType, note]
        );

        res.status(201).json({
            // Said differently when nobody can receive it yet, because a landlord told
            // "asked" will stop chasing — and nothing was delivered.
            message: state.reason === 'NO_ACCOUNT'
                ? `Saved. ${tenancy.name} will see it when they join on the app.`
                : `Asked ${tenancy.name} for their ID.`,
            request: {
                id: result.insertId,
                doc_type: docType,
                doc_label: docType ? DOC_LABELS[docType] : null,
                note: note || '',
                status: 'Pending',
                created_at: new Date().toISOString()
            },
            delivered: state.reason !== 'NO_ACCOUNT'
        });
    } catch (error) {
        console.error('createIdRequest error:', error);
        res.status(500).json({ message: 'Could not send the request. Please try again.' });
    }
};

// DELETE /api/owner/tenants/:id/id-request — withdraw it.
//
// Worth having as its own action: a landlord who asked by mistake, or got the document
// another way, has no other means of stopping the prompt on somebody's home screen.
const cancelIdRequest = async (req, res) => {
    try {
        if (isTenantToken(req)) return res.status(403).json({ message: 'Landlord access only.' });
        const ownerId = req.user.id;
        const tenancy = await loadTenancy(ownerId, req.params.id);
        if (!tenancy) return res.status(404).json({ message: 'Tenant not found.' });

        const pending = await pendingFor(ownerId, tenancy.id);
        if (!pending) return res.status(404).json({ message: 'There is no open request to withdraw.' });

        await db.query(
            "UPDATE document_requests SET status = 'Cancelled', closed_at = NOW() WHERE id = ? AND owner_id = ? AND status = 'Pending'",
            [pending.id, ownerId]
        );
        res.status(200).json({ message: 'Request withdrawn.', id: pending.id });
    } catch (error) {
        console.error('cancelIdRequest error:', error);
        res.status(500).json({ message: 'Could not withdraw the request.' });
    }
};

// Every open ask aimed at this portal account, with the landlord who made it.
//
// Reached through the account's OWN tenant_id, so the query can only ever return asks
// belonging to the tenancy this account is linked to — an account with no tenancy sees
// nothing, which is correct rather than empty.
const promptsForAccount = async (tenantUserId, now = new Date()) => {
    const [rows] = await db.query(
        `SELECT dr.id, dr.doc_type, dr.note, dr.status, dr.created_at,
                o.name AS landlord_name, o.phone AS landlord_phone
         FROM tenant_users tu
         JOIN document_requests dr ON dr.tenant_id = tu.tenant_id
         JOIN owners o ON dr.owner_id = o.id
         WHERE tu.id = ? AND dr.status = 'Pending'
         ORDER BY dr.created_at DESC, dr.id DESC`,
        [tenantUserId]
    );
    return rows
        .map((r) => prompt({ ...r, doc_label: r.doc_type ? DOC_LABELS[r.doc_type] : null }, now))
        .filter(Boolean);
};

// Close every open ask this document answers.
//
// Called from the upload path, so a request closes because a document exists — not
// because anybody said so. Failures are swallowed: the upload itself succeeded, and
// losing it over a bookkeeping update would be the worse outcome by far. The prompt
// simply keeps showing, which is visible and recoverable.
const closeRequestsFor = async (tenantUserId, doc) => {
    try {
        const [rows] = await db.query(
            `SELECT dr.id, dr.doc_type, dr.status
             FROM tenant_users tu
             JOIN document_requests dr ON dr.tenant_id = tu.tenant_id
             WHERE tu.id = ? AND dr.status = 'Pending'`,
            [tenantUserId]
        );
        const answered = rows.filter((r) => fulfils(r, doc));
        if (!answered.length) return 0;
        await db.query(
            "UPDATE document_requests SET status = 'Fulfilled', closed_at = NOW(), document_id = ? WHERE id IN (?) AND status = 'Pending'",
            [doc.id || null, answered.map((r) => r.id)]
        );
        return answered.length;
    } catch (err) {
        console.error('closeRequestsFor failed (upload itself was saved):', err.message);
        return 0;
    }
};

// Re-open an ask whose answering document has been deleted.
//
// Without this, a tenant who uploads and then withdraws leaves the request marked
// Fulfilled with nothing behind it: the landlord sees no document AND no open ask, so
// nothing tells them to look again. Keeping document_id on the row is what makes this
// answerable, and this is the thing that was supposed to use it.
//
// Only rows this exact document closed are reopened — a request closed by some other
// upload is not affected by this one going away.
const reopenRequestsFor = async (documentId) => {
    if (!documentId) return 0;
    try {
        const [r] = await db.query(
            "UPDATE document_requests SET status = 'Pending', closed_at = NULL, document_id = NULL WHERE document_id = ? AND status = 'Fulfilled'",
            [documentId]
        );
        return r.affectedRows || 0;
    } catch (err) {
        // Same reasoning as closing: the delete itself succeeded, and losing it over a
        // bookkeeping update would be the worse outcome.
        console.error('reopenRequestsFor failed (the delete itself was applied):', err.message);
        return 0;
    }
};

module.exports = {
    createIdRequest,
    cancelIdRequest,
    reopenRequestsFor,
    askStateFor,
    promptsForAccount,
    closeRequestsFor,
    DOC_LABELS
};
