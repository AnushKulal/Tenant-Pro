// File: backend/controllers/guestController.js
// Joining a property as a guest: a phone number, a photograph of a government ID,
// and nothing else.
//
// ── Why this exists ────────────────────────────────────────────────────────────
// "Join as a guest" used to be a lie. The button held on to the scanned property
// code, then routed you to the full registration form and replayed the code once
// an account existed — so the person it was aimed at, someone standing in the
// building today who wants in now, still had to invent a name, an email and a
// password first. Everything a guest could do required a tenant JWT, and there was
// no way to get one without registering.
//
// So this is the one genuinely public write in the tenant API. It does in a single
// call what the old flow spread across three screens:
//
//   1. creates a tenant_users row with is_guest = 1 and a randomised guest code,
//   2. files the government ID against it, and
//   3. sends the join request to the landlord who owns that property code,
//
// then hands back a normal tenant JWT. From that moment the guest is an ordinary
// authenticated tenant as far as every other endpoint is concerned — which is the
// point: no endpoint needs a guest special case, and none of them grow one.
//
// ── What a guest cannot do, and why that is safe ───────────────────────────────
// The guest code plus the phone number is a weak credential by design, so the blast
// radius has to be small. A guest account has no email, so it cannot receive a
// password reset; it can only ever see the ONE tenancy a landlord accepted it into;
// and the code dies with that tenancy (see endGuestIdentity). The route sits behind
// the same rate limiter as login. What it must never do is let a stranger reach an
// EXISTING account, which is why a phone number already belonging to a full account
// is refused outright rather than reused.
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { stayState, toSqlDate, parseStayUntil } = require('../utils/guestStay');
const { getFileUrl } = require('../middleware/uploadMiddleware');
const { findPropertyByCode, validateRequestedUnit } = require('./joinController');
const { fetchDocuments, summarise, DOC_TYPES } = require('./documentController');
const { newGuestCode, guestDisplayName, looksLikeGuestCode } = require('../utils/guestCode');

// A guest's token is shaped exactly like a registered tenant's, so `protect` and
// every `role === 'tenant'` check work unchanged. `email` is null rather than
// absent, because handlers read it and a missing key reads as undefined either way
// — being explicit is what stops a guest's email showing up as the string
// "undefined" somewhere.
//
// How long the session lasts depends on whether the account can be recovered,
// because for a guest being signed out IS the failure. A registered tenant who
// gets logged out types an email and a password they chose. A guest who gets
// logged out has to produce a six-character code they never chose and have not
// looked at since the day they joined — and there is no reset, because there is
// no email to send one to. At seven days that was not an edge case, it was a
// weekly event: most guests would have been locked out of their own tenancy,
// documents and payment history inside a fortnight.
//
// The trade is deliberate. A longer-lived token on a weaker credential is more
// exposure if the phone is stolen — but the blast radius is bounded to the single
// tenancy a landlord accepted them into (see the header), and it is bounded the
// same way at seven days as at ninety. Being permanently locked out is both the
// worse outcome and the far likelier one.
//
// Keyed on the email rather than on is_guest so it cannot drift: the moment a
// guest completes their profile they have real credentials and a real way back
// in, and they drop to the ordinary week on their next token.
const GUEST_SESSION = '90d';
const TENANT_SESSION = '7d';
const signTenantToken = (user) => jwt.sign(
    { id: user.id, email: user.email || null, role: 'tenant' },
    process.env.JWT_SECRET,
    { expiresIn: user.email ? TENANT_SESSION : GUEST_SESSION }
);

// Indian mobile numbers, which is what every other phone field in this codebase
// assumes. Accepts the shapes people actually type — +91 spaces, dashes, a leading
// 0 — and stores the ten digits.
const normalisePhone = (raw) => {
    const digits = String(raw || '').replace(/[^0-9]/g, '');
    const ten = digits.length > 10 ? digits.slice(-10) : digits;
    if (ten.length !== 10) return null;
    // 0-5 openers are landline/invalid ranges for mobiles.
    if (!/^[6-9]/.test(ten)) return null;
    return ten;
};

