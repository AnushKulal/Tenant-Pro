// The DEMO account: a REAL landlord account, backed by real rows in this database
// exactly like any other. Nothing about it is faked in the app — sign in as the demo
// and the screens read the same endpoints a paying customer's screens read.
//
// IT BEHAVES LIKE A REAL ACCOUNT. Whatever you do during a demo — record a payment,
// accept an applicant, edit a room, delete a property — sticks. Boot does not touch
// an account that has data in it.
//
// This used to work the other way round: the full picture was rebuilt on EVERY boot.
// Since Render's free tier sleeps and wakes constantly, that meant a restart in the
// middle of a demo quietly deleted the payments, expenses, requests and join
// decisions you had just made, and put every edited property, room and tenant back to
// its seeded values. It looked like the app was ignoring you.
//
// Now there are two separate paths:
//
//   ensureDemoAccount()  runs at boot. Guarantees the account can be SIGNED INTO, and
//                        builds the full picture only when there is nothing to lose —
//                        a brand-new database, or an account somebody emptied.
//   resetDemoData()      the destructive rebuild, ON DEMAND ONLY, via
//                        POST /api/owner/demo/reset. Run it before a client meeting
//                        and you get the rich, current-dated picture back.
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
// Design notes, all of which apply to resetDemoData rather than to boot:
//   • Structure (properties/units/tenants) is created-if-missing and then UPDATED to
//     known values, so a reset never duplicates and never drifts.
//   • Decisions are undone: accepting an applicant creates a real tenant record and
//     links their login, and a reset removes both, so the requests are waiting again.
//   • Financial history (payments, expenses) is DELETED and rebuilt, scoped to
//     demo-owned rows only.
//   • Dates are computed relative to "now" AT RESET TIME, so the six-month revenue
//     chart and the dues read as current — never a fixed year that ages. This is the
//     reason to reset before a demo rather than to leave it for months.
//   • Credentials are the ONE thing repaired on every boot, because the demo login is
//     printed on the landing page and handed to clients: an account nobody can sign
//     into is worse than one with stale numbers in it. That touches passwords and
//     account links, never data.
//   • Every query is scoped to the demo owner / its tenants / its properties. It never
//     reads or writes another account's data.
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
        // Deliberately does NOT overwrite the name or photo. This runs on every boot,
        // and Render's free tier restarts constantly, so rewriting them would revert
        // a profile edit made during a demo — the exact "my changes don't stick"
        // problem. resetDemoData() restores them when asked.
    }

    // Payment settings are created if absent and then left alone, for the same
    // reason: a landlord who set their own UPI during a demo keeps it.
    // UNIQUE(owner_id) makes the INSERT idempotent on its own.
    await db.query(
        `INSERT IGNORE INTO payment_settings (owner_id, upi_id, upi_number) VALUES (?, ?, ?)`,
        [ownerId, 'demo@okhdfcbank', DEMO_PHONE]
    );
    return ownerId;
};

// Has anybody put anything in this account yet? One property is enough: it means
// the rich picture has been built at least once, so boot must not touch it.
const demoHasData = async (ownerId) => {
    const [rows] = await db.query('SELECT COUNT(*) AS n FROM properties WHERE owner_id = ?', [ownerId]);
    return Number(rows[0].n) > 0;
};

// Reads and writes the single-row demo_state marker, which is what lets the app say
// "last reset 3 days ago" and what tells a reset apart from a first build.
const readDemoState = async () => {
    const [rows] = await db.query('SELECT owner_id, last_reset_at, reset_count FROM demo_state WHERE id = 1');
    return rows[0] || null;
};

const stampDemoState = async (ownerId) => {
    await db.query(
        `INSERT INTO demo_state (id, owner_id, last_reset_at, reset_count)
         VALUES (1, ?, NOW(), 1)
         ON DUPLICATE KEY UPDATE owner_id = VALUES(owner_id),
                                 last_reset_at = NOW(),
                                 reset_count = reset_count + 1`,
        [ownerId]
    );
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
            // History is money the landlord already acknowledged, so it is Confirmed
            // and counts toward the dashboard totals.
            await db.query(
                `INSERT INTO payments (tenant_id, amount_paid, payment_date, payment_method, reference_id, status)
                 VALUES (?, ?, ?, ?, ?, 'Confirmed')`,
                [tenantId, rent, date, method, 'DEMO-REF']
            );
            inserted++;
        }
    }

    // One tenant who says they have paid and is waiting on the landlord, so the
    // confirm queue has something real in it the moment you sign in to the demo --
    // and so the totals can be seen NOT counting it.
    let declared = 0;
    for (const name of names) {
        const tenantId = tenantIds[name];
        const [tr] = await db.query('SELECT rent_share, next_rent_due FROM tenants WHERE id = ?', [tenantId]);
        const rent = Number(tr[0]?.rent_share || 0);
        // Only somebody who actually owes something would be declaring a payment.
        if (rent <= 0 || new Date(tr[0].next_rent_due) > new Date()) continue;
        await db.query(
            `INSERT INTO payments
                (tenant_id, amount_paid, payment_date, payment_method, reference_id, status, declared_by)
             VALUES (?, ?, ?, 'UPI', ?, 'Declared',
                     (SELECT id FROM tenant_users WHERE tenant_id = ? LIMIT 1))`,
            [tenantId, rent, ymd(new Date()), 'DEMO-UPI-8842', tenantId]
        );
        declared++;
        break; // one is enough to show the flow without muddying the totals
    }
    console.log(
        `💸 Demo payments reseeded — ${inserted} confirmed across ${names.length} tenants (6-month history)`
        + `${declared ? `, ${declared} awaiting confirmation` : ''}.`
    );
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

