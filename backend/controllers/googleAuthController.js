// File: backend/controllers/googleAuthController.js
//
// The three endpoints behind "Continue with Google".
//
//   POST /api/auth/google/start      app asks for a consent URL
//   GET  /api/auth/google/callback   Google returns the browser here
//   POST /api/auth/google/poll       app collects the result
//
// ── WHY POLLING AND NOT A DEEP LINK ────────────────────────────────────────────
// A deep link back into the app needs a custom URL scheme, which is compiled into
// the Android manifest — a new APK before anybody could use this. Polling needs
// nothing the installed build does not already have. See config/googleAuth.js.
//
// ── THE TWO SECRETS, AND WHY THERE ARE TWO ─────────────────────────────────────
// `state` travels to Google and comes back in a browser URL, so it lands in browser
// history, in Google's logs and in ours. It cannot be the thing that authorises
// collecting a session token.
//
// So the app generates a SECOND secret, `claim`, and never sends it anywhere except
// straight to this server over HTTPS when it polls. Somebody reading the browser
// history has the state and still cannot claim the session. Same property PKCE
// gives, without needing a hash function the app does not have.
//
// Both are single-use and expire in ten minutes.

const crypto = require('crypto');
const db = require('../config/db');
const jwt = require('jsonwebtoken');
const { googleConfigured, googleMissing, authUrl, exchangeCode } = require('../config/googleAuth');

const SESSION_TTL_MS = 10 * 60 * 1000;

// 403, not 404: the route exists and the server is working — the deployment is
// missing a credential. A 404 would send somebody hunting for a typo in the URL.
const notConfigured = (res) => {
    const missing = googleMissing();
    return res.status(403).json({
        code: 'GOOGLE_NOT_CONFIGURED',
        // Names what to set without revealing whether the others hold real values.
        message: `Google sign-in is not set up on this server (missing ${missing.join(', ')}).`
    });
};

const randomToken = () => crypto.randomBytes(32).toString('hex');

// Housekeeping, run on the way past rather than on a timer: an expired row is
// harmless but it is also a stored secret, and the cheapest place to delete it is
// the request that was already touching the table.
const sweepExpired = async () => {
    try {
        await db.query('DELETE FROM oauth_sessions WHERE expires_at < NOW()');
    } catch (e) { /* housekeeping must never fail a sign-in */ }
};

// POST /api/auth/google/start   { role: 'owner' | 'tenant' }
const startGoogle = async (req, res) => {
    if (!googleConfigured()) return notConfigured(res);
    try {
        // Anything that is not 'tenant' is an owner, matching how the reset flow
        // resolves its target. The role decides WHICH TABLE the account lives in,
        // so it cannot be inferred later — it has to be captured now, before the
        // browser leaves.
        const role = req.body?.role === 'tenant' ? 'tenant' : 'owner';
        const state = randomToken();
        const claim = randomToken();

        await sweepExpired();
        await db.query(
            `INSERT INTO oauth_sessions (state, claim, role, status, expires_at)
             VALUES (?, ?, ?, 'pending', DATE_ADD(NOW(), INTERVAL 10 MINUTE))`,
            [state, claim, role]
        );

        res.status(200).json({
            // The app keeps `claim` and never puts it in a URL.
            claim,
            auth_url: authUrl(state),
            // So the app stops polling at the same moment the server stops caring.
            expires_in: Math.round(SESSION_TTL_MS / 1000)
        });
    } catch (error) {
        console.error('Google start failed:', error.message);
        res.status(500).json({ message: 'Could not start Google sign-in.' });
    }
};

