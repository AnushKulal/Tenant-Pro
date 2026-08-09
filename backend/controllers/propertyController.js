// File: backend/src/controllers/propertyController.js
const db = require('../config/db');
const { getFileUrl } = require('../middleware/uploadMiddleware');

// A coordinate, or null. Sent as form fields (the property form is multipart because
// it carries a photo), so they arrive as strings — "" for "not pinned", which
// Number() would helpfully turn into 0, i.e. a point in the Gulf of Guinea.
//
// Out-of-range values are also refused rather than clamped: a latitude of 200 is a
// bug in the caller, and storing 90 instead would hide it behind a pin in the Arctic.
const coord = (raw, limit) => {
    if (raw === undefined || raw === null || String(raw).trim() === '') return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    if (Math.abs(n) > limit) return null;
    return n;
};
const asLat = (v) => coord(v, 90);
const asLon = (v) => coord(v, 180);

// Add a new property
const addProperty = async (req, res) => {
    try {
        const ownerId = req.user.id; // Comes from your auth middleware
        const { name, property_type, address, locality, city, pincode } = req.body;
        const latitude = asLat(req.body.latitude);
        const longitude = asLon(req.body.longitude);

        // If an image was uploaded, store its path. Otherwise, leave it null.
        const image_url = getFileUrl(req.file);

        const query = `
            INSERT INTO properties 
            (owner_id, name, property_type, address, locality, city, pincode, latitude, longitude, image_url) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const [result] = await db.query(query, [
            ownerId, name, property_type, address, locality, city, pincode, latitude, longitude, image_url
        ]);

        res.status(201).json({
            message: "Property added successfully",
            propertyId: result.insertId
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error while adding property" });
    }
};

// Get all properties for the logged-in owner
const getProperties = async (req, res) => {
    try {
        const ownerId = req.user.id;

        // Smart query: Uses precise subqueries to independently count units 
        // and ACTIVE tenants without causing duplicate row multipliers
        const query = `
            SELECT 
                p.*, 
                (SELECT COUNT(*) FROM units u WHERE u.property_id = p.id) as units,
                (SELECT COUNT(*) FROM tenants t 
                 JOIN units u ON t.unit_id = u.id 
                 WHERE u.property_id = p.id AND t.status = 'Active') as tenant_count
            FROM properties p 
            WHERE p.owner_id = ? 
            ORDER BY p.created_at DESC
        `;

        const [properties] = await db.query(query, [ownerId]);

        res.status(200).json({ properties });
    } catch (error) {
        console.error("Error fetching properties:", error);
        res.status(500).json({ message: "Server error while fetching properties" });
    }
};  

// --- UPDATE PROPERTY ---
const updateProperty = async (req, res) => {
    try {
        const propertyId = req.params.id;
        const ownerId = req.user.id;
        const { name, property_type, address, locality, city, pincode } = req.body;

        // 1. Verify ownership
        const [check] = await db.query('SELECT id FROM properties WHERE id = ? AND owner_id = ?', [propertyId, ownerId]);
        if (check.length === 0) {
            return res.status(403).json({ message: "Unauthorized or property not found." });
        }

        // 2. Prepare dynamic SQL query
        let query = `
            UPDATE properties 
            SET name = ?, property_type = ?, address = ?, locality = ?, city = ?, pincode = ?
        `;
        let values = [name, property_type, address, locality, city, pincode];

        // The pin is only written when the caller sent one. An edit submitted without
        // opening the map omits these fields entirely, and treating that as "clear the
        // pin" would silently un-locate a property every time its name was corrected.
        // Sending an empty string IS how you deliberately clear it.
        if (req.body.latitude !== undefined || req.body.longitude !== undefined) {
            query += `, latitude = ?, longitude = ?`;
            values.push(asLat(req.body.latitude), asLon(req.body.longitude));
        }

        // 3. Handle Image Upload (if a new one was selected)
        if (req.file) {
            const imageUrl = getFileUrl(req.file);
            query += `, image_url = ?`;
            values.push(imageUrl);
        }

        // 4. Execute the update
        query += ` WHERE id = ? AND owner_id = ?`;
        values.push(propertyId, ownerId);

        await db.query(query, values);

        res.status(200).json({ message: "Property updated successfully." });

    } catch (error) {
        console.error("Error updating property:", error);
        res.status(500).json({ message: "Server error while updating property." });
    }
};

// --- DELETE PROPERTY ---
const deleteProperty = async (req, res) => {
    try {
        const propertyId = req.params.id;
        const ownerId = req.user.id;

        // 1. Verify ownership
        const [check] = await db.query('SELECT id FROM properties WHERE id = ? AND owner_id = ?', [propertyId, ownerId]);
        if (check.length === 0) {
            return res.status(403).json({ message: "Unauthorized or property not found." });
        }

        // 2. SAFETY CHECK: Prevent deletion if there are active tenants
        const checkTenantsQuery = `
            SELECT COUNT(*) as count 
            FROM tenants t 
            JOIN units u ON t.unit_id = u.id 
            WHERE u.property_id = ? AND t.status = 'Active'
        `;
        const [tenantCheck] = await db.query(checkTenantsQuery, [propertyId]);
        
        if (tenantCheck[0].count > 0) {
            return res.status(400).json({ message: "Cannot delete property. It still has active tenants." });
        }

        // 3. Delete the property (and its associated units to keep DB clean)
        await db.query('DELETE FROM units WHERE property_id = ?', [propertyId]);
        await db.query('DELETE FROM properties WHERE id = ?', [propertyId]);

        res.status(200).json({ message: "Property deleted successfully." });
    } catch (error) {
        console.error("Error deleting property:", error);
        res.status(500).json({ message: "Server error while deleting property." });
    }
};

// Clean, centralized exports
module.exports = {
    addProperty,
    getProperties,
    updateProperty, 
    deleteProperty
};