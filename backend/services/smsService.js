// File: backend/services/smsService.js
//
// Sending an SMS — or saying honestly that we cannot.
//
// ── The state of this ──────────────────────────────────────────────────────────
// There is no SMS provider connected. This file exists so that the code that NEEDS an
// SMS — proving somebody holds a phone number before it becomes their sign-in
// identifier — can be written, tested and shipped now, and starts working the moment
// credentials are set. That is the same shape webhookController takes for payments: the
// path is built and dormant rather than designed under pressure later.
//
// ── The one rule ───────────────────────────────────────────────────────────────
// An unconfigured provider must REFUSE, never pretend. A verification flow that
// silently no-ops is worse than no verification at all: the caller believes a code was
// sent, the person never receives one, and the natural next step for whoever is
// maintaining it is to "fix" the dead end by letting the change through unverified.
//
// Set MSG91_AUTH_KEY (+ MSG91_SENDER) or TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN +
// TWILIO_FROM to switch it on.

const MSG91_KEY = process.env.MSG91_AUTH_KEY || '';
const MSG91_SENDER = process.env.MSG91_SENDER || 'TNTPRO';
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_FROM = process.env.TWILIO_FROM || '';

// Short: this runs inside a request somebody is waiting on.
const TIMEOUT_MS = 8000;

const provider = () => {
    if (MSG91_KEY) return 'msg91';
    if (TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM) return 'twilio';
    return null;
};

// Reported by /healthz beside mail, uploads and push, so "can we verify a phone number"
// has an answer that is not a guess.
const smsMode = () => {
    const p = provider();
    if (p === 'msg91') return 'ready (msg91)';
    if (p === 'twilio') return 'ready (twilio)';
    // Twilio needs THREE variables, and two of three reads as "nothing set" — the same
    // trap that made the mail line useless (see mailMissing in config/mailer). Somebody
    // who has pasted the SID and the token and not yet bought a number would otherwise
    // be told to start over.
    if (TWILIO_SID || TWILIO_TOKEN || TWILIO_FROM) {
        const missing = [
            TWILIO_SID ? null : 'TWILIO_ACCOUNT_SID',
            TWILIO_TOKEN ? null : 'TWILIO_AUTH_TOKEN',
            TWILIO_FROM ? null : 'TWILIO_FROM'
        ].filter(Boolean);
        return `not-configured (missing ${missing.join(', ')})`;
    }
    return 'not-configured (no MSG91_AUTH_KEY or TWILIO_* set)';
};
const isSmsConfigured = () => provider() !== null;

const post = async (url, options) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(url, { ...options, signal: ctl.signal });
        const body = await res.text().catch(() => '');
        return { ok: res.ok, status: res.status, body };
    } finally {
        clearTimeout(timer);
    }
};

// Send one message to one Indian mobile number.
//
// `to` is the ten-digit normalised form this app stores; the country code is added
// here, because that is a transport detail and does not belong in the database.
//
// Returns { ok, reason } rather than throwing. The caller has to tell a person what
// happened, and "could not send" is information they need, not an exception.
const sendSms = async (to, text) => {
    const p = provider();
    if (!p) return { ok: false, reason: 'NOT_CONFIGURED' };
    const digits = String(to || '').replace(/[^0-9]/g, '');
    if (digits.length !== 10) return { ok: false, reason: 'BAD_NUMBER' };

    try {
        if (p === 'msg91') {
            const r = await post('https://control.msg91.com/api/v5/flow/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', authkey: MSG91_KEY },
                body: JSON.stringify({ sender: MSG91_SENDER, mobiles: `91${digits}`, message: text, route: '4' })
            });
            if (!r.ok) {
                console.error(`sms: msg91 returned ${r.status} - ${String(r.body).slice(0, 200)}`);
                return { ok: false, reason: 'PROVIDER_ERROR' };
            }
            return { ok: true };
        }

        // Twilio wants form encoding and HTTP basic auth.
        const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
        const r = await post(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${auth}` },
            body: new URLSearchParams({ To: `+91${digits}`, From: TWILIO_FROM, Body: text }).toString()
        });
        if (!r.ok) {
            console.error(`sms: twilio returned ${r.status} - ${String(r.body).slice(0, 200)}`);
            return { ok: false, reason: 'PROVIDER_ERROR' };
        }
        return { ok: true };
    } catch (err) {
        console.error('sms: send failed -', err.message);
        return { ok: false, reason: 'FAILED' };
    }
};

module.exports = { sendSms, isSmsConfigured, smsMode };
