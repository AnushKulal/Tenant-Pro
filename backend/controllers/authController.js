// File: backend/controllers/authController.js
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sendAppMail, isMailConfigured } = require('../config/mailer');

// --- Registration Logic ---
const registerOwner = async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;
        
        if (!name || !email || !phone || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        // Check if email or phone already exists BEFORE inserting
        const checkSql = `SELECT email, phone FROM owners WHERE email = ? OR phone = ?`;
        const [existingOwners] = await db.execute(checkSql, [email, phone]);

        if (existingOwners.length > 0) {
            const existing = existingOwners[0];
            
            // Send specific error messages based on what matched
            if (existing.email === email) {
                return res.status(409).json({ message: 'An account with this email already exists.' });
            }
            if (existing.phone === phone) {
                return res.status(409).json({ message: 'This phone number is already registered.' });
            }
        }

        // The two portals are kept mutually exclusive: one email or mobile number
        // belongs to a landlord account OR a tenant account, never both. Sign-in
        // now accepts either identifier, so an address living in both tables would
        // be genuinely ambiguous — and a reset code sent to it could plausibly be
        // meant for either account. Enforced at the point of creation, which is the
        // only place it can be enforced cheaply.
        const [crossTenant] = await db.execute(
            'SELECT email, phone FROM tenant_users WHERE email = ? OR phone = ?',
            [email, phone]
        );
        if (crossTenant.length > 0) {
            const clash = crossTenant[0];
            return res.status(409).json({
                message: clash.email === email
                    ? 'This email is already used for a tenant account. Use a different email, or sign in through the tenant portal.'
                    : 'This mobile number is already used for a tenant account. Use a different number, or sign in through the tenant portal.'
            });
        }

        // If no duplicates were found, proceed with hashing and saving
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // profile_pic will default to NULL automatically in the database
        const sql = `INSERT INTO owners (name, email, phone, password_hash) VALUES (?, ?, ?, ?)`;
        const [result] = await db.execute(sql, [name, email, phone, hashedPassword]);

        res.status(201).json({ 
            message: 'Owner registered successfully!', 
            ownerId: result.insertId 
        });

    } catch (error) {
        console.error('Registration Error:', error);
        res.status(500).json({ message: 'Server error during registration' });
    }
};

// --- Login Logic ---
const loginOwner = async (req, res) => {
    try {
        // Sign-in accepts an email OR a mobile number. `identifier` is what the app
        // sends now; `email` is still honoured so an older build keeps working.
        const { email, identifier, password, mode } = req.body;
        const login = String(identifier ?? email ?? '').trim();

        if (!login || !password) {
            return res.status(400).json({ message: 'Enter your email or mobile number and your password.' });
        }

        // `mode` says which KIND of identifier the user chose on the EMAIL/MOBILE
        // switch. Without it this matched either column, so picking MOBILE and then
        // typing an email address signed you in anyway — the switch looked like it
        // meant something and did not. Optional, so an older build that sends no
        // mode keeps its previous behaviour rather than breaking.
        const want = String(mode || '').trim().toLowerCase();
        const sql = want === 'mobile'
            ? 'SELECT * FROM owners WHERE phone = ?'
            : want === 'email'
                ? 'SELECT * FROM owners WHERE email = ?'
                : 'SELECT * FROM owners WHERE email = ? OR phone = ?';
        const params = want === 'mobile' || want === 'email' ? [login] : [login, login];
        const [rows] = await db.execute(sql, params);
        const owner = rows[0];

        // These answers are deliberately DIFFERENT, which is a product decision with
        // a security cost worth stating: it confirms to anyone asking whether a given
        // address is registered here. That is the same trade most consumer apps make,
        // because "wrong email or password" sends someone who simply has no account
        // round in circles retyping a password that never existed. The mitigation is
        // rate limiting (see middleware/rateLimit) rather than vagueness.
        if (!owner) {
            return res.status(404).json({
                code: 'NOT_REGISTERED',
                message: 'No landlord account is registered with these details.'
            });
        }

        const isMatch = await bcrypt.compare(password, owner.password_hash);
        if (!isMatch) {
            return res.status(401).json({
                code: 'WRONG_PASSWORD',
                message: 'Incorrect password. Try again or reset it.'
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: owner.id, email: owner.email }, 
            process.env.JWT_SECRET,               
            { expiresIn: '7d' }                   
        );

        // Send back all necessary user profile data
        res.status(200).json({
            message: 'Login successful',
            token: token,
            owner: { 
                id: owner.id, 
                name: owner.name, 
                email: owner.email, 
                phone: owner.phone || null, 
                profile_pic: owner.profile_pic || null 
            }
        });

    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ message: 'Server error during login' });
    }
};

