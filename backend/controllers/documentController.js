// File: backend/controllers/documentController.js
// ID proofs: the tenant's side (upload / list / withdraw) and the landlord's side
// (look at them, then verify or reject).
//
// AUTHORISATION IS THE WHOLE POINT OF THIS FILE. A government ID is the most
// sensitive thing in this database, so every read is scoped by one of exactly two
// relationships, and nothing else grants access:
//
//   1. The tenant is IN one of this owner's properties — tenant_users.tenant_id
//      resolves to a tenants row with owner_id = the caller.
//   2. The tenant has a PENDING join request to one of this owner's properties.
//      This is why documents hang off tenant_users rather than tenants: a landlord
//      needs to look at a stranger's ID *before* letting them in, and at that
//      moment no tenants row exists for them.
//
// A rejected or already-decided join request does NOT keep the door open, and an
// owner never sees a document belonging to somebody with no relationship to them.
const db = require('../config/db');
const { getFileUrl } = require('../middleware/uploadMiddleware');

// The three landlord handlers below read req.user.id as an owners.id. server.js mounts
// requireOwner on the router they hang off, and this is the same check at the handler,
// so moving one of them to a different mount cannot silently unlock it. (The tenant
// handlers do the mirror check: role MUST be 'tenant'.)
const isTenantToken = (req) => req.user?.role === 'tenant';

// The kinds of ID we accept, keyed by what the app sends. Anything else is
// refused rather than stored as free text, so the landlord's list cannot be
// filled with invented document names.
const DOC_TYPES = {
    aadhaar: 'Aadhaar card',
    pan: 'PAN card',
    voter: 'Voter ID',
    dl: 'Driving licence',
    passport: 'Passport',
    other: 'Other ID'
};

const DOC_COLUMNS = `
    d.id, d.tenant_user_id, d.doc_type, d.doc_number, d.file_url,
    d.status, d.note, d.verified_at, d.created_at,
    o.name AS verified_by_name
`;

// Everything one account has uploaded, newest first.
const fetchDocuments = async (tenantUserId) => {
    const [rows] = await db.query(
        `SELECT ${DOC_COLUMNS}
         FROM tenant_documents d
         LEFT JOIN owners o ON d.verified_by = o.id
         WHERE d.tenant_user_id = ?
         ORDER BY d.created_at DESC`,
        [tenantUserId]
    );
    return rows.map((r) => ({ ...r, doc_label: DOC_TYPES[r.doc_type] || DOC_TYPES.other }));
};

// A one-line summary of where an account stands, used by the portal to decide
// whether to nag and by the landlord's list to show a badge. Deliberately derived
// from the rows rather than cached on the account, so it can never disagree.
const summarise = (docs) => ({
    total: docs.length,
    verified: docs.filter((d) => d.status === 'Verified').length,
    pending: docs.filter((d) => d.status === 'Pending').length,
    rejected: docs.filter((d) => d.status === 'Rejected').length,
    // "This person has been checked" is one verified document, not all of them.
    is_verified: docs.some((d) => d.status === 'Verified'),
    has_any: docs.length > 0
});

// Can this owner see this tenant_users account's documents? Returns the reason
// they can, or null. See the header for why these are the only two paths.
const ownerMaySee = async (ownerId, tenantUserId) => {
    const [linked] = await db.query(
        `SELECT t.id
         FROM tenant_users tu
         JOIN tenants t ON tu.tenant_id = t.id
         WHERE tu.id = ? AND t.owner_id = ?`,
        [tenantUserId, ownerId]
    );
    if (linked.length) return 'tenant';

    const [applying] = await db.query(
        `SELECT id FROM join_requests
         WHERE tenant_user_id = ? AND owner_id = ? AND status = 'Pending'`,
        [tenantUserId, ownerId]
    );
    if (applying.length) return 'applicant';

    return null;
};

// ── Tenant side ───────────────────────────────────────────────────────────────

// GET /api/tenant-portal/documents
const getMyDocuments = async (req, res) => {
    try {
        if (req.user?.role !== 'tenant') {
            return res.status(403).json({ message: 'Tenant access only.' });
        }
        const documents = await fetchDocuments(req.user.id);
        res.status(200).json({ documents, summary: summarise(documents), types: DOC_TYPES });
    } catch (error) {
        console.error('Error fetching tenant documents:', error);
        res.status(500).json({ message: 'Server error while fetching your documents.' });
    }
};

