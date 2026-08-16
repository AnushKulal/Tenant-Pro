// File: backend/utils/signupPhone.js
//
// The one place a phone number becomes an account identifier.
//
// ── Why this exists ────────────────────────────────────────────────────────────
// Registration used to compare phone numbers as raw bytes — `existing.phone === phone`,
// and a UNIQUE key on the column. Both compare SPELLING. But a phone number has several
// spellings that are the same number, and this codebase already knows that: the tenant
// phone-match (utils/tenantMatch.js) exists precisely to reconcile "+91 98765 43210"
// with "9876543210" when linking somebody to their landlord's records.
//
// So the two halves disagreed. Registration said those were different people; the
// matcher said they were the same person. That gap was not cosmetic:
//
//   1. Six landlord accounts could hold one number — "9876543210", "+919876543210",
//      "09876543210", "919876543210", " 9876543210 " and "+91 9876543210" all passed
//      both the check and the UNIQUE key. Sign-in is `WHERE phone = ?` and takes the
//      first row, so which account you land in becomes a question about row order.
//
//   2. Worse, and demonstrated end to end: anyone who knew a tenant's number could
//      register on a variant spelling of it. The matcher normalised, recognised it as
//      that tenant, and offered them to the landlord as "Is this your tenant in room
//      101?" — a question the landlord cannot answer correctly. Accepting linked a
//      stranger to that tenancy, handing over its rent, history and documents.
//
// The fix is to make registration ask the same question the matcher asks: not "is this
// string taken" but "is this NUMBER taken".

const { normalisePhone, phoneSql } = require('./tenantMatch');

// What to store, and what to compare on.
//
// Returns the ten-digit form for anything that normalises, and falls back to the
// trimmed input for anything that does not. The fallback matters: `normalisePhone`
// only recognises Indian mobiles, and refusing everything else would lock out any
// account whose number this app has not been taught yet — a bigger failure than the
// one being fixed. Such a number still gets the raw UNIQUE key it always had.
const forSignup = (raw) => {
    const trimmed = String(raw || '').trim();
    const ten = normalisePhone(trimmed);
    return { store: ten || trimmed, ten };
};

// Is this NUMBER already on an account in `table`?
//
// Matched on both sides at once: the stored column is normalised in SQL, and the
// candidate is normalised in JS. That covers rows written before this existed, which
// still hold whatever spelling they were signed up with.
//
// A number that does not normalise falls back to an exact comparison — the same check
// as before, which is the most that can be said about a number we cannot parse.
const phoneTaken = async (db, table, raw) => {
    const { store, ten } = forSignup(raw);
    const [rows] = ten
        ? await db.query(`SELECT id FROM ${table} WHERE ${phoneSql('phone')} = ? LIMIT 1`, [ten])
        : await db.query(`SELECT id FROM ${table} WHERE phone = ? LIMIT 1`, [store]);
    return rows.length > 0;
};

module.exports = { forSignup, phoneTaken };
