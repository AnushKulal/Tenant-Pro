// The rooms the Find screen has to show on day one.
//
// Discovery is opt-in per room, which is right for privacy and useless for a
// launch: on the morning the feature goes live not one landlord has published
// anything, so the screen that is supposed to be the main thing a new tenant sees
// is an empty list with a search box over it. That reads as broken, and the first
// person to open it concludes the feature does not work.
//
// So this file puts a believable set of listed rooms in the database: eight
// properties across eight Bengaluru localities, in four property types and a wide
// spread of rents, every one of them a real row that the real endpoints read. There
// is nothing special-cased in the app — take these rows away and the screen is
// empty again, which is exactly what it should be.
//
// WHAT THIS IS NOT
//
// These landlords cannot be signed into. Their `password_hash` is a bcrypt hash of
// a random string that is thrown away in the line that makes it, so there is no
// password to leak and no account to take over. They exist to own rooms, nothing
// else. A tenant CAN ask to join one of these rooms — the request is written, and
// nobody will ever accept it, because nobody can sign in to accept it. That is the
// one place the seam shows, and it is the right trade: the alternative is six more
// real logins with published passwords on a live server.
//
// To demonstrate the whole loop — a tenant asks, a landlord accepts — use the DEMO
// landlord's listing instead (see `ensureDemoListing` at the bottom): that account
// can be signed into, and the request lands in its bell.
//
// SAFETY
//
// Everything here is create-if-missing and keyed on an email, a property name or a
// room number this file owns. It never reads, updates or deletes a row it did not
// make, so it cannot touch a real landlord's property, a real tenant or anybody's
// money. It runs on every boot and the second run is a no-op.
//
// THE SWITCH
//
// SHOWCASE_LISTINGS=false turns it off. Rows already written stay — removing them
// is a deliberate act, not something a restart should do — but nothing new is
// created. Set DISCOVER_ENABLED=false instead to take the whole feature off the
// screen; this switch only governs whether the sample rooms get topped up.
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('./db');

const showcaseEnabled = () => String(process.env.SHOWCASE_LISTINGS ?? 'true').toLowerCase() !== 'false';

// A dot-less, reserved-TLD domain, so none of these addresses can ever be a real
// mailbox and nothing we send can reach a stranger. `.invalid` is reserved by
// RFC 2606 for exactly this.
const DOMAIN = 'showcase.invalid';

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const inDays = (n) => ymd(new Date(Date.now() + n * 86400000));

// Locality centres, with the same coordinates the development seed uses so a
// distance filter behaves the same way here as it does in testing. The per-property
// offset is fixed rather than random: two boots must not move a building.
const AREAS = {
    Indiranagar: [12.9784, 77.6408],
    Koramangala: [12.9352, 77.6245],
    Whitefield: [12.9698, 77.7500],
    'HSR Layout': [12.9121, 77.6446],
    Jayanagar: [12.9250, 77.5938],
    Malleshwaram: [13.0035, 77.5647],
    'BTM Layout': [12.9166, 77.6101],
    Marathahalli: [12.9591, 77.6974]
};

// A pin a few hundred metres off the locality centre, derived from the property
// name so it is stable across boots and deploys.
const pinFor = (locality, name) => {
    const base = AREAS[locality] || AREAS.Indiranagar;
    const h = crypto.createHash('md5').update(name).digest();
    return [
        (base[0] + ((h[0] / 255) - 0.5) * 0.016).toFixed(7),
        (base[1] + ((h[1] / 255) - 0.5) * 0.016).toFixed(7)
    ];
};

// --- The landlords -----------------------------------------------------------
// [key, name, phone]
//
// Phone numbers are in the 999000xxxx block. `owners.phone` is UNIQUE, and these
// have to be numbers no real person can hold, or the day a genuine landlord signs
// up with one their registration fails for a reason nobody could guess.
// The portrait is a stock photo of nobody in particular, from the same source the
// demo account uses, so a listing card has a face on it rather than a grey circle.
const OWNERS = [
    ['anita', 'Anita Desai', '9990001001', 'https://randomuser.me/api/portraits/women/26.jpg'],
    ['farhan', 'Farhan Qureshi', '9990001002', 'https://randomuser.me/api/portraits/men/55.jpg'],
    ['lakshmi', 'Lakshmi Iyer', '9990001003', 'https://randomuser.me/api/portraits/women/71.jpg'],
    ['joseph', 'Joseph Mathew', '9990001004', 'https://randomuser.me/api/portraits/men/19.jpg'],
    ['devika', 'Devika Shetty', '9990001005', 'https://randomuser.me/api/portraits/women/83.jpg'],
    ['harish', 'Harish Pai', '9990001006', 'https://randomuser.me/api/portraits/men/41.jpg']
];

