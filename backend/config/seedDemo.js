// Seeds a ready-to-use DEMO account with sample data, so the app can be shown
// off immediately.
//   • If the demo owner doesn't exist, it creates everything (with images).
//   • If it already exists, it backfills any missing images.
// It never touches non-demo accounts.
//
//   Login:  demo@gmail.com  /  Kajal@2004
const db = require('../config/db');
const bcrypt = require('bcryptjs');

const DEMO_EMAIL = 'demo@gmail.com';
const DEMO_PASSWORD = 'Kajal@2004';

// Gender-matched portraits (randomuser.me) and property/room photos (picsum.photos).
const IMG = {
    owner: 'https://randomuser.me/api/portraits/men/32.jpg',
    tenants: {
        'Rahul Sharma': 'https://randomuser.me/api/portraits/men/45.jpg',   // male
        'Priya Nair': 'https://randomuser.me/api/portraits/women/44.jpg',   // female
        'Amit Verma': 'https://randomuser.me/api/portraits/men/68.jpg',     // male
        'Sneha Reddy': 'https://randomuser.me/api/portraits/women/65.jpg'   // female
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

// Tenants: [name, phone, email, company, unit_number_key, deposit, rent_share, move_in, next_due, credit]
const TENANTS = [
    ['Rahul Sharma', '9812345670', 'rahul@example.com', 'Infosys', '101', 16000, 8000, '2026-02-01', '2026-08-01', 100],
    ['Priya Nair', '9812345671', 'priya@example.com', 'Wipro', '101', 16000, 8000, '2026-03-01', '2026-08-01', 95],
    ['Amit Verma', '9812345672', 'amit@example.com', 'TCS', '102', 24000, 12000, '2026-01-15', '2026-08-15', 100],
    ['Sneha Reddy', '9812345673', 'sneha@example.com', 'Amazon', 'A1', 44000, 22000, '2026-04-10', '2026-08-10', 90]
];

// --- Create the whole demo account from scratch (with images) ---
const createDemo = async () => {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
        const [ownerRes] = await conn.query(
            'INSERT INTO owners (name, email, phone, password_hash, profile_pic) VALUES (?, ?, ?, ?, ?)',
            ['Demo', DEMO_EMAIL, '9000000000', passwordHash, IMG.owner]
        );
        const ownerId = ownerRes.insertId;

        await conn.query(
            'INSERT INTO payment_settings (owner_id, upi_id, upi_number) VALUES (?, ?, ?)',
            [ownerId, 'demo@okhdfcbank', '9000000000']
        );

        // Properties
        const [p1] = await conn.query(
            `INSERT INTO properties (owner_id, name, property_type, address, locality, city, pincode, upi_id, image_url)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [ownerId, 'Sunrise PG', 'PG', '12, 5th Cross, Koramangala', 'Koramangala', 'Bengaluru', '560034', 'demo@okhdfcbank', IMG.properties['Sunrise PG']]
        );
        const [p2] = await conn.query(
            `INSERT INTO properties (owner_id, name, property_type, address, locality, city, pincode, upi_id, image_url)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [ownerId, 'Green Meadows Apartment', 'Apartment', '45, Sector 2, HSR Layout', 'HSR Layout', 'Bengaluru', '560102', 'demo@okhdfcbank', IMG.properties['Green Meadows Apartment']]
        );

        // Units (rooms): [property_id, unit_number, room_type, capacity, base_rent, status]
        const units = [
            [p1.insertId, '101', 'Standard Sharing', 2, 16000, 'Occupied'],
            [p1.insertId, '102', 'Deluxe Single', 1, 12000, 'Occupied'],
            [p1.insertId, '103', 'Standard Sharing', 2, 16000, 'Vacant'],
            [p2.insertId, 'A1', '1 BHK', 1, 22000, 'Occupied'],
            [p2.insertId, 'A2', '2 BHK', 1, 30000, 'Vacant']
        ];
        const unitIds = {};
        for (const u of units) {
            const [ur] = await conn.query(
                `INSERT INTO units (property_id, unit_number, room_type, capacity, rent_split_type, base_rent, status, image_url)
                 VALUES (?, ?, ?, ?, 'Equal', ?, ?, ?)`,
                [u[0], u[1], u[2], u[3], u[4], u[5], IMG.units[u[1]]]
            );
            unitIds[u[1]] = ur.insertId;
        }

        // Tenants
        const tenantIds = {};
        for (const t of TENANTS) {
            const [tr] = await conn.query(
                `INSERT INTO tenants
                 (owner_id, unit_id, status, name, phone, email, company, deposit, rent_share, credit_score, image_url, move_in_date, billing_cycle, next_rent_due)
                 VALUES (?, ?, 'Active', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Anniversary', ?)`,
                [ownerId, unitIds[t[4]], t[0], t[1], t[2], t[3], t[5], t[6], t[9], IMG.tenants[t[0]], t[7], t[8]]
            );
            tenantIds[t[0]] = tr.insertId;
        }

        // A few recorded payments
        const payments = [
            ['Rahul Sharma', 8000, '2026-07-01', 'UPI'],
            ['Amit Verma', 12000, '2026-07-05', 'UPI'],
            ['Sneha Reddy', 22000, '2026-07-03', 'Cash']
        ];
        for (const pay of payments) {
            await conn.query(
                `INSERT INTO payments (tenant_id, amount_paid, payment_date, payment_method, reference_id)
                 VALUES (?, ?, ?, ?, ?)`,
                [tenantIds[pay[0]], pay[1], pay[2], pay[3], 'DEMO-REF']
            );
        }

        await conn.commit();
        console.log('✅ Demo account seeded! Login with demo@gmail.com / Kajal@2004');
    } catch (err) {
        await conn.rollback();
        console.error('❌ Demo seed failed (rolled back):', err.message);
    } finally {
        conn.release();
    }
};

// --- Backfill images onto an existing demo account (only where missing) ---
const backfillDemoImages = async (ownerId) => {
    const blank = '(image_url IS NULL OR image_url = "")';

    await db.query('UPDATE owners SET profile_pic = ? WHERE id = ? AND (profile_pic IS NULL OR profile_pic = "")', [IMG.owner, ownerId]);

    for (const [name, url] of Object.entries(IMG.properties)) {
        await db.query(`UPDATE properties SET image_url = ? WHERE owner_id = ? AND name = ? AND ${blank}`, [url, ownerId, name]);
    }
    for (const [unitNumber, url] of Object.entries(IMG.units)) {
        await db.query(
            `UPDATE units u JOIN properties p ON u.property_id = p.id
             SET u.image_url = ?
             WHERE p.owner_id = ? AND u.unit_number = ? AND (u.image_url IS NULL OR u.image_url = "")`,
            [url, ownerId, unitNumber]
        );
    }
    for (const [name, url] of Object.entries(IMG.tenants)) {
        await db.query(`UPDATE tenants SET image_url = ? WHERE owner_id = ? AND name = ? AND ${blank}`, [url, ownerId, name]);
    }
    console.log('🖼️  Demo account images ensured.');
};

const seedDemo = async () => {
    const [existing] = await db.query('SELECT id FROM owners WHERE email = ?', [DEMO_EMAIL]);
    if (existing.length === 0) {
        console.log('🌱 Seeding demo account with sample data...');
        await createDemo();
    } else {
        console.log('🌱 Demo account exists — ensuring sample images are set...');
        await backfillDemoImages(existing[0].id);
    }
};

module.exports = seedDemo;
