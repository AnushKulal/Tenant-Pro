// Shared email sender for password-reset codes, contact verification and reminders.
//
// THREE transports, checked in this order:
//
//   1. HTTPS API — BREVO_API_KEY, RESEND_API_KEY, SENDGRID_API_KEY (see mailProviders)
//      Preferred, and first for a reason: many hosts — Render's free tier among them —
//      block outbound SMTP ports outright, so options 2 and 3 cannot work there at all.
//      HTTPS is never blocked. Pin one with MAIL_PROVIDER while migrating between them.
//
//   2. Generic SMTP — SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
//      For a host that does allow outbound SMTP.
//
//   3. Gmail — EMAIL_USER, EMAIL_PASS
//      EMAIL_PASS must be a 16-character App Password, NOT the account password.
//      Google refuses plain passwords outright (SMTP 535), and App Passwords only
//      exist once 2-Step Verification is on.
//
// An HTTPS key WINS over SMTP variables that are also set. That is deliberate: if both
// are present, the one that works on a port-blocked host is the right answer, and a
// half-finished migration should not silently keep using the transport being migrated
// away from.
//
// FROM address falls back to the SMTP/Gmail user when MAIL_FROM is unset. On an HTTPS
// provider the from address must be one you have VERIFIED with that provider, or it
// will refuse the send — that refusal is reported by /healthz rather than swallowed.
const nodemailer = require('nodemailer');
const { pickProvider, providerSummary } = require('./mailProviders');

const smtpHost = process.env.SMTP_HOST;
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const gmailUser = process.env.EMAIL_USER;
const gmailPass = process.env.EMAIL_PASS;

// Resolved once at load, like everything else here, so the transport cannot change
// under a request mid-flight.
const apiProvider = pickProvider();
// A provider pinned by MAIL_PROVIDER but missing its key is NOT usable. Treated as
// unconfigured rather than silently falling through to SMTP, so the health line can
// say what is actually wrong.
const useApi = !!(apiProvider && apiProvider.key);

const useSmtp = !useApi && !!(smtpHost && smtpUser && smtpPass);
const useGmail = !useApi && !useSmtp && !!(gmailUser && gmailPass);

const isMailConfigured = useApi || useSmtp || useGmail;

// Which provider (if any) is in play, so /healthz and the boot log can say so
// without ever exposing a credential.
const mailProvider = useApi
    ? `api:${apiProvider.id}`
    : useSmtp ? `smtp:${smtpHost}` : useGmail ? 'gmail' : 'none';

// WHICH variable is missing, not merely that mail is off.
//
// "not-configured" on its own sent us round a loop that cost real time: mail needs a
// PAIR of variables, and half a pair looks exactly like no pair from outside. Somebody
// who has set EMAIL_USER and not EMAIL_PASS, or who set both and later cleared one,
// gets the identical word — so the only way to find out was to open the hosting
// dashboard, which the person debugging often cannot do.
//
// Reported the way googleMissing() is, and for the same reason. Names only, never values.
const mailMissing = () => {
    // A provider pinned by name with no key behind it: the one thing to fix.
    if (apiProvider && apiProvider.pinnedButKeyless) return [apiProvider.envKey];
    // Which pair the operator was reaching for, judged by what they have already set.
    // Listing both pairs would name six variables when two are wanted, and listing the
    // wrong pair would send them to configure a provider they are not using.
    if (smtpHost || smtpUser || smtpPass) {
        return [
            smtpHost ? null : 'SMTP_HOST',
            smtpUser ? null : 'SMTP_USER',
            smtpPass ? null : 'SMTP_PASS'
        ].filter(Boolean);
    }
    if (gmailUser || gmailPass) {
        return [
            gmailUser ? null : 'EMAIL_USER',
            gmailPass ? null : 'EMAIL_PASS'
        ].filter(Boolean);
    }
    // Nothing at all is set. This used to name EMAIL_USER/EMAIL_PASS, which is now bad
    // advice on the host this runs on: outbound SMTP is blocked there, so following it
    // leads to a connection timeout rather than working email. The HTTPS key is the
    // road that actually arrives.
    return ['BREVO_API_KEY'];
};

