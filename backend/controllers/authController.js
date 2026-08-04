// File: backend/controllers/authController.js
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { transporter, isMailConfigured } = require('../config/mailer');

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
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Please provide email and password' });
        }

        const sql = `SELECT * FROM owners WHERE email = ?`;
        const [rows] = await db.execute(sql, [email]);
        const owner = rows[0]; 

        if (!owner) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const isMatch = await bcrypt.compare(password, owner.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid email or password' });
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

// --- Forgot Password: email a 6-digit reset code ---
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ message: 'Please provide your email.' });
        }

        const [owners] = await db.query('SELECT id, name FROM owners WHERE email = ?', [email]);

        // Only send a code if the account exists — but always return the same
        // response so we never reveal whether an email is registered.
        if (owners.length > 0) {
            const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits

            // Replace any previous codes for this email, then store the new one (15 min TTL).
            await db.query('DELETE FROM password_resets WHERE email = ?', [email]);
            await db.query(
                'INSERT INTO password_resets (email, code, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))',
                [email, code]
            );

            if (isMailConfigured) {
                try {
                    await transporter.sendMail({
                        from: `"TenantPro" <${process.env.EMAIL_USER}>`,
                        to: email,
                        subject: 'Your TenantPro password reset code',
                        html: `
                            <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                                <h2>Password Reset</h2>
                                <p>Hello ${owners[0].name || ''}, use this code to reset your password:</p>
                                <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #3b82f6;">${code}</p>
                                <p>This code expires in 15 minutes. If you didn't request this, you can ignore this email.</p>
                            </div>
                        `
                    });
                    console.log(`📧 Password reset code sent to ${email}`);
                } catch (mailErr) {
                    console.error('❌ Failed to send reset email:', mailErr.message);
                }
            } else {
                console.warn(`⚠️ EMAIL not configured — reset code for ${email} is ${code} (dev only).`);
            }
        }

        res.status(200).json({ message: 'If that email is registered, a reset code has been sent.' });
    } catch (error) {
        console.error('Forgot Password Error:', error);
        res.status(500).json({ message: 'Server error. Please try again.' });
    }
};

// --- Reset Password: verify the code and set a new password ---
const resetPassword = async (req, res) => {
    try {
        const { email, code, newPassword } = req.body;
        if (!email || !code || !newPassword) {
            return res.status(400).json({ message: 'Email, code, and new password are required.' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters.' });
        }

        const [rows] = await db.query(
            `SELECT id FROM password_resets
             WHERE email = ? AND code = ? AND expires_at > NOW()
             ORDER BY created_at DESC LIMIT 1`,
            [email, code]
        );

        if (rows.length === 0) {
            return res.status(400).json({ message: 'Invalid or expired code.' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.query('UPDATE owners SET password_hash = ? WHERE email = ?', [hashedPassword, email]);

        // Invalidate all codes for this email now that it's used.
        await db.query('DELETE FROM password_resets WHERE email = ?', [email]);

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