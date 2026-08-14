// File: backend/controllers/tenantAuthController.js
// Auth for TENANT accounts (separate from owner/landlord accounts).
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { tryProposeLinks } = require('../services/tenantLinkService');

// --- Tenant Registration ---
const registerTenant = async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;
        if (!name || !email || !phone || !password) {
            return res.status(400).json({ message: 'All fields are required.' });
        }
        if (password.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters.' });
        }

        // Check the phone too: it is a sign-in identifier now, so a duplicate one
        // would make that number ambiguous at login. Reported separately so the user
        // knows which field to change.
        const [existing] = await db.query(
            'SELECT email, phone FROM tenant_users WHERE email = ? OR phone = ?',
            [email, phone]
        );
        if (existing.length > 0) {
            const clash = existing[0];
            if (clash.email === email) {
                return res.status(409).json({ message: 'An account with this email already exists.' });
            }
            return res.status(409).json({ message: 'This mobile number is already registered.' });
        }

        // The two portals are mutually exclusive — see the matching check in
        // registerOwner. One email or mobile belongs to a landlord account OR a
        // tenant account, never both, because sign-in accepts either identifier and
        // an address in both tables would be ambiguous.
        const [crossOwner] = await db.query(
            'SELECT email, phone FROM owners WHERE email = ? OR phone = ?',
            [email, phone]
        );
        if (crossOwner.length > 0) {
            const clash = crossOwner[0];
            return res.status(409).json({
                message: clash.email === email
                    ? 'This email is already used for a landlord account. Use a different email, or sign in through the landlord portal.'
                    : 'This mobile number is already used for a landlord account. Use a different number, or sign in through the landlord portal.'
            });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const [result] = await db.query(
            'INSERT INTO tenant_users (name, email, phone, password_hash) VALUES (?, ?, ?, ?)',
            [name, email, phone, passwordHash]
        );

        const token = jwt.sign(
            { id: result.insertId, email, role: 'tenant' },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // The landlord may already have typed this person into a room. If so, put a
        // request in front of them rather than linking on a phone number alone — a
        // number is not proof of identity, and carriers recycle them.
        //
        // Awaited so the very first screen after signup can already say "waiting for
        // your landlord", rather than showing "ask your landlord to link you" and
        // correcting itself a second later.
        const proposed = await tryProposeLinks({ id: result.insertId, phone });

        res.status(201).json({
            message: 'Registered successfully',
            token,
            tenant: {
                id: result.insertId, name, email, phone,
                // 'Pending' only if a request was actually raised. Saying it otherwise
                // would have the app claim somebody is waiting on a landlord who has
                // never heard of them.
                status: proposed.length ? 'Pending' : 'Unlinked'
            }
        });
    } catch (error) {
        console.error('Tenant Registration Error:', error);
        res.status(500).json({ message: 'Server error during registration.' });
    }
};

// --- Tenant Login ---
const loginTenant = async (req, res) => {
    try {
        // Email OR mobile number, same as the landlord side. `email` still accepted
        // so an older build keeps working.
        const { email, identifier, password, mode } = req.body;
        const login = String(identifier ?? email ?? '').trim();

        if (!login || !password) {
            return res.status(400).json({ message: 'Enter your email or mobile number and your password.' });
        }

        // Same as the landlord side: honour the EMAIL/MOBILE switch, so choosing
        // MOBILE and typing an email address does not quietly sign you in. Optional,
        // so an older build that sends no mode behaves exactly as before.
        const want = String(mode || '').trim().toLowerCase();
        const sql = want === 'mobile'
            ? 'SELECT * FROM tenant_users WHERE phone = ?'
            : want === 'email'
                ? 'SELECT * FROM tenant_users WHERE email = ?'
                : 'SELECT * FROM tenant_users WHERE email = ? OR phone = ?';
        const params = want === 'mobile' || want === 'email' ? [login] : [login, login];
        const [rows] = await db.query(sql, params);
        const user = rows[0];

        // Distinguished on purpose — see the note in authController.loginOwner for
        // the trade-off and the mitigation.
        if (!user) {
            return res.status(404).json({
                code: 'NOT_REGISTERED',
                message: 'No tenant account is registered with these details.'
            });
        }

        // No password hash means this account signs in with Google (or is a guest
        // identity that never had one). Telling them the password is wrong sends
        // them to reset a password that does not exist.
        if (!user.password_hash) {
            return res.status(409).json({
                code: 'USE_GOOGLE',
                message: 'This account signs in with Google. Use "Continue with Google" instead.'
            });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({
                code: 'WRONG_PASSWORD',
                message: 'Incorrect password. Try again or reset it.'
            });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: 'tenant' },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Also matched at LOGIN, not just registration. Two ordinary situations need
        // it: accounts that registered before this existed, and — much more common —
        // a tenant who installed the app first and whose landlord typed them into a
        // room afterwards. Neither would ever link if signup were the only chance.
        //
        // Costs one indexed lookup for an already-linked tenant, which is nearly
        // everybody, and cannot fail the login: tryProposeLinks swallows its errors.
        const proposed = await tryProposeLinks({ id: user.id, phone: user.phone });

        res.status(200).json({
            message: 'Login successful',
            token,
            tenant: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                // The row was read before the match ran, so `user.status` is stale by
                // exactly one field when a request has just been raised.
                status: proposed.length ? 'Pending' : user.status,
                tenant_id: user.tenant_id
            }
        });
    } catch (error) {
        console.error('Tenant Login Error:', error);
        res.status(500).json({ message: 'Server error during login.' });
    }
};

module.exports = { registerTenant, loginTenant };
