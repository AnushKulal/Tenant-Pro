// File: backend/services/sessionService.js
//
// Issuing, refreshing and REVOKING a session.
//
// ── The problem this exists to solve ──────────────────────────────────────────
// An access token is a signature over some claims. The server verifies it and admits
// the bearer; it consults nothing else, by design, because that is what makes it fast.
// The price is that nothing can take it back. A stolen phone, a tenant who moved out,
// a landlord who just changed their password because they think they were phished —
// none of those could end a session. It ran its thirty days and there was no button,
// anywhere, that would have stopped it.
//
// So a session is now a ROW as well as a signature. The row holds a refresh token
// whose only job is to mint access tokens; deleting the row is what "sign out",
// "this phone was stolen" and "I changed my password" all actually do.
//
// Revocation is immediate on the refresh path and lags by at most the access token's
// lifetime — two hours — on the access path. Making it instant would require a
// database read on every authenticated request. That is the trade, and it is the same
// trade essentially every system makes; two hours instead of thirty days is the win.
//
// ── Three decisions worth defending ──────────────────────────────────────────
//
// 1. The token is HASHED, never stored. We only ever need to COMPARE a refresh token,
//    which makes it exactly like a password — and the reset codes in this same
//    database were plain text for months on the reasoning that "we have to check it
//    later". They were wrong too. One leaked backup must not be every live session.
//
// 2. Refresh tokens ROTATE. Presenting one spends it and returns a new one. A token
//    that works for sixty days and is sent on every reconnect is a long-lived secret
//    crossing the network repeatedly; one that works once is not.
//
// 3. A SPENT token presented again revokes the whole family. Rotation means the
//    legitimate client always holds the newest token, so a replay of an old one means
//    a copy exists somewhere it should not. The safe reading of that is theft, and the
//    safe response is to end every session in the chain and make somebody sign in
//    again. A false positive costs one login; a false negative costs the account.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const {
    SESSION_TTL,
    GUEST_SESSION_TTL,
    REFRESH_TTL_DAYS,
    GUEST_REFRESH_TTL_DAYS
} = require('../config/session');

const SECRET = () => process.env.JWT_SECRET || '';

// 32 bytes of CSPRNG, hex. Not a JWT: it carries no claims and means nothing on its
// own — its entire meaning is "there is a row whose hash matches me".
const newRefreshToken = () => crypto.randomBytes(32).toString('hex');

// sha256 rather than bcrypt, deliberately, and this is the one place that choice is
// right. bcrypt is slow ON PURPOSE to frustrate guessing a human-chosen password;
// this token is 256 bits of randomness, so guessing is not the threat and slowness
// would only mean a refresh call that takes 100ms. What we need is that a stolen
// DATABASE cannot be turned back into tokens, and a one-way hash of a high-entropy
// secret gives exactly that.
const hashOf = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

const daysFromNow = (n) => new Date(Date.now() + n * 86400000);
// MySQL DATETIME wants 'YYYY-MM-DD HH:MM:SS'; an ISO string with its T and Z is
// accepted by some versions and silently mangled by others.
const sqlDateTime = (d) => new Date(d).toISOString().slice(0, 19).replace('T', ' ');

// The device string is for a human reading a future "your sessions" list. Truncated
// hard and never parsed — a User-Agent is attacker-controlled text.
const deviceOf = (req) => String((req && req.get && req.get('user-agent')) || '').slice(0, 200) || null;

// An access token for these claims. One place, so the four controllers that used to
// call jwt.sign by hand cannot drift on what a session token contains.
const signAccess = (claims, isGuest) => jwt.sign(
    claims,
    SECRET(),
    { expiresIn: isGuest ? GUEST_SESSION_TTL : SESSION_TTL }
);

// Start a session: an access token to use now, and a refresh token to get more.
//
// `kind` is 'owner' or 'tenant' and decides which table account_id points into. It is
// NOT derived from claims.role, because owner tokens carry no role at all — they
// predate roles existing — and inferring "not tenant therefore owner" from an absent
// field is the kind of guess that files a tenant's session under a landlord's id.
const issueSession = async ({ claims, kind, accountId, isGuest = false, req = null }) => {
    const refresh = newRefreshToken();
    const expires = daysFromNow(isGuest ? GUEST_REFRESH_TTL_DAYS : REFRESH_TTL_DAYS);
    try {
        await db.query(
            `INSERT INTO sessions (token_hash, account_kind, account_id, expires_at, device)
             VALUES (?, ?, ?, ?, ?)`,
            [hashOf(refresh), kind, accountId, sqlDateTime(expires), deviceOf(req)]
        );
    } catch (e) {
        // A sign-in that cannot write a session row must still sign the person in.
        // They get an access token with no refresh behind it — exactly the situation
        // every client was in before this existed — rather than an error on the one
        // screen whose whole job is getting them through the door.
        console.error('Could not store a refresh session (signing in without one):', e.message);
        return { token: signAccess(claims, isGuest), refresh: null, expires_at: null };
    }
    return {
        token: signAccess(claims, isGuest),
        refresh,
        refresh_expires_at: expires.toISOString()
    };
};

