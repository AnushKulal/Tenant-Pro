// Seeds a ready-to-use DEMO account with sample data, so the app can be shown
// off immediately. Runs on startup but only inserts once — if the demo owner
// already exists, it does nothing (so real data is never touched).
//
//   Login:  demo@gmail.com  /  Kajal@2004
const db = require('../config/db');
const bcrypt = require('bcryptjs');

const DEMO_EMAIL = 'demo@gmail.com';
const DEMO_PASSWORD = 'Kajal@2004';

const seedDemo = async () => {
    // Skip if the demo account is already there.
    const [existing] = await db.query('SELECT id FROM owners WHERE email = ?', [DEMO_EMAIL]);
    if (existing.length > 0) {
        console.log('🌱 Demo account already exists — skipping seed.');
        return;
    }

    console.log('🌱 Seeding demo account with sample data...');
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // --- 1. Demo owner ---
        const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
        const [ownerRes] = await conn.query(
            'INSERT INTO owners (name, email, phone, password_hash) VALUES (?, ?, ?, ?)',
            ['Demo', DEMO_EMAIL, '9000000000', passwordHash]
        );
        const ownerId = ownerRes.insertId;

        // --- 2. Payment settings (UPI / QR) ---
        await conn.query(
            'INSERT INTO payment_settings (owner_id, upi_id, upi_number) VALUES (?, ?, ?)',
            [ownerId, 'demo@okhdfcbank', '9000000000']
        );

        // --- 3. Properties ---
        const [p1] = await conn.query(
            `INSERT INTO properties (owner_id, name, property_type, address, locality, city, pincode, upi_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [ownerId, 'Sunrise PG', 'PG', '12, 5th Cross, Koramangala', 'Koramangala', 'Bengaluru', '560034', 'demo@okhdfcbank']
        );
        const prop1 = p1.insertId;

        const [p2] = await conn.query(
            `INSERT INTO properties (owner_id, name, property_type, address, locality, city, pincode, upi_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [ownerId, 'Green Meadows Apartment', 'Apartment', '45, Sector 2, HSR Layout', 'HSR Layout', 'Bengaluru', '560102', 'demo@okhdfcbank']
        );
        const prop2 = p2.insertId;

        // --- 4. Units (rooms) ---
        // Sunrise PG rooms
        const [u101] = await conn.query(
            `INSERT INTO units (property_id, unit_number, room_type, capacity, rent_split_type, base_rent, status)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [prop1, '101', 'Standard Sharing', 2, 'Equal', 16000, 'Occupied']
        );
        const room101 = u101.insertId;

        const [u102] = await conn.query(
            `INSERT INTO units (property_id, unit_number, room_type, capacity, rent_split_type, base_rent, status)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [prop1, '102', 'Deluxe Single', 1, 'Equal', 12000, 'Occupied']
        );
        const room102 = u102.insertId;

        await conn.query(
            `INSERT INTO units (property_id, unit_number, room_type, capacity, rent_split_type, base_rent, status)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [prop1, '103', 'Standard Sharing', 2, 'Equal', 16000, 'Vacant']
        );

        // Green Meadows flats
        const [uA1] = await conn.query(
            `INSERT INTO units (property_id, unit_number, room_type, capacity, rent_split_type, base_rent, status)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [prop2, 'A1', '1 BHK', 1, 'Equal', 22000, 'Occupied']
        );
        const flatA1 = uA1.insertId;

        await conn.query(
            `INSERT INTO units (property_id, unit_number, room_type, capacity, rent_split_type, base_rent, status)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [prop2, 'A2', '2 BHK', 1, 'Equal', 30000, 'Vacant']
        );

        // --- 5. Tenants ---
        const tenants = [
            // [name, phone, email, company, unit_id, deposit, rent_share, move_in, next_due, credit]
            ['Rahul Sharma', '9812345670', 'rahul@example.com', 'Infosys', room101, 16000, 8000, '2026-02-01', '2026-08-01', 100],
            ['Priya Nair', '9812345671', 'priya@example.com', 'Wipro', room101, 16000, 8000, '2026-03-01', '2026-08-01', 95],
            ['Amit Verma', '9812345672', 'amit@example.com', 'TCS', room102, 24000, 12000, '2026-01-15', '2026-08-15', 100],
            ['Sneha Reddy', '9812345673', 'sneha@example.com', 'Amazon', flatA1, 44000, 22000, '2026-04-10', '2026-08-10', 90]
        ];

        const tenantIds = {};
        for (const t of tenants) {
            const [tr] = await conn.query(
                `INSERT INTO tenants
                 (owner_id, unit_id, status, name, phone, email, company, deposit, rent_share, credit_score, move_in_date, billing_cycle, next_rent_due)
                 VALUES (?, ?, 'Active', ?, ?, ?, ?, ?, ?, ?, ?, 'Anniversary', ?)`,
                [ownerId, t[4], t[0], t[1], t[2], t[3], t[5], t[6], t[9], t[7], t[8]]
            );
            tenantIds[t[0]] = tr.insertId;
        }

        // --- 6. A few recorded payments ---
        const payments = [
            // [tenant name, amount, date, method]
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

module.exports = seedDemo;
