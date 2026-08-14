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
// Whether the landlord may READ the ID or only see that one exists. The two
// relationships above open the door; this decides what is behind it, because a
// tenancy that has ENDED should not leave a readable copy of somebody's Aadhaar in
// a former landlord's app for ever.
const { decideVisibility, applyVisibility, blurredUrl, canBlurAtAll, FULL, NONE } = require('../utils/idVisibility');
const jwt = require('jsonwebtoken');
const { Readable } = require('stream');
// One-way: idRequestController requires nothing from this file, which is why it keeps
// its own copy of the document labels rather than importing DOC_TYPES below. A test
// pins the two lists together so they cannot drift apart in silence.
const { askStateFor, promptsForAccount, closeRequestsFor, reopenRequestsFor } = require('./idRequestController');

// ── Serving a blurred ID without disclosing where the original lives ───────────
//
// A Cloudinary transformation URL is a path prefix on a PUBLIC asset: strip
// `e_blur:2000/` out of it and the original is right there, no token required. So a
// blurred URL cannot be handed to the app — it is the unblurred ID with extra steps.
//
// Instead the app gets a short-lived link back to this server. The token names one
// document and one owner, expires in fifteen minutes, and the handler re-checks the
// relationship before streaming anything — so a link that outlives the tenancy stops
// working, and a link shared with somebody else is useless to them.
const PREVIEW_TTL = '15m';

const previewToken = (docId, ownerId) => jwt.sign(
    { d: docId, o: ownerId, k: 'idprev' },
    process.env.JWT_SECRET,
    { expiresIn: PREVIEW_TTL }
);

