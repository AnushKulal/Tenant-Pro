// File: backend/services/verifyService.js
//
// Proving somebody holds the phone number or email address they just typed.
//
// ── Why a profile edit needs this and a name edit does not ─────────────────────
// `owners.phone` and `owners.email` are SIGN-IN IDENTIFIERS. Login matches on them,
// password reset sends a code to them, and the tenant phone-match links an account to a
// landlord's records by number. Changing your name changes a label; changing your phone
// number changes WHO CAN SIGN IN AS YOU — and, if the number belongs to somebody else,
// puts your account in front of their landlord as them.
//
// So a new value does not go onto the account when it is typed. It waits in
// contact_verifications until a code sent TO IT comes back.
//
// ── What this deliberately does not do ─────────────────────────────────────────
// It does not fall back to "allow it anyway" when a channel cannot send. An
// unverifiable change is refused, and the caller is told which channel is down. The
// alternative — accept the change, skip the proof — is the failure this whole file
// exists to prevent, arrived at by accident.

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { sendAppMail, isMailConfigured } = require('../config/mailer');
const { sendSms, isSmsConfigured } = require('./smsService');
const { normalisePhone } = require('../utils/tenantMatch');

// Long enough that guessing is impractical inside the window, short enough to read off
// a lock screen and type. Brute force is bounded by MAX_ATTEMPTS, not by length.
const CODE_LENGTH = 6;
const TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
// A new request within this window reuses nothing and simply supersedes the old row —
// but it is rate-limited so the endpoint cannot be used to send somebody a stream of
// texts they did not ask for.
const RESEND_SECONDS = 60;

