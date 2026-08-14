// File: backend/services/tenantLinkService.js
//
// Raising a join request when a new account's phone number is already in a
// landlord's books.
//
// The rules live in utils/tenantMatch.js, which is pure and tested. This file is only
// the database around them: find the candidates, ask the rules what to propose, write
// the rows. Nothing decides anything here.
//
// ── The one invariant ──────────────────────────────────────────────────────────
// This never writes tenant_users.tenant_id. That column is written in exactly one
// place — joinController's accept path, after a human has approved — and this file
// exists specifically so that stays true. All it does is put a request in front of
// the landlord that they could have received by any other route.

const db = require('../config/db');
const { normalisePhone, proposeMatches, phoneSql } = require('../utils/tenantMatch');

// Landlords type "+91 98765 43210" and tenants type "9876543210"; a raw equality test
// would miss almost every genuine match. Shared with the accept path — see the note on
// phoneSql for what went wrong when the two disagreed.
//
// Unindexed by necessity — no index can serve a computed expression here — but
// `tenants` is a per-landlord table of tens to hundreds of rows, and this runs once
// per registration, not per request.
const PHONE_SQL = phoneSql('t.phone');

// Look for tenancies matching this account's phone and raise a join request for each
// landlord who has one. Returns the proposals actually written.
//
// Every failure is swallowed by the caller, not thrown to the user: this runs inside
// registration and login, and a matcher that cannot find anything must never be the
// reason somebody cannot sign in.
const proposeLinksForAccount = async ({ id, phone }) => {
    const ten = normalisePhone(phone);
    if (!ten) return [];

    // Is this account already somebody's tenant? Asked first because it short-circuits
    // everything — and because proposing a linked account to a second landlord would
    // offer them the chance to claim a person who already lives elsewhere.
    const [[account]] = await db.query(
        'SELECT tenant_id FROM tenant_users WHERE id = ?',
        [id]
    );
    if (!account) return [];
    // Short-circuit before the phone scan, not just inside the rules. This runs on
    // every login, and the overwhelming majority of logins are by tenants who are
    // already linked — they should cost one indexed lookup, not a table scan.
    if (account.tenant_id != null) return [];

    // property_id lives on `units`, not on `tenants` — a tenancy reaches its property
    // through the room. A tenant recorded without a room therefore has no property,
    // and the rules drop those: join_requests.property_id is NOT NULL, and there
    // would be nothing for the landlord to accept them INTO.
    const [candidates] = await db.query(
        `SELECT t.id, t.owner_id, t.unit_id, t.status, t.name, u.property_id
         FROM tenants t
         LEFT JOIN units u ON t.unit_id = u.id
         WHERE ${PHONE_SQL} = ?
         ORDER BY (t.status = 'Active') DESC, t.id ASC`,
        [ten]
    );
    if (!candidates.length) return [];

    // Every request this account already has, at any status — because a landlord who
    // answered once must not be asked again. Without this the matcher runs on each
    // login and a rejected match becomes a notification that never stops.
    const [existing] = await db.query(
        'SELECT owner_id, status FROM join_requests WHERE tenant_user_id = ?',
        [id]
    );

    const proposals = proposeMatches({
        candidates,
        existing,
        accountLinked: account.tenant_id != null
    });
    if (!proposals.length) return [];

    const written = [];
    for (const p of proposals) {
        try {
            const [result] = await db.query(
                `INSERT INTO join_requests
                    (tenant_user_id, owner_id, property_id, unit_id, requested_unit_id, source)
                 VALUES (?, ?, ?, ?, ?, 'phone_match')`,
                [id, p.owner_id, p.property_id, p.unit_id, p.unit_id]
            );
            written.push({ ...p, id: result.insertId });
        } catch (err) {
            // One landlord's row failing must not cost the others theirs. The usual
            // cause is a room deleted between the SELECT and the INSERT, which is a
            // reason to skip this landlord and no reason at all to skip the next.
            console.error('tenantLink: could not raise request for owner', p.owner_id, '-', err.message);
        }
    }

    // 'Pending' is what this account's status now means, and only while it is nobody's
    // tenant — the same guard createJoinRequest uses, for the same reason: an account
    // linked under another landlord must not be downgraded to "waiting" by a match.
    if (written.length) {
        await db.query(
            "UPDATE tenant_users SET status = 'Pending' WHERE id = ? AND tenant_id IS NULL",
            [id]
        );
    }
    return written;
};

// The form the auth controllers call. Named for what it guarantees rather than what
// it does: whatever happens in here, the caller's response is unaffected.
//
// Registration and login are the two moments this can run — registration for a new
// account, login to catch accounts that registered before this existed, or whose
// landlord typed them in afterwards. Both are already doing database work, and both
// must succeed even if this does not.
const tryProposeLinks = async (account) => {
    try {
        const written = await proposeLinksForAccount(account);
        if (written.length) {
            console.log(`tenantLink: raised ${written.length} join request(s) for account ${account.id}`);
        }
        return written;
    } catch (err) {
        console.error('tenantLink: matching failed for account', account?.id, '-', err.message);
        return [];
    }
};

module.exports = { proposeLinksForAccount, tryProposeLinks };
