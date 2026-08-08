// Seeds a ready-to-use DEMO account so the app can be shown off immediately, and
// keeps it that way. This is a REAL owner account — nothing flags it as special —
// but its data self-heals to a known, full state on every boot, so a demo always
// starts from the same rich picture no matter what the last demo did to it.
//
//   Landlord login:  demo@gmail.com   /  Kajal@2004   (landlord portal)
//   Tenant login:    demo@gmail.com   /  Kajal@2004   (tenant portal — SAME
//                    credential works on both; mobile 9000000000 too)
//   Tenant alias:    tenant@gmail.com /  Tenant@2004  (kept working too)
//   Applicants:      meera.demo@gmail.com, vikram.demo@gmail.com,
//                    anjali.demo@gmail.com  /  Tenant@2004
//                    Deliberately UNLINKED accounts with a pending request to join,
//                    so the landlord's bell has real people in it during a demo —
//                    and so the flow can also be shown from the applicant's side.
//
// Design notes:
//   • Structure (properties/units/tenants) is created-if-missing and then UPDATED
//     to known values, so it never duplicates and never drifts.
//   • Decisions are undone too: accepting an applicant during a demo creates a real
//     tenant record and links their login, and the reset removes both, so the next
//     demo starts with the requests still waiting.
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
// A MySQL DATETIME `hours` from now (negative = in the past). Used to age the demo
// maintenance queue, which is shown as a relative age ("2H AGO") rather than a date.
const hoursFromNow = (hours) => {
    const d = new Date(Date.now() + hours * 3600000);
    return `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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

// Upsert a tenant-portal login row (idempotent on the UNIQUE email), always
// re-asserting the password so a demo login can never drift.
//
// UPSERT — not select-then-update — so the row is GUARANTEED to exist with the
// KNOWN password on every boot: it can never leave a half-seeded state, and it
// always re-asserts the password (the old update path skipped it to avoid a
// rehash, so a drifted hash would silently break the login). One bcrypt per boot
// for a couple of demo rows is nothing next to that determinism.
const upsertTenantLogin = async ({ name, email, phone, password, tenantId }) => {
    const hash = await bcrypt.hash(password, 10);
    await db.query(
        `INSERT INTO tenant_users (name, email, phone, password_hash, tenant_id, status)
         VALUES (?, ?, ?, ?, ?, 'Linked')
         ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            phone = VALUES(phone),
            password_hash = VALUES(password_hash),
            tenant_id = VALUES(tenant_id),
            status = VALUES(status)`,
        [name, email, phone, hash, tenantId]
    );
};

// The tenant-portal login(s), each linked to a demo tenant so the portal shows
// that tenant's real dues, payments, home and requests when signed in.
const ensureDemoTenantLogin = async (tenantIds) => {
    const linkTo = tenantIds['Rahul Sharma'] || Object.values(tenantIds)[0] || null;

    // ONE credential for BOTH portals. The landlord demo login (demo@gmail.com /
    // Kajal@2004, mobile 9000000000) also signs into the TENANT portal, linked to
    // Rahul Sharma. This is safe because the two portal logins hit DIFFERENT tables
    // — owner login queries `owners`, tenant login queries `tenant_users` — so the
    // same identifier can live in both with no ambiguity at sign-in. It is a
    // demo-only convenience: the mutual-exclusivity check in registration still
    // stops REAL users from holding both. Same phone as the landlord so the
    // "Mobile" tab matches too, so the whole demo has a single memorable login.
    await upsertTenantLogin({
        name: 'Rahul Sharma',
        email: DEMO_EMAIL,       // demo@gmail.com — same as the landlord
        phone: DEMO_PHONE,       // 9000000000     — same as the landlord
        password: DEMO_PASSWORD, // Kajal@2004     — same as the landlord
        tenantId: linkTo
    });

    // The original dedicated tenant login is kept working as an alias, so anything
    // that already used it does not break.
    await upsertTenantLogin({
        name: 'Rahul Sharma',
        email: DEMO_TENANT_EMAIL,       // tenant@gmail.com
        phone: DEMO_TENANT_PHONE,       // 9000000001
        password: DEMO_TENANT_PASSWORD, // Tenant@2004
        tenantId: linkTo
    });

    console.log('👤 Demo tenant-portal login ensured — demo@gmail.com / Kajal@2004 works on BOTH portals (alias: tenant@gmail.com / Tenant@2004).');
};

// Self-healing demo maintenance requests. Spread across SIX different tenants
// rather than all hung off one, because the landlord's dashboard shows the queue
// as "who is asking for what" — with a single tenant it read as one person
// complaining six times instead of a portfolio with a workload.
//
// Each row: [tenant, category, title, description, priority, status, hoursAgo,
//            photo?, thread?]. `thread` is a list of [sender_role, body] pairs
// seeded in order so a demo opens a request onto a real conversation rather than
// an empty reply box.
const REQUESTS = [
    ['Amit Verma', 'Plumbing', 'No water in the bathroom',
        'There has been no water in the bathroom since last night. The tap runs dry and the overhead tank line seems blocked. I have not been able to use the bathroom since morning — please send someone today.',
        'High', 'Open', 2, 'https://picsum.photos/seed/tp-tkt-1a/800/600',
        [
            ['tenant', 'Still nothing this morning. The kitchen tap is fine, so it looks like just the bathroom line.'],
            ['owner', 'Thanks for the photo — the plumber is coming today between 4 and 6pm. Please keep the bathroom accessible.']
        ]],
    ['Karthik Rao', 'Electrical', 'Ceiling fan not working',
        'The fan stopped right after yesterday’s power cut. The regulator clicks but the blades do not move. Other points in the room are working fine.',
        'High', 'Open', 26, 'https://picsum.photos/seed/tp-tkt-2a/800/600',
        [['tenant', 'It is getting hard to sleep without the fan. Can someone look at it tomorrow?']]],
    ['Rahul Sharma', 'Plumbing', 'Leaking tap in bathroom',
        'The cold-water tap drips constantly, even when fully closed. It is wasting water and the sound carries at night.',
        'Medium', 'In Progress', 72, 'https://picsum.photos/seed/tp-tkt-3a/800/600',
        [
            ['owner', 'Plumber has seen it — the washer needs replacing. Part arrives Thursday.'],
            ['tenant', 'Understood, thank you for the update.']
        ]],
    ['Sneha Reddy', 'General', 'Lift making a grinding noise',
        'The lift makes a loud grinding sound between the 2nd and 3rd floor. It still runs but it does not sound safe.',
        'Medium', 'Open', 96, null,
        [['tenant', 'It happened again this evening. I have started using the stairs.']]],
    ['Priya Nair', 'General', 'Wi-Fi drops every evening',
        'The connection drops for 10–15 minutes at a time between 8pm and 10pm. It has been happening all week.',
        'Low', 'Open', 168, null, []],
    ['Neha Gupta', 'Appliance', 'Geyser needs a service',
        'The water takes much longer to heat than it used to. Probably needs a descale and a service.',
        'Low', 'In Progress', 190, null,
        [['owner', 'Service booked for Saturday morning.']]],
    ['Rahul Sharma', 'Appliance', 'Geyser serviced',
        'Water heater checked and cleaned. Heating normally again.',
        'Low', 'Resolved', 340, null,
        [['owner', 'Done — descaled and tested. Closing this out.']]]
];

// People asking to be let into a demo property, so the landlord's bell has
// something in it during a demo. These are `tenant_users` accounts deliberately
// left UNLINKED with status 'Pending' — that is what a real applicant looks like
// before a landlord decides, and it is the only state in which a join request can
// exist. Real passwords, so a demo can also be given from the applicant's side.
//
// [name, email, phone, property, hoursAgo, note]
const APPLICANTS = [
    ['Meera Iyer', 'meera.demo@gmail.com', '9845012345', 'Sunrise PG', 3,
        'Referred by Rahul in 101 — looking for a bed from next month.'],
    ['Vikram Singh', 'vikram.demo@gmail.com', '9845099999', 'Sunrise PG', 20,
        'Working at Swiggy nearby. Can move in this weekend if a bed is free.'],
    ['Anjali Menon', 'anjali.demo@gmail.com', '9845077777', 'Green Meadows Apartment', 52,
        '']
];
const APPLICANT_PASSWORD = 'Tenant@2004';

const reseedJoinRequests = async (ownerId, propIds) => {
    const emails = APPLICANTS.map((a) => a[1]);
    const phones = APPLICANTS.map((a) => a[2]);
    const emailMarks = emails.map(() => '?').join(',');

    // Self-healing, and the order matters. Accepting an applicant during a demo
    // creates a real tenants row and links their account, so a reset has to undo
    // BOTH or the next demo starts with yesterday's decisions already made:
    //   1. drop their join requests (the FK would block deleting the accounts),
    //   2. unlink the accounts,
    //   3. delete any tenant record an accept created — matched on phone within
    //      this owner, which is how accept dedupes in the first place.
    const [accounts] = await db.query(
        `SELECT id FROM tenant_users WHERE email IN (${emailMarks})`,
        emails
    );
    if (accounts.length) {
        const ids = accounts.map((a) => a.id);
        await db.query(
            `DELETE FROM join_requests WHERE tenant_user_id IN (${ids.map(() => '?').join(',')})`,
            ids
        );
        await db.query(
            `UPDATE tenant_users SET tenant_id = NULL, status = 'Pending'
             WHERE id IN (${ids.map(() => '?').join(',')})`,
            ids
        );
    }
    await db.query(
        `DELETE FROM tenants WHERE owner_id = ? AND phone IN (${phones.map(() => '?').join(',')})`,
        [ownerId, ...phones]
    );

    const hash = await bcrypt.hash(APPLICANT_PASSWORD, 10);
    let seeded = 0;
    for (const [name, email, phone, propertyName, hoursAgo, note] of APPLICANTS) {
        const propertyId = propIds[propertyName];
        if (!propertyId) continue;

        // UNIQUE(email) makes this a clean upsert. Left unlinked on purpose.
        await db.query(
            `INSERT INTO tenant_users (name, email, phone, password_hash, tenant_id, status)
             VALUES (?, ?, ?, ?, NULL, 'Pending')
             ON DUPLICATE KEY UPDATE
                name = VALUES(name), phone = VALUES(phone),
                password_hash = VALUES(password_hash),
                tenant_id = NULL, status = 'Pending'`,
            [name, email, phone, hash]
        );
        const [rows] = await db.query('SELECT id FROM tenant_users WHERE email = ?', [email]);
        if (!rows.length) continue;

        // created_at written explicitly so the inbox shows a believable spread of
        // ages ("3H AGO" … "2D AGO") rather than three requests all made at the
        // moment of the last deploy.
        await db.query(
            `INSERT INTO join_requests (tenant_user_id, owner_id, property_id, status, note, created_at)
             VALUES (?, ?, ?, 'Pending', ?, ?)`,
            [rows[0].id, ownerId, propertyId, note || null, hoursFromNow(-hoursAgo)]
        );
        seeded += 1;
    }
    console.log(`🙋 Demo join requests reseeded — ${seeded} waiting on a decision.`);
};

const reseedRequests = async (ownerId, tenantIds) => {
    const ids = Object.values(tenantIds).filter(Boolean);
    if (ids.length === 0) return;

    // Scoped to this owner's tenants only — never another account's rows. The
    // messages go with them via ON DELETE CASCADE.
    await db.query(
        `DELETE FROM maintenance_requests WHERE tenant_id IN (${ids.map(() => '?').join(',')})`,
        ids
    );

    let seeded = 0;
    let messages = 0;
    for (const [who, category, title, description, priority, status, hoursAgo, photo, thread] of REQUESTS) {
        const tenantId = tenantIds[who];
        if (!tenantId) continue;

        // created_at/updated_at are written explicitly so the queue has a
        // believable spread of ages ("2H AGO" … "2W AGO") instead of every
        // request being raised at the moment of the last deploy.
        const raised = hoursFromNow(-hoursAgo);
        const [res] = await db.query(
            `INSERT INTO maintenance_requests
             (tenant_id, owner_id, category, title, description, priority, status, image_url, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [tenantId, ownerId, category, title, description, priority, status, photo, raised, raised]
        );
        seeded += 1;

        // Replies land after the request, evenly spaced through its lifetime, so
        // the thread reads in a sensible order.
        const list = thread || [];
        for (let i = 0; i < list.length; i += 1) {
            const at = hoursFromNow(-hoursAgo + ((i + 1) * hoursAgo) / (list.length + 1));
            await db.query(
                'INSERT INTO maintenance_messages (request_id, sender_role, body, created_at) VALUES (?, ?, ?, ?)',
                [res.insertId, list[i][0], list[i][1], at]
            );
            messages += 1;
        }
    }
    console.log(`🔧 Demo maintenance requests reseeded — ${seeded} across ${new Set(REQUESTS.map((r) => r[0])).size} tenants, ${messages} messages.`);
};

