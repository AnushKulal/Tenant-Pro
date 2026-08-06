// Seeds a ready-to-use DEMO account so the app can be shown off immediately, and
// keeps it that way. This is a REAL owner account — nothing flags it as special —
// but its data self-heals to a known, full state on every boot, so a demo always
// starts from the same rich picture no matter what the last demo did to it.
//
//   Landlord login:  demo@gmail.com     /  Kajal@2004
//   Tenant login:    tenant@gmail.com   /  Tenant@2004   (tenant portal)
//
// Design notes:
//   • Structure (properties/units/tenants) is created-if-missing and then UPDATED
//     to known values, so it never duplicates and never drifts.
//   • Financial history (payments, expenses) is DELETED and rebuilt every boot,
//     scoped to demo-owned rows only. That is what makes it self-healing: recording
//     a payment during a demo does not permanently alter the account.
//   • Dates are computed relative to "now" at runtime, so the six-month revenue
//     chart and the dues always look current — never a fixed year that ages.
//   • Every query is scoped to the demo owner / its tenants / its properties. It
//     never reads or writes another account's data.
const db = require('../config/db');
const bcrypt = require('bcryptjs');

const DEMO_EMAIL = 'demo@gmail.com';
const DEMO_PASSWORD = 'Kajal@2004';
const DEMO_PHONE = '9000000000';

// Tenant-portal login. A different email/phone from the landlord on purpose — the
// two portals are mutually exclusive per identifier, so they cannot collide.
const DEMO_TENANT_EMAIL = 'tenant@gmail.com';
const DEMO_TENANT_PASSWORD = 'Tenant@2004';
const DEMO_TENANT_PHONE = '9000000001';

// Gender-matched portraits (randomuser.me) and property/room photos (picsum.photos).
const IMG = {
    owner: 'https://randomuser.me/api/portraits/men/32.jpg',
    tenants: {
        'Rahul Sharma': 'https://randomuser.me/api/portraits/men/45.jpg',
        'Priya Nair': 'https://randomuser.me/api/portraits/women/44.jpg',
        'Amit Verma': 'https://randomuser.me/api/portraits/men/68.jpg',
        'Sneha Reddy': 'https://randomuser.me/api/portraits/women/65.jpg',
        'Karthik Rao': 'https://randomuser.me/api/portraits/men/12.jpg',
        'Neha Gupta': 'https://randomuser.me/api/portraits/women/28.jpg'
    },
    properties: {
        'Sunrise PG': 'https://picsum.photos/seed/tp-sunrise-pg/800/600',
        'Green Meadows Apartment': 'https://picsum.photos/seed/tp-green-meadows/800/600'
    },
    units: {
        '101': 'https://picsum.photos/seed/tp-room-101/800/600',
        '102': 'https://picsum.photos/seed/tp-room-102/800/600',
        '103': 'https://picsum.photos/seed/tp-room-103/800/600',
        'A1': 'https://picsum.photos/seed/tp-flat-a1/800/600',
        'A2': 'https://picsum.photos/seed/tp-flat-a2/800/600'
    }
};

// --- Date helpers (runtime-relative, so the demo never ages) -----------------
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// A date `months` before now, clamped to `day`. Used for payment history and dues.
const monthsAgo = (months, day = 5) => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() - months, day);
};
const daysFromNow = (days) => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
};

// --- Declarative dataset -----------------------------------------------------
const PROPERTIES = [
    { name: 'Sunrise PG', type: 'PG', address: '12, 5th Cross, Koramangala', locality: 'Koramangala', city: 'Bengaluru', pincode: '560034' },
    { name: 'Green Meadows Apartment', type: 'Apartment', address: '45, Sector 2, HSR Layout', locality: 'HSR Layout', city: 'Bengaluru', pincode: '560102' }
];

// [unit_number, property_name, room_type, capacity, base_rent, status]
const UNITS = [
    ['101', 'Sunrise PG', 'Standard Sharing', 2, 16000, 'Occupied'],
    ['102', 'Sunrise PG', 'Deluxe Single', 1, 12000, 'Occupied'],
    ['103', 'Sunrise PG', 'Standard Sharing', 2, 16000, 'Occupied'],
    ['A1', 'Green Meadows Apartment', '1 BHK', 1, 22000, 'Occupied'],
    ['A2', 'Green Meadows Apartment', '2 BHK', 1, 30000, 'Vacant']  // left vacant so the "Vacant Units" metric is non-zero
];