// --- The properties ----------------------------------------------------------
// [key, owner key, name, type, locality, address, pincode]
const PROPERTIES = [
    ['sh-lotus', 'anita', 'Lotus Residency', 'PG', 'Koramangala', '18, 7th Block, Koramangala', '560095'],
    ['sh-silveroak', 'anita', 'Silver Oak Enclave', 'Apartment', 'HSR Layout', '7, 14th Main, HSR Layout', '560102'],
    ['sh-palm', 'farhan', 'Palm Courtyard', 'PG', 'Indiranagar', '22, 12th Main, Indiranagar', '560038'],
    ['sh-orchid', 'lakshmi', 'Orchid Heights', 'Apartment', 'Whitefield', '4, Varthur Road, Whitefield', '560066'],
    ['sh-banyan', 'lakshmi', 'Banyan House', 'Independent House', 'Jayanagar', '31, 9th Block, Jayanagar', '560069'],
    ['sh-maple', 'joseph', 'Maple Nest Hostel', 'Hostel', 'BTM Layout', '56, 2nd Stage, BTM Layout', '560076'],
    ['sh-jasmine', 'devika', 'Jasmine Homes', 'PG', 'Marathahalli', '9, Outer Ring Road, Marathahalli', '560037'],
    ['sh-cedar', 'harish', 'Cedar Mansion', 'Apartment', 'Malleshwaram', '3, 8th Cross, Malleshwaram', '560003']
];

// --- The rooms, and what each listing says -----------------------------------
// [property key, room number, room type, capacity, rent, furnishing, deposit months,
//  preferred, amenities, available in N days (null = now), headline]
//
// Rent is the WHOLE room; a shared room is split across its occupants before it is
// shown, which is why a ₹18,000 twin reads as ₹9,000 on the card. The spread is
// deliberate: ₹6,500 to ₹34,000, so a budget filter anywhere in the range has both
// something to include and something to exclude.
const ROOMS = [
    ['sh-lotus', 'L-1', 'Standard Sharing', 2, 18000, 'Semi-furnished', 1, 'Working professionals',
        'wifi,food,laundry,housekeeping,power', null, 'Twin sharing with meals, five minutes from Forum'],
    ['sh-lotus', 'L-2', 'Deluxe Single', 1, 15500, 'Fully furnished', 2, 'Working professionals',
        'wifi,ac,food,laundry,housekeeping,power', null, 'Furnished single room, air-conditioned'],
    ['sh-lotus', 'L-3', 'Triple Sharing', 3, 21000, 'Semi-furnished', 1, 'Students',
        'wifi,food,laundry,water', 7, 'Budget triple sharing, meals included'],

    ['sh-silveroak', 'S-201', '2 BHK', 1, 32000, 'Semi-furnished', 2, 'Families',
        'parking,lift,power,security,balcony,kitchen', null, 'Quiet two-bedroom with covered parking'],
    ['sh-silveroak', 'S-104', '1 BHK', 1, 21000, 'Unfurnished', 2, 'Anyone',
        'parking,lift,power,security,kitchen', 21, 'One-bedroom on a low floor, lift and backup'],

    ['sh-palm', 'P-A', 'Standard Sharing', 2, 20000, 'Fully furnished', 1, 'Working professionals',
        'wifi,ac,food,laundry,housekeeping,gym', null, 'Twin sharing on 12th Main, gym in the building'],
    ['sh-palm', 'P-B', 'Deluxe Single', 1, 17500, 'Fully furnished', 1, 'Working professionals',
        'wifi,ac,food,laundry,housekeeping,gym,balcony', null, 'Single with a balcony, walk to the metro'],

    ['sh-orchid', 'O-402', '2 BHK', 1, 26000, 'Semi-furnished', 2, 'Families',
        'parking,lift,power,security,water,kitchen', null, 'Two-bedroom near the tech parks'],
    ['sh-orchid', 'O-115', '1 BHK', 1, 17000, 'Semi-furnished', 1, 'Working professionals',
        'parking,lift,power,water,kitchen', 14, 'One-bedroom, short hop to ITPL'],

    ['sh-banyan', 'B-G', 'Studio', 1, 14000, 'Semi-furnished', 1, 'Anyone',
        'parking,water,kitchen,balcony', null, 'Ground-floor studio with a private entrance'],
    ['sh-banyan', 'B-1', '1 BHK', 1, 19000, 'Unfurnished', 2, 'Families',
        'parking,water,kitchen,balcony', 30, 'Upstairs one-bedroom in a quiet lane'],

    ['sh-maple', 'M-11', 'Triple Sharing', 3, 19500, 'Semi-furnished', 1, 'Students',
        'wifi,food,laundry,water,security', null, 'Student hostel, three to a room, mess included'],
    ['sh-maple', 'M-12', 'Standard Sharing', 2, 15000, 'Semi-furnished', 1, 'Students',
        'wifi,food,laundry,water,security', null, 'Twin sharing for students, walk to BTM bus stand'],
    ['sh-maple', 'M-21', 'Four Sharing', 4, 26000, 'Unfurnished', 1, 'Students',
        'wifi,food,water,security', 10, 'Cheapest bed on this list, four to a room'],

    ['sh-jasmine', 'J-1', 'Standard Sharing', 2, 16000, 'Semi-furnished', 1, 'Working professionals',
        'wifi,food,laundry,power,parking', null, 'Twin sharing on the Ring Road'],
    ['sh-jasmine', 'J-2', 'Deluxe Single', 1, 13500, 'Semi-furnished', 1, 'Anyone',
        'wifi,food,laundry,power,parking', null, 'Single room, meals and laundry included'],

    ['sh-cedar', 'C-301', '2 BHK', 1, 34000, 'Fully furnished', 2, 'Families',
        'parking,lift,power,security,ac,balcony,kitchen,housekeeping', null,
        'Fully furnished two-bedroom in old Malleshwaram'],
    ['sh-cedar', 'C-102', '1 BHK', 1, 22500, 'Fully furnished', 1, 'Working professionals',
        'parking,lift,power,security,ac,kitchen', 5, 'Furnished one-bedroom, move in next week']
];