// POST /api/tenant-portal/documents  (multipart: `document` + doc_type, doc_number)
const addMyDocument = async (req, res) => {
    try {
        if (req.user?.role !== 'tenant') {
            return res.status(403).json({ message: 'Tenant access only.' });
        }

        const fileUrl = getFileUrl(req.file);
        if (!fileUrl) {
            return res.status(400).json({ message: 'Attach a photo or PDF of the document.' });
        }

        const docType = String(req.body.doc_type || '').trim().toLowerCase();
        if (!DOC_TYPES[docType]) {
            return res.status(400).json({
                message: 'Choose which document this is.',
                allowed: Object.keys(DOC_TYPES)
            });
        }

        // Optional, and stored as typed apart from spacing — we are not in a
        // position to validate an Aadhaar or PAN number, and pretending to would
        // reject valid ones.
        const number = String(req.body.doc_number || '').trim().slice(0, 64) || null;

        const [result] = await db.query(
            `INSERT INTO tenant_documents (tenant_user_id, doc_type, doc_number, file_url)
             VALUES (?, ?, ?, ?)`,
            [req.user.id, docType, number, fileUrl]
        );

        const documents = await fetchDocuments(req.user.id);
        res.status(201).json({
            message: `${DOC_TYPES[docType]} added. Your landlord can now check it.`,
            id: result.insertId,
            documents,
            summary: summarise(documents)
        });
    } catch (error) {
        console.error('Error adding tenant document:', error);
        res.status(500).json({ message: 'Server error while saving the document.' });
    }
};

// DELETE /api/tenant-portal/documents/:id
// A tenant may withdraw a document they uploaded — but not one a landlord has
// already verified, because that verdict is a record of what was checked, and
// letting it be deleted would let a verified badge outlive its evidence.
const deleteMyDocument = async (req, res) => {
    try {
        if (req.user?.role !== 'tenant') {
            return res.status(403).json({ message: 'Tenant access only.' });
        }
        const [rows] = await db.query(
            'SELECT id, status FROM tenant_documents WHERE id = ? AND tenant_user_id = ?',
            [req.params.id, req.user.id]
        );
        if (!rows.length) return res.status(404).json({ message: 'Document not found.' });
        if (rows[0].status === 'Verified') {
            return res.status(409).json({
                message: 'This one has already been verified, so it cannot be removed. Ask your landlord if it needs to change.'
            });
        }

        await db.query('DELETE FROM tenant_documents WHERE id = ?', [req.params.id]);
        const documents = await fetchDocuments(req.user.id);
        res.status(200).json({ message: 'Document removed.', documents, summary: summarise(documents) });
    } catch (error) {
        console.error('Error deleting tenant document:', error);
        res.status(500).json({ message: 'Server error while removing the document.' });
    }
};

// ── Landlord side ─────────────────────────────────────────────────────────────

// Shared tail for both owner read paths: check, fetch, answer.
const respondWithDocuments = async (res, ownerId, tenantUserId, person) => {
    const via = await ownerMaySee(ownerId, tenantUserId);
    if (!via) {
        // Deliberately the same answer as "no such person": whether a given
        // account exists is not something an unrelated owner should learn.
        return res.status(404).json({ message: 'No documents you can see for this person.' });
    }
    const documents = await fetchDocuments(tenantUserId);
    res.status(200).json({ documents, summary: summarise(documents), via, person, types: DOC_TYPES });
};

// GET /api/owner/tenants/:id/documents — from the tenant's detail screen.
const getTenantDocuments = async (req, res) => {
    try {
        if (isTenantToken(req)) return res.status(403).json({ message: 'Landlord access only.' });
        const [rows] = await db.query(
            `SELECT tu.id AS tenant_user_id, t.name, t.phone, t.email
             FROM tenants t
             LEFT JOIN tenant_users tu ON tu.tenant_id = t.id
             WHERE t.id = ? AND t.owner_id = ?`,
            [req.params.id, req.user.id]
        );
        if (!rows.length) return res.status(404).json({ message: 'Tenant not found.' });

        // A tenant the landlord typed in by hand has no portal account, so there is
        // nowhere for documents to have come from. Say that rather than 404ing, so
        // the app can offer to invite them instead.
        if (!rows[0].tenant_user_id) {
            return res.status(200).json({
                documents: [],
                summary: summarise([]),
                via: 'tenant',
                no_account: true,
                person: { name: rows[0].name, phone: rows[0].phone, email: rows[0].email },
                types: DOC_TYPES
            });
        }

        await respondWithDocuments(res, req.user.id, rows[0].tenant_user_id, {
            name: rows[0].name, phone: rows[0].phone, email: rows[0].email
        });
    } catch (error) {
        console.error('Error fetching documents for tenant:', error);
        res.status(500).json({ message: 'Server error while fetching the documents.' });
    }
};