// [name, phone, email, company, unit_number, deposit, rent_share, move_in_months_ago, credit, dueOffsetDays]
// dueOffsetDays: negative = overdue (feeds "Pending Dues"), positive = paid up.
const TENANTS = [
    ['Rahul Sharma', '9812345670', 'rahul@example.com', 'Infosys', '101', 16000, 8000, 6, 100, 24],
    ['Priya Nair', '9812345671', 'priya@example.com', 'Wipro', '101', 16000, 8000, 5, 95, 24],
    ['Amit Verma', '9812345672', 'amit@example.com', 'TCS', '102', 24000, 12000, 7, 100, -3],   // overdue
    ['Sneha Reddy', '9812345673', 'sneha@example.com', 'Amazon', 'A1', 44000, 22000, 4, 90, 20],
    ['Karthik Rao', '9812345674', 'karthik@example.com', 'Flipkart', '103', 16000, 8000, 3, 88, -1], // overdue
    ['Neha Gupta', '9812345675', 'neha@example.com', 'Zomato', '103', 16000, 8000, 2, 92, 27]
];

// Expenses give the account a "used" feel and make property P&L believable.
// [property_name, category, amount, months_ago, description]
const EXPENSES = [
    ['Sunrise PG', 'Maintenance', 3500, 1, 'Plumbing repair — 2nd floor'],
    ['Sunrise PG', 'Electricity', 4200, 1, 'Common area + water pump'],
    ['Sunrise PG', 'Internet', 1499, 2, 'Monthly broadband'],
    ['Sunrise PG', 'Cleaning', 2000, 0, 'Housekeeping'],
    ['Green Meadows Apartment', 'Maintenance', 5000, 2, 'Lift AMC'],
    ['Green Meadows Apartment', 'Water', 1800, 1, 'Tanker top-up'],
    ['Green Meadows Apartment', 'Electricity', 2600, 0, 'Common area']
];

const METHODS = ['UPI', 'UPI', 'Cash', 'UPI', 'Bank Transfer'];

// --- Idempotent "ensure" steps ----------------------------------------------

// Owner row + payment settings. Returns the demo owner id.
const ensureOwner = async () => {
    const [existing] = await db.query('SELECT id FROM owners WHERE email = ?', [DEMO_EMAIL]);
    let ownerId;
    if (existing.length === 0) {
        const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
        const [res] = await db.query(
            'INSERT INTO owners (name, email, phone, password_hash, profile_pic) VALUES (?, ?, ?, ?, ?)',
            ['Demo Landlord', DEMO_EMAIL, DEMO_PHONE, hash, IMG.owner]
        );
        ownerId = res.insertId;
    } else {
        ownerId = existing[0].id;
        // Self-heal the display fields (name/photo) without touching the password.
        await db.query('UPDATE owners SET name = ?, profile_pic = ? WHERE id = ?', ['Demo Landlord', IMG.owner, ownerId]);
    }

    // UNIQUE(owner_id) makes this a clean upsert.
    await db.query(
        `INSERT INTO payment_settings (owner_id, upi_id, upi_number) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE upi_id = VALUES(upi_id), upi_number = VALUES(upi_number)`,
        [ownerId, 'demo@okhdfcbank', DEMO_PHONE]
    );
    return ownerId;
};

