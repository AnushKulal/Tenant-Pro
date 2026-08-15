// File: backend/services/pushService.js
//
// Delivering a push to a person's devices, via Expo.
//
// The copy and the audience rules live in utils/pushRules.js, which is pure and
// tested. This file is the tokens, the HTTP call, and the cleanup.
//
// ── Three things this guarantees ───────────────────────────────────────────────
//
// 1. A send NEVER throws into the caller. Every call site is a request that already
//    succeeded — the ID was requested, the payment was confirmed, the notice was
//    given. Losing that because Expo was slow, or the network blinked, would be a far
//    worse bug than a missing notification. Failures are logged and swallowed.
//
// 2. A message only reaches its declared audience. `buildPush` stamps every kind with
//    'owner' or 'tenant', and the token lookup filters on that role. A caller passing
//    an owner id to a tenant-facing kind gets nothing sent, not a landlord's phone
//    buzzing with another tenant's rent.
//
// 3. Dead tokens are pruned. Expo answers per-message; a DeviceNotRegistered means the
//    app was uninstalled or the token rotated, and keeping it means retrying a dead
//    handset forever.

const db = require('../config/db');
const { buildPush, isExpoToken } = require('../utils/pushRules');

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';
// Expo's documented cap per request. Sending more in one POST is rejected outright.
const CHUNK = 100;
// Short on purpose. This runs inside a request the user is waiting on, so a slow push
// service must not become a slow app.
const TIMEOUT_MS = 8000;

// Whether pushes can be delivered at all. Reported by /healthz next to uploads and
// google, so "did my tenant get told" has an answer that is not a guess.
//
// There is nothing to configure — Expo's push endpoint needs no key for tokens issued
// to our own project — so this is really "is there anywhere to send to yet".
const pushMode = async () => {
    try {
        const [[row]] = await db.query('SELECT COUNT(*) AS n FROM push_tokens');
        const n = Number(row.n) || 0;
        return n > 0 ? `ready (${n} ${n === 1 ? 'device' : 'devices'})` : 'no devices registered yet';
    } catch (err) {
        return 'unavailable';
    }
};

// Store or refresh a device's token.
//
// Upsert on the token rather than on the account: the same handset can be signed into
// a different account after a reinstall, and the row must follow the DEVICE. Without
// this a tenant who hands their old phone on would keep receiving the new owner's
// notifications, or vice versa.
const registerToken = async ({ role, accountId, token, platform }) => {
    if (!isExpoToken(token)) return { ok: false, reason: 'BAD_TOKEN' };
    if (!['owner', 'tenant'].includes(role) || !accountId) return { ok: false, reason: 'BAD_ACCOUNT' };
    await db.query(
        `INSERT INTO push_tokens (role, account_id, token, platform)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            role = VALUES(role),
            account_id = VALUES(account_id),
            platform = VALUES(platform),
            last_seen_at = CURRENT_TIMESTAMP`,
        [role, accountId, String(token).trim(), platform ? String(platform).slice(0, 16) : null]
    );
    return { ok: true };
};

// Forget a device. Called on sign-out, so the next person to use the handset does not
// inherit the last person's notifications.
const forgetToken = async (token) => {
    if (!token) return 0;
    const [r] = await db.query('DELETE FROM push_tokens WHERE token = ?', [String(token).trim()]);
    return r.affectedRows || 0;
};

// Every device belonging to this account, in this role.
//
// Joined back to the account rather than read straight off push_tokens. The table
// carries no foreign key — its rows point at one of TWO tables and MySQL cannot express
// that — so deleting a landlord or a tenant leaves their tokens behind. The join is
// what makes those leftovers inert: a token whose account no longer exists is never
// sent to, and the sweep below can clear it at leisure.
//
// It does NOT defend against an id being reused by a later account. MySQL does not
// recycle auto_increment ids in normal operation, so that needs the table to have been
// truncated or restored — at which point the tokens are stale anyway.
const tokensFor = async (role, accountId) => {
    const table = role === 'tenant' ? 'tenant_users' : 'owners';
    const [rows] = await db.query(
        `SELECT p.token
         FROM push_tokens p
         JOIN ${table} a ON a.id = p.account_id
         WHERE p.role = ? AND p.account_id = ?`,
        [role, accountId]
    );
    return rows.map((r) => r.token).filter(isExpoToken);
};

// Drop tokens whose account is gone. Cheap, and worth running on boot: without a
// foreign key nothing else ever removes them, and they would otherwise accumulate for
// the life of the database.
const sweepOrphanTokens = async () => {
    try {
        const [r] = await db.query(
            `DELETE p FROM push_tokens p
             LEFT JOIN tenant_users t ON p.role = 'tenant' AND t.id = p.account_id
             LEFT JOIN owners o       ON p.role = 'owner'  AND o.id = p.account_id
             WHERE t.id IS NULL AND o.id IS NULL`
        );
        const n = r.affectedRows || 0;
        if (n) console.log(`push: swept ${n} token(s) whose account is gone`);
        return n;
    } catch (err) {
        console.error('push: orphan sweep failed -', err.message);
        return 0;
    }
};

