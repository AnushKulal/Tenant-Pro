const db = require('../config/db');
const { getFileUrl } = require('../middleware/uploadMiddleware');
const { nextDueAfter, anchorDayOf } = require('../utils/rentDates');
const { notifyTenancy } = require('../services/pushService');
// The landlord's own payment gateway. Credentials are sealed on the way in and never
// come back out — see gatewayStatus below for what a client is allowed to be told.
const { getProvider, providerCatalog } = require('../services/gatewayService');
const { seal, hint, secretsReady, secretsProblem } = require('../utils/secretBox');

// Tell the tenant what became of the payment they declared.
//
// This is the notification with the most riding on it. Between declaring and hearing
// back, the tenant has paid real money and has nothing in the app saying it counted;
// a confirmation ends that, and a rejection is the only way they learn their landlord
// could not find it while the reference is still fresh enough to chase.
//
// The landlord's name is read AFTER the transaction and separately from the locked
// row. Joining `owners` into a SELECT ... FOR UPDATE would take a lock on the landlord
// as well as the payment, which serialises two confirmations by the same landlord for
// nothing but a display name.
const notifyPaymentDecision = (pay, status, note) => {
    const send = (landlordName) => notifyTenancy({
        tenantId: pay.tenant_id,
        kind: status === 'Confirmed' ? 'payment_confirmed' : 'payment_rejected',
        data: { landlordName, amount: Number(pay.amount_paid), note, id: pay.id }
    });
    if (!pay.owner_id) return send(null);
    db.query('SELECT name FROM owners WHERE id = ?', [pay.owner_id])
        // Without the name the copy says "Your landlord", which is true and readable,
        // so a failed lookup costs a word rather than the whole notification.
        .then(([rows]) => send(rows.length ? rows[0].name : null))
        .catch(() => send(null));
};

// Owner tokens carry no role; tenant tokens carry role: 'tenant'. server.js already
// mounts requireOwner on this whole router, so this is the second lock on the same
// door -- kept because these handlers treat req.user.id as an owners.id, and the day
// someone mounts them elsewhere the mount-level guard does not travel with them.
const isTenantToken = (req) => req.user?.role === 'tenant';

// What a client may be told about a connected gateway.
//
// Never the secret, and never the sealed form of it either — a ciphertext handed to a
// client is still the thing an attacker wants, and the only thing standing between it
// and the plaintext is an environment variable they may well also be after.
//
// `key_hint` is the last four characters of the Key ID, which is the public half of the
// pair and appears in the landlord's own dashboard. It is here for recognition — "yes,
// that is the key I generated" — and nothing else.
const gatewayStatus = (row) => {
    const provider = row && row.gateway ? getProvider(row.gateway) : null;
    if (!provider || !row.gateway_key_id) {
        return {
            connected: false,
            // Why connecting is impossible, if it is. A landlord tapping Connect on a
            // server with no CREDENTIALS_KEY would otherwise get "could not save" with
            // no idea that the fault is ours and not theirs.
            can_connect: secretsReady(),
            blocked_reason: secretsReady() ? null : secretsProblem(),
            providers: providerCatalog()
        };
    }
    return {
        connected: true,
        can_connect: secretsReady(),
        blocked_reason: secretsReady() ? null : secretsProblem(),
        provider: provider.id,
        provider_label: provider.label,
        key_hint: hint(row.gateway_key_id),
        enabled: !!row.gateway_enabled,
        providers: providerCatalog()
    };
};

// Everything about a payment_settings row that is safe to send, which is to say
// everything except the credential columns.
//
// This exists because the handler below used `SELECT *` and returned the row whole. The
// moment gateway_secret joined that table, `SELECT *` started handing every landlord
// their own sealed secret on every settings load — one careless log, one crash reporter
// capturing a response body, and it is out. A column list is the fix, and a function
// rather than a literal so there is one place the next column has to be considered.
const publicSettings = (row) => ({
    id: row.id,
    owner_id: row.owner_id,
    upi_id: row.upi_id,
    upi_number: row.upi_number,
    qr_code_url: row.qr_code_url,
    updated_at: row.updated_at,
    gateway: gatewayStatus(row)
});