const ensureProperties = async (ownerId) => {
    const ids = {};
    for (const p of PROPERTIES) {
        const [rows] = await db.query('SELECT id FROM properties WHERE owner_id = ? AND name = ?', [ownerId, p.name]);
        if (rows.length === 0) {
            const [res] = await db.query(
                `INSERT INTO properties (owner_id, name, property_type, address, locality, city, pincode, upi_id, image_url)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [ownerId, p.name, p.type, p.address, p.locality, p.city, p.pincode, 'demo@okhdfcbank', IMG.properties[p.name]]
            );
            ids[p.name] = res.insertId;
        } else {
            ids[p.name] = rows[0].id;
            await db.query('UPDATE properties SET image_url = ?, address = ?, locality = ?, city = ?, pincode = ? WHERE id = ?',
                [IMG.properties[p.name], p.address, p.locality, p.city, p.pincode, rows[0].id]);
        }
    }
    return ids;
};

const ensureUnits = async (propIds) => {
    const ids = {};
    for (const [num, propName, roomType, cap, rent, status] of UNITS) {
        const propertyId = propIds[propName];
        const [rows] = await db.query('SELECT id FROM units WHERE property_id = ? AND unit_number = ?', [propertyId, num]);
        if (rows.length === 0) {
            const [res] = await db.query(
                `INSERT INTO units (property_id, unit_number, room_type, capacity, rent_split_type, base_rent, status, image_url)
                 VALUES (?, ?, ?, ?, 'Equal', ?, ?, ?)`,
                [propertyId, num, roomType, cap, rent, status, IMG.units[num]]
            );
            ids[num] = res.insertId;
        } else {
            ids[num] = rows[0].id;
            await db.query('UPDATE units SET room_type = ?, capacity = ?, base_rent = ?, status = ?, image_url = ? WHERE id = ?',
                [roomType, cap, rent, status, IMG.units[num], rows[0].id]);
        }
    }
    return ids;
};

const ensureTenants = async (ownerId, unitIds) => {
    const ids = {};
    for (const [name, phone, email, company, unitNum, deposit, rentShare, moveInMonths, credit, dueOffset] of TENANTS) {
        const unitId = unitIds[unitNum];
        const moveIn = ymd(monthsAgo(moveInMonths, 1));
        const nextDue = ymd(daysFromNow(dueOffset));
        const [rows] = await db.query('SELECT id FROM tenants WHERE owner_id = ? AND name = ?', [ownerId, name]);
        if (rows.length === 0) {
            const [res] = await db.query(
                `INSERT INTO tenants
                 (owner_id, unit_id, status, name, phone, email, company, deposit, rent_share, credit_score, image_url, move_in_date, billing_cycle, next_rent_due)
                 VALUES (?, ?, 'Active', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Anniversary', ?)`,
                [ownerId, unitId, name, phone, email, company, deposit, rentShare, credit, IMG.tenants[name], moveIn, nextDue]
            );
            ids[name] = res.insertId;
        } else {
            ids[name] = rows[0].id;
            await db.query(
                `UPDATE tenants SET unit_id = ?, status = 'Active', phone = ?, email = ?, company = ?,
                 deposit = ?, rent_share = ?, credit_score = ?, image_url = ?, move_in_date = ?, next_rent_due = ?
                 WHERE id = ?`,
                [unitId, phone, email, company, deposit, rentShare, credit, IMG.tenants[name], moveIn, nextDue, rows[0].id]
            );
        }
    }
    return ids;
};

// Self-healing: wipe the demo's payment history and rebuild six months of it.
const reseedPayments = async (tenantIds) => {
    const ids = Object.values(tenantIds);
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    await db.query(`DELETE FROM payments WHERE tenant_id IN (${placeholders})`, ids);

    let inserted = 0;
    const names = Object.keys(tenantIds);
    for (let n = 0; n < names.length; n++) {
        const name = names[n];
        const tenantId = tenantIds[name];
        const [tr] = await db.query('SELECT rent_share, next_rent_due FROM tenants WHERE id = ?', [tenantId]);
        const rent = Number(tr[0]?.rent_share || 0);
        if (rent <= 0) continue;

        // Five completed months of on-time payments, plus the current month only if
        // the tenant is paid up (dueOffset was positive → next_rent_due in future).
        const paidCurrentMonth = new Date(tr[0].next_rent_due) > new Date();
        const startMonth = paidCurrentMonth ? 0 : 1;
        for (let m = startMonth; m <= 5; m++) {
            const date = ymd(monthsAgo(m, 2 + ((n + m) % 6))); // vary the day a little
            const method = METHODS[(n + m) % METHODS.length];
            await db.query(
                `INSERT INTO payments (tenant_id, amount_paid, payment_date, payment_method, reference_id)
                 VALUES (?, ?, ?, ?, ?)`,
                [tenantId, rent, date, method, 'DEMO-REF']
            );
            inserted++;
        }
    }
    console.log(`💸 Demo payments reseeded — ${inserted} across ${names.length} tenants (6-month history).`);
};

const reseedExpenses = async (propIds) => {
    const ids = Object.values(propIds);
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    await db.query(`DELETE FROM expenses WHERE property_id IN (${placeholders})`, ids);

    let inserted = 0;
    for (const [propName, category, amount, monthsBack, description] of EXPENSES) {
        const propertyId = propIds[propName];
        if (!propertyId) continue;
        await db.query(
            `INSERT INTO expenses (property_id, expense_category, amount, expense_date, description)
             VALUES (?, ?, ?, ?, ?)`,
            [propertyId, category, amount, ymd(monthsAgo(monthsBack, 12)), description]
        );
        inserted++;
    }
    console.log(`🧾 Demo expenses reseeded — ${inserted} across ${ids.length} properties.`);
};

// The tenant-portal login, linked to one of the demo tenants so its identity is
// consistent. The tenant portal is still a placeholder today, so this mainly makes
// the portal signable-into for demos; it is ready for when the portal renders data.
const ensureDemoTenantLogin = async (tenantIds) => {
    const linkTo = tenantIds['Rahul Sharma'] || Object.values(tenantIds)[0] || null;
    const [rows] = await db.query('SELECT id FROM tenant_users WHERE email = ?', [DEMO_TENANT_EMAIL]);
    if (rows.length === 0) {
        const hash = await bcrypt.hash(DEMO_TENANT_PASSWORD, 10);
        await db.query(
            `INSERT INTO tenant_users (name, email, phone, password_hash, tenant_id, status)
             VALUES (?, ?, ?, ?, ?, 'Linked')`,
            ['Rahul Sharma', DEMO_TENANT_EMAIL, DEMO_TENANT_PHONE, hash, linkTo]
        );
        console.log('👤 Demo tenant login created — tenant@gmail.com / Tenant@2004');
    } else {
        // Keep the link fresh (tenant id can change if the demo was rebuilt); leave
        // the password alone so we don't rehash on every boot.
        await db.query('UPDATE tenant_users SET name = ?, phone = ?, tenant_id = ?, status = ? WHERE id = ?',
            ['Rahul Sharma', DEMO_TENANT_PHONE, linkTo, 'Linked', rows[0].id]);
    }
};

// Self-healing demo maintenance requests, so the tenant portal's Requests section
// shows real entries in a demo rather than an empty state. Attached to the tenant
// the demo tenant login is linked to (Rahul Sharma).
const reseedRequests = async (ownerId, tenantIds) => {
    const tenantId = tenantIds['Rahul Sharma'];
    if (!tenantId) return;
    await db.query('DELETE FROM maintenance_requests WHERE tenant_id = ?', [tenantId]);
    const rows = [
        ['Plumbing', 'Leaking tap in bathroom', 'The cold-water tap drips constantly.', 'Medium', 'In Progress'],
        ['Electrical', 'Ceiling fan not working', 'Fan stopped after the power cut.', 'High', 'Open'],
        ['Appliance', 'Geyser serviced', 'Water heater checked and cleaned.', 'Low', 'Resolved']
    ];
    for (const [category, title, description, priority, status] of rows) {
        await db.query(
            `INSERT INTO maintenance_requests (tenant_id, owner_id, category, title, description, priority, status)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [tenantId, ownerId, category, title, description, priority, status]
        );
    }
    console.log(`🔧 Demo maintenance requests reseeded — ${rows.length}.`);
};

const seedDemo = async () => {
    try {
        const ownerId = await ensureOwner();
        const propIds = await ensureProperties(ownerId);
        const unitIds = await ensureUnits(propIds);
        const tenantIds = await ensureTenants(ownerId, unitIds);
        await reseedPayments(tenantIds);
        await reseedExpenses(propIds);
        await reseedRequests(ownerId, tenantIds);
        await ensureDemoTenantLogin(tenantIds);
        console.log('✅ Demo account ready — landlord demo@gmail.com / Kajal@2004, tenant tenant@gmail.com / Tenant@2004');
    } catch (err) {
        // Never block boot on demo seeding — the app must serve real accounts even
        // if the demo refresh hits a transient DB error.
        console.error('❌ Demo seed failed (non-fatal):', err.message);
    }
};

module.exports = seedDemo;
