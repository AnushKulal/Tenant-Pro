// Shared email transporter (Gmail via Nodemailer).
// Reads EMAIL_USER / EMAIL_PASS from the environment. If they're not set,
// isMailConfigured is false and callers can handle it gracefully.
const nodemailer = require('nodemailer');

const isMailConfigured = !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

module.exports = { transporter, isMailConfigured };