// A code is allocated by trying: 594 million codes over a handful of guests means a
// collision is a curiosity, not a case to design around, but the UNIQUE index makes
// one an error rather than a silent overwrite, so it is retried rather than assumed
// away. Runs inside the caller's transaction so the reservation cannot be lost.
const allocateGuestCode = async (conn) => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
        const code = newGuestCode();
        const [clash] = await conn.query('SELECT id FROM tenant_users WHERE guest_code = ? LIMIT 1', [code]);
        if (!clash.length) return code;
    }
    throw new Error('Could not allocate a guest code.');
};

// The two duplicate cases for a returning guest, phrased for someone who has no
// idea they already have an account on this phone.
const pendingOrLinkedFor = async (prior, property) => {
    const [pending] = await db.query(
        "SELECT id FROM join_requests WHERE tenant_user_id = ? AND property_id = ? AND status = 'Pending' LIMIT 1",
        [prior.id, property.id]
    );
    if (pending.length) {
        return {
            code: 'ALREADY_PENDING',
            message: `You already asked to join ${property.name}. Your guest ID is ${prior.guest_code} — sign in with it to check.`,
            guest_code: prior.guest_code
        };
    }
    if (prior.tenant_id) {
        return {
            code: 'ALREADY_IN',
            message: `You are already in a property as guest ${prior.guest_code}. Sign in with that ID.`,
            guest_code: prior.guest_code
        };
    }
    return null;
};