// Enough of the configured address to RECOGNISE it, and not enough to use it.
//
// The question this answers is "which of my accounts is this?", asked by somebody who
// has three and cannot remember which one they typed into a dashboard months ago. The
// domain is kept whole because that is usually the whole answer; the local part is
// reduced to its first and last character, because /healthz is a public URL and
// publishing a full working address there is how it ends up scraped.
const maskAddress = (addr) => {
    const s = String(addr || '').trim();
    const at = s.lastIndexOf('@');
    if (at < 1) return null;
    const local = s.slice(0, at);
    const domain = s.slice(at);
    if (local.length <= 2) return `${'*'.repeat(local.length)}${domain}`;
    return `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}${domain}`;
};

// The masked login, whichever provider it belongs to, or null when no user is set at
// all. Deliberately independent of isMailConfigured: the case worth reporting is
// precisely the one where a user exists but the password does not.
const mailUserHint = () => maskAddress(smtpUser || gmailUser);

// Whether the credentials were ACCEPTED, not merely present.
//
// This is the difference that matters and the one that was invisible. Two variables
// being non-empty says nothing about whether Google agreed to them — and a wrong app
// password fails in precisely the same way as no password at all: the request
// succeeds, the email never arrives. verifyMail() has always tested this at boot, but
// only to the console, so the answer lived in a hosting dashboard's log tab. Kept here
// so /healthz can say it.
//
// There are THREE outcomes, not two, and conflating two of them is actively harmful:
//
//   pending      the boot check has not finished (or has not been run)
//   ok           the provider accepted the login
//   rejected     the provider answered and REFUSED the credentials — regenerate them
//   unreachable  we never got far enough to present credentials at all
//
// The first version of this reported a connection timeout as "CREDENTIALS REJECTED",
// which is a lie that costs an afternoon: it sends somebody to regenerate an app
// password when the password was never tried and the real problem is that the host
// blocks outbound SMTP. The two need opposite fixes, so they get separate states.
let verifyState = 'pending';
let verifyDetail = '';
let verifyAttempts = 0;