// crypto.randomInt, not Math.random: this is a credential, and Math.random is
// predictable enough to enumerate given a few samples.
const makeCode = () => String(crypto.randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');

// What actually gets stored and compared. A phone is normalised so a code sent to
// 9876543210 cannot be redeemed against "+919876543210" as though it were a different
// number — the same reconciliation utils/tenantMatch.js does everywhere else.
const canonical = (channel, value) => {
    const raw = String(value || '').trim();
    if (channel === 'phone') return normalisePhone(raw);
    const email = raw.toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
};

// Whether this channel can carry a code at all, right now.
const channelReady = (channel) => (channel === 'phone' ? isSmsConfigured() : isMailConfigured);

const deliver = async (channel, value, code) => {
    if (channel === 'phone') {
        return sendSms(value, `${code} is your TenantPro verification code. It expires in ${TTL_MINUTES} minutes. If you did not ask for this, ignore it.`);
    }
    try {
        await sendAppMail({
            to: value,
            subject: `${code} is your TenantPro verification code`,
            html: `<p>Use this code to confirm this email address on your TenantPro account:</p>
                   <p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:18px 0;">${code}</p>
                   <p>It expires in ${TTL_MINUTES} minutes. If you did not ask for this, you can ignore this email — nothing has changed on your account.</p>`
        });
        return { ok: true };
    } catch (err) {
        console.error('verify: email send failed -', err.message);
        return { ok: false, reason: 'FAILED' };
    }
};

// Start proving a value. Returns { ok } or { ok: false, code, message }.
//
// The reasons are distinct on purpose: "we cannot send to phones at all" and "wait a
// minute before asking again" have completely different fixes, and a single generic
// failure would send somebody retrying a thing that can never work.
const requestCode = async ({ role, accountId, channel, value }) => {
    const canon = canonical(channel, value);
    if (!canon) {
        return { ok: false, code: 'BAD_VALUE', message: channel === 'phone'
            ? 'That does not look like a mobile number.'
            : 'That does not look like an email address.' };
    }
    if (!channelReady(channel)) {
        return { ok: false, code: 'CHANNEL_DOWN', message: channel === 'phone'
            ? 'Text messages are not switched on for this server yet, so a new number cannot be confirmed. Your other changes were saved.'
            : 'Email is not configured on this server yet, so a new address cannot be confirmed. Your other changes were saved.' };
    }

    // Not a security control — a code is proof of holding the ADDRESS, and asking twice
    // proves nothing extra. It stops this endpoint being used to text somebody
    // repeatedly, which costs money and is somebody else's phone buzzing.
    const [recent] = await db.query(
        `SELECT created_at FROM contact_verifications
          WHERE role = ? AND account_id = ? AND channel = ? AND consumed_at IS NULL
            AND created_at > (NOW() - INTERVAL ? SECOND)
          ORDER BY id DESC LIMIT 1`,
        [role, accountId, channel, RESEND_SECONDS]
    );
    if (recent.length) {
        return { ok: false, code: 'TOO_SOON', message: 'A code was just sent. Wait a minute before asking for another.' };
    }

    const code = makeCode();
    const hash = await bcrypt.hash(code, 10);

    // Any earlier pending request for this channel is dead the moment a new one is
    // made — otherwise an older code stays redeemable against a value the person has
    // since changed their mind about.
    await db.query(
        `UPDATE contact_verifications SET consumed_at = NOW()
          WHERE role = ? AND account_id = ? AND channel = ? AND consumed_at IS NULL`,
        [role, accountId, channel]
    );
    await db.query(
        `INSERT INTO contact_verifications (role, account_id, channel, value, code_hash, expires_at)
         VALUES (?, ?, ?, ?, ?, (NOW() + INTERVAL ? MINUTE))`,
        [role, accountId, channel, canon, hash, TTL_MINUTES]
    );

    const sent = await deliver(channel, canon, code);
    if (!sent.ok) {
        // Burn the row. Leaving a live code behind for a message that never arrived
        // means the only way to use it is to guess it.
        await db.query(
            `UPDATE contact_verifications SET consumed_at = NOW()
              WHERE role = ? AND account_id = ? AND channel = ? AND consumed_at IS NULL`,
            [role, accountId, channel]
        );
        return { ok: false, code: 'SEND_FAILED', message: 'Could not send the code just now. Try again in a moment.' };
    }
    return { ok: true, sentTo: canon, expiresInMinutes: TTL_MINUTES };
};

// Redeem a code. Returns { ok, value } — the CANONICAL value that was proved, which is
// what the caller should write; taking the value from the request body instead would
// let somebody verify one address and save another.
const confirmCode = async ({ role, accountId, channel, code }) => {
    const [rows] = await db.query(
        `SELECT id, value, code_hash, attempts, expires_at
           FROM contact_verifications
          WHERE role = ? AND account_id = ? AND channel = ? AND consumed_at IS NULL
          ORDER BY id DESC LIMIT 1`,
        [role, accountId, channel]
    );
    if (!rows.length) {
        return { ok: false, code: 'NONE_PENDING', message: 'Nothing is waiting to be confirmed. Ask for a new code.' };
    }
    const row = rows[0];

    if (new Date(row.expires_at).getTime() <= Date.now()) {
        await db.query('UPDATE contact_verifications SET consumed_at = NOW() WHERE id = ?', [row.id]);
        return { ok: false, code: 'EXPIRED', message: 'That code has expired. Ask for a new one.' };
    }
    if (row.attempts >= MAX_ATTEMPTS) {
        await db.query('UPDATE contact_verifications SET consumed_at = NOW() WHERE id = ?', [row.id]);
        return { ok: false, code: 'TOO_MANY', message: 'Too many wrong codes. Ask for a new one.' };
    }

    const match = await bcrypt.compare(String(code || '').trim(), row.code_hash);
    if (!match) {
        // Counted BEFORE answering, so a failed attempt is recorded even if the caller
        // hangs up on the response.
        await db.query('UPDATE contact_verifications SET attempts = attempts + 1 WHERE id = ?', [row.id]);
        const left = MAX_ATTEMPTS - (row.attempts + 1);
        return { ok: false, code: 'WRONG_CODE', message: left > 0
            ? `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.`
            : 'That code is not right, and that was the last try. Ask for a new one.' };
    }

    // Single use.
    await db.query('UPDATE contact_verifications SET consumed_at = NOW() WHERE id = ?', [row.id]);
    return { ok: true, value: row.value };
};

// Housekeeping. Rows are tiny but they accumulate, and a consumed or expired row has no
// further purpose. Run on boot next to the push-token sweep.
const sweepVerifications = async () => {
    try {
        const [r] = await db.query(
            `DELETE FROM contact_verifications
              WHERE consumed_at IS NOT NULL OR expires_at < (NOW() - INTERVAL 1 DAY)`
        );
        const n = r.affectedRows || 0;
        if (n) console.log(`verify: swept ${n} finished verification(s)`);
        return n;
    } catch (err) {
        console.error('verify: sweep failed -', err.message);
        return 0;
    }
};

module.exports = { requestCode, confirmCode, canonical, channelReady, sweepVerifications, TTL_MINUTES, MAX_ATTEMPTS };
