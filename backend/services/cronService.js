// File: backend/services/cronService.js
const cron = require('node-cron');
const twilio = require('twilio');
const db = require('../config/db');

// --- 1. EMAIL SETUP ---
// Deliberately the SHARED transporter, not a private one. This file used to build
// its own Gmail-only transport, which meant configuring the server with a
// transactional provider (SMTP_HOST/PORT/USER/PASS) fixed password-reset emails
// while rent reminders stayed silently broken — two email paths, one configured.
// One transporter, one place to configure, one boot check that covers both.
const { sendAppMail, isMailConfigured } = require('../config/mailer');
// When a reminder is due, kept pure and tested rather than expressed as a WHERE clause.
const { shouldRemind, reminderKind, daysPastDue } = require('../utils/rentReminder');
const { notify } = require('./pushService');

// --- 2. TWILIO SETUP (SMS & WhatsApp) ---
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
} else {
    console.warn("⚠️ Twilio credentials missing in .env! SMS/WhatsApp will run in Mock Mode.");
}

// Helper: Twilio requires numbers to start with the country code (e.g., +91 for India)
const formatPhone = (phone) => {
    const cleaned = phone.replace(/\D/g, ''); // Remove spaces or dashes
    if (cleaned.length === 10) return `+91${cleaned}`; // Add +91 if it's just a standard 10-digit number
    if (!phone.startsWith('+')) return `+${cleaned}`;
    return phone;
};