// Provider error text, made safe to publish.
//
// /healthz is a public URL and these strings come from someone else's server, so they
// are treated as untrusted: any address is masked, anything resembling a credential is
// dropped, and the whole thing is truncated. Gmail's 535 does not normally quote the
// password, but "does not normally" is not a guarantee worth publishing against.
const safeReason = (msg) => String(msg || '')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g, (m) => maskAddress(m) || '[address]')
    // Long unbroken tokens are far likelier to be a secret than a sentence.
    .replace(/\b[A-Za-z0-9/+_-]{20,}\b/g, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    // 320, not 140. The first real failure this caught in production was Brevo saying
    // "We have detected you are using an unrecognised IP address 74.220.48.219. If you
    // performed this action make sure to add the" — truncated one word before the fix.
    // A reason cut off before its verb is barely better than no reason: the whole point
    // of publishing the provider's own words is that they say what to go and do.
    .slice(0, 320);

// Did we get an ANSWER from the provider, or never reach it?
//
// nodemailer sets a code on the error, and the codes divide cleanly along exactly the
// line that matters. EAUTH means the server replied and said no — that is a credential
// problem. Everything connection-shaped means the credentials were never presented.
// An unrecognised code falls through to 'unreachable', which is the safer wrong answer:
// it points at reachability without accusing a password that may be perfectly good.
const CONNECTION_CODES = ['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'ECONNREFUSED', 'EDNS', 'EHOSTUNREACH', 'ENOTFOUND'];

const noteVerify = (ok, err) => {
    verifyAttempts += 1;
    if (ok) {
        verifyState = 'ok';
        verifyDetail = '';
        return;
    }
    const code = String((err && err.code) || '').toUpperCase();
    const msg = String((err && err.message) || '');
    // Some transports report a timeout in the message without setting a code.
    const looksConnection = CONNECTION_CODES.includes(code)
        || /timeout|timed out|refused|unreachable|getaddrinfo|network/i.test(msg);
    verifyState = (code === 'EAUTH' || (!looksConnection && /invalid login|password not accepted|5\.7\.\d/i.test(msg)))
        ? 'rejected'
        : 'unreachable';
    verifyDetail = safeReason(code ? `${code}: ${msg}` : msg);
};

// The one line /healthz reports. Assembled here rather than at the two call sites in
// server.js, which had drifted into saying it twice — so a change to the wording only
// landed on the healthy branch and the degraded branch quietly kept the old answer.
const mailStatus = () => {
    if (!isMailConfigured) {
        const hint = mailUserHint();
        return `not-configured (missing ${mailMissing().join(', ')}${hint ? `; user ${hint}` : ''})`;
    }
    // Configured. Say whether it actually WORKS, because that is the live question
    // once the variables are in place.
    if (verifyState === 'ok') return `${mailProvider} (verified, sending as ${maskAddress(mailFrom) || mailFrom})`;
    if (verifyState === 'rejected') {
        return `${mailProvider} (CREDENTIALS REJECTED: ${verifyDetail || 'no reason given'})`;
    }
    if (verifyState === 'unreachable') {
        // Named for what to go and check, and that differs by transport: an HTTPS
        // provider cannot be port-blocked, so pointing at outbound SMTP there would
        // send somebody to look at the one thing that is definitely not the cause.
        const where = useApi ? `check ${apiProvider.label} status` : 'check outbound SMTP';
        return `${mailProvider} (UNREACHABLE after ${verifyAttempts} attempt${verifyAttempts === 1 ? '' : 's'}`
            + ` — credentials never tried, ${where}: ${verifyDetail || 'no reason given'})`;
    }
    return `${mailProvider} (configured, not yet verified)`;
};

// The address messages are sent FROM. On Gmail this is forced to the account itself
// no matter what MAIL_FROM says — Google rewrites anything else — so a no-reply
// sender address only truly takes effect once MAIL_FROM points at a domain you own
// and have verified with a provider (e.g. no-reply@tenantpro.app via Brevo).
const mailFrom = process.env.MAIL_FROM || smtpUser || gmailUser || 'no-reply@tenantpro.app';

// The display name recipients see. Kept explicit so every automated message reads
// as coming from the product, not from a person's inbox.
const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || 'TenantPro';

// Where replies go. Optional: set MAIL_REPLY_TO to a mailbox you actually own if you
// want replies to land somewhere. Left unset, we send no Reply-To and instead mark
// the message as automated (below), which is the honest "no-reply" on Gmail — the
// from address is unavoidably your own account there, so faking a Reply-To at a
// domain you don't control would only bounce.
const mailReplyTo = process.env.MAIL_REPLY_TO || null;

// Standard, machine-readable "this is an automated message, do not reply" markers.
// Auto-Submitted (RFC 3834) tells mail servers and out-of-office autoresponders not
// to reply; X-Auto-Response-Suppress is Microsoft's equivalent. This is what actually
// makes a message "no-reply" at the protocol level, independent of the from address.
//
// 'Precedence: bulk' USED to be here and was removed deliberately. Its only real job —
// suppressing vacation autoresponders — is already done properly and standardly by
// Auto-Submitted above, so it was redundant. What it was NOT free of is a cost: it is
// a non-standard header that filters read as "this is bulk mail", and a password reset
// code is the opposite of bulk. Volunteering a bulk signal on the one message a locked-
// out person is refreshing their inbox for is a bad trade for a duplicate of a header
// we already send.
const NO_REPLY_HEADERS = {
    'Auto-Submitted': 'auto-generated',
    'X-Auto-Response-Suppress': 'OOF, AutoReply, All'
};

// A plain-text version of the message, derived from the HTML.
//
// Every mail this app sends was HTML-only, and an HTML-only message is a mild spam
// signal on its own: real correspondence is multipart, and bulk senders are the ones
// who cannot be bothered. It also matters to the people reading in a text-only client,
// a screen reader, or a watch preview — the alternative to a text part is not "no text
// part", it is the client generating a worse one.
//
// Deliberately simple. These templates are a handful of paragraphs and one big code;
// a full HTML-to-text converter would be a dependency and a parsing surface for no gain.
const htmlToText = (html) => String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    // Block-level ends become line breaks, so paragraphs survive as paragraphs.
    .replace(/<\/(p|div|h[1-6]|tr|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    // Tidy the whitespace the tags left behind, without collapsing paragraph breaks.
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// A short line the recipient can see, since headers are invisible to humans. Every
// automated email ends with this.
const NO_REPLY_FOOTER =
    '<p style="margin-top:24px;color:#9aa0aa;font-size:12px;">' +
    'This is an automated message from TenantPro — please do not reply to this email.' +
    '</p>';

// Single place every automated email goes through, so the no-reply identity (from,
// reply-to, headers, footer) is applied consistently to OTPs and rent reminders
// alike rather than re-specified — and differently — at each call site.
//
// The transport is chosen here and nowhere else. authController, verifyService and
// cronService call this and are entirely unaware of whether the message left over
// HTTPS or SMTP — which is the whole point: switching provider touches this file only.
//
// Rejects on failure, exactly as transporter.sendMail always has, so existing callers'
// try/catch keeps working. An HTTPS provider answers with a status rather than throwing,
// so its refusal is turned into an Error carrying the provider's own explanation —
// "sender not verified" is worth propagating verbatim.
const sendAppMail = async ({ to, subject, html, text }) => {
    const body = html + NO_REPLY_FOOTER;
    // A caller may supply its own wording; otherwise it is derived. Never empty — an
    // empty text part is worse than none, because clients will show it.
    const plain = (text && String(text).trim()) || htmlToText(body);

    if (useApi) {
        const r = await apiProvider.send({
            key: apiProvider.key,
            fromName: MAIL_FROM_NAME,
            from: mailFrom,
            to,
            subject,
            html: body,
            text: plain,
            replyTo: mailReplyTo,
            headers: NO_REPLY_HEADERS
        });
        if (!r.ok) {
            const err = new Error(`${apiProvider.label} refused the message (HTTP ${r.status}): ${r.reason || 'no reason given'}`);
            // Carried so a caller — or a future retry policy — can tell "this will never
            // work" from "try again later" without parsing the message.
            err.fatal = !!r.fatal;
            err.status = r.status;
            throw err;
        }
        return { accepted: [to], provider: apiProvider.id };
    }

    return transporter.sendMail({
        from: `"${MAIL_FROM_NAME}" <${mailFrom}>`,
        ...(mailReplyTo ? { replyTo: mailReplyTo } : {}),
        to,
        subject,
        text: plain,
        html: body,
        headers: NO_REPLY_HEADERS
    });
};

// Built only for the SMTP transports. On an HTTPS provider there is no socket to open,
// so this stays a stub — and a stub that throws is better than a live transporter
// nobody uses, because it makes an accidental direct call fail loudly instead of
// quietly bypassing the chosen provider.
const transporter = (isMailConfigured && !useApi)
    ? nodemailer.createTransport(
        useSmtp
            ? {
                host: smtpHost,
                port: Number(process.env.SMTP_PORT || 587),
                // 465 is implicit TLS; 587 upgrades with STARTTLS.
                secure: Number(process.env.SMTP_PORT || 587) === 465,
                auth: { user: smtpUser, pass: smtpPass }
            }
            : { service: 'gmail', auth: { user: gmailUser, pass: gmailPass } }
    )
    // A stub so callers can import this unconditionally; every send rejects with a
    // message that says exactly what is missing.
    : {
        sendMail: async () => {
            throw new Error(useApi
                ? `Email goes out through ${apiProvider.label}'s HTTPS API on this server — use sendAppMail, not transporter.`
                : 'Email is not configured on this server.');
        },
        // verifyMail calls this; on an HTTPS provider the equivalent check is the
        // provider's own authenticated endpoint, handled in verifyMail itself.
        verify: async () => { throw new Error('No SMTP transport on this server.'); }
    };

// Credentials that are present but WRONG behave identically to no credentials at
// all from the outside: the request succeeds, the email never arrives, and nothing
// says why. Verifying once at boot turns that into a log line you can act on.
const verifyMail = async () => {
    if (!isMailConfigured) {
        const hint = mailUserHint();
        console.warn(
            `⚠️  Email is NOT configured — missing ${mailMissing().join(', ')}. ` +
            'Password reset codes and contact-verification codes cannot be sent. ' +
            (hint
                // Half a pair set is a materially different situation from none, and
                // the old wording ("set all of these") told somebody who had already
                // set the user to set it again.
                ? `A login IS set (${hint}) — so it is the password half that is absent. `
                : '') +
            'Set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS, or EMAIL_USER/EMAIL_PASS ' +
            '(Gmail App Password, not the account password).'
        );
        return false;
    }
    try {
        if (useApi) {
            // The provider's own authenticated endpoint. A 401/403 is a bad key — that
            // is a credential problem. A thrown fetch error (DNS, timeout, abort) means
            // we never reached them. Anything else — a 500, a rate limit — is also
            // "not their answer about our key", so it counts as unreachable rather than
            // condemning a key that may be perfectly valid.
            const r = await apiProvider.verify({ key: apiProvider.key });
            if (r.ok) {
                noteVerify(true);
                console.log(`📧 Email ready via ${apiProvider.label} HTTPS API, sending as ${mailFrom}`);
                return true;
            }
            const e = new Error(`HTTP ${r.status}: ${r.reason || 'no reason given'}`);
            // Only an auth status maps to EAUTH; everything else stays connection-shaped.
            e.code = r.auth ? 'EAUTH' : 'EPROVIDER';
            throw e;
        }
        await transporter.verify();
        noteVerify(true);
        console.log(`📧 Email ready via ${mailProvider}, sending as ${mailFrom}`);
        return true;
    } catch (err) {
        noteVerify(false, err);
        // Two different failures, two different sentences. Telling somebody to
        // regenerate an app password when the connection never opened is the single
        // most misleading thing this function could say.
        if (verifyState === 'unreachable') {
            console.error(
                `❌ Cannot REACH the mail provider (${mailProvider}): ${err.message}. ` +
                'The credentials were never presented, so they are not the problem yet. ' +
                (useApi
                    // HTTPS is not port-blocked anywhere, so this is the provider being
                    // down or rate-limiting — genuinely worth retrying, which we do.
                    ? `${apiProvider.label}'s API did not give a verdict on the key. Usually their outage or a rate limit; retrying.`
                    : 'Many hosts block outbound SMTP — Render\'s free tier blocks ports 25/465/587 outright. ' +
                      'Either move to an instance type that allows it, or set an HTTPS provider key (BREVO_API_KEY).')
            );
            scheduleRecheck();
        } else {
            console.error(
                `❌ Email credentials REJECTED by ${mailProvider}: ${err.message}. ` +
                (useApi
                    ? `Check ${apiProvider.envKey} — the key was refused. A revoked or mistyped key looks exactly like this, ` +
                      'and so does an account-level block such as an IP allowlist.'
                    : useGmail
                        ? 'For Gmail this is almost always a non-App-Password: turn on 2-Step ' +
                          'Verification and generate a 16-character App Password.'
                        : 'Check SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS.')
            );
            // A rejection on an HTTPS provider is worth re-probing, slowly. Not every 401
            // means a bad key: an IP allowlist, an account still being reviewed, a key
            // pending activation all answer 401 and are all fixed on the PROVIDER'S side,
            // where nothing tells this process it has happened. Without a re-probe the
            // health line keeps reporting a failure that was resolved twenty minutes ago,
            // and the only way to correct it is a deploy nobody should have to do.
            //
            // NOT extended to SMTP. Repeated failed AUTH against a mail server is exactly
            // the pattern abuse protections watch for, and Gmail will lock an account over
            // it. A REST endpoint answering 401 has no such trap — it is a stateless read.
            if (useApi) scheduleRecheck(REJECT_DELAYS_MS);
        }
        return false;
    }
};

// A boot check that runs while the container is still wiring up its network can fail
// for reasons that have nothing to do with the configuration, and a one-shot check
// would then report UNREACHABLE for the lifetime of the process. So connection
// failures are retried on a widening delay.
//
// Only connection failures. A refused password will not start working on its own, and
// hammering AUTH at Gmail is a good way to get an account locked.
const RECHECK_DELAYS_MS = [30_000, 60_000, 120_000, 300_000];

// Slower, and spread over about an hour. A rejection is not urgent the way an unreachable
// provider is — nobody is waiting on the next 30 seconds — but somebody who has just
// fixed an allowlist or activated a key should see the health line correct itself while
// they are still looking at it, rather than after the next deploy.
const REJECT_DELAYS_MS = [60_000, 300_000, 900_000, 1_800_000, 1_800_000];

const scheduleRecheck = (schedule = RECHECK_DELAYS_MS) => {
    const delay = schedule[verifyAttempts - 1];
    if (delay === undefined) {
        // Out of retries. The state stands, and the attempt count in /healthz is what
        // distinguishes this from a single unlucky cold start.
        // Worded from the state rather than assuming "unreachable" — this scheduler now
        // serves rejections too, and telling somebody their mail is unreachable when the
        // provider has been refusing their key for an hour points at the wrong thing.
        console.error(
            `❌ Mail still ${verifyState} after ${verifyAttempts} attempts — giving up until next restart.`
        );
        return;
    }
    // unref: a pending retry must never be the reason the process stays alive.
    setTimeout(() => { verifyMail().catch(() => {}); }, delay).unref();
};

module.exports = {
    transporter, sendAppMail, isMailConfigured, mailProvider, mailFrom, verifyMail,
    mailMissing, mailUserHint, mailStatus,
    // For DEPLOY.md tooling and any future admin view: which providers exist and
    // whether each key is set. Never the keys.
    providerSummary
};
