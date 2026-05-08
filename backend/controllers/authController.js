// File: backend/controllers/authController.js
const db = require('../config/db'); 
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

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

// --- Export Functions ---
module.exports = {
    registerOwner,
    loginOwner
};