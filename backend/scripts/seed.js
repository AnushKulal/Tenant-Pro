// File: backend/scripts/seed.js
//
// Fill a database with a portfolio that looks like somebody's actual work.
//
//     node scripts/seed.js              # ~3 properties, a dozen rooms, tenants
//     node scripts/seed.js --big        # 8 properties, enough to stress a list
//     node scripts/seed.js --wipe       # clear seeded rows first
//     node scripts/seed.js --seed 42    # same "random" data every time
//
// ── Why this exists ───────────────────────────────────────────────────────────
// Testing against an empty database only ever proves the empty states work. Every
// interesting bug on this project lived in the shape of the data rather than in a
// handler: a tenant with no unit, a payment whose claim nobody decided, a request
// whose last message came from the landlord rather than the tenant, a guest whose
// stay ends on Tuesday. None of those exist until something makes them.
//
// So this does not generate "20 tenants". It generates the AWKWARD ones on purpose,
// because they are the ones that break screens:
//
//   · a tenant with no unit            (unassigned list, and every `UNIT ${t.unit}`)
//   · a guest with no email            (claim-account prompt, stay expiry)
//   · a guest whose stay already ended (requireLiveStay's 403 path)
//   · rent overdue, due today, due in a fortnight, and never set at all
//   · a payment Declared and undecided (the landlord's confirm queue)
//   · a payment Rejected with a note   (the tenant's "why was this refused")
//   · a request whose last word is the landlord's, and one where it is the tenant's
//   · a tenant who has given notice    (leave date, no Leave button)
//   · a property with no rooms, and a room with no tenant
//
// ── Determinism ───────────────────────────────────────────────────────────────
// The generator is seeded, so a failing test can be reproduced exactly by passing
// the same --seed back. Math.random() would make every failure a one-off ghost.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../config/db');

