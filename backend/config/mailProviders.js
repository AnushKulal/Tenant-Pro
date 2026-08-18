// File: backend/config/mailProviders.js
//
// Sending email over HTTPS instead of SMTP.
//
// ── Why this file exists ──────────────────────────────────────────────────────
// Render's free web services block outbound traffic to SMTP ports (25, 465, 587).
// A Gmail transporter on that plan does not fail with a bad-password error — it fails
// with a connection timeout, because the packets never leave the host. No app password,
// no SMTP host, and no amount of redeploying can fix that: the port is shut.
//
// Every serious mail provider also offers an HTTPS API, and HTTPS is not blocked —
// it is the same channel the app already uses for Cloudinary and Expo push. So this is
// not a workaround; it is the transport that should have been used from the start.
// Transactional providers also authenticate their own domains, which is why their mail
// lands in inboxes where mail sent through a personal Gmail account lands in spam.
//
// ── Why it is a TABLE ─────────────────────────────────────────────────────────
// The brief was: something free today, upgradeable later to something that handles as
// much volume as possible, without a rewrite. So a provider is one entry here, chosen
// by which API key is present. Moving from Brevo's free tier to a provider built for
// millions of messages is then setting a different environment variable — the calling
// code, the templates, the no-reply identity and the health check do not change.
//
// Adding a provider is one object. Nothing else in the codebase needs to know.

// Long enough for a slow API on a cold container, short enough that nobody is left
// staring at a spinner: this runs inside a request somebody is waiting on.
const TIMEOUT_MS = 10000;

// One fetch with a deadline. Returns the status and the body text — the body is worth
// keeping because these APIs explain their refusals in it, and "400 Bad Request" with
// no detail is a wasted round trip when the answer was "sender not verified".
const call = async (url, options) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(url, { ...options, signal: ctl.signal });
        const body = await res.text().catch(() => '');
        return { status: res.status, ok: res.ok, body };
    } finally {
        clearTimeout(timer);
    }
};

// Providers report failures in their own JSON shapes. Pull out something human without
// caring which shape it is, and fall back to the raw text.
const errText = (body) => {
    try {
        const j = JSON.parse(body);
        return j.message || j.error?.message || j.error
            || (Array.isArray(j.errors) ? j.errors.map((e) => e.message || e.field || '').filter(Boolean).join('; ') : '')
            || body;
    } catch (e) {
        return body;
    }
};

// A refusal that will never succeed on retry (bad key, unverified sender, malformed
// request) versus one that might (rate limit, provider outage). The distinction drives
// whether the health check calls the credentials rejected or the provider unreachable,
// which are the two things that must never be confused — see noteVerify in mailer.js.
const isAuthStatus = (status) => status === 401 || status === 403;

