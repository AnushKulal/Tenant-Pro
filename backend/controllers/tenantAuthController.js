// File: backend/controllers/tenantAuthController.js
// Auth for TENANT accounts (separate from owner/landlord accounts).
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

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

        res.status(201).json({
            message: 'Registered successfully',
            token,
            tenant: { id: result.insertId, name, email, phone, status: 'Unlinked' }
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
        const { email, identifier, password } = req.body;
        const login = String(identifier ?? email ?? '').trim();

        if (!login || !password) {
            return res.status(400).json({ message: 'Enter your email or mobile number and your password.' });
        }

        const [rows] = await db.query(
            'SELECT * FROM tenant_users WHERE email = ? OR phone = ?',
            [login, login]
        );
        const user = rows[0];

        // Same message either way, so nobody can enumerate registered accounts.
        const WRONG = 'Incorrect email/mobile number or password.';

        if (!user) {
            return res.status(401).json({ message: WRONG });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: WRONG });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: 'tenant' },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(200).json({
            message: 'Login successful',
            token,
            tenant: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                status: user.status,
                tenant_id: user.tenant_id
            }
        });
    } catch (error) {
        console.error('Tenant Login Error:', error);
        res.status(500).json({ message: 'Server error during login.' });
    }
};

module.exports = { registerTenant, loginTenant };
