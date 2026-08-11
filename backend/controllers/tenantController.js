const db = require('../config/db');
const { getFileUrl } = require('../middleware/uploadMiddleware');
const { endGuestIdentity } = require('./guestController');
const { parseStayUntil, toSqlDate } = require('../utils/guestStay');

// --- 1. ADD TENANT ---
const addTenant = async (req, res) => {
    try {
        const { 
            unit_id, name, phone, email, aadhar, company, emergency, 
            deposit, rent_share, move_in_date, billing_cycle 
        } = req.body;
        
        const owner_id = req.user.id; 

        if (!name || !phone) {
            return res.status(400).json({ message: "Name and phone are required." });
        }

        // 1. Check if Phone already exists
        const [existingPhone] = await db.query('SELECT id FROM tenants WHERE phone = ?', [phone]);
        if (existingPhone.length > 0) {
            return res.status(409).json({ field: 'phone', message: 'This phone number is already registered to a tenant.' });
        }

        // 2. Check if Email exists
        if (email && email.trim() !== '') {
            const [existingEmail] = await db.query('SELECT id FROM tenants WHERE email = ?', [email]);
            if (existingEmail.length > 0) {
                return res.status(409).json({ field: 'email', message: 'This email address is already in use.' });
            }
        }

        const image_url = getFileUrl(req.file);
        const finalUnitId = unit_id || null;
        const finalStatus = 'Active';

        // --- 3. SMART BILLING ENGINE (Calculate Next Rent Due) ---
        let nextRentDue = null;
        if (move_in_date && finalUnitId) { 
            const [year, month, day] = move_in_date.split('-');
            
            // Start the clock on the exact day they move in
            let d = new Date(year, month - 1, day);
            
            if (billing_cycle === '1st_of_month') {
                // If they chose 1st of month, rent is due on the 1st of the CURRENT month
                d = new Date(year, month - 1, 1); 
            } 
            // If 'Anniversary', we do not add a month! They owe rent on the day they move in.
            
            const dueYear = d.getFullYear();
            const dueMonth = String(d.getMonth() + 1).padStart(2, '0');
            const dueDay = String(d.getDate()).padStart(2, '0');
            nextRentDue = `${dueYear}-${dueMonth}-${dueDay}`;
        }

        // 4. Insert into database (Now includes dates!)
        const query = `
            INSERT INTO tenants 
            (owner_id, unit_id, status, name, phone, email, aadhar, company, emergency_phone, deposit, rent_share, image_url, move_in_date, billing_cycle, next_rent_due) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        await db.query(query, [
            owner_id, finalUnitId, finalStatus, name, phone, email || null, aadhar || null, 
            company || null, emergency || null, deposit || 0, rent_share || 0, image_url,
            move_in_date || null, billing_cycle || 'Anniversary', nextRentDue
        ]);

        // 5. SMART AUTO-UPDATE: If they were added to a unit, mark the unit as Occupied
        if (finalUnitId) {
            await db.query('UPDATE units SET status = ? WHERE id = ?', ['Occupied', finalUnitId]);
        }

        res.status(201).json({ message: "Tenant added successfully" });
    } catch (error) {
        console.error("Error adding tenant:", error);
        res.status(500).json({ message: "Server error while adding tenant." });
    }
};

// --- 2. FETCH ACTIVE TENANTS BY UNIT ---
const getTenantsByUnit = async (req, res) => {
    try {
        const { unit_id } = req.params;
        const ownerId = req.user.id;

        // Because you added owner_id directly to the tenants table, 
        // we no longer need complex JOINs! We just fetch Active tenants for this owner's unit.
        const query = `
            SELECT * FROM tenants 
            WHERE unit_id = ? AND owner_id = ? AND status = 'Active'
            ORDER BY created_at DESC
        `;

        const [tenants] = await db.query(query, [unit_id, ownerId]);
        res.status(200).json({ tenants });
    } catch (error) {
        console.error("Error fetching tenants:", error);
        res.status(500).json({ message: "Server error while fetching tenants." });
    }
};

// --- 3. SOFT REMOVE TENANT FROM UNIT ---
const moveOutTenant = async (req, res) => {
    try {
        const tenantId = req.params.id;
        const ownerId = req.user.id;

        // 1. Security Check: Verify this owner actually owns this tenant
        const [check] = await db.query(`SELECT unit_id FROM tenants WHERE id = ? AND owner_id = ?`, [tenantId, ownerId]);

        if (check.length === 0) {
            return res.status(403).json({ message: "Unauthorized or tenant not found." });
        }

        const unitId = check[0].unit_id;

        // 2. SOFT DELETE: Remove them from the room and mark them as Inactive. 
        // We DO NOT run a DELETE query, so their data is safe forever!
        await db.query(`UPDATE tenants SET unit_id = NULL, status = 'Inactive' WHERE id = ?`, [tenantId]);

        // 3. SMART AUTO-UPDATE: Check how many ACTIVE tenants are left in this room
        if (unitId) {
            const [remainingTenants] = await db.query(`SELECT COUNT(*) as count FROM tenants WHERE unit_id = ? AND status = 'Active'`, [unitId]);
            
            // If the room is now completely empty, automatically set it to 'Vacant'
            if (remainingTenants[0].count === 0) {
                await db.query('UPDATE units SET status = ? WHERE id = ?', ['Vacant', unitId]);
            }
        }

        // A guest's ID was only ever valid for this stay, so it retires with it --
        // otherwise "a guest ID that lasts as long as you are in the property" is
        // just a code that never expires. Guests only: a full account keeps its
        // existing behaviour, because its identity was never tied to one tenancy.
        await endGuestIdentity(tenantId);

        res.status(200).json({ message: "Tenant successfully removed from unit." });
    } catch (error) {
        console.error("Error removing tenant:", error);
        res.status(500).json({ message: "Server error while removing tenant." });
    }
};

// --- NEW: FETCH ALL TENANTS FOR OWNER ---
const getAllTenants = async (req, res) => {
    try {
        const ownerId = req.user.id;

        // Fetch all tenants, and gracefully join unit/property info IF they have a room.
        //
        // The three ID-document columns are correlated subqueries rather than joins
        // on purpose: tenant_users.tenant_id is not unique, so joining it would
        // duplicate a tenant row per linked account and per document, quietly
        // multiplying everyone's rent in any caller that sums this list.
        const query = `
            SELECT 
                t.*, 
                u.unit_number, 
                p.id as property_id,
                p.name as property_name,
                (SELECT tu.id FROM tenant_users tu
                  WHERE tu.tenant_id = t.id ORDER BY tu.id LIMIT 1) AS tenant_user_id,
                -- A guest signs in with this code and nothing else, and there is no
                -- password reset for an account with no email. The landlord is
                -- therefore the recovery path: they hold the government ID this
                -- person uploaded, so they can check a face against it and read the
                -- code back — a stronger identity check than an emailed link.
                -- Correlated the same way as tenant_user_id so a tenant with more
                -- than one linked account still yields exactly one row.
                (SELECT tu.guest_code FROM tenant_users tu
                  WHERE tu.tenant_id = t.id AND tu.is_guest = 1
                  ORDER BY tu.id LIMIT 1) AS guest_code,
                (SELECT COUNT(*) FROM tenant_documents d
                  JOIN tenant_users tu ON d.tenant_user_id = tu.id
                  WHERE tu.tenant_id = t.id) AS doc_count,
                (SELECT COUNT(*) FROM tenant_documents d
                  JOIN tenant_users tu ON d.tenant_user_id = tu.id
                  WHERE tu.tenant_id = t.id AND d.status = 'Verified') AS doc_verified
            FROM tenants t
            LEFT JOIN units u ON t.unit_id = u.id
            LEFT JOIN properties p ON u.property_id = p.id
            WHERE t.owner_id = ?
            ORDER BY t.created_at DESC
        `;

        const [tenants] = await db.query(query, [ownerId]);
        res.status(200).json({ tenants });
    } catch (error) {
        console.error("Error fetching all tenants:", error);
        res.status(500).json({ message: "Server error while fetching all tenants." });
    }
};

const assignUnit = async (req, res) => {
    const { tenant_id, unit_id, deposit, rent_share, move_in_date, billing_cycle } = req.body;
    const ownerId = req.user.id;

    try {
        // 1. Security Check & Capture OLD Room
        const [check] = await db.query('SELECT id, unit_id FROM tenants WHERE id = ? AND owner_id = ?', [tenant_id, ownerId]);
        if (check.length === 0) {
            return res.status(403).json({ message: "Unauthorized or tenant not found." });
        }
        
        const oldUnitId = check[0].unit_id;

        // 2. --- SMART BILLING ENGINE (Calculate Next Rent Due) ---
        let nextRentDue = null;
        if (move_in_date) {
            const [year, month, day] = move_in_date.split('-');
            
            // Rent is due on the day they move in
            let d = new Date(year, month - 1, day);
            
            if (billing_cycle === '1st_of_month') {
                // If they chose 1st of month, rent is due on the 1st of the CURRENT month
                d = new Date(year, month - 1, 1); 
            } 
            
            const dueYear = d.getFullYear();
            const dueMonth = String(d.getMonth() + 1).padStart(2, '0');
            const dueDay = String(d.getDate()).padStart(2, '0');
            nextRentDue = `${dueYear}-${dueMonth}-${dueDay}`;
        }

        // 3. Update tenant with NEW room, financials, and dates
        await db.query(
            `UPDATE tenants 
             SET unit_id = ?, deposit = ?, rent_share = ?, status = 'Active', move_in_date = ?, billing_cycle = ?, next_rent_due = ? 
             WHERE id = ?`,
            [unit_id, deposit || 0, rent_share || 0, move_in_date || null, billing_cycle || 'Anniversary', nextRentDue, tenant_id]
        );

        // 4. Ensure NEW unit is marked as Occupied
        await db.query(`UPDATE units SET status = 'Occupied' WHERE id = ?`, [unit_id]);
        
        // 5. SMART CLEANUP: Check the old room and mark Vacant if empty
        if (oldUnitId && oldUnitId !== unit_id) {
            const [remainingTenants] = await db.query(`SELECT COUNT(*) as count FROM tenants WHERE unit_id = ? AND status = 'Active'`, [oldUnitId]);
            
            if (remainingTenants[0].count === 0) {
                await db.query(`UPDATE units SET status = 'Vacant' WHERE id = ?`, [oldUnitId]);
            }
        }
        
        res.status(200).json({ message: "Tenant assigned successfully" });
    } catch (error) {
        console.error("Assignment error:", error);
        res.status(500).json({ message: "Assignment failed" });
    }
};

// --- UPDATE EXISTING TENANT ---
const updateTenant = async (req, res) => {
    try {
        const tenantId = req.params.id;
        const ownerId = req.user.id;
        const { name, phone, email, aadhar, company, emergency_phone } = req.body;
        
        // 1. Verify the tenant belongs to this owner
        const [existing] = await db.query('SELECT id FROM tenants WHERE id = ? AND owner_id = ?', [tenantId, ownerId]);
        if (existing.length === 0) {
            return res.status(404).json({ message: "Tenant not found or unauthorized." });
        }

        // 2. Prepare the dynamic SQL query
        let query = `
            UPDATE tenants 
            SET name = ?, phone = ?, email = ?, aadhar = ?, company = ?, emergency_phone = ?
        `;
        // Convert empty strings to null for the database
        let values = [
            name, 
            phone, 
            email || null, 
            aadhar || null, 
            company || null, 
            emergency_phone || null
        ];

        // 3. Handle Image Upload (if a new one was selected)
        if (req.file) {
            const imageUrl = getFileUrl(req.file);
            query += `, image_url = ?`;
            values.push(imageUrl);
        }

        // 4. Execute the update
        query += ` WHERE id = ? AND owner_id = ?`;
        values.push(tenantId, ownerId);

        await db.query(query, values);

        res.status(200).json({ message: "Tenant updated successfully." });

    } catch (error) {
        console.error("Error updating tenant:", error);
        res.status(500).json({ message: "Server error while updating tenant." });
    }
};

// --- 2. HARD DELETE TENANT (Permanently erases them) ---
const deleteTenant = async (req, res) => {
    try {
        const tenantId = req.params.id;
        const ownerId = req.user.id;

        // 1. Get the tenant and their unit_id before deleting them
        const [check] = await db.query(`SELECT id, unit_id FROM tenants WHERE id = ? AND owner_id = ?`, [tenantId, ownerId]);
        if (check.length === 0) return res.status(403).json({ message: "Unauthorized or tenant not found." });

        const unitId = check[0].unit_id;

        // 2. HARD DELETE: Actually wipes the row from the database
        await db.query(`DELETE FROM tenants WHERE id = ?`, [tenantId]);

        // 3. SMART AUTO-UPDATE: If they were in a room, check if the room is now empty
        if (unitId) {
            const [remainingTenants] = await db.query(`SELECT COUNT(*) as count FROM tenants WHERE unit_id = ? AND status = 'Active'`, [unitId]);
            if (remainingTenants[0].count === 0) {
                await db.query('UPDATE units SET status = ? WHERE id = ?', ['Vacant', unitId]);
            }
        }

        // Same as moving out: the stay is over, so a guest identity tied to it goes
        // too. tenant_users.tenant_id has no foreign key, so nothing would have
        // cleared it on its own -- the guest would keep a working ID pointing at a
        // tenancy row that no longer exists.
        await endGuestIdentity(tenantId);

        res.status(200).json({ message: "Tenant permanently deleted." });
    } catch (error) {
        console.error("Error deleting tenant:", error);
        res.status(500).json({ message: "Server error. Tenant might have active lease records tying them down." });
    }
};

// --- UPDATE TENANT FINANCIALS ---
const updateFinancials = async (req, res) => {
    try {
        const tenantId = req.params.id;
        const ownerId = req.user.id;
        const { deposit, rent_share } = req.body;

        // 1. Verify ownership
        const [existing] = await db.query('SELECT id FROM tenants WHERE id = ? AND owner_id = ?', [tenantId, ownerId]);
        if (existing.length === 0) return res.status(404).json({ message: "Tenant not found or unauthorized." });

        // 2. Update just the money
        await db.query(
            `UPDATE tenants SET deposit = ?, rent_share = ? WHERE id = ?`,
            [deposit, rent_share, tenantId]
        );

        res.status(200).json({ message: "Financials updated successfully." });
    } catch (error) {
        console.error("Error updating financials:", error);
        res.status(500).json({ message: "Server error while updating financials." });
    }
};


// --- CHANGE WHEN A GUEST'S STAY ENDS ---
//
// The escape hatch that makes hard expiry acceptable. Access ending on a date is only
// reasonable if the landlord can move that date — a guest still living in the room
// whose ID stopped working needs the landlord to be able to fix it in one tap, not to
// re-admit them from scratch.
//
// Sending null clears the date, which is open-ended again. Extending a stay that has
// ALREADY expired is deliberately allowed: that is the common case, discovered when
// the guest says they cannot sign in.
const updateStay = async (req, res) => {
    try {
        const tenantId = req.params.id;
        const ownerId = req.user.id;

        // Ownership and the move-in date in one read: the validator needs the floor, and
        // a second query for it would be a second chance to forget the owner check.
        const [existing] = await db.query(
            'SELECT id, move_in_date FROM tenants WHERE id = ? AND owner_id = ?',
            [tenantId, ownerId]
        );
        if (existing.length === 0) return res.status(404).json({ message: 'Tenant not found or unauthorized.' });

        const stay = parseStayUntil(req.body?.stay_until, { notBefore: existing[0].move_in_date });
        if (!stay.ok) return res.status(400).json({ message: stay.message });

        const value = toSqlDate(stay.value);
        await db.query('UPDATE tenants SET stay_until = ? WHERE id = ?', [value, tenantId]);

        res.status(200).json({
            message: value ? 'Stay dates updated.' : 'This stay is open-ended again.',
            stay_until: value
        });
    } catch (error) {
        console.error('Error updating stay dates:', error);
        res.status(500).json({ message: 'Server error while updating the stay dates.' });
    }
};

// --- 1. GET ALL UNASSIGNED TENANTS ---
const getUnassignedTenants = async (req, res) => {
    try {
        const ownerId = req.user.id; 

        // SIMPLIFIED QUERY: Just grab this owner's tenants who have no unit
        const query = `
            SELECT * FROM tenants 
            WHERE owner_id = ? AND (unit_id IS NULL OR unit_id = 0)
            ORDER BY name ASC
        `;
        
        const [tenants] = await db.query(query, [ownerId]);

        res.status(200).json({ tenants });
    } catch (error) {
        console.error("Error fetching unassigned tenants:", error);
        res.status(500).json({ message: "Server error while fetching unassigned tenants." });
    }
};

// --- 2. ASSIGN TENANT TO A ROOM ---
const assignTenantToRoom = async (req, res) => {
    try {
        const tenantId = req.params.id;
        const { unit_id, deposit, rent_share, move_in_date, billing_cycle } = req.body; 

        if (!unit_id) return res.status(400).json({ message: "Unit ID is required." });

        // --- SMART BILLING ENGINE ---
        let nextRentDue = null;
        if (move_in_date) {
            const [year, month, day] = move_in_date.split('-');
            
            // Rent is due the day they move in
            let d = new Date(year, month - 1, day);
            
            if (billing_cycle === '1st_of_month') {
                // If they chose 1st of month, rent is due on the 1st of the CURRENT month
                d = new Date(year, month - 1, 1); 
            }
            
            const dueYear = d.getFullYear();
            const dueMonth = String(d.getMonth() + 1).padStart(2, '0');
            const dueDay = String(d.getDate()).padStart(2, '0');
            nextRentDue = `${dueYear}-${dueMonth}-${dueDay}`;
        }

        // Update room, financials, dates, and reactivate the tenant!
        const updateQuery = `
            UPDATE tenants 
            SET unit_id = ?, deposit = ?, rent_share = ?, status = 'Active', move_in_date = ?, billing_cycle = ?, next_rent_due = ?
            WHERE id = ?
        `;
        const [result] = await db.query(updateQuery, [
            unit_id, deposit || 0, rent_share || 0, 
            move_in_date || null, billing_cycle || 'Anniversary', nextRentDue, 
            tenantId
        ]);

        if (result.affectedRows === 0) return res.status(404).json({ message: "Tenant not found." });

        // Mark the new room as Occupied
        await db.query(`UPDATE units SET status = 'Occupied' WHERE id = ?`, [unit_id]);

        res.status(200).json({ message: "Tenant successfully assigned to the room!" });
    } catch (error) {
        console.error("Error assigning tenant:", error);
        res.status(500).json({ message: "Server error while assigning tenant." });
    }
};

// Export controllers
module.exports = { addTenant, getTenantsByUnit, moveOutTenant, getAllTenants, assignUnit, updateTenant, deleteTenant, updateFinancials, updateStay, getUnassignedTenants, assignTenantToRoom };