// ── The providers ─────────────────────────────────────────────────────────────
//
// Ordered by what to reach for first. `free` is documentation for a human reading
// /healthz or DEPLOY.md, not something the code branches on.
const PROVIDERS = [
    {
        id: 'brevo',
        label: 'Brevo',
        envKey: 'BREVO_API_KEY',
        free: '300 emails/day',
        // The only one of these that lets you verify a single SENDER ADDRESS rather
        // than requiring you to own and verify a domain — which is why it is first.
        // Everything else here needs a domain before it will send to strangers.
        needsDomain: false,
        send: async ({ key, fromName, from, to, subject, html, text, replyTo, headers }) => {
            const r = await call('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
                body: JSON.stringify({
                    sender: { name: fromName, email: from },
                    to: [{ email: to }],
                    subject,
                    htmlContent: html,
                    ...(text ? { textContent: text } : {}),
                    ...(replyTo ? { replyTo: { email: replyTo } } : {}),
                    headers
                })
            });
            return r.ok ? { ok: true } : { ok: false, status: r.status, reason: errText(r.body), fatal: isAuthStatus(r.status) };
        },
        // Cheapest authenticated call that proves the key works.
        verify: async ({ key }) => {
            const r = await call('https://api.brevo.com/v3/account', { headers: { 'api-key': key, accept: 'application/json' } });
            return r.ok ? { ok: true } : { ok: false, status: r.status, reason: errText(r.body), auth: isAuthStatus(r.status) };
        }
    },
    {
        id: 'resend',
        label: 'Resend',
        envKey: 'RESEND_API_KEY',
        free: '3,000 emails/month',
        needsDomain: true,
        send: async ({ key, fromName, from, to, subject, html, text, replyTo, headers }) => {
            const r = await call('https://api.resend.com/emails', {
                method: 'POST',
                headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
                body: JSON.stringify({
                    from: `${fromName} <${from}>`,
                    to: [to],
                    subject,
                    html,
                    ...(text ? { text } : {}),
                    ...(replyTo ? { reply_to: replyTo } : {}),
                    headers
                })
            });
            return r.ok ? { ok: true } : { ok: false, status: r.status, reason: errText(r.body), fatal: isAuthStatus(r.status) };
        },
        verify: async ({ key }) => {
            const r = await call('https://api.resend.com/domains', { headers: { authorization: `Bearer ${key}` } });
            return r.ok ? { ok: true } : { ok: false, status: r.status, reason: errText(r.body), auth: isAuthStatus(r.status) };
        }
    },
    {
        id: 'sendgrid',
        label: 'SendGrid',
        envKey: 'SENDGRID_API_KEY',
        free: '100 emails/day',
        needsDomain: true,
        send: async ({ key, fromName, from, to, subject, html, text, replyTo, headers }) => {
            const r = await call('https://api.sendgrid.com/v3/mail/send', {
                method: 'POST',
                headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
                body: JSON.stringify({
                    personalizations: [{ to: [{ email: to }] }],
                    from: { email: from, name: fromName },
                    subject,
                    // text/plain MUST come first: SendGrid requires the content array
                    // in ascending order of preference and rejects the reverse.
                    content: [
                        ...(text ? [{ type: 'text/plain', value: text }] : []),
                        { type: 'text/html', value: html }
                    ],
                    ...(replyTo ? { reply_to: { email: replyTo } } : {}),
                    headers
                })
            });
            // A successful send here is 202, not 200 — res.ok covers both.
            return r.ok ? { ok: true } : { ok: false, status: r.status, reason: errText(r.body), fatal: isAuthStatus(r.status) };
        },
        verify: async ({ key }) => {
            const r = await call('https://api.sendgrid.com/v3/scopes', { headers: { authorization: `Bearer ${key}` } });
            return r.ok ? { ok: true } : { ok: false, status: r.status, reason: errText(r.body), auth: isAuthStatus(r.status) };
        }
    }
];

const keyFor = (p) => String(process.env[p.envKey] || '').trim();

// Which provider is in play.
//
// MAIL_PROVIDER pins it explicitly, which matters while migrating: both keys are
// present for a while, and "whichever is first in the table" is not a decision anybody
// wants made for them mid-cutover. Otherwise the first provider holding a key wins.
//
// Returns the entry plus its key so callers never re-read the environment.
const pickProvider = () => {
    const pinned = String(process.env.MAIL_PROVIDER || '').trim().toLowerCase();
    if (pinned) {
        const p = PROVIDERS.find((x) => x.id === pinned);
        // A pinned provider with no key is a misconfiguration worth failing loudly on
        // rather than silently falling back to a different one — somebody who typed
        // MAIL_PROVIDER=resend does not want mail quietly going out through Brevo.
        if (p) {
            const key = keyFor(p);
            return key ? { ...p, key } : { ...p, key: '', pinnedButKeyless: true };
        }
        return null;
    }
    for (const p of PROVIDERS) {
        const key = keyFor(p);
        if (key) return { ...p, key };
    }
    return null;
};

// For the health line and the docs: every provider and whether its key is set. Names
// only — never a key, not even a prefix.
const providerSummary = () => PROVIDERS.map((p) => ({
    id: p.id, label: p.label, envKey: p.envKey, free: p.free, needsDomain: p.needsDomain, set: !!keyFor(p)
}));

module.exports = { PROVIDERS, pickProvider, providerSummary, TIMEOUT_MS };