// Spend a refresh token and get a new pair.
//
// Returns a reason rather than throwing, because each outcome means something
// different to the client: `expired` and `revoked` mean sign in again, `unknown` means
// the same, and `reuse` means something is wrong and every session just ended.
const refreshSession = async (refreshToken, { req = null } = {}) => {
    const token = String(refreshToken || '').trim();
    // A length check before touching the database: a refresh token is 64 hex
    // characters, so anything else is noise and should not cost a query.
    if (!/^[0-9a-f]{64}$/.test(token)) return { ok: false, reason: 'unknown' };

    const hash = hashOf(token);
    const [rows] = await db.query(
        `SELECT id, account_kind, account_id, expires_at, replaced_at, revoked_at
           FROM sessions WHERE token_hash = ? LIMIT 1`,
        [hash]
    );
    if (!rows.length) return { ok: false, reason: 'unknown' };
    const row = rows[0];

    // A token that was already spent. Rotation means the honest client holds the
    // newest one, so this is a replay — and the only way to replay is to have a copy.
    // Everything for this account goes.
    if (row.replaced_at) {
        await revokeAllForAccount(row.account_kind, row.account_id, 'reuse');
        console.warn(`Refresh token reuse detected for ${row.account_kind} ${row.account_id} — all sessions revoked.`);
        return { ok: false, reason: 'reuse' };
    }
    if (row.revoked_at) return { ok: false, reason: 'revoked' };
    if (new Date(row.expires_at).getTime() <= Date.now()) return { ok: false, reason: 'expired' };

    // Who this is, read fresh. An account deleted since sign-in must not be able to
    // mint a new token off a row that outlived it.
    const who = await accountClaims(row.account_kind, row.account_id);
    if (!who) {
        await revokeAllForAccount(row.account_kind, row.account_id, 'gone');
        return { ok: false, reason: 'unknown' };
    }

    const next = newRefreshToken();
    const expires = daysFromNow(who.isGuest ? GUEST_REFRESH_TTL_DAYS : REFRESH_TTL_DAYS);

    const conn = await db.getConnection();
    try {
        // Both writes or neither. Marking the old one spent without storing the new
        // one would leave the client holding a token that is already dead, and the
        // next refresh would read as REUSE and revoke everything they have.
        await conn.beginTransaction();
        // Conditional on still being unspent, so two refreshes racing cannot both
        // succeed — the loser's UPDATE matches no rows and it rolls back.
        const [spent] = await conn.query(
            'UPDATE sessions SET replaced_at = NOW(), last_used_at = NOW() WHERE id = ? AND replaced_at IS NULL AND revoked_at IS NULL',
            [row.id]
        );
        if (!spent.affectedRows) {
            await conn.rollback();
            return { ok: false, reason: 'raced' };
        }
        await conn.query(
            `INSERT INTO sessions (token_hash, account_kind, account_id, expires_at, device)
             VALUES (?, ?, ?, ?, ?)`,
            [hashOf(next), row.account_kind, row.account_id, sqlDateTime(expires), deviceOf(req)]
        );
        await conn.commit();
    } catch (e) {
        await conn.rollback().catch(() => {});
        throw e;
    } finally {
        conn.release();
    }

    return {
        ok: true,
        token: signAccess(who.claims, who.isGuest),
        refresh: next,
        refresh_expires_at: expires.toISOString(),
        role: row.account_kind
    };
};

// What goes in an access token for this account, read from the account itself rather
// than carried along in the session row. A name or email changed since sign-in should
// be reflected, and a deleted account should produce nothing at all.
const accountClaims = async (kind, id) => {
    if (kind === 'owner') {
        const [rows] = await db.query('SELECT id, email FROM owners WHERE id = ? LIMIT 1', [id]);
        if (!rows.length) return null;
        // Deliberately no `role` for an owner. Owner tokens have never carried one —
        // requireOwner identifies a TENANT by role === 'tenant' and lets everything
        // else through — and adding one here would quietly change what every existing
        // owner token looks like.
        return { claims: { id: rows[0].id, email: rows[0].email }, isGuest: false };
    }
    const [rows] = await db.query('SELECT id, email, is_guest FROM tenant_users WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) return null;
    return {
        claims: { id: rows[0].id, email: rows[0].email, role: 'tenant' },
        isGuest: !!rows[0].is_guest
    };
};

// Sign out THIS device. Idempotent, and quiet about whether the token existed — a
// sign-out that reports "no such session" is a way to test whether one is live.
const revokeSession = async (refreshToken, reason = 'signout') => {
    const token = String(refreshToken || '').trim();
    if (!/^[0-9a-f]{64}$/.test(token)) return false;
    const [r] = await db.query(
        'UPDATE sessions SET revoked_at = NOW(), revoked_reason = ? WHERE token_hash = ? AND revoked_at IS NULL',
        [reason, hashOf(token)]
    );
    return r.affectedRows > 0;
};

// Sign out EVERYWHERE. What a password change and a stolen phone both need, and the
// thing that was impossible before this table existed.
const revokeAllForAccount = async (kind, accountId, reason = 'signout') => {
    const [r] = await db.query(
        `UPDATE sessions SET revoked_at = NOW(), revoked_reason = ?
          WHERE account_kind = ? AND account_id = ? AND revoked_at IS NULL`,
        [reason, kind, accountId]
    );
    return r.affectedRows;
};

// Housekeeping. Rows that are revoked or long expired are of no further use; keeping
// them for ever turns a table read on every refresh into a table scan over years of
// dead sessions. Spent-but-recent rows are KEPT on purpose — they are what makes
// reuse detectable.
const sweepSessions = async () => {
    try {
        const [r] = await db.query(
            `DELETE FROM sessions
              WHERE expires_at < (NOW() - INTERVAL 7 DAY)
                 OR (revoked_at IS NOT NULL AND revoked_at < (NOW() - INTERVAL 30 DAY))`
        );
        if (r.affectedRows) console.log(`🧹 Swept ${r.affectedRows} dead session row(s).`);
        return r.affectedRows;
    } catch (e) {
        console.error('Session sweep failed:', e.message);
        return 0;
    }
};

module.exports = {
    issueSession,
    refreshSession,
    revokeSession,
    revokeAllForAccount,
    sweepSessions,
    // Exported for tests, which need to assert that what is STORED is not the token.
    hashOf
};
