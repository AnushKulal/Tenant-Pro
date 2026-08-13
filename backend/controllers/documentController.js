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

const decorate = (rows) => rows.map((r) => ({ ...r, doc_label: DOC_TYPES[r.doc_type] || DOC_TYPES.other }));

// Everything a SET of accounts has uploaded, newest first.
//
// A set, not one account, because one person can hold more than one tenant_users row
// pointing at the same tenants row — the demo account ships exactly that
// (demo@gmail.com and tenant@gmail.com both linked to Rahul Sharma), and a guest who
// later completes a profile is another way in. The landlord's list already counts
// documents across ALL of them:
//
//     SELECT COUNT(*) FROM tenant_documents d
//       JOIN tenant_users tu ON d.tenant_user_id = tu.id
//      WHERE tu.tenant_id = t.id
//
// ...while this fetch used to be handed ONE arbitrarily-chosen account id. When the
// document belonged to the other one, the tenant's card said "1 ID TO CHECK" and the
// sheet it opened said "Nothing uploaded yet" — reproduced exactly against a live
// database. Counting one way and reading another is the bug; making both span the
// tenant is the fix.
const fetchDocumentsForAccounts = async (ids) => {
    const list = (Array.isArray(ids) ? ids : [ids]).filter((x) => x != null);
    if (!list.length) return [];
    const [rows] = await db.query(
        `SELECT ${DOC_COLUMNS}
         FROM tenant_documents d
         LEFT JOIN owners o ON d.verified_by = o.id
         WHERE d.tenant_user_id IN (?)
         ORDER BY d.created_at DESC`,
        [list]
    );
    return decorate(rows);
};

// One account, for the callers that genuinely mean one: a tenant reading their own,
// and an applicant who has no tenancy yet and therefore no second row to merge with.
const fetchDocuments = async (tenantUserId) => fetchDocumentsForAccounts([tenantUserId]);

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
        // The tenant, and ownership, in one statement. Two queries rather than a join
        // that returns one row per portal account: this used to LEFT JOIN
        // tenant_users and then read rows[0], which silently picked ONE account out of
        // however many the tenant has — with no ORDER BY, so which one was up to
        // MySQL. See fetchDocumentsForAccounts for what that cost.
        // Tenancy status and room come back too, because the landlord's question is
        // never "has this person installed my app" — it is "who is living in my
        // building, and have I checked them". The sheet used to answer the first,
        // telling a landlord "they have not signed in to TenantPro yet" about a tenant
        // sitting in room 101, which is both true and useless.
        const [rows] = await db.query(
            `SELECT t.id, t.name, t.phone, t.email, t.status, u.unit_number
             FROM tenants t
             LEFT JOIN units u ON t.unit_id = u.id
             WHERE t.id = ? AND t.owner_id = ?`,
            [req.params.id, req.user.id]
        );
        if (!rows.length) return res.status(404).json({ message: 'Tenant not found.' });
        const person = {
            name: rows[0].name,
            phone: rows[0].phone,
            email: rows[0].email,
            // 'Active' or 'Inactive'. A moved-out tenant is kept, not deleted, so their
            // documents remain a record of who was checked — the sheet needs to say
            // which of the two it is rather than implying they are still resident.
            tenancy_status: rows[0].status || 'Active',
            moved_out: String(rows[0].status || 'Active') === 'Inactive',
            unit_number: rows[0].unit_number || null
        };

        // EVERY portal account linked to this tenant, because that is what the
        // landlord's own badge counts.
        const [accounts] = await db.query(
            'SELECT id FROM tenant_users WHERE tenant_id = ?',
            [rows[0].id]
        );

        // A tenant the landlord typed in by hand has no portal account, so there is
        // nowhere for a document to have come FROM. That is still worth reporting —
        // it changes what the landlord can do next, since asking somebody to upload an
        // ID only works if they have an app to upload it from — but it is reported as a
        // fact ALONGSIDE the tenancy, not instead of it. The app phrases it from
        // person.tenancy_status, so a tenant in room 101 reads as a tenant in room 101.
        if (!accounts.length) {
            return res.status(200).json({
                documents: [],
                summary: summarise([]),
                via: 'tenant',
                no_account: true,
                person,
                types: DOC_TYPES
            });
        }

        // Ownership is already proven above — the tenants row matched this owner_id —
        // so there is no ownerMaySee call to make here. Going through it per account
        // would re-derive the same fact once per row and, worse, would make the answer
        // depend on which account happened to be checked first.
        const documents = await fetchDocumentsForAccounts(accounts.map((a) => a.id));
        return res.status(200).json({
            documents,
            summary: summarise(documents),
            via: 'tenant',
            person,
            types: DOC_TYPES
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
