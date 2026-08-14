// File: backend/utils/tenantMatch.js
//
// Finding the tenancy a newly-registered account probably belongs to.
//
// ── The gap this closes ────────────────────────────────────────────────────────
// tenant_users.tenant_id — the link between a portal account and a landlord's
// tenant record — is written in exactly ONE place: joinController's accept path.
// So the ordinary case never linked at all:
//
//   1. A landlord types "Rahul Sharma, 9876543210" into room 101. That is a
//      `tenants` row with no account.
//   2. Rahul installs the app and registers with the same number. That is a
//      `tenant_users` row with tenant_id NULL.
//   3. Nothing connects them, ever.
//
// The landlord sees Rahul in room 101; Rahul sees "ask your landlord to link you".
// His portal, his rent, his ID uploads and every notification aimed at him are all
// broken, and nobody is told.
//
// ── Why this PROPOSES rather than links ────────────────────────────────────────
// A phone number is not proof of identity. Carriers recycle numbers, landlords
// mistype them, families share them. Linking automatically on a number alone would
// hand a stranger somebody else's tenancy, rent history and government ID, silently
// and with nobody ever looking at it.
//
// So a match raises a JOIN REQUEST — the thing the landlord's inbox already shows
// and already knows how to accept. One tap approves it, and the accept path takes
// over: it already reuses an existing tenants row keyed on (owner_id, phone) before
// inserting, so approving a phone match attaches to the hand-entered record rather
// than creating a duplicate. Nothing new writes tenant_id; there is still exactly
// one place that does.
//
// Pure, so the rules below are tests rather than hopes.

// Reduce a number to the ten digits that identify an Indian mobile.
//
// People type "+91 98765 43210", "098765-43210" and "9876543210" for the same phone,
// and a landlord's hand-typed record and a tenant's registration are exactly the two
// places those spellings diverge. Comparing raw strings would miss most real matches
// — which is the failure that looks like "it just doesn't work".
//
// KNOWN LIMIT: a landline written with its STD code ("080 2222 1111") normalises to
// 8022221111, which is indistinguishable from a real mobile — both are ten digits
// starting 6-9. No prefix rule separates them. That is tolerable only because a match
// PROPOSES and a human confirms; it would not be if this linked on its own.
const normalisePhone = (raw) => {
    const digits = String(raw || '').replace(/[^0-9]/g, '');
    if (!digits) return null;
    // Strip a country code or trunk prefix EXPLICITLY, by the shapes a phone number
    // actually comes in. Blindly keeping the last ten digits would accept any long
    // run of numbers — an Aadhaar, an account number, a mistyped date — as a phone.
    let ten = null;
    if (digits.length === 10) ten = digits;
    else if (digits.length === 11 && digits[0] === '0') ten = digits.slice(1);
    else if (digits.length === 12 && digits.startsWith('91')) ten = digits.slice(2);
    else if (digits.length === 13 && digits.startsWith('091')) ten = digits.slice(3);
    if (!ten) return null;
    // Indian mobile numbers start 6-9. Anything else is a typo or a placeholder, and
    // matching on it would be matching on noise.
    if (!/^[6-9]/.test(ten)) return null;
    return ten;
};

// Given the candidate tenancies that share this phone number, decide what to
// propose. Returns an array of proposals — one per landlord, because a number can
// legitimately appear in two landlords' books at once (somebody moving between
// properties) and each landlord decides for themselves.
//
//   candidates  rows from `tenants` matching the phone, each with
//               { id, owner_id, property_id, unit_id, status, name }
//   existing    join_requests already on file for this account, so a decision the
//               landlord already made is not asked again
//   accountLinked  whether this account already has a tenant_id
const proposeMatches = ({ candidates = [], existing = [], accountLinked = false } = {}) => {
    // Already linked: there is nothing to propose, and proposing anyway would offer
    // a landlord the chance to claim somebody who is already somebody else's tenant.
    if (accountLinked) return [];

    const decidedOwners = new Set();
    const pendingOwners = new Set();
    for (const r of existing) {
        // A rejection is an answer. Re-proposing on every login would turn "not him"
        // into a notification that never stops.
        if (String(r.status) === 'Rejected' || String(r.status) === 'Accepted') decidedOwners.add(String(r.owner_id));
        if (String(r.status) === 'Pending') pendingOwners.add(String(r.owner_id));
    }

    const seenOwners = new Set();
    const out = [];
    for (const c of candidates) {
        // Only a LIVE tenancy. A tenant who moved out in March is not somebody this
        // landlord is waiting for, and proposing it would resurrect an old tenancy.
        //
        // NULL means "never set" — the column defaults to Active and old rows predate
        // it, so those are live. An empty string does NOT: `status` is an enum, and
        // MySQL stores '' precisely when a write tried to set something the enum does
        // not allow. That is a damaged row, and a damaged row is not permission.
        const status = c.status == null ? 'Active' : String(c.status);
        if (status !== 'Active') continue;
        const owner = String(c.owner_id);
        if (decidedOwners.has(owner)) continue;   // already answered
        if (pendingOwners.has(owner)) continue;   // already asked, still waiting
        if (seenOwners.has(owner)) continue;      // one proposal per landlord
        // A tenancy with no property cannot become a join request — the row requires
        // property_id, and there is nothing for the landlord to accept them INTO.
        if (c.property_id == null) continue;
        seenOwners.add(owner);
        out.push({
            owner_id: c.owner_id,
            property_id: c.property_id,
            // The room they are already recorded in, so the landlord's accept
            // pre-fills correctly instead of asking a question they have answered.
            unit_id: c.unit_id || null,
            tenant_id: c.id,
            tenant_name: c.name || null
        });
    }
    return out;
};

// The same reduction as normalisePhone, expressed in SQL so a comparison can happen
// inside a query.
//
// It exists as one exported string rather than as two similar literals in two files
// because the two ends of this feature MUST agree. They did not: the matcher compared
// normalised numbers while the accept path compared raw ones, so a landlord who typed
// "+91 98765 43210" matched a tenant who typed "9876543210" — and then accepting the
// match failed to find that same tenancy and created a second one. Two rows for one
// person, which is the exact outcome the matching was built to avoid.
const phoneSql = (col) =>
    `RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${col}, ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), 10)`;

module.exports = { normalisePhone, proposeMatches, phoneSql };
