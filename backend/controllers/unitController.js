const db = require('../config/db');
const { getFileUrl } = require('../middleware/uploadMiddleware');

const addUnit = async (req, res) => {
    try {
        // 1. ADDED 'capacity' to the destructuring here
        const { property_id, unit_number, room_type, base_rent, capacity, status, rent_split_type } = req.body;
        const image_url = getFileUrl(req.file);

        // Security check: Ensure the logged-in owner actually owns this property
        const [propCheck] = await db.query('SELECT id FROM properties WHERE id = ? AND owner_id = ?', [property_id, req.user.id]);
        if (propCheck.length === 0) return res.status(403).json({ message: "Unauthorized to add units to this property." });

        // 2. ADDED 'capacity' to the SQL columns, and an extra '?' for the values
        const query = `INSERT INTO units (property_id, unit_number, room_type, base_rent, capacity, status, rent_split_type, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        const [result] = await db.query(query, [property_id, unit_number, room_type, base_rent, capacity || 1, status || 'Vacant', rent_split_type || 'Equal', image_url]);

        res.status(201).json({ message: "Unit added successfully", unitId: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error while adding unit" });
    }
};

const getUnits = async (req, res) => {
    try {
        const { property_id } = req.query;
        const ownerId = req.user.id;

        // Base query: Joins with properties to ensure we only get the owner's units
        let query = `
            SELECT u.*, p.name as property_name 
            FROM units u 
            JOIN properties p ON u.property_id = p.id 
            WHERE p.owner_id = ?
        `;
        const params = [ownerId];

        // If a specific property is selected, filter by it
        if (property_id && property_id !== 'all') {
            query += ` AND u.property_id = ?`;
            params.push(property_id);
        }
        query += ` ORDER BY u.id DESC`;

        const [units] = await db.query(query, params);
        res.status(200).json({ units });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error while fetching units" });
    }
};

// --- UPDATED: Edit Unit ---
const updateUnit = async (req, res) => {
    try {
        const { id } = req.params;
        // 1. ADDED rent_split_type to destructuring
        const { unit_number, room_type, base_rent, capacity, status, rent_split_type } = req.body;

        // Security Check: Verify this unit belongs to a property owned by the logged-in user
        const [check] = await db.query(`
            SELECT u.id, u.image_url FROM units u
            JOIN properties p ON u.property_id = p.id
            WHERE u.id = ? AND p.owner_id = ?
        `, [id, req.user.id]);

        if (check.length === 0) return res.status(403).json({ message: "Unauthorized or unit not found." });

        // Handle Image: Keep existing if no new image is uploaded
        let image_url = check[0].image_url;
        if (req.file) {
            image_url = getFileUrl(req.file);
        }

        // 2. ADDED rent_split_type to the SQL UPDATE query
        const query = `
            UPDATE units 
            SET unit_number = ?, room_type = ?, base_rent = ?, capacity = ?, status = COALESCE(?, status), rent_split_type = ?, image_url = ?
            WHERE id = ?
        `;
        await db.query(query, [unit_number, room_type, base_rent, capacity, status, rent_split_type || 'Equal', image_url, id]);

        // 3. --- NEW: THE MAGIC AUTO-CALCULATOR ---
        // If the owner sets/updates this unit to 'Equal', forcefully update all tenants living in it to the equal share!
        if (rent_split_type === 'Equal' && base_rent && capacity) {
            const equalShare = (base_rent / capacity).toFixed(0);
            await db.query('UPDATE tenants SET rent_share = ? WHERE unit_id = ?', [equalShare, id]);
        }

        res.status(200).json({ message: "Unit updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error while updating unit" });
    }
};

// --- NEW: Delete Unit ---
const deleteUnit = async (req, res) => {
    try {
        const { id } = req.params;

        // Security Check
        const [check] = await db.query(`
            SELECT u.id FROM units u
            JOIN properties p ON u.property_id = p.id
            WHERE u.id = ? AND p.owner_id = ?
        `, [id, req.user.id]);

        if (check.length === 0) return res.status(403).json({ message: "Unauthorized or unit not found." });

        await db.query('DELETE FROM units WHERE id = ?', [id]);
        res.status(200).json({ message: "Unit deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error while deleting unit" });
    }
};

// --- FETCH AVAILABLE UNITS (Capacity > Active Tenants) ---
const getAvailableUnits = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const query = `
            SELECT 
                u.id, 
                u.unit_number, 
                u.base_rent, 
                u.capacity, 
                u.rent_split_type, -- FIX: Changed from rent_type
                p.name as property_name,
                (SELECT COUNT(*) FROM tenants t WHERE t.unit_id = u.id AND t.status = 'Active') as current_occupancy
            FROM units u
            JOIN properties p ON u.property_id = p.id
            WHERE p.owner_id = ? AND u.status != 'Maintenance'
            HAVING current_occupancy < u.capacity
        `;
        const [availableUnits] = await db.query(query, [ownerId]);
        res.status(200).json({ availableUnits });
    } catch (error) {
        console.error("Error fetching units:", error);
        res.status(500).json({ message: "Error fetching available units" });
    }
};

const updateUnitSettings = async (req, res) => {
    try {
        const unitId = req.params.id;
        const { notify_email, notify_sms, notify_whatsapp } = req.body;

        // Convert booleans to 1 or 0 for MySQL
        const emailVal = notify_email ? 1 : 0;
        const smsVal = notify_sms ? 1 : 0;
        const whatsappVal = notify_whatsapp ? 1 : 0;

        const updateQuery = `
            UPDATE units 
            SET notify_email = ?, notify_sms = ?, notify_whatsapp = ? 
            WHERE id = ?
        `;

        const [result] = await db.query(updateQuery, [emailVal, smsVal, whatsappVal, unitId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Unit not found." });
        }

        res.status(200).json({ message: "Settings updated successfully." });
    } catch (error) {
        console.error("Error updating unit settings:", error);
        res.status(500).json({ message: "Server error while updating settings." });
    }
};


module.exports = { addUnit, getUnits, updateUnit, deleteUnit, getAvailableUnits, updateUnitSettings };