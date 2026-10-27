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
// A NOT NULL text column that the client may legitimately leave blank. '' rather than
// NULL, which is what the app has always sent and what the column accepts.
const text = (v) => (v == null ? '' : String(v));

// The two fields a property cannot exist without, in the landlord's words rather than
// MySQL's. Returns the message, or '' when everything needed is present.
const PROPERTY_TYPES = ['PG', 'Apartment', 'Independent House'];
const requiredProblem = ({ name, property_type }) => {
    if (!String(name || '').trim()) return 'Give this property a name.';
    if (!String(property_type || '').trim()) return 'Choose what kind of property this is.';
    // The column is an enum, so an unknown value is a 500 from the driver rather than a
    // row with a surprising type in it. Listing the options beats echoing theirs back.
    if (!PROPERTY_TYPES.includes(property_type)) {
        return `A property must be one of: ${PROPERTY_TYPES.join(', ')}.`;
    }
    return '';
};

const addProperty = async (req, res) => {
    try {
        const ownerId = req.user.id; // Comes from your auth middleware
        const { name, property_type, address, locality, city, pincode } = req.body;
        const latitude = asLat(req.body.latitude);
        const longitude = asLon(req.body.longitude);

        // Validated here rather than left to MySQL. `name`, `property_type` and
        // `address` are NOT NULL, so omitting any of them used to surface as a 500
        // reading "Server error while adding property" — which tells the landlord
        // nothing and tells us only that something, somewhere, was missing. A 400
        // naming the field is the difference between a fixable mistake and a bug
        // report.
        //
        // `address` is coerced rather than demanded: the column forbids NULL but an
        // empty string is a legitimate answer, and the app already sends '' for a
        // blank field. Refusing it would break a form that works today.
        const problem = requiredProblem({ name, property_type });
        if (problem) return res.status(400).json({ message: problem });

        // If an image was uploaded, store its path. Otherwise, leave it null.
        const image_url = getFileUrl(req.file);

        const query = `
            INSERT INTO properties 
            (owner_id, name, property_type, address, locality, city, pincode, latitude, longitude, image_url) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const [result] = await db.query(query, [
            ownerId, name.trim(), property_type, text(address), text(locality), text(city), text(pincode), latitude, longitude, image_url
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

        // 1. Verify ownership FIRST. Validating before this would answer a stranger's
        // probe with "give this property a name" — which is a different reply from
        // "unauthorized or not found", and therefore a way to tell the two apart.
        const [check] = await db.query('SELECT id FROM properties WHERE id = ? AND owner_id = ?', [propertyId, ownerId]);
        if (check.length === 0) {
            return res.status(403).json({ message: "Unauthorized or property not found." });
        }

        // Same validation as creating one, and for the same reason: this endpoint
        // replaces every text column, so a missing name is a 500 on the way to
        // erasing the one the landlord already had.
        const problem = requiredProblem({ name, property_type });
        if (problem) return res.status(400).json({ message: problem });

        // 2. Prepare dynamic SQL query
        let query = `
            UPDATE properties 
            SET name = ?, property_type = ?, address = ?, locality = ?, city = ?, pincode = ?
        `;
        // Coerced exactly as the INSERT above does. This endpoint replaces every text
        // column, and `address` is NOT NULL — so an edit that omits it (renaming a
        // property from a form that does not carry the address) was a 500 reading
        // "Server error while updating property." Found by renaming a property in an
        // end-to-end run, which is the first time anything had edited one without
        // sending all six fields.
        let values = [name.trim(), property_type, text(address), text(locality), text(city), text(pincode)];

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