// ── A small deterministic PRNG (mulberry32) ──────────────────────────────────
// Thirty lines of arithmetic beats a dependency, and the point is reproducibility
// rather than statistical quality.
const makeRng = (seed) => {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const SEED = Number(opt('seed', 20260101)) || 20260101;
const rng = makeRng(SEED);

const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const chance = (p) => rng() < p;
// Rent that looks like rent: a round-ish number, not 14387.
const money = (lo, hi, step = 500) => Math.round(int(lo, hi) / step) * step;

const DAY = 86400000;
const dateOf = (d) => new Date(d).toISOString().slice(0, 10);
const daysFromNow = (n) => dateOf(Date.now() + n * DAY);

// ── Names that read as Indian rental records, because that is what this is ───
const FIRST = ['Rahul', 'Priya', 'Anjali', 'Vikram', 'Sneha', 'Arjun', 'Kavya', 'Rohit', 'Meera', 'Karthik',
    'Divya', 'Suresh', 'Lakshmi', 'Nikhil', 'Pooja', 'Manoj', 'Shruti', 'Ganesh', 'Ananya', 'Praveen',
    'Deepa', 'Sandeep', 'Ritu', 'Harish', 'Nisha', 'Varun', 'Swathi', 'Akash'];
const LAST = ['Sharma', 'Kulal', 'Reddy', 'Nair', 'Iyer', 'Shetty', 'Rao', 'Hegde', 'Pai', 'Menon',
    'Gowda', 'Bhat', 'Kamath', 'Prabhu', 'Shenoy', 'Naik'];
const LOCALITY = ['Indiranagar', 'Koramangala', 'Whitefield', 'HSR Layout', 'Jayanagar', 'Malleshwaram',
    'BTM Layout', 'Marathahalli', 'Hebbal', 'Rajajinagar', 'Banashankari', 'Yelahanka'];
const PROP_WORD = ['Residency', 'Nest', 'Heights', 'Enclave', 'Courtyard', 'Villa', 'Mansion', 'Homes'];
const PROP_NAME = ['Sunrise', 'Green Meadows', 'Lotus', 'Silver Oak', 'Palm', 'Orchid', 'Maple', 'Tulip',
    'Banyan', 'Cedar', 'Jasmine', 'Amber'];
const COMPANY = ['Infosys', 'Wipro', 'TCS', 'Freelance', 'Flipkart', 'Zoho', 'Razorpay', 'Student', null];
const ROOM_TYPE = ['Single', 'Double Sharing', 'Triple Sharing', '1BHK', '2BHK', 'Studio'];
const CATEGORY = ['Plumbing', 'Electrical', 'Appliance', 'Cleaning', 'Furniture', 'Internet', 'Other'];

const REQ_TITLES = {
    Plumbing: ['Tap leaking in the bathroom', 'Water not coming in the morning', 'Drain blocked in the kitchen'],
    Electrical: ['Fan making noise', 'Socket in the bedroom is dead', 'Lights flickering at night'],
    Appliance: ['Geyser not heating', 'Fridge stopped cooling', 'Washing machine not draining'],
    Cleaning: ['Common area not swept this week', 'Dustbins overflowing'],
    Furniture: ['Cupboard door came off', 'Bed frame creaking badly'],
    Internet: ['WiFi drops every evening', 'Router keeps restarting'],
    Other: ['Main gate lock is stiff', 'Parking spot taken by someone else']
};

const name = () => `${pick(FIRST)} ${pick(LAST)}`;
// 10 digits starting 6-9, which is what Indian mobile validation expects — and what
// the signup and UPI-number fields actually check for.
const phone = () => `${pick(['6', '7', '8', '9'])}${String(int(0, 999999999)).padStart(9, '0')}`;
const emailFor = (n, i) => `${n.toLowerCase().replace(/[^a-z]/g, '.')}${i}@example.com`;

const log = (...m) => console.log(...m);

// Everything this script writes is attributable, so --wipe can remove exactly what it
// made and nothing a human typed. The marker is the email domain.
const SEED_DOMAIN = '@example.com';

const wipe = async () => {
    log('🧹 Clearing previously seeded rows…');
    // Ordered by dependency, though every FK here is ON DELETE CASCADE. Owners last:
    // deleting them takes their properties, units, tenants and payments with them.
    await db.query(`DELETE FROM tenant_users WHERE email LIKE '%${SEED_DOMAIN}' OR guest_code LIKE 'SEED%'`);
    await db.query(`DELETE FROM owners WHERE email LIKE '%${SEED_DOMAIN}'`);
    log('   done.');
};

const main = async () => {
    const big = flag('big');
    if (flag('wipe')) await wipe();

    log(`🌱 Seeding (seed=${SEED}${big ? ', --big' : ''})…`);

    // ── The landlord ─────────────────────────────────────────────────────────
    // One password for every seeded account, printed at the end. A random one would
    // be unusable, which defeats the purpose of a fixture you sign into.
    const PASSWORD = 'Test@1234';
    const hash = await bcrypt.hash(PASSWORD, 10);
    const ownerName = name();
    const ownerEmail = `landlord${SEED}${SEED_DOMAIN}`;
    const [o] = await db.query(
        'INSERT INTO owners (name, email, phone, password_hash) VALUES (?, ?, ?, ?)',
        [ownerName, ownerEmail, phone(), hash]
    );
    const ownerId = o.insertId;
    await db.query(
        'INSERT INTO payment_settings (owner_id, upi_id, upi_number) VALUES (?, ?, ?)',
        [ownerId, `${ownerName.split(' ')[0].toLowerCase()}@okaxis`, phone()]
    );

    const propCount = big ? 8 : 3;
    const made = { props: 0, units: 0, tenants: 0, users: 0, payments: 0, requests: 0, joins: 0 };
    const allTenants = [];

    for (let p = 0; p < propCount; p += 1) {
        const pname = `${pick(PROP_NAME)} ${pick(PROP_WORD)}`;
        const [pr] = await db.query(
            `INSERT INTO properties (owner_id, name, property_type, address, locality, city, pincode, latitude, longitude)
             VALUES (?, ?, ?, ?, ?, 'Bengaluru', ?, ?, ?)`,
            [ownerId, pname, pick(['PG', 'Apartment', 'Independent House']),
                `${int(1, 200)}, ${pick(['1st', '2nd', '3rd', '4th'])} Cross`, pick(LOCALITY),
                `5600${String(int(1, 99)).padStart(2, '0')}`,
                (12.8 + rng() * 0.35).toFixed(7), (77.5 + rng() * 0.35).toFixed(7)]
        );
        made.props += 1;

        // One property deliberately left with no rooms at all. An empty property is a
        // state the dashboard, the room list and the "add your first room" prompt all
        // have to handle, and it never occurs by accident in a generated set.
        if (p === propCount - 1) {
            log(`   · ${pname} — left EMPTY on purpose (no rooms)`);
            continue;
        }

        const unitCount = int(2, big ? 6 : 4);
        for (let u = 0; u < unitCount; u += 1) {
            const rent = money(6000, 28000);
            const [un] = await db.query(
                `INSERT INTO units (property_id, unit_number, room_type, capacity, rent_split_type, base_rent, status)
                 VALUES (?, ?, ?, ?, 'Equal', ?, 'Vacant')`,
                [pr.insertId, `${int(1, 4)}${String.fromCharCode(65 + u)}`, pick(ROOM_TYPE), int(1, 3), rent]
            );
            made.units += 1;

            // A vacant room in every property: the "lost rent" figure on the dashboard
            // is derived from these, and with none it silently reads zero for ever.
            if (u === 0 && chance(0.6)) continue;

            const occupants = int(1, 2);
            for (let t = 0; t < occupants; t += 1) {
                const tn = name();
                const share = occupants > 1 ? money(rent / occupants - 500, rent / occupants + 500, 250) : rent;
                const moveIn = daysFromNow(-int(30, 400));

                // The due date is the single most load-bearing field on every screen,
                // so all four of its states are represented rather than left to chance.
                const dueRoll = rng();
                const nextDue = dueRoll < 0.2 ? daysFromNow(-int(2, 25))   // overdue
                    : dueRoll < 0.3 ? daysFromNow(0)                        // due today
                        : dueRoll < 0.9 ? daysFromNow(int(1, 25))           // upcoming
                            : null;                                          // never set

                const [tr] = await db.query(
                    `INSERT INTO tenants
                        (owner_id, unit_id, status, name, phone, email, company, emergency_phone,
                         deposit, rent_share, credit_score, move_in_date, billing_cycle, next_rent_due)
                     VALUES (?, ?, 'Active', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Monthly', ?)`,
                    [ownerId, un.insertId, tn, phone(), emailFor(tn, made.tenants), pick(COMPANY), phone(),
                        money(rent, rent * 2), share, int(620, 790), moveIn, nextDue]
                );
                made.tenants += 1;
                await db.query("UPDATE units SET status = 'Occupied' WHERE id = ?", [un.insertId]);
                allTenants.push({ id: tr.insertId, name: tn, share, moveIn, nextDue, unitId: un.insertId });
            }
        }
    }

    // ── Tenants in states that break screens ─────────────────────────────────
    // An unassigned tenant: no unit, therefore no property, no rent and no due date.
    // Every `UNIT ${t.unit}` in the app renders against one of these.
    const uaName = name();
    await db.query(
        `INSERT INTO tenants (owner_id, unit_id, status, name, phone, email, deposit, rent_share, credit_score, billing_cycle)
         VALUES (?, NULL, 'Active', ?, ?, ?, 0, 0, ?, 'Monthly')`,
        [ownerId, uaName, phone(), emailFor(uaName, 900), int(620, 790)]
    );
    made.tenants += 1;
    log(`   · ${uaName} — unassigned (no room), on purpose`);

    // Somebody on their way out. The portal must not offer them a Leave button, and
    // the landlord's list has to show the date.
    if (allTenants.length) {
        const leaver = allTenants[0];
        await db.query(
            'UPDATE tenants SET notice_given_on = ?, leave_on = ? WHERE id = ?',
            [daysFromNow(-10), daysFromNow(20), leaver.id]
        );
        log(`   · ${leaver.name} — has given notice, leaving in 20 days`);
    }

    // ── Tenant portal accounts ───────────────────────────────────────────────
    // Linked full accounts for the first few, so there is something to sign into.
    const portalLogins = [];
    for (let i = 0; i < Math.min(3, allTenants.length); i += 1) {
        const t = allTenants[i];
        const em = emailFor(t.name, 1000 + i);
        await db.query(
            `INSERT INTO tenant_users (name, email, phone, password_hash, tenant_id, status, is_guest)
             VALUES (?, ?, ?, ?, ?, 'Linked', 0)`,
            [t.name, em, phone(), hash, t.id]
        );
        made.users += 1;
        portalLogins.push(em);
    }

    // A guest: no email, no password, a code instead of a name. Their whole account is
    // a different shape, and the "finish your profile" prompt exists for them alone.
    if (allTenants.length > 3) {
        const g = allTenants[3];
        await db.query(
            `INSERT INTO tenant_users (name, phone, tenant_id, status, is_guest, guest_code)
             VALUES (?, ?, ?, 'Linked', 1, ?)`,
            [g.name, phone(), g.id, `SEED${String(int(1000, 9999))}`]
        );
        await db.query('UPDATE tenants SET stay_until = ? WHERE id = ?', [daysFromNow(12), g.id]);
        made.users += 1;
        log(`   · ${g.name} — guest, stay ends in 12 days`);
    }

    // A guest whose stay is ALREADY over. This is the only way to reach
    // requireLiveStay's 403 and the claim-account route it points at, and it is
    // unreachable from the UI without waiting for a real date to pass.
    if (allTenants.length > 4) {
        const ex = allTenants[4];
        await db.query(
            `INSERT INTO tenant_users (name, phone, tenant_id, status, is_guest, guest_code)
             VALUES (?, ?, ?, 'Linked', 1, ?)`,
            [ex.name, phone(), ex.id, `SEED${String(int(1000, 9999))}`]
        );
        await db.query('UPDATE tenants SET stay_until = ? WHERE id = ?', [daysFromNow(-5), ex.id]);
        made.users += 1;
        log(`   · ${ex.name} — guest whose stay ENDED 5 days ago, on purpose`);
    }

    // An unlinked account: registered, waiting for a landlord to take them in. The
    // portal's whole "ask to join" flow is drawn for this person.
    const unName = name();
    const [unlinked] = await db.query(
        `INSERT INTO tenant_users (name, email, phone, password_hash, status, is_guest)
         VALUES (?, ?, ?, ?, 'Unlinked', 0)`,
        [unName, emailFor(unName, 2000), phone(), hash]
    );
    made.users += 1;
    portalLogins.push(emailFor(unName, 2000));

    // …and their pending request to join, so the landlord's inbox is not empty.
    const [firstProp] = await db.query('SELECT id FROM properties WHERE owner_id = ? LIMIT 1', [ownerId]);
    if (firstProp.length) {
        await db.query(
            `INSERT INTO join_requests (tenant_user_id, owner_id, property_id, status, note, source)
             VALUES (?, ?, ?, 'Pending', ?, 'code')`,
            [unlinked.insertId, ownerId, firstProp[0].id, 'Looking for a single room from next month.']
        );
        made.joins += 1;
    }

    // ── Payment history ──────────────────────────────────────────────────────
    for (const t of allTenants) {
        // Confirmed history, so totals, the ledger and the score have something to
        // work from. due_date is written because without it a payment cannot be
        // scored on-time or late — the gap that made the score read "None missed"
        // for everybody.
        const months = int(1, 6);
        for (let m = months; m >= 1; m -= 1) {
            const paid = daysFromNow(-m * 30 + int(-3, 4));
            await db.query(
                `INSERT INTO payments (tenant_id, amount_paid, payment_date, due_date, payment_method, status, confirmation_source, decided_at)
                 VALUES (?, ?, ?, ?, ?, 'Confirmed', 'landlord', NOW())`,
                [t.id, t.share, paid, daysFromNow(-m * 30), pick(['UPI', 'Cash', 'Bank Transfer'])]
            );
            made.payments += 1;
        }
    }

    // One undecided claim. The landlord's confirm queue, the bell count and the
    // tenant's "waiting on your landlord" state all hang off exactly this row.
    if (allTenants.length) {
        const c = allTenants[0];
        await db.query(
            `INSERT INTO payments (tenant_id, amount_paid, payment_date, due_date, payment_method, reference_id, status)
             VALUES (?, ?, ?, ?, 'UPI', ?, 'Declared')`,
            [c.id, c.share, daysFromNow(-1), c.nextDue, `TP${int(100000, 999999)}`]
        );
        made.payments += 1;
        log(`   · ${c.name} — has a payment DECLARED and awaiting confirmation`);
    }
    // A refused one, with a reason. The tenant has to be able to see why.
    if (allTenants.length > 1) {
        const rj = allTenants[1];
        await db.query(
            `INSERT INTO payments (tenant_id, amount_paid, payment_date, due_date, payment_method, status, decision_note, confirmation_source, decided_at)
             VALUES (?, ?, ?, ?, 'UPI', 'Rejected', ?, 'landlord', NOW())`,
            [rj.id, rj.share, daysFromNow(-8), rj.nextDue, 'Could not find this transfer in my account — please send the UTR.']
        );
        made.payments += 1;
    }

    // ── Maintenance ──────────────────────────────────────────────────────────
    for (const t of allTenants) {
        if (!chance(0.55)) continue;
        const cat = pick(CATEGORY);
        const status = pick(['Open', 'In Progress', 'Resolved']);
        const [rq] = await db.query(
            `INSERT INTO maintenance_requests (tenant_id, owner_id, category, title, description, priority, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [t.id, ownerId, cat, pick(REQ_TITLES[cat]),
                'Started a few days ago and is getting worse. Please take a look when you can.',
                pick(['Low', 'Medium', 'High']), status,
                new Date(Date.now() - int(1, 40) * DAY)]
        );
        made.requests += 1;

        // WHO spoke last decides whether the other side gets an alert, so both
        // directions are represented. A set where the tenant always speaks last would
        // leave the landlord-replied notification permanently untested.
        await db.query(
            `INSERT INTO maintenance_messages (request_id, sender_role, kind, body) VALUES (?, 'tenant', 'message', ?)`,
            [rq.insertId, 'Any update on this?']
        );
        if (chance(0.5)) {
            await db.query(
                `INSERT INTO maintenance_messages (request_id, sender_role, kind, body) VALUES (?, 'owner', 'message', ?)`,
                [rq.insertId, 'Plumber is coming tomorrow between 10 and 12.']
            );
        }
        if (status !== 'Open') {
            await db.query(
                `INSERT INTO maintenance_messages (request_id, sender_role, kind, body, status_from, status_to)
                 VALUES (?, 'system', 'status', '', 'Open', ?)`,
                [rq.insertId, status]
            );
        }
    }

    log('');
    log('✅ Seeded:');
    log(`   ${made.props} properties · ${made.units} rooms · ${made.tenants} tenants`);
    log(`   ${made.users} portal accounts · ${made.payments} payments · ${made.requests} requests · ${made.joins} join request`);
    log('');
    log('   LANDLORD');
    log(`     ${ownerEmail}`);
    log(`     ${PASSWORD}`);
    log('   TENANT PORTAL');
    for (const em of portalLogins) log(`     ${em}  /  ${PASSWORD}`);
    log('');
    log(`   Reproduce this exact data with:  node scripts/seed.js --wipe --seed ${SEED}`);
    process.exit(0);
};

main().catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
});
