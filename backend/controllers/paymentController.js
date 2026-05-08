const db = require('../config/db');

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
            // Reusing your existing upload structure
            qr_code_url = `/uploads/payments/${req.file.filename}`; 
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

const recordPayment = async (req, res) => {
    const { id } = req.params; // This is the tenant_id from the URL
    const { amount, payment_mode, reference_id, payment_date } = req.body;

    try {
        // 1. Verify the tenant exists and get their current due date
        // ✨ FIX: Removed .promise()
        const [tenants] = await db.query(
            `SELECT next_rent_due FROM tenants WHERE id = ? AND owner_id = ?`, 
            [id, req.user.id] // req.user.id comes from authMiddleware
        );

        if (tenants.length === 0) {
            return res.status(404).json({ message: "Tenant not found or unauthorized." });
        }

        // 2. Save the actual payment receipt to the database
        // ✨ FIX: Removed .promise()
        await db.query(
            `INSERT INTO payments (tenant_id, amount_paid, payment_date, payment_method, reference_id)
             VALUES (?, ?, ?, ?, ?)`,
            [id, amount, payment_date, payment_mode, reference_id || null]
        );

        // 3. The Smart Math: Push the due date forward by 1 month!
        let currentDueDate = new Date(tenants[0].next_rent_due);
        
        // Safety fallback: If they somehow don't have a due date yet, start from the payment date
        if (isNaN(currentDueDate.getTime())) {
            currentDueDate = new Date(payment_date); 
        }

        // Add exactly 1 month
        currentDueDate.setMonth(currentDueDate.getMonth() + 1);
        
        // Format it safely for MySQL (YYYY-MM-DD)
        const year = currentDueDate.getFullYear();
        const month = String(currentDueDate.getMonth() + 1).padStart(2, '0');
        const day = String(currentDueDate.getDate()).padStart(2, '0');
        const nextRentDueStr = `${year}-${month}-${day}`;

        // 4. Update the tenant's profile with their new due date
        // ✨ FIX: Removed .promise()
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

module.exports = { getPaymentSettings, savePaymentSettings, recordPayment };