// Password recovery serves both account types. Owners and tenants live in
// different tables, so the role picks the target — and it is resolved through this
// fixed map rather than interpolated from the request, so a table name can never
// come from user input. Anything other than 'tenant' falls back to owner, which
// keeps older clients that send no role working unchanged.
const RESET_TARGETS = {
    owner: { table: 'owners', noun: 'account' },
    tenant: { table: 'tenant_users', noun: 'tenant account' }
};
const resolveTarget = (role) => (role === 'tenant'
    ? { role: 'tenant', ...RESET_TARGETS.tenant }
    : { role: 'owner', ...RESET_TARGETS.owner });

// a…b@example.com — enough to recognise your own address, not enough to learn
// someone else's from a mobile number you guessed.
const maskEmail = (addr = '') => {
    const [user, domain] = String(addr).split('@');
    if (!domain) return addr;
    const shown = user.length <= 2 ? user.slice(0, 1) : `${user[0]}…${user[user.length - 1]}`;
    return `${shown}@${domain}`;
};

// An identifier can match more than one row once guests exist: a guest is created
// from a phone number alone, and the same person may later register properly with
// that number. Without an ORDER BY, which row came back was whatever the storage
// engine felt like returning — so the same reset request could behave differently
// on two consecutive calls. Rows that actually HAVE an email sort first, because
// those are the only ones a reset can be delivered to. Valid on `owners` too,
// where email is NOT NULL and the clause is simply a no-op.
const ACCOUNT_PREFERENCE = 'ORDER BY (email IS NULL), id';

// Guest accounts have no email and no password — that is the whole point of them
// (see guestController). Password reset used to walk straight into that: it read
// `email` as NULL, tried to INSERT it into password_resets.email, which is NOT
// NULL, and the caller got "Server error. Please try again." with an
// ER_BAD_NULL_ERROR in the log. Reproduced against a real database before fixing.
//
// A guest cannot be given a reset code, so say what they should do instead rather
// than failing. Returns null when the account is fine, or the body to send back.
const emailless = (account) => {
    if (account.email) return null;
    return account.is_guest
        ? {
            code: 'GUEST_ACCOUNT',
            message: 'This is a guest account, so it has no password. Sign in with your guest ID and phone number instead.'
        }
        : {
            code: 'NO_EMAIL',
            message: 'There is no email address on this account, so a reset code cannot be sent. Please contact support.'
        };
};

// --- Forgot Password: email a 6-digit reset code ---
const forgotPassword = async (req, res) => {
    try {
        // Accepts an email OR a mobile number, matching what sign-in accepts. `email`
        // is still honoured so an older build keeps working.
        const { email, identifier, role } = req.body;
        const login = String(identifier ?? email ?? '').trim();
        if (!login) {
            return res.status(400).json({ message: 'Enter your registered email or mobile number.' });
        }

        // Say so plainly rather than accepting the request and dropping it. This is
        // a server-wide condition, identical for every address, so it leaks nothing.
        if (!isMailConfigured) {
            console.warn('⚠️  Password reset requested but email is not configured — see the boot log.');
            return res.status(503).json({
                message: 'Password reset is unavailable right now. Please contact support.'
            });
        }

        const target = resolveTarget(role);
        // Look the account up by EITHER identifier, but always key the reset on the
        // account's own email: that is where the code is sent, and it keeps one row
        // per account no matter which identifier was typed.
        const [owners] = await db.query(
            `SELECT id, name, email${target.table === 'tenant_users' ? ', is_guest' : ', 0 AS is_guest'}
               FROM \`${target.table}\`
              WHERE email = ? OR phone = ?
              ${ACCOUNT_PREFERENCE}`,
            [login, login]
        );

        // Refuse identifiers that are not registered, rather than accepting them
        // silently. This is what stops the flow looking like it will reset "any
        // random account": no account, no code, no row written, and the caller is
        // told plainly. It does confirm whether an address is registered — the same
        // trade the sign-in messages make, mitigated by rate limiting.
        if (owners.length === 0) {
            return res.status(404).json({
                code: 'NOT_REGISTERED',
                message: `No ${target.role === 'tenant' ? 'tenant' : 'landlord'} account is registered with these details.`
            });
        }

        const noEmail = emailless(owners[0]);
        if (noEmail) return res.status(409).json(noEmail);

        {
            // The code always goes to the account's registered email, never to
            // anything supplied in the request — so a reset cannot be redirected by
            // asking for it with someone else's address.
            const accountEmail = owners[0].email;
            const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits

            // Replace any previous codes for this email AND role, then store the new
            // one (15 min TTL). Scoped by role so requesting an owner code does not
            // invalidate a tenant code for the same address.
            await db.query('DELETE FROM password_resets WHERE email = ? AND role = ?', [accountEmail, target.role]);
            await db.query(
                `INSERT INTO password_resets (email, role, code, expires_at)
                 VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))`,
                [accountEmail, target.role, code]
            );

            {
                try {
                    // Through the shared sender so the no-reply identity (from name,
                    // automated-message headers, do-not-reply footer) is applied here
                    // exactly as it is for rent reminders.
                    await sendAppMail({
                        to: accountEmail,
                        subject: 'Your TenantPro password reset code',
                        html: `
                            <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                                <h2>Password Reset</h2>
                                <p>Hello ${owners[0].name || ''}, use this code to reset the password on your TenantPro ${target.noun}:</p>
                                <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #3b82f6;">${code}</p>
                                <p>This code expires in 15 minutes. If you didn't request this, you can ignore this email.</p>
                            </div>
                        `
                    });
                    console.log(`📧 Password reset code sent to ${accountEmail}`);
                } catch (mailErr) {
                    // Previously this was swallowed and the request still answered
                    // "a code has been sent". The user then waited for an email that
                    // was never going to arrive, with nothing anywhere saying why.
                    // A send failure is effectively always global (bad credentials,
                    // provider down) rather than specific to one address, so
                    // reporting it reveals nothing about who is registered.
                    console.error('❌ Failed to send reset email:', mailErr.message);
                    return res.status(502).json({
                        message: 'We could not send the email just now. Please try again in a minute.'
                    });
                }
            }
        }

        res.status(200).json({
            // Echo the masked destination so the user knows WHERE to look — a code
            // sent to an old address is otherwise indistinguishable from one that
            // was never sent.
            sentTo: maskEmail(owners[0].email),
            message: `A reset code has been sent to ${maskEmail(owners[0].email)}.`
        });
    } catch (error) {
        console.error('Forgot Password Error:', error);
        res.status(500).json({ message: 'Server error. Please try again.' });
    }
};