// GET /api/owner/join-requests/:id/documents — from the bell, before deciding.
const getApplicantDocuments = async (req, res) => {
    try {
        if (isTenantToken(req)) return res.status(403).json({ message: 'Landlord access only.' });
        const [rows] = await db.query(
            `SELECT jr.tenant_user_id, tu.name, tu.phone, tu.email
             FROM join_requests jr
             JOIN tenant_users tu ON jr.tenant_user_id = tu.id
             WHERE jr.id = ? AND jr.owner_id = ?`,
            [req.params.id, req.user.id]
        );
        if (!rows.length) return res.status(404).json({ message: 'Request not found.' });

        await respondWithDocuments(res, req.user.id, rows[0].tenant_user_id, {
            name: rows[0].name, phone: rows[0].phone, email: rows[0].email
        });
    } catch (error) {
        console.error('Error fetching documents for applicant:', error);
        res.status(500).json({ message: 'Server error while fetching the documents.' });
    }
};

// PUT /api/owner/documents/:id  { decision: 'verified' | 'rejected', note }
// The manual check: the landlord has looked at the file and is recording what they
// concluded. Re-derives access from the document's own owner rather than trusting
// that the caller reached it through a screen they were entitled to.
const decideDocument = async (req, res) => {
    try {
        if (isTenantToken(req)) return res.status(403).json({ message: 'Landlord access only.' });
        const decision = String(req.body.decision || '').trim().toLowerCase();
        const status = { verified: 'Verified', rejected: 'Rejected', pending: 'Pending' }[decision];
        if (!status) {
            return res.status(400).json({ message: "Send decision as 'verified' or 'rejected'." });
        }
        const note = String(req.body.note || '').trim().slice(0, 300) || null;

        const [rows] = await db.query(
            'SELECT id, tenant_user_id, doc_type, status FROM tenant_documents WHERE id = ?',
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ message: 'Document not found.' });

        const doc = rows[0];
        const via = await ownerMaySee(req.user.id, doc.tenant_user_id);
        if (!via) return res.status(404).json({ message: 'Document not found.' });

        if (doc.status === status) {
            // Nothing to write, and re-stamping verified_at would rewrite history.
            const documents = await fetchDocuments(doc.tenant_user_id);
            return res.status(200).json({
                message: `Already ${status.toLowerCase()}.`,
                unchanged: true,
                documents,
                summary: summarise(documents)
            });
        }

        // Going back to Pending clears the verdict rather than leaving a stale
        // "verified by X at Y" attached to a document nobody has now approved.
        if (status === 'Pending') {
            await db.query(
                'UPDATE tenant_documents SET status = ?, verified_by = NULL, verified_at = NULL, note = ? WHERE id = ?',
                [status, note, doc.id]
            );
        } else {
            await db.query(
                'UPDATE tenant_documents SET status = ?, verified_by = ?, verified_at = NOW(), note = ? WHERE id = ?',
                [status, req.user.id, note, doc.id]
            );
        }

        const documents = await fetchDocuments(doc.tenant_user_id);
        res.status(200).json({
            message: status === 'Verified'
                ? `${DOC_TYPES[doc.doc_type] || 'Document'} marked verified.`
                : `${DOC_TYPES[doc.doc_type] || 'Document'} rejected.`,
            documents,
            summary: summarise(documents)
        });
    } catch (error) {
        console.error('Error deciding document:', error);
        res.status(500).json({ message: 'Server error while saving the decision.' });
    }
};

module.exports = {
    getMyDocuments,
    addMyDocument,
    deleteMyDocument,
    getTenantDocuments,
    getApplicantDocuments,
    decideDocument,
    // Shared with the portal and the tenant list so "verified" means one thing.
    fetchDocuments,
    summarise,
    DOC_TYPES
};