// Demo ID proofs, one per applicant, deliberately in three different states so the
// landlord's inbox shows all three badges at once: verified, waiting to be checked,
// and nothing on file.
//
// `file` is a placeholder image rather than a real scan, for the obvious reason —
// there is no such thing as a demo Aadhaar card, and putting a realistic-looking
// one in a seed script would be creating a fake government document. It is a
// picture that says what it is.
const DEMO_ID_IMAGE = 'https://placehold.co/900x560/1a1a1f/c8f751/png?text=DEMO+ID+DOCUMENT';
const APPLICANT_DOCS = {
    // email → [doc_type, doc_number, status]
    'meera.demo@gmail.com': ['aadhaar', '2345 6789 0123', 'Verified'],
    'vikram.demo@gmail.com': ['pan', 'BQXPS4321L', 'Pending']
    // Anjali has none on purpose: "NO ID ON FILE" is a state a landlord has to
    // recognise, and a demo where everybody is documented never shows it.
};

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

        // The ID proof, if this applicant is meant to have one. Deleted first so a
        // re-run does not stack duplicates — the accounts survive between boots,
        // and ON DELETE CASCADE only fires when the account itself goes.
        await db.query('DELETE FROM tenant_documents WHERE tenant_user_id = ?', [rows[0].id]);
        const spec = APPLICANT_DOCS[email];
        if (spec) {
            const [docType, docNumber, status] = spec;
            await db.query(
                `INSERT INTO tenant_documents
                    (tenant_user_id, doc_type, doc_number, file_url, status, verified_by, verified_at, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    rows[0].id, docType, docNumber, DEMO_ID_IMAGE, status,
                    status === 'Verified' ? ownerId : null,
                    status === 'Verified' ? hoursFromNow(-1) : null,
                    hoursFromNow(-hoursAgo)
                ]
            );
        }
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

// The destructive rebuild. Everything the demo account should look like for a
// client walkthrough, with dates computed from "now" so the six-month chart and the
// dues always read as current.
//
// This is ON DEMAND ONLY. It used to run on every boot, which is why demo changes
// never stuck: Render's free tier sleeps and wakes constantly, and each wake quietly
// deleted the payments, expenses, requests and join decisions from the demo you were
// halfway through, and put every edited property, room and tenant back.
// Clears everything the demo owner has, so a reset rebuilds onto a clean slate
// instead of layering the seed on top of the leftovers.
//
// This exists because the "ensure" steps below match seed rows BY NAME. Rename
// "Sunrise PG" to "Anush Towers" during a demo and the next reset does not recognise
// it: the rename survives AND a fresh "Sunrise PG" appears next to it. Same for a
// renamed tenant, and any room or property added by hand stayed forever. Three
// properties and seven tenants is not the picture you want to put in front of a
// client, so a reset now genuinely resets.
//
// SAFETY: every statement is scoped to this owner_id, which callers obtain from
// ensureOwner() — the row matched on DEMO_EMAIL. demoController additionally refuses
// any caller whose own email is not DEMO_EMAIL, so a real landlord's data can never
// reach this function.
//
// Deletion order follows the foreign keys. properties CASCADE to units and expenses;
// tenants CASCADE to payments and maintenance_requests (and those to their messages).
// leases would block a tenant delete because its FK has no ON DELETE clause, so it
// goes first — nothing writes that table today, but a reset that starts failing the
// day something does would be a nasty surprise.
const wipeDemoData = async (ownerId) => {
    // Unlink the portal logins first. tenant_users.tenant_id has no foreign key, so
    // deleting the tenants would otherwise leave it pointing at a row that is gone —
    // and a tenant signing in would resolve to nothing.
    await db.query(
        `UPDATE tenant_users SET tenant_id = NULL, status = 'Unlinked'
         WHERE tenant_id IN (SELECT id FROM tenants WHERE owner_id = ?)`,
        [ownerId]
    );

    await db.query(
        `DELETE FROM leases WHERE tenant_id IN (SELECT id FROM tenants WHERE owner_id = ?)`,
        [ownerId]
    );
    // Cascades: payments, maintenance_requests -> maintenance_messages.
    await db.query('DELETE FROM tenants WHERE owner_id = ?', [ownerId]);
    await db.query('DELETE FROM join_requests WHERE owner_id = ?', [ownerId]);
    // Cascades: units, expenses.
    await db.query('DELETE FROM properties WHERE owner_id = ?', [ownerId]);

    // The applicants' uploaded IDs. Keyed on tenant_users rather than on this owner,
    // so nothing above reaches them; reseedJoinRequests puts them back.
    await db.query(
        `DELETE FROM tenant_documents WHERE tenant_user_id IN
           (SELECT id FROM tenant_users WHERE email IN (?, ?, ?))`,
        ['meera.demo@gmail.com', 'vikram.demo@gmail.com', 'anjali.demo@gmail.com']
    );
};

const resetDemoData = async () => {
    const ownerId = await ensureOwner();
    await wipeDemoData(ownerId);
    const propIds = await ensureProperties(ownerId);
    const unitIds = await ensureUnits(propIds);
    const tenantIds = await ensureTenants(ownerId, unitIds);

    // Put the landlord's own profile back too — a reset is a request for the whole
    // picture, and this is the one place allowed to overwrite it.
    await db.query('UPDATE owners SET name = ?, profile_pic = ? WHERE id = ?', ['Demo Landlord', IMG.owner, ownerId]);
    await db.query(
        `INSERT INTO payment_settings (owner_id, upi_id, upi_number) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE upi_id = VALUES(upi_id), upi_number = VALUES(upi_number)`,
        [ownerId, 'demo@okhdfcbank', DEMO_PHONE]
    );

    // The tenant-portal LOGIN goes first, right after tenants exist. It used to run
    // last, so any earlier step that threw left it uncreated — exactly the "can't log
    // into the tenant portal" symptom. Isolating the steps below keeps the login
    // independent of them.
    await step('tenant-login', () => ensureDemoTenantLogin(tenantIds));
    await step('payments', () => reseedPayments(tenantIds));
    await step('expenses', () => reseedExpenses(propIds));
    await step('requests', () => reseedRequests(ownerId, tenantIds));
    await step('join-requests', () => reseedJoinRequests(ownerId, propIds));
    await stampDemoState(ownerId);

    return { ownerId, properties: Object.keys(propIds).length, tenants: Object.keys(tenantIds).length };
};

// What runs at boot. Guarantees the demo can be LOGGED INTO, and builds the full
// picture only when there is nothing there to lose — a brand-new database, or an
// account somebody emptied. An account with data in it is left completely alone, so
// a restart in the middle of a demo is invisible.
const ensureDemoAccount = async () => {
    try {
        const ownerId = await ensureOwner();

        if (await demoHasData(ownerId)) {
            // Credentials still get repaired every boot, because the demo login is
            // written on the landing page and handed to clients — a demo nobody can
            // sign into is worse than a stale one. This touches passwords and links,
            // never data.
            const [tenantRows] = await db.query(
                `SELECT t.name, t.id FROM tenants t WHERE t.owner_id = ? AND t.status = 'Active'
                 ORDER BY t.id LIMIT 1`,
                [ownerId]
            );
            const tenantIds = tenantRows.length ? { [tenantRows[0].name]: tenantRows[0].id } : {};
            await step('tenant-login', () => ensureDemoTenantLogin(tenantIds));

            const state = await readDemoState();
            const when = state?.last_reset_at
                ? new Date(state.last_reset_at).toISOString().slice(0, 10)
                : 'never';
            console.log(`🏠 Demo account is live and untouched by this boot (last reset: ${when}). Changes made during a demo persist; reset it from Settings when you want the full picture back.`);
            return;
        }

        console.log('🆕 Demo account is empty — building the full picture once.');
        await resetDemoData();
        console.log('✅ Demo account ready — landlord demo@gmail.com / Kajal@2004, tenant tenant@gmail.com / Tenant@2004');
    } catch (err) {
        // Never block boot on the demo — the app must serve real accounts even if this
        // hits a transient DB error.
        console.error('❌ Demo setup failed (non-fatal):', err.message);
    }
};

module.exports = ensureDemoAccount;
module.exports.ensureDemoAccount = ensureDemoAccount;
module.exports.resetDemoData = resetDemoData;
module.exports.readDemoState = readDemoState;
module.exports.DEMO_EMAIL = DEMO_EMAIL;
