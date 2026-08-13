// File: backend/config/googleAuth.js
//
// Google sign-in, done entirely on the server.
//
// ── WHY THE SERVER RUNS THE FLOW AND NOT THE APP ───────────────────────────────
// The usual recipe is expo-auth-session in the app. It needs two things this app
// does not have: a native module (so it cannot reach an already-installed build
// over the air) and a custom URL scheme in app.json (compiled into the Android
// manifest, so also a rebuild). Between them that is a new APK before a single
// person can press the button — the same trap that left "Use my current location"
// dead for two days.
//
// So the app never speaks to Google. It asks this server for a URL, opens it with
// React Native's own Linking (already compiled into every build), and then polls.
// The authorization code is exchanged here, which is where a client secret is
// allowed to exist — an app cannot keep one, which is exactly why Google's mobile
// clients have none and need PKCE instead.
//
// The one real cost is that the browser does not close itself and the user taps
// back to the app. That is a fair trade for shipping today, and a deep link can be
// layered on later as a pure optimisation without changing anything here.
//
// ── WHY ONE CREDENTIAL AND NOT FOUR ────────────────────────────────────────────
// Because the redirect target is this server, a single **Web application** OAuth
// client covers Android and iOS both. No Android client ID, no release-keystore
// SHA-1 fingerprint, no separate iOS client — the four things that make Google
// sign-in a half-day of console work.
//
// ── FAILS CLOSED ───────────────────────────────────────────────────────────────
// Unset credentials mean the endpoints refuse and the app hides the button. A
// half-configured OAuth flow that renders an inviting button and then dead-ends is
// worse than no button, because the person pressing it concludes the app is broken.

const https = require('https');

// Read at call time, never captured at module load: an env var added in the Render
// dashboard arrives with a restart, and a value snapshotted into a const at import
// time is a value that cannot be corrected without a code change.
const clientId = () => String(process.env.GOOGLE_CLIENT_ID || '').trim();
const clientSecret = () => String(process.env.GOOGLE_CLIENT_SECRET || '').trim();

// Where Google sends the browser back. Must match a redirect URI registered on the
// OAuth client EXACTLY, including scheme and trailing path — Google compares it as
// a string, and a mismatch is the single most common cause of redirect_uri_mismatch.
const redirectUri = () => {
    const base = String(process.env.BASE_URL || '').trim().replace(/\/+$/, '');
    if (!base) return '';
    return `${base}/api/auth/google/callback`;
};

// All three, or nothing. BASE_URL is as load-bearing as the secret here: without it
// there is no redirect URI to send, and Google would reject the request anyway —
// better to refuse before opening a browser than after.
const googleConfigured = () => !!(clientId() && clientSecret() && redirectUri());

// What is missing, for the log and for /healthz. Never the values.
const googleMissing = () => [
    clientId() ? null : 'GOOGLE_CLIENT_ID',
    clientSecret() ? null : 'GOOGLE_CLIENT_SECRET',
    redirectUri() ? null : 'BASE_URL'
].filter(Boolean);

// The consent screen URL.
//
// `prompt: select_account` rather than the default: a phone with two Google accounts
// on it would otherwise silently reuse whichever one is active, and somebody signing
// in as their landlord self on a family phone has no way to switch.
const authUrl = (state) => {
    const params = new URLSearchParams({
        client_id: clientId(),
        redirect_uri: redirectUri(),
        response_type: 'code',
        // openid gets the stable subject id; email and profile get the address and
        // the display name. Nothing else is requested — an app that asks for a
        // person's contacts to let them log in deserves the refusal it gets.
        scope: 'openid email profile',
        state,
        prompt: 'select_account',
        // No refresh token. This is an identity handshake, not ongoing access to
        // anything of Google's, so there is nothing to refresh and a stored refresh
        // token would be a liability with no purpose.
        access_type: 'online'
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
};

// Minimal HTTPS POST returning parsed JSON. Written out rather than adding a fetch
// polyfill or axios to the backend: it is one call to one known endpoint, and Node
// 20+ has global fetch anyway — this exists so the module keeps working if the
// runtime is older, which the Dockerfile's node:20-alpine leaves open.
const postForm = (url, form) => new Promise((resolve, reject) => {
    const body = new URLSearchParams(form).toString();
    const u = new URL(url);
    const req = https.request({
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body)
        },
        timeout: 15000
    }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
            try {
                const parsed = JSON.parse(data || '{}');
                if (res.statusCode >= 400) {
                    // Google's own error name, which is genuinely useful
                    // (redirect_uri_mismatch, invalid_client, invalid_grant) and
                    // contains no secret of ours.
                    const err = new Error(parsed.error_description || parsed.error || `HTTP ${res.statusCode}`);
                    err.googleError = parsed.error || null;
                    return reject(err);
                }
                resolve(parsed);
            } catch (e) {
                reject(new Error('Google returned a response that could not be read.'));
            }
        });
    });
    req.on('timeout', () => req.destroy(new Error('Google did not respond in time.')));
    req.on('error', reject);
    req.end(body);
});