// Where the app should fetch a blurred document from. Relative, so it works on any
// host without BASE_URL being right.
// NOT under /api/owner: that mount requires a Bearer header, and a React Native
// <Image> cannot send one. The token in the query string is what guards this.
const previewSigner = (ownerId) => (docId) => `/api/id-preview/${docId}?t=${previewToken(docId, ownerId)}`;

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
// Returns { via, tenancyStatus } or null.
//
// `tenancyStatus` rides along because the relationship EXISTING and the relationship
// being LIVE are different questions, and only the first was being asked. A landlord
// keeps their tenants row for ever — a move-out is a soft delete — so `via: 'tenant'`
// came back identically for somebody in room 101 and somebody who left in March.
// The status is what tells them apart, and decideVisibility needs it.
const ownerMaySee = async (ownerId, tenantUserId) => {
    const [linked] = await db.query(
        `SELECT t.id, t.status
         FROM tenant_users tu
         JOIN tenants t ON tu.tenant_id = t.id
         WHERE tu.id = ? AND t.owner_id = ?
         ORDER BY (t.status = 'Active') DESC, t.id
         LIMIT 1`,
        [tenantUserId, ownerId]
    );
    // Ordered so a LIVE tenancy wins over a lapsed one. One person can have been this
    // landlord's tenant twice — left, came back — and picking whichever row MySQL
    // returned first would blur a current tenant's ID because of an old tenancy.
    if (linked.length) return { via: 'tenant', tenancyStatus: linked[0].status || 'Active' };

    const [applying] = await db.query(
        `SELECT id FROM join_requests
         WHERE tenant_user_id = ? AND owner_id = ? AND status = 'Pending'`,
        [tenantUserId, ownerId]
    );
    // No tenancy yet, which is the point of the applicant path.
    if (applying.length) return { via: 'applicant', tenancyStatus: null };

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
        // Who has asked them for one, and why. Loaded here rather than on its own
        // endpoint so the prompt and the documents it is about can never be a refresh
        // apart — a "your landlord asked for your ID" banner sitting above the ID they
        // just uploaded is the kind of thing that makes an app feel broken.
        const requests = await promptsForAccount(req.user.id);
        res.status(200).json({ documents, summary: summarise(documents), requests, types: DOC_TYPES });
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

        // Close whatever ask this answers. Driven by the document that now exists,
        // never by anybody saying it arrived — a landlord able to close their own
        // request could silence the tenant's prompt without receiving anything.
        const closed = await closeRequestsFor(req.user.id, { id: result.insertId, doc_type: docType });

        const documents = await fetchDocuments(req.user.id);
        res.status(201).json({
            // Worth saying when it settles an ask: the tenant uploaded this BECAUSE
            // they were asked, and "your landlord can now check it" leaves them
            // wondering whether the request is still hanging over them.
            message: closed
                ? `${DOC_TYPES[docType]} sent. That answers your landlord's request.`
                : `${DOC_TYPES[docType]} added. Your landlord can now check it.`,
            id: result.insertId,
            documents,
            summary: summarise(documents),
            requests: await promptsForAccount(req.user.id)
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
        // If this document was what answered a landlord's request, that request is open
        // again. Otherwise it stays marked Fulfilled with nothing behind it — the
        // landlord sees no document AND no outstanding ask, so nothing tells them to
        // look again, and the tenant is never prompted either.
        const reopened = await reopenRequestsFor(Number(req.params.id));

        const documents = await fetchDocuments(req.user.id);
        res.status(200).json({
            // Said plainly, because withdrawing an ID quietly puts a prompt back on
            // their own home screen and they should not have to work that out.
            message: reopened
                ? "Document removed. Your landlord's request is open again."
                : 'Document removed.',
            documents,
            summary: summarise(documents),
            requests: await promptsForAccount(req.user.id)
        });
    } catch (error) {
        console.error('Error deleting tenant document:', error);
        res.status(500).json({ message: 'Server error while removing the document.' });
    }
};

// ── Landlord side ─────────────────────────────────────────────────────────────

// Shared tail for both owner read paths: check, fetch, answer.
const respondWithDocuments = async (res, ownerId, tenantUserId, person) => {
    const rel = await ownerMaySee(ownerId, tenantUserId);
    if (!rel) {
        // Deliberately the same answer as "no such person": whether a given
        // account exists is not something an unrelated owner should learn.
        return res.status(404).json({ message: 'No documents you can see for this person.' });
    }
    const { via } = rel;
    const documents = await fetchDocuments(tenantUserId);
    // The status comes from the RELATIONSHIP query, not from whatever `person` the
    // caller happened to assemble — one source, so a caller that forgets to include
    // it cannot accidentally unlock a lapsed tenancy.
    const seen = decideVisibility({ relationship: via, tenancyStatus: rel.tenancyStatus });
    res.status(200).json({
        documents: applyVisibility(documents, seen.level, previewSigner(ownerId)),
        summary: summarise(documents),
        via,
        visibility: seen.level,
        visibility_reason: seen.reason,
        // In disk mode no blurred copy can be produced, so a hidden document has no
        // image at all. That is a deployment fact, not a permission one, and the app
        // says something different about it.
        blur_available: canBlurAtAll(),
        person,
        types: DOC_TYPES
    });
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
        // Whether the ID is readable, decided BEFORE anything is fetched so a moved-out
        // tenant's document cannot leave this function unblurred. This path proves
        // ownership through the tenants row rather than ownerMaySee, which is why it
        // needs the check spelled out here — it was the hole: `via: 'tenant'` was
        // returned for an Inactive tenancy exactly as for a live one, so a landlord kept
        // a readable copy of the ID of somebody who had moved out months ago.
        const seen = decideVisibility({ relationship: 'tenant', tenancyStatus: person.tenancy_status });

        if (!accounts.length) {
            return res.status(200).json({
                documents: [],
                summary: summarise([]),
                via: 'tenant',
                no_account: true,
                visibility: seen.level,
                visibility_reason: seen.reason,
                blur_available: canBlurAtAll(),
                // Still offered, and honestly labelled. A tenant with no account can be
                // asked — the ask waits for them — but the landlord is told nobody will
                // see it today rather than being left to assume a notification went out.
                ask: await askStateFor({
                    ownerId: req.user.id,
                    tenantId: rows[0].id,
                    tenancyStatus: person.tenancy_status,
                    hasAccount: false,
                    summary: summarise([])
                }),
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
            // The summary counts the REAL rows — how many exist and how many were
            // verified is the landlord's own record and stays true either way. Only
            // the documents themselves are blurred.
            documents: applyVisibility(documents, seen.level, previewSigner(req.user.id)),
            summary: summarise(documents),
            via: 'tenant',
            visibility: seen.level,
            visibility_reason: seen.reason,
            blur_available: canBlurAtAll(),
            // Whether the landlord may ask, what the button should say, and the open
            // ask if there is one. Assembled here, from the same summary the rows are
            // drawn from, so the button and the list beneath it cannot disagree.
            ask: await askStateFor({
                ownerId: req.user.id,
                tenantId: rows[0].id,
                tenancyStatus: person.tenancy_status,
                hasAccount: true,
                summary: summarise(documents)
            }),
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

// GET /api/id-preview/:id?t=<token>
//
// Streams the BLURRED copy of a hidden ID. The only way a landlord ever sees one,
// because the Cloudinary address of the original is never disclosed.
//
// Deliberately outside the normal auth mount: an <Image> cannot send an
// Authorization header without the app threading one through every render, so the
// token is in the query string instead. That is safe here because the token names one
// document, expires in fifteen minutes, and proves nothing on its own — the
// relationship is re-checked below, so a leaked link stops working the moment the
// tenancy changes, and gives an unrelated person nothing at all.
const previewDocument = async (req, res) => {
    try {
        let claims;
        try {
            claims = jwt.verify(String(req.query.t || ''), process.env.JWT_SECRET);
        } catch (e) {
            return res.status(403).json({ message: 'That preview link has expired.' });
        }
        // A token minted for something else must not work here. Without the `k`
        // check, any valid session token would open any document.
        if (!claims || claims.k !== 'idprev') {
            return res.status(403).json({ message: 'That preview link is not valid.' });
        }
        if (String(claims.d) !== String(req.params.id)) {
            return res.status(403).json({ message: 'That preview link is for a different document.' });
        }

        const [rows] = await db.query('SELECT id, tenant_user_id, file_url FROM tenant_documents WHERE id = ?', [claims.d]);
        if (!rows.length) return res.status(404).json({ message: 'Document not found.' });

        // Re-checked at FETCH time, not just when the link was made. A link handed out
        // while somebody was a tenant must stop working when they are not — otherwise
        // the fifteen-minute window is a fifteen-minute hole.
        const rel = await ownerMaySee(claims.o, rows[0].tenant_user_id);
        if (!rel) return res.status(404).json({ message: 'Document not found.' });

        // And only ever the blurred copy. If this document has become fully visible
        // again the app will have a direct URL for it; this endpoint has exactly one
        // job and must not become a second way to fetch an original.
        const target = blurredUrl(rows[0].file_url);
        if (!target) return res.status(404).json({ message: 'No preview available.' });

        const upstream = await fetch(target);
        if (!upstream.ok) return res.status(502).json({ message: 'Could not load the preview.' });

        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
        // Private and short-lived: a blurred ID is still somebody's ID, and it should
        // not sit in a shared cache after the relationship it depended on has ended.
        res.setHeader('Cache-Control', 'private, max-age=300');
        Readable.fromWeb(upstream.body).pipe(res);
    } catch (error) {
        console.error('Error streaming document preview:', error.message);
        res.status(500).json({ message: 'Could not load the preview.' });
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
        const rel = await ownerMaySee(req.user.id, doc.tenant_user_id);
        if (!rel) return res.status(404).json({ message: 'Document not found.' });

        // A verdict is a statement that you LOOKED at the document. Once the tenancy
        // has ended the image is blurred, so there is nothing to look at and a fresh
        // "verified" would be a claim about something the landlord cannot see. Existing
        // verdicts stand — this refuses new ones, it does not erase the old record.
        const seen = decideVisibility({ relationship: rel.via, tenancyStatus: rel.tenancyStatus });
        if (seen.level !== FULL) {
            return res.status(403).json({
                code: 'ID_HIDDEN',
                message: 'Their ID is hidden now that they have moved out, so it cannot be checked again.'
            });
        }

        if (doc.status === status) {
            // Nothing to write, and re-stamping verified_at would rewrite history.
            const documents = await fetchDocuments(doc.tenant_user_id);
            return res.status(200).json({
                message: `Already ${status.toLowerCase()}.`,
                unchanged: true,
                documents: applyVisibility(documents, seen.level, previewSigner(req.user.id)),
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
            // Through applyVisibility like every other landlord-facing response. Only
            // FULL can reach here, so nothing is blurred in practice — it goes through
            // the same door so a future change to who may decide cannot turn this into
            // the one endpoint that hands back raw URLs.
            documents: applyVisibility(documents, seen.level, previewSigner(req.user.id)),
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
    previewDocument,
    // Shared with the portal and the tenant list so "verified" means one thing.
    fetchDocuments,
    summarise,
    DOC_TYPES
};
