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
const { transporter, isMailConfigured, mailFrom } = require('../config/mailer');

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
        // Find ALL tenants whose rent is due EXACTLY today.
        // It also grabs the toggle switches (notify_email, notify_sms, notify_whatsapp) for their unit!
        const query = `
            SELECT 
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
            AND t.next_rent_due = CURDATE()
        `;

        const [dueTenants] = await db.query(query);

        if (dueTenants.length === 0) {
            console.log("✅ [CRON] No rent due today. Sleeping.");
            return;
        }

        console.log(`🔔 [CRON] Found ${dueTenants.length} tenants due today. Processing...`);

        // LOOP through EVERY tenant who owes money today
        for (const tenant of dueTenants) {
            
            const amountStr = `₹${tenant.rent_share}`;
            const qrLink = tenant.qr_code_url ? `${process.env.BASE_URL}${tenant.qr_code_url}` : 'No QR Provided';
            const formattedPhone = formatPhone(tenant.tenant_phone);

            // ==============================================
            // 📧 1. SEND EMAIL (Only if switch is ON)
            // ==============================================
            if (tenant.notify_email && tenant.tenant_email) {
                const mailOptions = {
                    from: `"TenantPro System" <${mailFrom}>`,
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
                        await transporter.sendMail(mailOptions);
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