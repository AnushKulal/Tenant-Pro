// File: backend/src/controllers/ownerController.js
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const { getFileUrl } = require('../middleware/uploadMiddleware');

const updateProfile = async (req, res) => {
    const ownerId = req.user.id; // Extracted from token via authMiddleware
    const { name, phone, currentPassword, newPassword } = req.body;
    
    // If an image was uploaded, create the public URL path
    const profilePicPath = getFileUrl(req.file);

    try {
        // 1. Fetch current owner from DB (Updated to db.execute for consistency)
        const [owners] = await db.execute('SELECT * FROM owners WHERE id = ?', [ownerId]);
        if (owners.length === 0) {
            return res.status(404).json({ message: 'Owner not found' });
        }
        const owner = owners[0];

        // 2. Handle Password Change Logic
        // FIXED: Changed owner.password to owner.password_hash to match your DB!
        let hashedPassword = owner.password_hash; 
        
        if (newPassword && currentPassword) {
            const isMatch = await bcrypt.compare(currentPassword, owner.password_hash);
            if (!isMatch) {
                return res.status(400).json({ message: 'Incorrect current password' });
            }
            hashedPassword = await bcrypt.hash(newPassword, 10);
        }

        // 3. Build the Update Query dynamically
        let updateQuery = 'UPDATE owners SET name = ?, phone = ?, password_hash = ?';
        let queryParams = [name, phone || null, hashedPassword];

        if (profilePicPath) {
            updateQuery += ', profile_pic = ?';
            queryParams.push(profilePicPath);
        }

        updateQuery += ' WHERE id = ?';
        queryParams.push(ownerId);

        // 4. Execute the update
        await db.execute(updateQuery, queryParams);

        // 5. Send back the updated owner data (NEVER send the password back)
        const updatedOwner = {
            id: owner.id,
            name: name,
            email: owner.email,
            phone: phone || null,
            profile_pic: profilePicPath || owner.profile_pic
        };

        res.status(200).json({
            message: 'Profile updated successfully',
            owner: updatedOwner
        });

    } catch (error) {
        console.error('Profile Update Error:', error);
        res.status(500).json({ message: 'Server error during profile update' });
    }
};

const getDashboardStats = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const { property_id } = req.query; // 'all' or a specific ID

        // 1. Build the filter logic
        let propertyFilter = '';
        let queryParams = [ownerId];
        
        if (property_id && property_id !== 'all' && property_id !== 'null') {
            propertyFilter = ' AND p.id = ?';
            queryParams.push(property_id);
        }

        // Run all 5 independent queries in PARALLEL instead of one-by-one.
        // This is much faster, especially when the DB is in a different region.
        const [
            [tenantStats],
            [unitStats],
            [collectionStats],
            [chartData],
            [recentPayments]
        ] = await Promise.all([
            // Query 1: Active Tenants & Pending Rent
            db.query(`
                SELECT
                    COUNT(t.id) as total_tenants,
                    SUM(CASE WHEN t.next_rent_due <= CURDATE() THEN t.rent_share ELSE 0 END) as total_pending
                FROM tenants t
                LEFT JOIN units u ON t.unit_id = u.id
                LEFT JOIN properties p ON u.property_id = p.id
                WHERE t.owner_id = ? AND t.status = 'Active' ${propertyFilter}
            `, queryParams),

            // Query 2: Vacant Units
            db.query(`
                SELECT COUNT(u.id) as vacant_units
                FROM units u
                JOIN properties p ON u.property_id = p.id
                WHERE p.owner_id = ? AND u.status = 'Vacant' ${propertyFilter}
            `, queryParams),

            // Query 3: Rent Collected THIS Month
            db.query(`
                SELECT SUM(pay.amount_paid) as collected_this_month
                FROM payments pay
                JOIN tenants t ON pay.tenant_id = t.id
                LEFT JOIN units u ON t.unit_id = u.id
                LEFT JOIN properties p ON u.property_id = p.id
                WHERE t.owner_id = ? AND MONTH(pay.payment_date) = MONTH(CURDATE()) AND YEAR(pay.payment_date) = YEAR(CURDATE())
                ${propertyFilter}
            `, queryParams),

            // Query 4: Chart Data (Last 6 Months Revenue)
            db.query(`
                SELECT
                    DATE_FORMAT(pay.payment_date, '%b') as month,
                    SUM(pay.amount_paid) as value
                FROM payments pay
                JOIN tenants t ON pay.tenant_id = t.id
                LEFT JOIN units u ON t.unit_id = u.id
                LEFT JOIN properties p ON u.property_id = p.id
                WHERE t.owner_id = ? AND pay.payment_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
                ${propertyFilter}
                GROUP BY YEAR(pay.payment_date), MONTH(pay.payment_date), DATE_FORMAT(pay.payment_date, '%b')
                ORDER BY YEAR(pay.payment_date) ASC, MONTH(pay.payment_date) ASC
            `, queryParams),

            // Query 5: Recent 5 Payments
            db.query(`
                SELECT
                    pay.id, pay.amount_paid, pay.payment_date, pay.payment_method,
                    t.name as tenant_name, u.unit_number
                FROM payments pay
                JOIN tenants t ON pay.tenant_id = t.id
                LEFT JOIN units u ON t.unit_id = u.id
                LEFT JOIN properties p ON u.property_id = p.id
                WHERE t.owner_id = ? ${propertyFilter}
                ORDER BY pay.created_at DESC
                LIMIT 5
            `, queryParams)
        ]);

        res.status(200).json({
            stats: {
                activeTenants: tenantStats[0].total_tenants || 0,
                pendingDues: tenantStats[0].total_pending || 0,
                vacantUnits: unitStats[0].vacant_units || 0,
                rentCollected: collectionStats[0].collected_this_month || 0,
            },
            chart: chartData.length > 0 ? chartData : [{ month: 'No Data', value: 0 }],
            recentPayments: recentPayments
        });

    } catch (error) {
        console.error("Dashboard Stats Error:", error);
        res.status(500).json({ message: "Failed to load dashboard data." });
    }
};

// --- GET ALL TRANSACTIONS ---
const getAllTransactions = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const { property_id } = req.query;

        let propertyFilter = '';
        let queryParams = [ownerId];
        
        if (property_id && property_id !== 'all' && property_id !== 'null') {
            propertyFilter = ' AND p.id = ?';
            queryParams.push(property_id);
        }

        const [transactions] = await db.query(`
            SELECT 
                pay.id, pay.amount_paid, pay.payment_date, pay.payment_method, pay.reference_id,
                t.name as tenant_name, u.unit_number, p.name as property_name
            FROM payments pay
            JOIN tenants t ON pay.tenant_id = t.id
            LEFT JOIN units u ON t.unit_id = u.id
            LEFT JOIN properties p ON u.property_id = p.id
            WHERE t.owner_id = ? ${propertyFilter}
            ORDER BY pay.payment_date DESC, pay.created_at DESC
        `, queryParams);

        res.status(200).json({ transactions });
    } catch (error) {
        console.error("Error fetching transactions:", error);
        res.status(500).json({ message: "Failed to load transactions." });
    }
};

// Update your module.exports at the bottom!
module.exports = {
    updateProfile,
    getDashboardStats,
    getAllTransactions // <-- Add this
};