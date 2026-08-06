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
        console.warn(
            '⚠️  Email is NOT configured — password reset codes cannot be sent. ' +
            'Set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS, or EMAIL_USER/EMAIL_PASS ' +
            '(Gmail App Password, not the account password).'
        );
        return false;
    }
    try {
        await transporter.verify();
        console.log(`📧 Email ready via ${mailProvider}, sending as ${mailFrom}`);
        return true;
    } catch (err) {
        console.error(
            `❌ Email credentials rejected by ${mailProvider}: ${err.message}. ` +
            (useGmail
                ? 'For Gmail this is almost always a non-App-Password: turn on 2-Step ' +
                  'Verification and generate a 16-character App Password.'
                : 'Check SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS.')
        );
        return false;
    }
};

module.exports = { transporter, sendAppMail, isMailConfigured, mailProvider, mailFrom, verifyMail };
