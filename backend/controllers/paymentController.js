const db = require('../config/db');
const { getFileUrl } = require('../middleware/uploadMiddleware');
const { nextDueAfter, anchorDayOf } = require('../utils/rentDates');

// Owner tokens carry no role; tenant tokens carry role: 'tenant'. server.js already
// mounts requireOwner on this whole router, so this is the second lock on the same
// door -- kept because these handlers treat req.user.id as an owners.id, and the day
// someone mounts them elsewhere the mount-level guard does not travel with them.
const isTenantToken = (req) => req.user?.role === 'tenant';

// --- FETCH PAYMENT SETTINGS ---
const getPaymentSettings = async (req, res) => {
    try {
        const ownerId = req.user.id;
        
        const [settings] = await db.query('SELECT * FROM payment_settings WHERE owner_id = ?', [ownerId]);
        
        if (settings.length === 0) {
            return res.status(200).json({ settings: null });
        }
        
        res.status(200).json({ settings: settings[0] });
    } catch (error) {
        console.error("Error fetching payment settings:", error);
        res.status(500).json({ message: "Server error while fetching payment settings." });
    }
};

// --- SAVE OR UPDATE PAYMENT SETTINGS ---
const savePaymentSettings = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const { upi_id, upi_number } = req.body;

        // --- 1. STRICT BACKEND VALIDATION ---
        
        // Validate UPI ID (e.g., user@okhdfcbank)
        if (upi_id && upi_id.trim() !== '') {
            const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
            if (!upiRegex.test(upi_id.trim())) {
                return res.status(400).json({ message: "Invalid UPI ID format. It should look like 'name@bank'." });
            }
        }

        // Validate UPI Phone Number (Must be exactly 10 digits)
        if (upi_number && upi_number.trim() !== '') {
            const phoneRegex = /^\d{10}$/;
            if (!phoneRegex.test(upi_number.trim())) {
                return res.status(400).json({ message: "Invalid UPI Number. It must be exactly 10 digits." });
            }
        }

        // Prevent saving a completely empty form
        if (!upi_id && !upi_number && !req.file) {
            return res.status(400).json({ message: "Please provide at least one payment method (UPI ID, Number, or QR Code)." });
        }

        // --- 2. HANDLE QR CODE IMAGE ---
        let qr_code_url = null;
        if (req.file) {
            // Works for both local disk and Cloudinary storage
            qr_code_url = getFileUrl(req.file);
        }

        // --- 3. UPSERT LOGIC (Update if exists, Insert if new) ---
        const [existing] = await db.query('SELECT id FROM payment_settings WHERE owner_id = ?', [ownerId]);

        if (existing.length > 0) {
            // Build dynamic update query so we don't overwrite the QR code with NULL if they didn't upload a new one
            let updateQuery = 'UPDATE payment_settings SET upi_id = ?, upi_number = ?';
            let queryParams = [upi_id || null, upi_number || null];

            if (qr_code_url) {
                updateQuery += ', qr_code_url = ?';
                queryParams.push(qr_code_url);
            }

            updateQuery += ' WHERE owner_id = ?';
            queryParams.push(ownerId);

            await db.query(updateQuery, queryParams);
        } else {
            // Insert brand new settings
            await db.query(
                'INSERT INTO payment_settings (owner_id, upi_id, upi_number, qr_code_url) VALUES (?, ?, ?, ?)',
                [ownerId, upi_id || null, upi_number || null, qr_code_url]
            );
        }

        res.status(200).json({ message: "Payment settings saved successfully!" });

    } catch (error) {
        console.error("Error saving payment settings:", error);
        res.status(500).json({ message: "Server error while saving payment details." });
    }
};