// A tiny page for the browser tab the person is looking at. Deliberately plain
// text-ish HTML with no assets: it is on screen for a couple of seconds and any
// external reference would just be a way for it to render broken.
const closingPage = (title, detail, tone) => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TenantPro</title></head>
<body style="margin:0;background:#0B0B0F;color:#F4F3F7;font-family:system-ui,-apple-system,sans-serif;
display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px">
<div style="max-width:340px;text-align:center">
<div style="font-size:44px;line-height:1;margin-bottom:18px">${tone}</div>
<h1 style="font-size:21px;margin:0 0 10px;letter-spacing:-0.5px">${title}</h1>
<p style="font-size:14px;line-height:1.55;color:#A5A3B0;margin:0">${detail}</p>
</div></body></html>`;

// GET /api/auth/google/callback?code=&state=
//
// Google sends a BROWSER here, not the app, so every outcome has to be a readable
// page rather than JSON. The app learns what happened by polling.
const googleCallback = async (req, res) => {
    const send = (code, title, detail, tone) =>
        res.status(code).type('html').send(closingPage(title, detail, tone));

    if (!googleConfigured()) {
        return send(403, 'Google sign-in is not set up', 'This server has no Google credentials configured.', '⚙️');
    }

    const state = String(req.query.state || '');
    const code = String(req.query.code || '');

    // The person pressed Cancel on the consent screen. Not an error — mark the
    // session so the app stops waiting instead of spinning for ten minutes.
    if (req.query.error) {
        if (state) {
            await db.query(
                "UPDATE oauth_sessions SET status = 'failed', detail = ? WHERE state = ? AND status = 'pending'",
                ['Sign-in was cancelled.', state]
            ).catch(() => {});
        }
        return send(200, 'Sign-in cancelled', 'Nothing has changed. You can close this tab and return to TenantPro.', '👋');
    }

    if (!state || !code) {
        return send(400, 'Something went wrong', 'That link is incomplete. Please start again from the app.', '⚠️');
    }

    try {
        const [rows] = await db.query(
            "SELECT id, role, status FROM oauth_sessions WHERE state = ? AND expires_at > NOW()",
            [state]
        );
        const session = rows[0];
        // Unknown or expired state. Also what a replayed callback looks like, since
        // the row is consumed on success — so this is the CSRF refusal too.
        if (!session || session.status !== 'pending') {
            return send(400, 'That sign-in has expired', 'Please start again from the app.', '⌛');
        }

        const result = await exchangeCode(code);
        if (!result.ok) {
            await db.query("UPDATE oauth_sessions SET status = 'failed', detail = ? WHERE id = ?", [result.reason, session.id]);
            return send(400, 'Could not sign you in', result.reason, '⚠️');
        }

        const resolved = await resolveAccount(result.identity, session.role);
        if (!resolved.ok) {
            await db.query("UPDATE oauth_sessions SET status = 'failed', detail = ? WHERE id = ?", [resolved.reason, session.id]);
            return send(409, 'Could not sign you in', resolved.reason, '⚠️');
        }

        // Ready to collect. The payload is stored rather than the JWT so that a
        // token is only minted at the moment the app proves it holds `claim`.
        await db.query(
            "UPDATE oauth_sessions SET status = 'ready', identity = ? WHERE id = ?",
            [JSON.stringify({ ...result.identity, outcome: resolved }), session.id]
        );

        return send(200, resolved.needsProfile ? 'Almost there' : 'You are signed in',
            resolved.needsProfile
                ? 'Return to TenantPro to finish setting up your account.'
                : 'Return to TenantPro — you can close this tab.',
            '✅');
    } catch (error) {
        console.error('Google callback failed:', error.message);
        return send(500, 'Something went wrong', 'Please try again from the app.', '⚠️');
    }
};

// Find the account this Google identity belongs to, or say what is needed.
//
// Three outcomes, and the difference between them matters:
//
//   * bound      — a row already carries this google_sub. Sign in, no questions.
//   * linked     — no google_sub, but an account exists with this verified email.
//                  Bind them. Safe ONLY because checkIdentity refused unverified
//                  addresses; without that this would be account takeover by
//                  signing up to Google with somebody else's address.
//   * needsProfile — nobody has this email. An account cannot be created from what
//                  Google supplies, because both tables require a phone number that
//                  Google does not have and this app genuinely needs — a landlord
//                  rings their tenant, and rent reminders go out by SMS. So the app
//                  finishes the job with one more field.
const resolveAccount = async (identity, role) => {
    const table = role === 'tenant' ? 'tenant_users' : 'owners';
    const other = role === 'tenant' ? 'owners' : 'tenant_users';

    const [bySub] = await db.query(`SELECT id, name, email, phone FROM ${table} WHERE google_sub = ? LIMIT 1`, [identity.sub]);
    if (bySub[0]) {
        return { ok: true, kind: 'bound', role, id: bySub[0].id, needsProfile: false };
    }

    const [byEmail] = await db.query(`SELECT id, name, email, phone FROM ${table} WHERE email = ? LIMIT 1`, [identity.email]);
    if (byEmail[0]) {
        await db.query(`UPDATE ${table} SET google_sub = ? WHERE id = ?`, [identity.sub, byEmail[0].id]);
        return { ok: true, kind: 'linked', role, id: byEmail[0].id, needsProfile: false };
    }

    // The two portals stay mutually exclusive, exactly as registerOwner enforces:
    // one address belongs to a landlord account OR a tenant account, never both.
    // Without this check, Google sign-in would be a side door around a rule the
    // registration form spells out.
    const [cross] = await db.query(`SELECT id FROM ${other} WHERE email = ? LIMIT 1`, [identity.email]);
    if (cross[0]) {
        return {
            ok: false,
            reason: role === 'tenant'
                ? 'That email is already used for a landlord account. Sign in through the landlord portal instead.'
                : 'That email is already used for a tenant account. Sign in through the tenant portal instead.'
        };
    }

    return { ok: true, kind: 'new', role, id: null, needsProfile: true };
};

// Mint the app's own session token. Same shape and lifetime the password path
// issues, so nothing downstream can tell the two apart — a social login that
// produced a subtly different token would break in some unrelated place months later.
const issueToken = (id, email, role) => jwt.sign(
    role === 'tenant' ? { id, email, role: 'tenant' } : { id, email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
);

// POST /api/auth/google/poll   { claim }
//
// Called every couple of seconds while the browser is open. Answers:
//   { status: 'pending' }                   keep waiting
//   { status: 'failed', message }           stop, and say why
//   { status: 'ready', token, owner|tenant }signed in
//   { status: 'profile', google: {...} }    needs a phone number first
const pollGoogle = async (req, res) => {
    if (!googleConfigured()) return notConfigured(res);
    try {
        const claim = String(req.body?.claim || '');
        if (!claim) return res.status(400).json({ message: 'Missing claim.' });

        const [rows] = await db.query(
            'SELECT id, role, status, detail, identity FROM oauth_sessions WHERE claim = ? AND expires_at > NOW() LIMIT 1',
            [claim]
        );
        const session = rows[0];
        // Expired, unknown, or already collected. Single-use is the point: a claim
        // that keeps working is a bearer token with a ten-minute life and no owner.
        if (!session) {
            return res.status(410).json({ status: 'expired', message: 'That sign-in attempt has expired. Please try again.' });
        }
        if (session.status === 'pending') return res.status(200).json({ status: 'pending' });

        if (session.status === 'failed') {
            await db.query('DELETE FROM oauth_sessions WHERE id = ?', [session.id]);
            return res.status(200).json({ status: 'failed', message: session.detail || 'Google sign-in did not complete.' });
        }

        const stored = typeof session.identity === 'string' ? JSON.parse(session.identity) : (session.identity || {});
        const outcome = stored.outcome || {};

        if (outcome.needsProfile) {
            // No token — nothing exists yet to hold a session, and a token whose
            // `id` points at no row would fail in some unrelated place later.
            //
            // The row is KEPT, not consumed. completeGoogle re-reads the verified
            // email and sub from it, server-side. The alternative — handing the app
            // the email and sub and taking them back on the next request — would let
            // anyone POST an arbitrary address to /complete and create an account
            // bound to a Google identity they do not own. The email is echoed here
            // only so the app can SHOW whose account it is about to create.
            //
            // Status moves off 'pending' so a poll that arrives twice does not read
            // as still waiting.
            await db.query("UPDATE oauth_sessions SET status = 'profile' WHERE id = ?", [session.id]);
            return res.status(200).json({
                status: 'profile',
                role: session.role,
                google: { email: stored.email, name: stored.name || '' }
            });
        }

        // Consumed: the browser half is finished and this row is a stored secret
        // with no further use.
        await db.query('DELETE FROM oauth_sessions WHERE id = ?', [session.id]);

        const table = session.role === 'tenant' ? 'tenant_users' : 'owners';
        const [accs] = await db.query(
            `SELECT id, name, email, phone${table === 'owners' ? ', profile_pic' : ''} FROM ${table} WHERE id = ? LIMIT 1`,
            [outcome.id]
        );
        const acc = accs[0];
        // Deleted between the callback and the poll. Vanishingly rare, and a 500
        // here would be a lie — nothing is broken, the account is gone.
        if (!acc) return res.status(404).json({ status: 'failed', message: 'That account no longer exists.' });

        const token = issueToken(acc.id, acc.email, session.role);
        return res.status(200).json({
            status: 'ready',
            token,
            [session.role === 'tenant' ? 'tenant' : 'owner']: {
                id: acc.id,
                name: acc.name,
                email: acc.email,
                phone: acc.phone || null,
                profile_pic: acc.profile_pic || null
            }
        });
    } catch (error) {
        console.error('Google poll failed:', error.message);
        res.status(500).json({ message: 'Could not complete Google sign-in.' });
    }
};

// POST /api/auth/google/complete   { claim, phone }
//
// Creates the account for a first-time Google sign-in. The ONLY thing taken from
// the request is the phone number — the name, email and Google subject all come
// from the session row this server wrote after Google vouched for them. Trusting a
// client-supplied email here would make this endpoint an account-creation forgery:
// post somebody else's address, get an account bound to their Google identity.
const completeGoogle = async (req, res) => {
    if (!googleConfigured()) return notConfigured(res);
    try {
        const claim = String(req.body?.claim || '');
        const phone = String(req.body?.phone || '').trim();
        if (!claim) return res.status(400).json({ message: 'Missing claim.' });
        if (!phone) return res.status(400).json({ field: 'phone', message: 'Enter your mobile number.' });
        // Deliberately loose: Indian mobile numbers are ten digits, but people paste
        // them with +91, spaces and hyphens, and rejecting those teaches nothing.
        const digits = phone.replace(/[^0-9]/g, '');
        if (digits.length < 10) {
            return res.status(400).json({ field: 'phone', message: 'That mobile number looks too short.' });
        }

        const [rows] = await db.query(
            "SELECT id, role, identity FROM oauth_sessions WHERE claim = ? AND status = 'profile' AND expires_at > NOW() LIMIT 1",
            [claim]
        );
        const session = rows[0];
        if (!session) {
            return res.status(410).json({ status: 'expired', message: 'That sign-in attempt has expired. Please start again.' });
        }

        const stored = typeof session.identity === 'string' ? JSON.parse(session.identity) : (session.identity || {});
        const role = session.role === 'tenant' ? 'tenant' : 'owner';
        const table = role === 'tenant' ? 'tenant_users' : 'owners';
        const other = role === 'tenant' ? 'owners' : 'tenant_users';

        // The phone number is new information Google never saw, so the uniqueness
        // rules the registration form enforces have to be applied here too — in both
        // tables, because one number belongs to a landlord or a tenant, never both.
        const [clash] = await db.query(`SELECT id FROM ${table} WHERE phone = ? LIMIT 1`, [digits]);
        if (clash[0]) {
            return res.status(409).json({ field: 'phone', message: 'That mobile number is already registered.' });
        }
        const [crossClash] = await db.query(`SELECT id FROM ${other} WHERE phone = ? LIMIT 1`, [digits]);
        if (crossClash[0]) {
            return res.status(409).json({
                field: 'phone',
                message: role === 'tenant'
                    ? 'That mobile number is already used for a landlord account.'
                    : 'That mobile number is already used for a tenant account.'
            });
        }

        // password_hash stays NULL. This account signs in with Google and has no
        // password to compare — which is why the column had to become nullable, and
        // why loginOwner must refuse a NULL hash rather than hand it to bcrypt.
        const name = stored.name || stored.email.split('@')[0];
        const [ins] = await db.query(
            `INSERT INTO ${table} (name, email, phone, google_sub) VALUES (?, ?, ?, ?)`,
            [name, stored.email, digits, stored.sub]
        );

        await db.query('DELETE FROM oauth_sessions WHERE id = ?', [session.id]);

        const token = issueToken(ins.insertId, stored.email, role);
        return res.status(201).json({
            status: 'ready',
            token,
            [role === 'tenant' ? 'tenant' : 'owner']: {
                id: ins.insertId,
                name,
                email: stored.email,
                phone: digits,
                profile_pic: null
            }
        });
    } catch (error) {
        console.error('Google complete failed:', error.message);
        res.status(500).json({ message: 'Could not finish creating your account.' });
    }
};

module.exports = { startGoogle, googleCallback, pollGoogle, completeGoogle, resolveAccount, issueToken };
