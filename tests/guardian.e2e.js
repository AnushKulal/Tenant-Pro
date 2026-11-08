// File: tests/guardian.e2e.js
//
// A tenant under 18, end to end — form to column.
//
// Under the Indian Contract Act a person under 18 is not competent to contract,
// so a minor cannot hold a tenancy in their own name. That is the whole reason
// the signup form asks. Until this release it did nothing with the answer: the
// "GUARDIAN REQUIRED" card was four rows of static text, the button said "Send
// for guardian consent", and it called the same endpoint an adult's signup
// called. Nothing was collected and nobody was sent anything.
//
// So this checks the thing that was missing rather than the thing that showed:
// that the answer survives the round trip and lands in a column a landlord can
// read, and that the server refuses the cases where it would not.
//
// Edge cases, in the order they matter:
//   · a minor with no guardian at all is refused;
//   · a minor with a name but no number is refused — a name you cannot ring is
//     not a consent route;
//   · a minor with a number too short to be one is refused;
//   · a valid minor is stored, with the relationship optional;
//   · an ADULT stores NULL, not empty strings: "no guardian" and "a guardian
//     whose name we failed to capture" must never look the same in the table;
//   · a client that says nothing about age is treated as an adult, so a build
//     that predates this keeps working.
//
//   cd backend && node server.js &
//   E2E_BASE=http://127.0.0.1:5000 node tests/guardian.e2e.js
const path = require('path');

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:5000';

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
    if (c) { pass += 1; console.log(`  ok   ${n}`); }
    else { fail += 1; console.log(`  FAIL ${n}${extra ? '  -> ' + JSON.stringify(extra) : ''}`); }
};
const section = (s) => console.log('\n' + s);

const POST = async (p, body) => {
    const r = await fetch(BASE + p, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch (e) {}
    return { status: r.status, json };
};

// Unique every run: the table has a UNIQUE key on email and the app refuses a
// duplicate mobile, so a fixed address would pass once and 409 ever after.
const tag = () => Date.now().toString().slice(-7) + Math.floor(Math.random() * 90 + 10);
const newTenant = (extra = {}) => {
    const t = tag();
    return {
        name: 'Test Minor ' + t,
        email: `minor${t}@example.com`,
        // 999-block, same as the showcase seed uses, so these cannot collide with
        // a real person's number.
        phone: '999' + t.slice(-7),
        password: 'Test@1234',
        ...extra
    };
};

(async () => {
    console.log('='.repeat(60));
    console.log('A TENANT UNDER 18');
    console.log('='.repeat(60));

    // Read the row back the same way the app's own code would. Required lazily so
    // a failure to reach the database is reported here rather than at import.
    // chdir first so the backend's own relative requires resolve, and load both
    // dotenv and the pool from the BACKEND's node_modules — this file sits in
    // tests/, which has none of its own.
    const backend = path.join(__dirname, '..', 'backend');
    process.chdir(backend);
    require(path.join(backend, 'node_modules', 'dotenv')).config({ quiet: true });
    const db = require(path.join(backend, 'config', 'db'));
    const rowFor = async (email) => {
        const [rows] = await db.query(
            'SELECT guardian_name, guardian_relation, guardian_phone FROM tenant_users WHERE email = ? LIMIT 1',
            [email]
        );
        return rows[0] || null;
    };

    section('A MINOR WITHOUT A GUARDIAN IS REFUSED');
    let r = await POST('/api/tenant-auth/register', newTenant({ adult: false }));
    ok('no guardian at all is a 400', r.status === 400, { s: r.status, j: r.json });
    ok('...and the message names the field', /guardian/i.test((r.json && r.json.message) || ''), r.json);

    r = await POST('/api/tenant-auth/register', newTenant({ adult: false, guardian: { name: 'Asha Menon' } }));
    ok('a name with no number is a 400', r.status === 400, { s: r.status, j: r.json });
    ok('...and says it is the number that is missing',
        /mobile|number/i.test((r.json && r.json.message) || ''), r.json);

    r = await POST('/api/tenant-auth/register', newTenant({
        adult: false, guardian: { name: 'Asha Menon', phone: '99887' }
    }));
    ok('a number too short to be one is a 400', r.status === 400, { s: r.status, j: r.json });

    section('A MINOR WITH A GUARDIAN IS STORED');
    const m = newTenant({
        adult: false,
        guardian: { name: 'Asha Menon', relation: 'Parent', phone: '9876543210' }
    });
    r = await POST('/api/tenant-auth/register', m);
    ok('the account is created', r.status === 201, { s: r.status, j: r.json });
    ok('...and signs the tenant in', !!(r.json && r.json.token), Object.keys(r.json || {}));
    const stored = await rowFor(m.email);
    ok('the guardian name reached the table', stored && stored.guardian_name === 'Asha Menon', stored);
    ok('...the relationship too', stored && stored.guardian_relation === 'Parent', stored);
    ok('...and the number', stored && stored.guardian_phone === '9876543210', stored);

    section('THE RELATIONSHIP IS OPTIONAL, THE REST IS NOT');
    const m2 = newTenant({ adult: false, guardian: { name: 'Vikram Rao', phone: '9876501234' } });
    r = await POST('/api/tenant-auth/register', m2);
    ok('a guardian with no stated relationship is accepted', r.status === 201, { s: r.status, j: r.json });
    const stored2 = await rowFor(m2.email);
    ok('...and the relationship is NULL, not an empty string',
        stored2 && stored2.guardian_relation === null, stored2);

    section('AN ADULT CARRIES NO GUARDIAN AT ALL');
    const a = newTenant({ adult: true, guardian: { name: 'Ignore Me', phone: '9999999999' } });
    r = await POST('/api/tenant-auth/register', a);
    ok('an adult signs up normally', r.status === 201, { s: r.status, j: r.json });
    const storedA = await rowFor(a.email);
    // Sent deliberately and ignored deliberately: "I am over 18" is the claim the
    // row should reflect, whatever else the client attached to it.
    ok('a guardian sent by an adult is NOT stored',
        storedA && storedA.guardian_name === null && storedA.guardian_phone === null, storedA);

    section('A BUILD THAT PREDATES THIS STILL WORKS');
    const old = newTenant();   // no `adult` key at all
    r = await POST('/api/tenant-auth/register', old);
    ok('a signup with no age claim is accepted', r.status === 201, { s: r.status, j: r.json });
    const storedOld = await rowFor(old.email);
    ok('...and is treated as an adult', storedOld && storedOld.guardian_name === null, storedOld);

    console.log('\n' + '='.repeat(60));
    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch((e) => {
    console.error('THREW:', e && e.message);
    process.exit(1);
});