// --- THE LANDLORD RECORDS A PAYMENT THEY SAW ARRIVE ---
// Born Confirmed: this is the landlord's own statement about their own money, so
// there is nobody left to verify it. A tenant CLAIMING a payment goes through
// tenantPortalController.declarePayment and waits for decidePayment below.
const recordPayment = async (req, res) => {
    const { id } = req.params; // This is the tenant_id from the URL
    const { amount, payment_mode, reference_id, payment_date } = req.body;

    try {
        // 1. Verify the tenant exists and get their current due date
        const [tenants] = await db.query(
            `SELECT next_rent_due, move_in_date FROM tenants WHERE id = ? AND owner_id = ?`,
            [id, req.user.id] // req.user.id comes from authMiddleware
        );

        if (tenants.length === 0) {
            return res.status(404).json({ message: "Tenant not found or unauthorized." });
        }

        // 2. Save the actual payment receipt to the database
        await db.query(
            `INSERT INTO payments (tenant_id, amount_paid, payment_date, payment_method, reference_id, status)
             VALUES (?, ?, ?, ?, ?, 'Confirmed')`,
            [id, amount, payment_date, payment_mode, reference_id || null]
        );

        // 3. Push the due date forward by one month. The month arithmetic -- including
        //    why a tenant anchored on the 31st does not drift -- lives in one place
        //    now, because confirming a declared payment has to give the same answer.
        const nextRentDueStr = nextDueAfter(
            tenants[0].next_rent_due,
            payment_date,
            anchorDayOf(tenants[0].move_in_date)
        );

        // 4. Update the tenant's profile with their new due date
        await db.query(
            `UPDATE tenants SET next_rent_due = ? WHERE id = ?`,
            [nextRentDueStr, id]
        );

        res.status(200).json({
            message: "Payment recorded successfully!",
            next_rent_due: nextRentDueStr
        });

    } catch (error) {
        console.error("Payment Error:", error);
        res.status(500).json({ message: "Server error while recording payment." });
    }
};

// --- THE QUEUE OF PAYMENTS TENANTS SAY THEY HAVE MADE ---
// GET /api/payments/declared
// Read on every dashboard load to put a count on the bell, so it returns the whole
// row the confirm sheet needs rather than making the client fetch each one.
const getDeclaredPayments = async (req, res) => {
    try {
        if (isTenantToken(req)) {
            return res.status(403).json({ message: 'Landlord access only.' });
        }
        const [rows] = await db.query(
            `SELECT
                pay.id, pay.amount_paid, pay.payment_date, pay.payment_method,
                pay.reference_id, pay.created_at,
                t.id AS tenant_id, t.name AS tenant_name, t.image_url AS tenant_image,
                t.rent_share, t.next_rent_due,
                u.unit_number, p.name AS property_name, p.id AS property_id
             FROM payments pay
             JOIN tenants t ON pay.tenant_id = t.id
             LEFT JOIN units u ON t.unit_id = u.id
             LEFT JOIN properties p ON u.property_id = p.id
             WHERE t.owner_id = ? AND pay.status = 'Declared'
             ORDER BY pay.created_at ASC`,
            [req.user.id]
        );
        res.status(200).json({ payments: rows });
    } catch (error) {
        console.error("Error fetching declared payments:", error);
        res.status(500).json({ message: "Could not load payments awaiting confirmation." });
    }
};

