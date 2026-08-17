// Shared email transporter for password-reset codes.
//
// Two ways to configure it, checked in this order:
//
//   1. Generic SMTP — SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
//      Use this for Brevo, Mailgun, Resend, Postmark, SES, anything. Preferred:
//      transactional providers actually deliver, where a personal Gmail account
//      gets rate-limited and spam-foldered.
//
//   2. Gmail — EMAIL_USER, EMAIL_PASS
//      EMAIL_PASS must be a 16-character App Password, NOT the account password.
//      Google refuses plain passwords outright (SMTP 535), and App Passwords only
//      exist once 2-Step Verification is on. This is the single most common reason
//      reset emails silently never arrive.
//
// FROM address falls back to the SMTP/Gmail user when MAIL_FROM is unset.
const nodemailer = require('nodemailer');

const smtpHost = process.env.SMTP_HOST;
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const gmailUser = process.env.EMAIL_USER;
const gmailPass = process.env.EMAIL_PASS;

const useSmtp = !!(smtpHost && smtpUser && smtpPass);
const useGmail = !useSmtp && !!(gmailUser && gmailPass);

const isMailConfigured = useSmtp || useGmail;

// Which provider (if any) is in play, so /healthz and the boot log can say so
// without ever exposing a credential.
const mailProvider = useSmtp ? `smtp:${smtpHost}` : useGmail ? 'gmail' : 'none';

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
    // Nothing at all is set. Gmail is the shorter road for a single operator, so that
    // is the pair named.
    return ['EMAIL_USER', 'EMAIL_PASS'];
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
    .slice(0, 140);

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
        // Named for what to go and check. The attempt count separates a cold-start
        // blip from a host that simply does not allow the connection.
        return `${mailProvider} (UNREACHABLE after ${verifyAttempts} attempt${verifyAttempts === 1 ? '' : 's'}`
            + ` — credentials never tried, check outbound SMTP: ${verifyDetail || 'no reason given'})`;
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
// to reply; the others suppress auto-acknowledgements. This is what actually makes a
// message "no-reply" at the protocol level, independent of the from address — so it
// works today on Gmail and keeps working on a custom domain later.
const NO_REPLY_HEADERS = {
    'Auto-Submitted': 'auto-generated',
    'X-Auto-Response-Suppress': 'OOF, AutoReply, All',
    'Precedence': 'bulk'
};

// A short line the recipient can see, since headers are invisible to humans. Every
// automated email ends with this.
const NO_REPLY_FOOTER =
    '<p style="margin-top:24px;color:#9aa0aa;font-size:12px;">' +
    'This is an automated message from TenantPro — please do not reply to this email.' +
    '</p>';

// Single place every automated email goes through, so the no-reply identity (from,
// reply-to, headers, footer) is applied consistently to OTPs and rent reminders
// alike rather than re-specified — and differently — at each call site.
const sendAppMail = ({ to, subject, html }) => transporter.sendMail({
    from: `"${MAIL_FROM_NAME}" <${mailFrom}>`,
    ...(mailReplyTo ? { replyTo: mailReplyTo } : {}),
    to,
    subject,
    html: html + NO_REPLY_FOOTER,
    headers: NO_REPLY_HEADERS
});

const transporter = isMailConfigured
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
    : { sendMail: async () => { throw new Error('Email is not configured on this server.'); } };

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
                `❌ Cannot REACH the mail server (${mailProvider}): ${err.message}. ` +
                'The credentials were never presented, so they are not the problem yet. ' +
                'Most hosts block outbound SMTP — check whether this platform allows ' +
                'port 465/587 outbound, or switch to a provider with an HTTPS API.'
            );
            scheduleRecheck();
        } else {
            console.error(
                `❌ Email credentials REJECTED by ${mailProvider}: ${err.message}. ` +
                (useGmail
                    ? 'For Gmail this is almost always a non-App-Password: turn on 2-Step ' +
                      'Verification and generate a 16-character App Password.'
                    : 'Check SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS.')
            );
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

const scheduleRecheck = () => {
    const delay = RECHECK_DELAYS_MS[verifyAttempts - 1];
    if (delay === undefined) {
        // Out of retries. The state stands, and the attempt count in /healthz is what
        // distinguishes this from a single unlucky cold start.
        console.error(`❌ Mail still unreachable after ${verifyAttempts} attempts — giving up until next restart.`);
        return;
    }
    // unref: a pending retry must never be the reason the process stays alive.
    setTimeout(() => { verifyMail().catch(() => {}); }, delay).unref();
};

module.exports = {
    transporter, sendAppMail, isMailConfigured, mailProvider, mailFrom, verifyMail,
    mailMissing, mailUserHint, mailStatus
};