// --- FETCH PAYMENT SETTINGS ---
const getPaymentSettings = async (req, res) => {
    try {
        const ownerId = req.user.id;

        const [settings] = await db.query(
            `SELECT id, owner_id, upi_id, upi_number, qr_code_url, updated_at,
                    gateway, gateway_key_id, gateway_enabled
               FROM payment_settings WHERE owner_id = ?`,
            [ownerId]
        );

        if (settings.length === 0) {
            // `gateway` is sent even with no row at all, because the screen has to be
            // able to draw the Connect option — and say why it cannot — for a landlord
            // who has never saved any payment settings.
            return res.status(200).json({ settings: null, gateway: gatewayStatus(null) });
        }

        res.status(200).json({ settings: publicSettings(settings[0]), gateway: gatewayStatus(settings[0]) });
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

// --- CONNECTING THE LANDLORD'S OWN PAYMENT GATEWAY ---
// POST /api/payments/gateway   { provider, key_id, key_secret }
//
// Verified against the gateway BEFORE it is stored, and refused if the gateway says no.
// That ordering is the whole value of this handler: a mistyped secret saved happily now
// becomes a tenant, days later, tapping Pay and getting nothing, with the landlord
// nowhere near the screen where it could be fixed. Checking while they are still
// looking at the form turns a silent future failure into "Razorpay did not accept that
// Key ID and secret."
const connectGateway = async (req, res) => {
    if (isTenantToken(req)) {
        return res.status(403).json({ message: 'Landlord access only.' });
    }

    const provider = getProvider(req.body?.provider || 'razorpay');
    if (!provider) {
        return res.status(400).json({ message: 'That payment gateway is not supported.' });
    }

    // Refused before anything is read from the body, because without the key there is
    // nowhere to put a secret that is not plain text in a database.
    if (!secretsReady()) {
        return res.status(503).json({
            message: `Payment gateways are not available on this server yet (${secretsProblem()}).`
        });
    }

    const keyId = String(req.body?.key_id || '').trim();
    const keySecret = String(req.body?.key_secret || '').trim();
    if (!keyId || !keySecret) {
        return res.status(400).json({ message: `Enter both the ${provider.keyLabel} and the ${provider.secretLabel}.` });
    }
    // A length ceiling matching the columns, so an accidental paste of a whole page is
    // refused here rather than truncated by MySQL into a key that looks saved and is not.
    if (keyId.length > 120 || keySecret.length > 200) {
        return res.status(400).json({ message: 'That does not look like a key — check what you pasted.' });
    }

    try {
        const check = await provider.verify({ keyId, secret: keySecret });
        if (!check.ok) {
            // 400 when the gateway rejected the credentials — the landlord can fix that.
            // 502 when the gateway merely failed to answer, because retrying is the right
            // advice and "check your key" would be a lie.
            return res.status(check.rejected ? 400 : 502).json({ message: check.reason });
        }

        const sealed = seal(keySecret);
        // Connecting switches it on. A landlord who has just pasted two credentials and
        // watched them be accepted does not also want to hunt for a toggle; the toggle
        // below exists for turning it OFF again without throwing the keys away.
        await db.query(
            `INSERT INTO payment_settings (owner_id, gateway, gateway_key_id, gateway_secret, gateway_enabled)
             VALUES (?, ?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE
                gateway = VALUES(gateway),
                gateway_key_id = VALUES(gateway_key_id),
                gateway_secret = VALUES(gateway_secret),
                gateway_enabled = 1`,
            [req.user.id, provider.id, keyId, sealed]
        );

        res.status(200).json({
            message: `${provider.label} connected. Tenants can now pay by card, netbanking or UPI.`,
            gateway: gatewayStatus({ gateway: provider.id, gateway_key_id: keyId, gateway_enabled: 1 })
        });
    } catch (error) {
        console.error('Error connecting payment gateway:', error.message);
        res.status(500).json({ message: 'Could not save those gateway details.' });
    }
};

// PUT /api/payments/gateway   { enabled: true | false }
// Pausing online payments without surrendering the keys — which a landlord wants when a
// gateway is between KYC states, or when they would simply rather be paid by UPI this
// month. Tenants fall back to the free UPI flow, which never went away.
const toggleGateway = async (req, res) => {
    if (isTenantToken(req)) {
        return res.status(403).json({ message: 'Landlord access only.' });
    }
    const enabled = req.body?.enabled === true || req.body?.enabled === 'true' ? 1 : 0;
    try {
        const [rows] = await db.query(
            'SELECT gateway, gateway_key_id FROM payment_settings WHERE owner_id = ?',
            [req.user.id]
        );
        if (!rows.length || !rows[0].gateway_key_id) {
            return res.status(400).json({ message: 'No payment gateway is connected yet.' });
        }
        await db.query('UPDATE payment_settings SET gateway_enabled = ? WHERE owner_id = ?', [enabled, req.user.id]);
        res.status(200).json({
            message: enabled ? 'Online payments are on.' : 'Online payments are off. Tenants can still pay by UPI.',
            gateway: gatewayStatus({ ...rows[0], gateway_enabled: enabled })
        });
    } catch (error) {
        console.error('Error toggling payment gateway:', error.message);
        res.status(500).json({ message: 'Could not change that setting.' });
    }
};

// DELETE /api/payments/gateway
// Forgets the credentials entirely. Offered next to the pause above because the two are
// different intentions and conflating them is how a landlord who wanted to stop taking
// cards for a month ends up having to generate a new key.
//
// Payment links already created keep working — they live at the gateway, not here — and
// any that get paid can still be settled, because gateway_ref stays on the row and the
// landlord can confirm by hand. Removing the keys stops NEW links being made.
const disconnectGateway = async (req, res) => {
    if (isTenantToken(req)) {
        return res.status(403).json({ message: 'Landlord access only.' });
    }
    try {
        await db.query(
            `UPDATE payment_settings
                SET gateway = NULL, gateway_key_id = NULL, gateway_secret = NULL, gateway_enabled = 0
              WHERE owner_id = ?`,
            [req.user.id]
        );
        res.status(200).json({
            message: 'Gateway disconnected. Your UPI details are untouched.',
            gateway: gatewayStatus(null)
        });
    } catch (error) {
        console.error('Error disconnecting payment gateway:', error.message);
        res.status(500).json({ message: 'Could not disconnect that gateway.' });
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
        // due_date records WHICH rent this settles — the tenant's next_rent_due right
        // now, before step 3 moves it forward. Captured here because this is the only
        // moment it is knowable: next_rent_due is overwritten below, so afterwards there
        // is no way to say whether this payment was early, on time or late. That missing
        // fact is why the tenant score reported "None missed" for everybody.
        const [entered] = await db.query(
            `INSERT INTO payments (tenant_id, amount_paid, payment_date, payment_method, reference_id, status, due_date)
             VALUES (?, ?, ?, ?, ?, 'Confirmed', ?)`,
            [id, amount, payment_date, payment_mode, reference_id || null, tenants[0].next_rent_due || null]
        );

        // The tenant never asked for this one — the landlord entered it, usually for
        // cash or a transfer that arrived outside the app — which is exactly why it is
        // worth sending. It is the tenant's only confirmation that money handed over in
        // person was written down, and their receipt is now there to prove it.
        notifyPaymentDecision(
            { id: entered.insertId, tenant_id: id, amount_paid: amount, owner_id: req.user.id },
            'Confirmed',
            null
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
                    t.next_rent_due, t.move_in_date, t.name AS tenant_name, t.owner_id
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

        // Told here rather than in decidePayment, because BOTH callers owe the tenant
        // this: a gateway webhook confirming a payment settles their month exactly as a
        // landlord tapping Confirm does, and a tenant who learns about one but not the
        // other has no way to know which kind of confirmation they got.
        //
        // After the commit on purpose. A notification about a transaction that then
        // rolled back is a receipt for money the app no longer believes it received.
        notifyPaymentDecision(pay, status, note);

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
    connectGateway,
    toggleGateway,
    disconnectGateway,
    gatewayStatus,
    publicSettings,
    recordPayment,
    getDeclaredPayments,
    decidePayment
};