// POST /api/tenant-auth/guest   (public, multipart: field name `document`)
//
// Body: code | property_id, phone, doc_type, doc_number?, note?
//
// Every failure path has to return BEFORE the account is created, or a rejected
// attempt leaves a real guest account with no document and no request behind it.
// The one thing that cannot be checked in advance is the transaction itself, which
// is why the three inserts share one.
const joinAsGuest = async (req, res) => {
    try {
        const phone = normalisePhone(req.body.phone);
        if (!phone) {
            return res.status(400).json({ message: 'Enter a 10-digit mobile number your landlord can reach you on.' });
        }

        // The document is the whole point of the flow — it is what a landlord is
        // being asked to accept a stranger on the strength of — so it is required,
        // not optional.
        if (!req.file) {
            return res.status(400).json({ message: 'Attach a photo of a government ID — Aadhaar, PAN, licence or passport.' });
        }
        const docType = String(req.body.doc_type || '').trim().toLowerCase();
        if (!DOC_TYPES[docType]) {
            return res.status(400).json({ message: 'Choose which document this is.', allowed: Object.keys(DOC_TYPES) });
        }
        const docNumber = String(req.body.doc_number || '').trim().slice(0, 64) || null;

        // How long they say they are staying. Checked here, before the account is
        // created, for the same reason every other failure above is: a rejected date
        // must not leave a guest account and a document behind it.
        //
        // This is the applicant's ASK and nothing more. The landlord sets the real
        // dates when they accept, and a guest who could set their own expiry could set
        // it to never -- which is the whole thing guest expiry exists to prevent.
        const asked = parseStayUntil(req.body.stay_until);
        if (!asked.ok) {
            return res.status(400).json({ message: asked.message });
        }

        // Which property. Same two ways in as a normal join request.
        const wantedCode = String(req.body.code || '').trim().toUpperCase();
        const propertyId = Number(req.body.property_id) || null;
        let property = null;
        if (propertyId) {
            const [rows] = await db.query('SELECT id, name, owner_id FROM properties WHERE id = ? LIMIT 1', [propertyId]);
            property = rows[0] || null;
        } else if (wantedCode) {
            property = await findPropertyByCode(wantedCode);
        }
        if (!property) {
            return res.status(404).json({
                message: 'No property matches that code. Please check it with your landlord.',
                code: wantedCode || null
            });
        }

        // Does this number already have an account? Three cases, and only one of
        // them is a guest join.
        const [existing] = await db.query(
            'SELECT id, name, email, is_guest, guest_code, tenant_id, status FROM tenant_users WHERE phone = ? LIMIT 1',
            [phone]
        );
        const prior = existing[0] || null;

        // A full account on this number. Refused — not reused. Handing a token for
        // somebody's real account to whoever can type their phone number is exactly
        // the hole this flow must not open, and the honest answer is "that number
        // already has an account, sign in".
        if (prior && !prior.is_guest) {
            return res.status(409).json({
                code: 'ACCOUNT_EXISTS',
                message: 'That number already has a TenantPro account. Sign in instead — you can ask to join from there.'
            });
        }

        // A guest account on this number already. Reused rather than duplicated: a
        // second guest row on one number would make the phone ambiguous for sign-in,
        // and the point of the code is that a person keeps one identity per stay.
        if (prior && prior.guest_code) {
            const dupe = await pendingOrLinkedFor(prior, property);
            if (dupe) return res.status(409).json(dupe);
        }

        // Which room they asked for, validated against THIS property. Checked here for
        // the same reason as every refusal above: before the account exists, so a bad
        // room id cannot leave a guest and an uploaded ID orphaned behind it.
        const wantedUnit = await validateRequestedUnit(req.body.requested_unit_id, property.id);
        if (!wantedUnit.ok) {
            return res.status(400).json({ message: wantedUnit.message });
        }

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            let userId = prior ? prior.id : null;
            let guestCode = prior ? prior.guest_code : null;

            if (!userId) {
                guestCode = await allocateGuestCode(conn);
                const [ins] = await conn.query(
                    `INSERT INTO tenant_users (name, email, phone, password_hash, is_guest, guest_code, status)
                     VALUES (?, NULL, ?, NULL, 1, ?, 'Pending')`,
                    [guestDisplayName(guestCode), phone, guestCode]
                );
                userId = ins.insertId;
            } else if (!guestCode) {
                // A guest row that lost its code — its previous stay ended. Issue a
                // new one: this is a new stay, and the old code was retired with the
                // old tenancy on purpose.
                guestCode = await allocateGuestCode(conn);
                await conn.query(
                    "UPDATE tenant_users SET guest_code = ?, name = ?, status = 'Pending' WHERE id = ?",
                    [guestCode, guestDisplayName(guestCode), userId]
                );
            } else {
                await conn.query(
                    "UPDATE tenant_users SET status = 'Pending' WHERE id = ? AND tenant_id IS NULL",
                    [userId]
                );
            }

            await conn.query(
                'INSERT INTO tenant_documents (tenant_user_id, doc_type, doc_number, file_url) VALUES (?, ?, ?, ?)',
                [userId, docType, docNumber, getFileUrl(req.file)]
            );

            const note = String(req.body.note || '').trim().slice(0, 300) || null;
            const [jr] = await conn.query(
                `INSERT INTO join_requests
                    (tenant_user_id, owner_id, property_id, note, requested_stay_until, requested_unit_id)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [userId, property.owner_id, property.id, note, toSqlDate(asked.value), wantedUnit.value]
            );

            await conn.commit();

            const documents = await fetchDocuments(userId);
            const user = { id: userId, name: guestDisplayName(guestCode), email: null, phone, status: 'Pending' };

            console.log(`🎟️  Guest ${guestCode} asked to join ${property.name}.`);
            return res.status(201).json({
                message: `Request sent. ${property.name} will see your ID and decide.`,
                token: signTenantToken(user),
                tenant: { ...user, is_guest: 1, guest_code: guestCode },
                guest_code: guestCode,
                request: {
                    id: jr.insertId,
                    property_id: property.id,
                    property_name: property.name,
                    status: 'Pending',
                    requested_stay_until: toSqlDate(asked.value),
                    requested_unit_id: wantedUnit.value
                },
                documents,
                id_proof: summarise(documents)
            });
        } catch (e) {
            await conn.rollback();
            throw e;
        } finally {
            conn.release();
        }
    } catch (error) {
        console.error('Guest join error:', error.message);
        res.status(500).json({ message: 'Could not send that request. Please try again.' });
    }
};

// POST /api/tenant-auth/guest-login   (public)
// Body: { code, phone }
//
// A guest has no password, so this pair IS the credential. Both halves are checked
// in one query and the failure is deliberately single and vague: saying "no such
// code" would turn this into an oracle for which codes exist.
const guestLogin = async (req, res) => {
    try {
        const code = String(req.body.code || '').trim().toUpperCase();
        const phone = normalisePhone(req.body.phone);
        if (!looksLikeGuestCode(code) || !phone) {
            return res.status(400).json({ message: 'Enter your 6-character guest ID and the mobile number you used.' });
        }

        // The tenancy is joined in for its stay dates: refusing an expired guest at the
        // door is clearer than admitting them and having every subsequent request fail.
        const [rows] = await db.query(
            `SELECT u.id, u.name, u.email, u.phone, u.status, u.tenant_id, u.guest_code, t.stay_until
             FROM tenant_users u
             LEFT JOIN tenants t ON u.tenant_id = t.id
             WHERE u.guest_code = ? AND u.phone = ? AND u.is_guest = 1 LIMIT 1`,
            [code, phone]
        );
        const user = rows[0];
        if (!user) {
            return res.status(404).json({
                code: 'NO_GUEST',
                message: 'That guest ID and number do not match. A guest ID only lasts while you are in the property.'
            });
        }

        // Past the end of the stay. Says the date rather than just "expired", because
        // the first thing anybody asks is "since when" — and names the two real ways
        // forward instead of leaving them at a locked door.
        const stay = stayState({ stayUntil: user.stay_until, isGuest: true });
        if (stay.expired) {
            return res.status(403).json({
                code: 'GUEST_STAY_ENDED',
                endedOn: toSqlDate(stay.endsOn),
                message: `This guest ID ended on ${toSqlDate(stay.endsOn)}. Ask your landlord to extend your dates, or sign in with an email and password if you set one up.`
            });
        }

        res.status(200).json({
            message: 'Signed in',
            token: signTenantToken(user),
            tenant: {
                id: user.id,
                name: user.name,
                email: null,
                phone: user.phone,
                status: user.status,
                tenant_id: user.tenant_id,
                is_guest: 1,
                guest_code: user.guest_code
            }
        });
    } catch (error) {
        console.error('Guest login error:', error.message);
        res.status(500).json({ message: 'Could not sign you in. Please try again.' });
    }
};

// POST /api/tenant-portal/claim-account   (tenant token)
// Body: { name, email, password }
//
// Turning a guest into a full account. This is what the "finish your profile"
// prompt leads to, and what it buys is concrete rather than vague: an email to
// reset a password with, a real name in the landlord's roster instead of
// "Guest 7K2QFH", and an identity that outlives this one stay.
//
// The guest code is retired here. Keeping it alive after the upgrade would leave a
// second, weaker way into an account that now has a password.
const claimAccount = async (req, res) => {
    try {
        if (req.user?.role !== 'tenant') {
            return res.status(403).json({ message: 'Tenant access only.' });
        }

        const name = String(req.body.name || '').trim().slice(0, 100);
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = String(req.body.password || '');

        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Name, email and password are all required.' });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ message: 'That email address does not look right.' });
        }
        if (password.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters.' });
        }

        const [me] = await db.query(
            'SELECT id, is_guest, tenant_id, guest_code FROM tenant_users WHERE id = ? LIMIT 1',
            [req.user.id]
        );
        const account = me[0];
        if (!account) return res.status(404).json({ message: 'Account not found.' });
        // Already a full account: this endpoint only ever upgrades. Changing an
        // existing account's email and password is a different operation with
        // different safety requirements (confirm the old password, verify the new
        // address), and quietly doing it here would be a takeover primitive.
        if (!account.is_guest) {
            return res.status(409).json({ message: 'This is already a full account.' });
        }

        // The same two uniqueness rules registration enforces, for the same reason:
        // the two portals are mutually exclusive and an email identifies an account.
        const [clash] = await db.query('SELECT id FROM tenant_users WHERE email = ? AND id <> ? LIMIT 1', [email, req.user.id]);
        if (clash.length) {
            return res.status(409).json({ message: 'That email already has a tenant account.' });
        }
        const [ownerClash] = await db.query('SELECT id FROM owners WHERE email = ? LIMIT 1', [email]);
        if (ownerClash.length) {
            return res.status(409).json({ message: 'That email is registered as a landlord account.' });
        }

        const hash = await bcrypt.hash(password, 10);

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query(
                'UPDATE tenant_users SET name = ?, email = ?, password_hash = ?, is_guest = 0, guest_code = NULL WHERE id = ?',
                [name, email, hash, req.user.id]
            );
            // The landlord's roster carries its own copy of the name, taken from this
            // account when the request was accepted. Without this the landlord would
            // still see "Guest 7K2QFH" in their people list forever — and the whole
            // reason to finish a profile is that the landlord learns who you are.
            // Only the placeholder is replaced: a landlord who has since corrected
            // the name themselves keeps their version.
            if (account.tenant_id) {
                await conn.query(
                    'UPDATE tenants SET name = ?, email = ? WHERE id = ? AND name = ?',
                    [name, email, account.tenant_id, guestDisplayName(account.guest_code)]
                );
                // The email is worth copying across regardless — the roster had none.
                await conn.query(
                    'UPDATE tenants SET email = ? WHERE id = ? AND (email IS NULL OR email = ?)',
                    [email, account.tenant_id, '']
                );
            }
            await conn.commit();
        } catch (e) {
            await conn.rollback();
            throw e;
        } finally {
            conn.release();
        }

        console.log(`✅ Guest ${account.guest_code} became a full account (${email}).`);
        res.status(200).json({
            message: 'Profile complete. You can now sign in with your email and password.',
            tenant: { id: req.user.id, name, email, is_guest: 0, guest_code: null },
            // A fresh token: the old one carries email: null in its payload, which is
            // what `protect` puts on req.user and what handlers read.
            token: signTenantToken({ id: req.user.id, email })
        });
    } catch (error) {
        console.error('Claim account error:', error.message);
        res.status(500).json({ message: 'Could not save that. Please try again.' });
    }
};

// Retire a guest identity because the tenancy it belonged to has ended.
//
// "A guest ID that stays as long as they are in that property" is only true if
// something takes it away when they leave, so this is called from the two places a
// landlord ends a tenancy: moving a tenant out, and deleting them.
//
// Guests ONLY. A full account keeps its existing behaviour on move-out, because a
// full account's identity was never tied to one stay — it has an email and a
// password and can ask to join somewhere else tomorrow.
//
// Best-effort by design: it is called after the move-out has already succeeded, and
// failing to clear a code is not a reason to tell a landlord their move-out failed.
const endGuestIdentity = async (tenantId) => {
    if (!tenantId) return;
    try {
        const [r] = await db.query(
            `UPDATE tenant_users
                SET guest_code = NULL, tenant_id = NULL, status = 'Unlinked'
              WHERE tenant_id = ? AND is_guest = 1`,
            [tenantId]
        );
        if (r.affectedRows) {
            console.log(`🎟️  Retired ${r.affectedRows} guest identity(ies) with tenancy ${tenantId}.`);
        }
    } catch (e) {
        console.error('Could not retire guest identity:', e.message);
    }
};

module.exports = { joinAsGuest, guestLogin, claimAccount, endGuestIdentity, normalisePhone };