// --- Reset Password: verify the code and set a new password ---
const resetPassword = async (req, res) => {
    try {
        const { email, identifier, code, newPassword, role } = req.body;
        const login = String(identifier ?? email ?? '').trim();
        if (!login || !code || !newPassword) {
            return res.status(400).json({ message: 'Your email or mobile number, the code, and a new password are all required.' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters.' });
        }

        const target = resolveTarget(role);

        // Resolve the identifier back to a real account first. Codes are keyed on the
        // account's own email, so someone cannot present a code alongside a different
        // address and have the reset land somewhere else.
        const [accounts] = await db.query(
            `SELECT email${target.table === 'tenant_users' ? ', is_guest' : ', 0 AS is_guest'}
               FROM \`${target.table}\`
              WHERE email = ? OR phone = ?
              ${ACCOUNT_PREFERENCE}`,
            [login, login]
        );
        if (accounts.length === 0) {
            return res.status(404).json({
                code: 'NOT_REGISTERED',
                message: 'No account is registered with these details.'
            });
        }

        // Without this the guest case failed CONFUSINGLY rather than loudly: the
        // code lookup ran `WHERE email = NULL`, which in SQL matches nothing no
        // matter what is stored, so a guest was told "Invalid or expired code" for
        // a code that was never issuable in the first place. Same answer as the
        // request step now, so the two halves of the flow cannot disagree.
        const noEmail = emailless(accounts[0]);
        if (noEmail) return res.status(409).json(noEmail);

        const accountEmail = accounts[0].email;

        // The role is part of the match, so a code issued for one account type can
        // never reset the other.
        const [rows] = await db.query(
            `SELECT id FROM password_resets
             WHERE email = ? AND role = ? AND code = ? AND expires_at > NOW()
             ORDER BY created_at DESC LIMIT 1`,
            [accountEmail, target.role, code]
        );

        if (rows.length === 0) {
            return res.status(400).json({ message: 'Invalid or expired code.' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.query(
            `UPDATE \`${target.table}\` SET password_hash = ? WHERE email = ?`,
            [hashedPassword, accountEmail]
        );

        // Invalidate this account type's codes now that one has been used.
        await db.query('DELETE FROM password_resets WHERE email = ? AND role = ?', [accountEmail, target.role]);

        res.status(200).json({ message: 'Password reset successful. You can now sign in.' });
    } catch (error) {
        console.error('Reset Password Error:', error);
        res.status(500).json({ message: 'Server error. Please try again.' });
    }
};

// --- Export Functions ---
module.exports = {
    registerOwner,
    loginOwner,
    forgotPassword,
    resetPassword
};