const img = (slug) => `https://picsum.photos/seed/tp-${slug}/800/600`;

// An account nobody can sign into. The password is random, used once to make the
// hash, and gone when this function returns — there is no copy of it anywhere, so
// there is nothing to publish, leak or guess. The column is NOT NULL on a fresh
// database, which is why this is a throwaway hash rather than simply null.
const unusableHash = async () => bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);

const ensureOwners = async () => {
    const ids = {};
    for (const [key, name, phone, portrait] of OWNERS) {
        const email = `${key}@${DOMAIN}`;
        const [rows] = await db.query('SELECT id FROM owners WHERE email = ? LIMIT 1', [email]);
        if (rows.length) {
            ids[key] = rows[0].id;
            continue;
        }
        try {
            const [res] = await db.query(
                'INSERT INTO owners (name, email, phone, password_hash, profile_pic) VALUES (?, ?, ?, ?, ?)',
                [name, email, phone, await unusableHash(), portrait]
            );
            ids[key] = res.insertId;
        } catch (error) {
            // `owners.phone` is UNIQUE. If a real landlord ever holds one of these
            // numbers, this insert fails — and the one thing that must NOT happen
            // then is adopting their account and hanging sample rooms off it. Skip
            // this showcase landlord; the other seven properties still appear.
            console.warn(`   sample landlord "${name}" skipped: ${error.message}`);
        }
    }
    return ids;
};

const ensureProperties = async (ownerIds) => {
    const ids = {};
    for (const [key, ownerKey, name, type, locality, address, pincode] of PROPERTIES) {
        const ownerId = ownerIds[ownerKey];
        if (!ownerId) continue;   // its landlord was skipped above
        const [lat, lng] = pinFor(locality, key);
        const [rows] = await db.query(
            'SELECT id FROM properties WHERE owner_id = ? AND name = ? LIMIT 1', [ownerId, name]
        );
        if (rows.length) {
            ids[key] = rows[0].id;
            continue;
        }
        const [res] = await db.query(
            `INSERT INTO properties
                (owner_id, name, property_type, address, locality, city, pincode, latitude, longitude, image_url)
             VALUES (?, ?, ?, ?, ?, 'Bengaluru', ?, ?, ?, ?)`,
            [ownerId, name, type, address, locality, pincode, lat, lng, img(key)]
        );
        ids[key] = res.insertId;
    }
    return ids;
};