// --- 3. THE CORE AUTOMATION FUNCTION ---
const checkAndSendRentReminders = async () => {
    console.log("⏰ [CRON] Running daily rent reminder check...");

    try {
        // Everyone whose rent is due TODAY OR EARLIER. It used to be `= CURDATE()`,
        // which meant a tenant who missed the day was never mentioned again — the
        // reminder fired once, into a channel that was not configured, and that was
        // that.
        //
        // Nothing before the due date, deliberately, and that is enforced here in SQL as
        // well as in the schedule below: chasing rent that is not owed yet is not the
        // app's job.
        //
        // `id` and the tenant's portal account come along now, so a reminder can reach
        // a phone rather than only an inbox.
        const query = `
            SELECT 
                t.id AS tenant_id,
                t.name as tenant_name, t.email as tenant_email, t.phone as tenant_phone, 
                t.rent_share, t.next_rent_due,
                u.unit_number, u.notify_email, u.notify_sms, u.notify_whatsapp,
                p.name as property_name,
                ps.upi_id, ps.upi_number, ps.qr_code_url
            FROM tenants t
            JOIN units u ON t.unit_id = u.id
            JOIN properties p ON u.property_id = p.id
            LEFT JOIN payment_settings ps ON t.owner_id = ps.owner_id
            WHERE t.status = 'Active' 
            AND t.next_rent_due IS NOT NULL
            AND t.next_rent_due <= CURDATE()
        `;

        const [candidates] = await db.query(query);

        // Which of them actually hear from us this morning. Somebody forty days behind
        // must not be pushed forty times — by day five they have muted the app, and then
        // nothing reaches them again, including the things that matter more.
        const now = new Date();
        const dueTenants = candidates.filter((t) => shouldRemind(daysPastDue(t.next_rent_due, now)));
        const held = candidates.length - dueTenants.length;
        if (held > 0) {
            console.log(`🔕 [CRON] ${held} overdue tenant(s) skipped today by the reminder schedule.`);
        }

        if (dueTenants.length === 0) {
            console.log("✅ [CRON] Nobody to remind today. Sleeping.");
            return;
        }

        console.log(`🔔 [CRON] Reminding ${dueTenants.length} tenant(s). Processing...`);

        // LOOP through EVERY tenant who owes money today
        for (const tenant of dueTenants) {
            
            // ==============================================
            // 🔔 0. PUSH (the only channel that needs no account with anybody)
            // ==============================================
            // First, and unconditional, because it is the one that actually works right
            // now: email needs SMTP credentials and SMS needs Twilio, and this server
            // has neither — which is why this cron has been composing messages every
            // morning and delivering none of them.
            //
            // No per-unit toggle, because those three switches live on `units` and
            // describe a room. A push goes to a device belonging to a person; somebody
            // who does not want them turns them off in the OS, which is the control they
            // already understand.
            try {
                const past = daysPastDue(tenant.next_rent_due, now);
                const [accounts] = await db.query(
                    'SELECT id FROM tenant_users WHERE tenant_id = ?',
                    [tenant.tenant_id]
                );
                for (const a of accounts) {
                    notify({
                        role: 'tenant',
                        accountId: a.id,
                        kind: reminderKind(past),
                        data: {
                            // reminderKind picks the wording; both read `days`, but one
                            // counts down to nothing and the other counts up.
                            days: Math.abs(past),
                            amount: tenant.rent_share,
                            property: tenant.property_name,
                            unit: tenant.unit_number
                        }
                    });
                }
            } catch (err) {
                // A reminder that could not be pushed must not stop the email and SMS
                // below from going out to the same person.
                console.error(`❌ Push reminder failed for ${tenant.tenant_name}:`, err.message);
            }

            const amountStr = `₹${tenant.rent_share}`;
            const qrLink = tenant.qr_code_url ? `${process.env.BASE_URL}${tenant.qr_code_url}` : 'No QR Provided';
            const formattedPhone = formatPhone(tenant.tenant_phone);

            // ==============================================
            // 📧 1. SEND EMAIL (Only if switch is ON)
            // ==============================================
            if (tenant.notify_email && tenant.tenant_email) {
                const mailOptions = {
                    to: tenant.tenant_email,
                    subject: `Rent Reminder: ${tenant.property_name} - Unit ${tenant.unit_number}`,
                    html: `
                        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                            <h2>Hello ${tenant.tenant_name},</h2>
                            <p>This is a gentle reminder that your rent of <strong>${amountStr}</strong> is due today.</p>
                            
                            <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
                                <h3 style="margin-top: 0; color: #3b82f6;">Payment Details</h3>
                                <p><strong>UPI ID:</strong> ${tenant.upi_id || 'Not provided'}</p>
                                <p><strong>UPI Number:</strong> ${tenant.upi_number || 'Not provided'}</p>
                                ${tenant.qr_code_url ? `<p><a href="${qrLink}" style="color: #10b981; font-weight: bold;">Click here to view Payment QR Code</a></p>` : ''}
                            </div>
                            
                            <p>Thank you!</p>
                        </div>
                    `
                };

                if (!isMailConfigured) {
                    // Say it per run rather than failing quietly for every tenant:
                    // an unconfigured server would otherwise log a wall of identical
                    // send errors that look like a delivery problem.
                    console.warn(`⚠️  [CRON] Email not configured — no reminder sent to ${tenant.tenant_name}.`);
                } else {
                    try {
                        await sendAppMail(mailOptions);
                        console.log(`📧 Email sent to ${tenant.tenant_name}`);
                    } catch (err) {
                        console.error(`❌ Failed to send email to ${tenant.tenant_name}:`, err.message);
                    }
                }
            }

            // ==============================================
            // 📱 2. SEND SMS (Only if switch is ON)
            // ==============================================
            if (tenant.notify_sms && tenant.tenant_phone) {
                const smsMessage = `Hi ${tenant.tenant_name}, your rent of ${amountStr} for ${tenant.property_name} is due today. UPI: ${tenant.upi_id || 'N/A'}. Thank you!`;
                
                if (twilioClient) {
                    try {
                        await twilioClient.messages.create({
                            body: smsMessage,
                            from: process.env.TWILIO_PHONE_NUMBER,
                            to: formattedPhone
                        });
                        console.log(`📱 Real SMS sent to ${tenant.tenant_name} (${formattedPhone})`);
                    } catch (err) {
                        console.error(`❌ SMS Failed for ${tenant.tenant_name}:`, err.message);
                    }
                } else {
                    console.log(`📱 [MOCK SMS] to ${formattedPhone}: ${smsMessage}`);
                }
            }

            // ==============================================
            // 🟩 3. SEND WHATSAPP (Only if switch is ON)
            // ==============================================
            if (tenant.notify_whatsapp && tenant.tenant_phone) {
                const waMessage = `*Rent Due Today!*\nHi ${tenant.tenant_name},\nYour rent of *${amountStr}* is due.\nUPI: ${tenant.upi_id || 'N/A'}\nQR Code: ${qrLink}`;
                
                if (twilioClient) {
                    try {
                        await twilioClient.messages.create({
                            body: waMessage,
                            from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
                            to: `whatsapp:${formattedPhone}`
                        });
                        console.log(`🟩 Real WhatsApp sent to ${tenant.tenant_name} (${formattedPhone})`);
                    } catch (err) {
                        console.error(`❌ WhatsApp Failed for ${tenant.tenant_name}:`, err.message);
                    }
                } else {
                    console.log(`🟩 [MOCK WHATSAPP] to ${formattedPhone}:\n${waMessage}`);
                }
            }
        } // End of For Loop

    } catch (error) {
        console.error("❌ [CRON] Error checking rent reminders:", error);
    }
};

// --- 4. SCHEDULE THE JOB ---
// "0 8 * * *" means "Run exactly at 8:00 AM every single day"
const initCronJobs = () => {
    cron.schedule('0 8 * * *', checkAndSendRentReminders, {
        scheduled: true,
        timezone: "Asia/Kolkata" 
    });
    console.log("⏱️ Cron jobs initialized (Running daily at 8:00 AM IST)");
};

module.exports = { initCronJobs, checkAndSendRentReminders };