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
const mailFrom = process.env.MAIL_FROM || smtpUser || gmailUser || 'no-reply@tenantpro.app';

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

module.exports = { transporter, isMailConfigured, mailProvider, mailFrom, verifyMail };