const postChunk = async (messages) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(EXPO_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(messages),
            signal: ctl.signal
        });
        if (!res.ok) return { data: [], httpError: `${res.status}` };
        const json = await res.json().catch(() => null);
        return { data: (json && json.data) || [] };
    } finally {
        clearTimeout(timer);
    }
};

// Expo answers with one ticket per message, in order. A ticket can be an error even
// though the POST returned 200, which is the case worth handling — DeviceNotRegistered
// is how we learn an app was uninstalled, and it arrives nowhere else.
const reapDeadTokens = async (tickets, tokens) => {
    const dead = [];
    tickets.forEach((t, i) => {
        const code = t && t.details && t.details.error;
        if (t && t.status === 'error' && code === 'DeviceNotRegistered' && tokens[i]) {
            dead.push(tokens[i]);
        }
    });
    if (!dead.length) return 0;
    try {
        const [r] = await db.query('DELETE FROM push_tokens WHERE token IN (?)', [dead]);
        return r.affectedRows || 0;
    } catch (err) {
        console.error('push: could not prune dead tokens -', err.message);
        return 0;
    }
};

// Send one kind of notification to one account.
//
//   role      'owner' | 'tenant' — must match the kind's declared audience
//   accountId owners.id or tenant_users.id
//   kind      a key from pushRules
//   data      whatever that kind's copy reads
//
// Returns a small report rather than throwing. Nothing upstream should branch on it
// beyond logging: a notification is a courtesy on top of state that is already saved
// and already visible in the app.
const sendTo = async ({ role, accountId, kind, data = {} }) => {
    try {
        const msg = buildPush(kind, data);
        // An unknown kind builds nothing. Better to send silence than a push with
        // placeholder text that the reader cannot act on or ask about.
        if (!msg) {
            console.error(`push: unknown kind "${kind}" — nothing sent`);
            return { sent: 0, reason: 'UNKNOWN_KIND' };
        }
        // The audience check. See the header — this is the one that stops a landlord's
        // message reaching a tenant when a caller passes the wrong id.
        // 'any' is the test message and nothing else — see pushRules' AUDIENCE.
        if (msg.audience !== 'any' && msg.audience !== role) {
            console.error(`push: "${kind}" is for ${msg.audience}, refused for ${role}`);
            return { sent: 0, reason: 'WRONG_AUDIENCE' };
        }

        const tokens = await tokensFor(role, accountId);
        // Nobody has installed a build that can receive pushes yet. Not an error, and
        // the commonest case until an APK with the native module is out.
        if (!tokens.length) return { sent: 0, reason: 'NO_DEVICES' };

        let sent = 0;
        let pruned = 0;
        for (let i = 0; i < tokens.length; i += CHUNK) {
            const slice = tokens.slice(i, i + CHUNK);
            const { data: tickets, httpError } = await postChunk(slice.map((to) => ({
                to,
                title: msg.title,
                body: msg.body,
                data: msg.data,
                sound: 'default',
                // Android needs a channel or the notification is silent and low
                // priority; the app creates one with this id at registration.
                channelId: 'default'
            })));
            if (httpError) {
                console.error(`push: Expo returned HTTP ${httpError} for ${kind}`);
                continue;
            }
            sent += tickets.filter((t) => t && t.status === 'ok').length;
            pruned += await reapDeadTokens(tickets, slice);
        }
        return { sent, pruned };
    } catch (err) {
        // Swallowed on purpose — see the header. The thing this notification is ABOUT
        // has already been saved.
        console.error(`push: send failed for ${kind} -`, err.message);
        return { sent: 0, reason: 'FAILED' };
    }
};

// Fire and forget. The form call sites should use: the request that triggered it must
// not wait on Expo, and must not fail if Expo does.
const notify = (args) => {
    sendTo(args).then((r) => {
        if (r && r.sent) console.log(`push: ${args.kind} → ${r.sent} device(s)${r.pruned ? `, pruned ${r.pruned}` : ''}`);
    }).catch(() => {});
};

// Notify the person living in a tenancy, whoever that turns out to be signed in as.
//
// A `tenants` row is a PLACE — a person in a room — while a push goes to an ACCOUNT.
// The two are not one-to-one: usually one account, occasionally two when somebody
// registered twice and the landlord linked both, and none at all for a tenant the
// landlord typed in who has never installed the app. Every tenant-facing call site has
// the tenancy id to hand and none of them should have to know that, so the fan-out
// lives here rather than being copied five times.
//
// Zero accounts is silence, not an error. There is genuinely nowhere to send, and the
// thing being announced is on their screen the next time they open it.
//
// Fire-and-forget like `notify`: never awaited, never throws.
const notifyTenancy = ({ tenantId, kind, data = {} }) => {
    if (!tenantId) return;
    db.query('SELECT id FROM tenant_users WHERE tenant_id = ?', [tenantId])
        .then(([accounts]) => {
            for (const a of accounts) notify({ role: 'tenant', accountId: a.id, kind, data });
        })
        .catch((err) => {
            console.error(`push: could not resolve accounts for tenancy ${tenantId} -`, err.message);
        });
};

module.exports = {
    registerToken, forgetToken, sendTo, notify, notifyTenancy, pushMode, tokensFor, sweepOrphanTokens
};