// Rooms and their listings in one pass, because a showcase room with no listing is
// invisible and a listing with no room cannot exist. Both are create-if-missing: a
// landlord-side edit made during a demo survives the next restart.
const ensureRoomsAndListings = async (propIds, ownerIds) => {
    let published = 0;
    for (const [propKey, roomNo, roomType, cap, rent, furnishing, depositMonths,
        preferred, amenities, availableInDays, headline] of ROOMS) {
        const propertyId = propIds[propKey];
        if (!propertyId) continue;
        const ownerKey = (PROPERTIES.find(([k]) => k === propKey) || [])[1];
        const ownerId = ownerIds[ownerKey];
        if (!ownerId) continue;

        const [rows] = await db.query(
            'SELECT id FROM units WHERE property_id = ? AND unit_number = ? LIMIT 1', [propertyId, roomNo]
        );
        let unitId = rows.length ? rows[0].id : null;
        if (!unitId) {
            const [res] = await db.query(
                `INSERT INTO units (property_id, unit_number, room_type, capacity, rent_split_type, base_rent, status, image_url)
                 VALUES (?, ?, ?, ?, 'Equal', ?, 'Vacant', ?)`,
                [propertyId, roomNo, roomType, cap, rent, img(`${propKey}-${roomNo}`)]
            );
            unitId = res.insertId;
        }

        const [has] = await db.query('SELECT id, published FROM listings WHERE unit_id = ? LIMIT 1', [unitId]);
        if (has.length) {
            if (has[0].published) published += 1;
            continue;
        }
        await db.query(
            `INSERT INTO listings
                (unit_id, owner_id, published, headline, description, available_from,
                 deposit_months, preferred, furnishing, amenities)
             VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
            [
                unitId, ownerId, headline,
                `${roomType} at ${(PROPERTIES.find(([k]) => k === propKey) || [])[2]}. `
                + `Ask the landlord for a visit through the app — your contact details stay private until you do.`,
                availableInDays === null ? null : inDays(availableInDays),
                depositMonths, preferred, furnishing, amenities
            ]
        );
        published += 1;
    }
    return published;
};

// The demo landlord's own vacant flat, listed.
//
// Separate from everything above because this one is reachable from both sides: the
// demo account can be signed into, so a request made against this room can actually
// be accepted, and the whole flow — tenant finds a room, asks, landlord accepts,
// tenant appears in the portal — can be shown end to end.
//
// Only a room with space in it is listed, and only if it is not listed already, so
// a landlord who unpublishes it during a demo does not find it back on the next
// restart.
const ensureDemoListing = async () => {
    const [rows] = await db.query(
        `SELECT u.id, u.property_id, p.owner_id
           FROM units u
           JOIN properties p ON p.id = u.property_id
           JOIN owners o     ON o.id = p.owner_id
          WHERE o.email = 'demo@gmail.com' AND u.status = 'Vacant'
          ORDER BY u.id LIMIT 1`
    );
    if (!rows.length) return 0;
    const u = rows[0];
    const [has] = await db.query('SELECT id FROM listings WHERE unit_id = ? LIMIT 1', [u.id]);
    if (has.length) return 0;
    await db.query(
        `INSERT INTO listings
            (unit_id, owner_id, published, headline, description, available_from,
             deposit_months, preferred, furnishing, amenities)
         VALUES (?, ?, 1, ?, ?, NULL, 2, 'Anyone', 'Semi-furnished', ?)`,
        [u.id, u.owner_id,
            'Spacious two-bedroom, available now',
            'Listed by the demo landlord. Ask to join from here and the request lands in the demo '
            + 'landlord\'s notifications, where it can be accepted — the whole flow, both sides.',
            'parking,lift,power,water,kitchen,balcony']
    );
    return 1;
};

// Runs at boot, after initDb has made sure the `listings` table exists.
const ensureShowcaseListings = async () => {
    if (!showcaseEnabled()) {
        console.log('🏠 Sample listings: skipped (SHOWCASE_LISTINGS=false)');
        return;
    }
    try {
        const ownerIds = await ensureOwners();
        const propIds = await ensureProperties(ownerIds);
        const n = await ensureRoomsAndListings(propIds, ownerIds);
        const d = await ensureDemoListing();
        console.log(`🏠 Sample listings ready: ${n + d} rooms listed across ${PROPERTIES.length + (d ? 1 : 0)} properties`);
    } catch (error) {
        // A failure here must never stop the server. Discovery with no rooms in it
        // is a thin screen; a server that will not boot is an outage.
        console.error('⚠️  Sample listings could not be prepared:', error.message);
    }
};

module.exports = { ensureShowcaseListings, showcaseEnabled, DOMAIN };