// Decode a JWT payload WITHOUT verifying its signature.
//
// Safe here and ONLY here, because of where this token came from: we opened a TLS
// connection to accounts.google.com ourselves and it handed the token back on that
// connection. There is no untrusted party in between to have forged it, which is
// why Google's own server-side documentation says signature verification may be
// skipped for the authorization-code flow. The CLAIMS are still checked below —
// skipping the signature is not the same as trusting the contents.
//
// If this ever starts accepting an ID token sent up BY THE APP, that reasoning
// evaporates and full JWKS verification becomes mandatory. It does not, by design:
// the app never sees a Google token at all.
const decodeIdToken = (idToken) => {
    const parts = String(idToken || '').split('.');
    if (parts.length !== 3) return null;
    try {
        return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch (e) {
        return null;
    }
};

const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

// Every claim that has to hold before an identity is believed. Pure, so each
// refusal below is a test rather than a hope.
//
// Returns { ok: true, identity } or { ok: false, reason }.
const checkIdentity = (claims, { audience, now = Date.now() } = {}) => {
    if (!claims) return { ok: false, reason: 'Google sent an identity that could not be read.' };

    // Who the token was minted FOR. Without this check a token Google issued for
    // somebody else's app would be accepted here, which is the whole reason `aud`
    // exists.
    if (!audience || claims.aud !== audience) {
        return { ok: false, reason: 'That sign-in was issued for a different app.' };
    }
    if (!GOOGLE_ISSUERS.includes(String(claims.iss || ''))) {
        return { ok: false, reason: 'That sign-in did not come from Google.' };
    }
    // Expiry, with no grace. A few seconds of clock skew is not worth a window.
    if (!claims.exp || Number(claims.exp) * 1000 <= now) {
        return { ok: false, reason: 'That sign-in has expired. Please try again.' };
    }
    const email = String(claims.email || '').trim().toLowerCase();
    if (!email) return { ok: false, reason: 'That Google account has no email address.' };

    // THE LOAD-BEARING CHECK. An account is matched to an existing TenantPro
    // account by email address, so an unverified address would let somebody sign
    // up to Google claiming an address they do not own and walk straight into
    // another person's landlord account. Google reports the difference; refuse when
    // it says no.
    if (claims.email_verified !== true && claims.email_verified !== 'true') {
        return { ok: false, reason: 'Google has not verified that email address, so it cannot be used to sign in.' };
    }
    // The stable identifier. Unlike the address, `sub` never changes — a person who
    // renames their Google account keeps it, so it is what the account is bound to.
    const sub = String(claims.sub || '').trim();
    if (!sub) return { ok: false, reason: 'Google sent an identity with no account id.' };

    return {
        ok: true,
        identity: {
            sub,
            email,
            // A display name is a nicety, not a requirement: some accounts have none.
            name: String(claims.name || '').trim() || null,
            picture: String(claims.picture || '').trim() || null
        }
    };
};

// Swap the one-time code for tokens, then validate what came back.
// Returns { ok, identity } / { ok: false, reason }.
const exchangeCode = async (code) => {
    if (!googleConfigured()) return { ok: false, reason: 'Google sign-in is not configured on this server.' };
    let tokens;
    try {
        tokens = await postForm('https://oauth2.googleapis.com/token', {
            code,
            client_id: clientId(),
            client_secret: clientSecret(),
            redirect_uri: redirectUri(),
            grant_type: 'authorization_code'
        });
    } catch (e) {
        // Google's error name is logged because redirect_uri_mismatch and
        // invalid_client are otherwise near-impossible to tell apart from the
        // outside, and neither reveals a credential.
        console.error(`Google token exchange failed: ${e.googleError || e.message}`);
        return { ok: false, reason: 'Google would not complete that sign-in.' };
    }
    return checkIdentity(decodeIdToken(tokens.id_token), { audience: clientId() });
};

module.exports = {
    googleConfigured,
    googleMissing,
    authUrl,
    exchangeCode,
    // Exported for tests: the claim rules are the security boundary, so every
    // refusal is pinned rather than trusted.
    checkIdentity,
    decodeIdToken
};