// --- THE LANDLORD'S VERDICT ON A CLAIMED PAYMENT ---
// PUT /api/payments/declared/:id   { decision: 'confirm' | 'reject', note }
// Confirming is the moment the money becomes real: it starts counting toward every
// total AND it advances the due date, which is what clears the month. Rejecting
// keeps the row as a record of the claim, so the tenant can see it was refused and
// why, rather than watching it silently vanish.
// The one place a payment's fate is written.
//
// Two callers reach this: a landlord tapping Confirm, and (later) a gateway webhook
// saying the money arrived. They MUST do the same thing — flip the status and, on
// confirmation, advance next_rent_due — because that date is what clears the month.
// Two copies of this would eventually give two different answers to "why is my due
// date wrong", so there is one.
//
// `scope` decides who is allowed to touch the row. A landlord may only decide their
// own tenants' payments, so it passes { ownerId }. A webhook has no landlord — it is
// vouching for a specific payment — so it passes nothing and the caller has already
// established which row it means.
//
// Returns a plain result rather than writing to `res`, so the HTTP shape belongs to
// the caller and this stays testable on its own.
const settlePayment = async ({ paymentId, status, note = null, source, gatewayRef = null, ownerId = null }) => {
    const conn = await db.getConnection();
    try {
        // Both writes or neither: if the due date moved but the status did not, the
        // landlord sees the claim again and confirming twice advances the date twice.
        await conn.beginTransaction();

        // FOR UPDATE so two taps, or a tap racing a webhook, cannot both pass the
        // still-Declared check.
        const [rows] = await conn.query(
            `SELECT pay.id, pay.status, pay.amount_paid, pay.payment_date, pay.tenant_id,
                    t.next_rent_due, t.move_in_date, t.name AS tenant_name
             FROM payments pay
             JOIN tenants t ON pay.tenant_id = t.id
             WHERE pay.id = ? ${ownerId != null ? 'AND t.owner_id = ?' : ''}
             FOR UPDATE`,
            ownerId != null ? [paymentId, ownerId] : [paymentId]
        );
        if (!rows.length) {
            await conn.rollback();
            return { ok: false, code: 404, message: 'Payment not found.' };
        }

        const pay = rows[0];
        if (pay.status !== 'Declared') {
            await conn.rollback();
            return {
                ok: false,
                code: 409,
                message: pay.status === 'Confirmed'
                    ? 'That payment was already confirmed.'
                    : 'That payment was already rejected.'
            };
        }

        await conn.query(
            `UPDATE payments
                SET status = ?, decided_at = NOW(), decision_note = ?,
                    confirmation_source = ?, gateway_ref = COALESCE(?, gateway_ref)
              WHERE id = ?`,
            [status, note, source, gatewayRef, pay.id]
        );

        let nextRentDue = pay.next_rent_due;
        if (status === 'Confirmed') {
            nextRentDue = nextDueAfter(pay.next_rent_due, pay.payment_date, anchorDayOf(pay.move_in_date));
            await conn.query('UPDATE tenants SET next_rent_due = ? WHERE id = ?', [nextRentDue, pay.tenant_id]);
        }

        await conn.commit();
        return {
            ok: true,
            status,
            source,
            next_rent_due: nextRentDue,
            tenant_id: pay.tenant_id,
            tenant_name: pay.tenant_name,
            amount: Number(pay.amount_paid)
        };
    } catch (error) {
        await conn.rollback().catch(() => {});
        throw error;
    } finally {
        conn.release();
    }
};

// --- THE LANDLORD'S VERDICT ON A CLAIMED PAYMENT ---
// PUT /api/payments/declared/:id   { decision: 'confirm' | 'reject', note }
const decidePayment = async (req, res) => {
    if (isTenantToken(req)) {
        return res.status(403).json({ message: 'Only your landlord can confirm a payment.' });
    }
    // Validated before a pooled connection is taken out, so a malformed request never
    // holds one of the ten.
    const decision = String(req.body?.decision || '').trim().toLowerCase();
    const status = { confirm: 'Confirmed', reject: 'Rejected' }[decision];
    if (!status) {
        return res.status(400).json({ message: "Decision must be 'confirm' or 'reject'." });
    }
    const note = String(req.body?.note || '').trim().slice(0, 300) || null;

    try {
        const r = await settlePayment({
            paymentId: req.params.id,
            status,
            note,
            source: 'landlord',
            ownerId: req.user.id
        });
        if (!r.ok) return res.status(r.code).json({ message: r.message });

        res.status(200).json({
            message: status === 'Confirmed'
                ? `₹${r.amount.toLocaleString('en-IN')} from ${r.tenant_name} confirmed.`
                : `Payment from ${r.tenant_name} rejected.`,
            status,
            next_rent_due: r.next_rent_due
        });
    } catch (error) {
        console.error("Error deciding payment:", error);
        res.status(500).json({ message: "Server error while confirming the payment." });
    }
};

module.exports = {
    settlePayment,
    getPaymentSettings,
    savePaymentSettings,
    recordPayment,
    getDeclaredPayments,
    decidePayment
};