// Run a self-healing step but never let its failure abort the ones after it.
// Structure (owner/properties/units/tenants) is a hard dependency for everything
// else, so those stay in the main try; the independent refresh steps below are
// isolated so, e.g., a hiccup rebuilding payment history can't stop the tenant
// LOGIN from being seeded.
const step = async (label, fn) => {
    try {
        await fn();
    } catch (err) {
        console.error(`⚠️  Demo seed step "${label}" failed (continuing):`, err.message);
    }
};

const seedDemo = async () => {
    try {
        const ownerId = await ensureOwner();
        const propIds = await ensureProperties(ownerId);
        const unitIds = await ensureUnits(propIds);
        const tenantIds = await ensureTenants(ownerId, unitIds);

        // Seed the tenant-portal LOGIN first, right after tenants exist — before the
        // financial/requests refresh. It used to run last, so any earlier step that
        // threw (a bad row, a transient error) left the demo tenant login uncreated,
        // which is exactly the "can't log into the tenant portal" symptom. Ordering
        // it here, plus isolating the steps below, makes the login independent of
        // them.
        await step('tenant-login', () => ensureDemoTenantLogin(tenantIds));
        await step('payments', () => reseedPayments(tenantIds));
        await step('expenses', () => reseedExpenses(propIds));
        await step('requests', () => reseedRequests(ownerId, tenantIds));
        await step('join-requests', () => reseedJoinRequests(ownerId, propIds));

        console.log('✅ Demo account ready — landlord demo@gmail.com / Kajal@2004, tenant tenant@gmail.com / Tenant@2004');
    } catch (err) {
        // Never block boot on demo seeding — the app must serve real accounts even
        // if the demo refresh hits a transient DB error.
        console.error('❌ Demo seed failed (non-fatal):', err.message);
    }
};

module.exports = seedDemo;
