// File: backend/controllers/discoverController.js
//
// "Where could I live?" — the search a tenant runs before they belong anywhere.
//
// ── Why this is allowed to exist at all ──────────────────────────────────────
// tenantPortalRoutes.js says, about resolving an invite code: "Lookup by code only
// — there is no browse-all, which would let any account enumerate every landlord's
// portfolio." That decision stands. Nothing here reads a room because it happens to
// be empty. It reads rooms whose landlord created a `listings` row and switched
// `published` on, which is an explicit act of publication, one room at a time.
//
// The difference matters. A landlord with four rooms who lists one has published
// one room, not their portfolio: the other three are as invisible to this endpoint
// as they were before the feature existed.
//
// ── Why the ranking is here and not in the client ────────────────────────────
// The client could sort an array. It could not score one, because scoring needs the
// whole candidate set — "cheaper than most around here" is meaningless until you
// know what most around here costs. Doing it on the server also means the `why`
// lines the card shows are the same sentences the ranking actually used, rather
// than a second explanation written separately and free to disagree with it.
const db = require('../config/db');

// ── The off switch ───────────────────────────────────────────────────────────
// Set DISCOVER_ENABLED=false in the environment and restart, and this feature
// stops existing: the search answers with an empty, disabled result and the app
// hides the whole section and falls back to the invite-code flow it had before.
//
// It is an environment variable rather than a code change on purpose. Backing a
// feature out should not need a deploy, a rebuild or an over-the-air update —
// each of those takes minutes and can fail, and the moment you most want a
// feature gone is the moment you least want to be shipping something. One
// variable and a restart is a few seconds and cannot go wrong.
//
// Defaults to ON. An unset variable is a server that was never told anything
// about this, which must behave as if the switch is not there.
const discoverEnabled = () => String(process.env.DISCOVER_ENABLED ?? 'true').toLowerCase() !== 'false';

// What the app gets when the switch is off. Shaped exactly like a real empty
// answer, plus `disabled`, so a client that has never heard of the flag renders
// "nothing listed" rather than breaking.
const OFF = {
    results: [],
    total: 0,
    disabled: true,
    facets: { types: [], areas: [], cities: [], rent_min: 0, rent_max: 0, published: 0 }
};

// Everything a card needs, in one read. Vacancy is counted in the query rather
// than filtered afterwards because a full room must never reach the client at all:
// a listing you cannot act on is worse than no listing.
const BASE_SQL = `
    SELECT
        l.id              AS listing_id,
        l.headline, l.description, l.available_from, l.deposit_months,
        l.preferred, l.furnishing, l.amenities, l.created_at AS listed_at,
        u.id              AS unit_id,
        u.unit_number, u.room_type, u.capacity, u.base_rent,
        u.rent_split_type, u.image_url AS unit_image, u.status AS unit_status,
        p.id              AS property_id,
        p.name            AS property_name,
        p.property_type, p.locality, p.city, p.image_url AS property_image,
        p.latitude, p.longitude,
        o.id              AS owner_id,
        o.name            AS owner_name,
        (SELECT COUNT(*) FROM tenants t
          WHERE t.unit_id = u.id AND t.status = 'Active') AS taken
    FROM listings l
    JOIN units u       ON u.id = l.unit_id
    JOIN properties p  ON p.id = u.property_id
    JOIN owners o      ON o.id = l.owner_id
    WHERE l.published = 1
      AND u.status <> 'Maintenance'
`;

// Great-circle distance in kilometres.
//
// Computed in JavaScript rather than SQL because the radius filter has to run
// BEFORE any limit — filtering after a LIMIT returns "the nearest of an arbitrary
// twenty", which looks like a working filter and is not one. The published set is
// small enough that reading it whole and measuring here costs nothing.
const distanceKm = (aLat, aLng, bLat, bLng) => {
    if ([aLat, aLng, bLat, bLng].some((v) => v === null || v === undefined || Number.isNaN(v))) return null;
    const R = 6371;
    const rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(bLat - aLat);
    const dLng = rad(bLng - aLng);
    const s =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
};

const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

// What one occupant of this room actually pays. A room let to three people on an
// equal split is not a room that costs the whole rent, and showing the whole rent
// would price it out of every budget filter it genuinely fits.
const perHead = (baseRent, capacity, splitType) => {
    const rent = Number(baseRent) || 0;
    const cap = Math.max(1, Number(capacity) || 1);
    return splitType === 'Equal' && cap > 1 ? Math.round(rent / cap) : Math.round(rent);
};

const AMENITY_LABELS = {
    wifi: 'Wi-Fi', ac: 'Air conditioning', food: 'Meals included', laundry: 'Laundry',
    parking: 'Parking', power: 'Power backup', lift: 'Lift', gym: 'Gym',
    housekeeping: 'Housekeeping', water: 'Water included', security: '24×7 security',
    furnished: 'Furnished', balcony: 'Balcony', kitchen: 'Kitchen'
};

const parseAmenities = (csv) =>
    String(csv || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
        .map((slug) => ({ slug, label: AMENITY_LABELS[slug] || slug }));

// GET /api/tenant-portal/discover
//
// Query: q, type, min, max, rooms, area, lat, lng, within, furnishing, sort.
// Every one of them is optional; with none of them this is "suggested for you".
const discover = async (req, res) => {
    if (!discoverEnabled()) return res.json(OFF);
    try {
        const q = String(req.query.q || '').trim().toLowerCase();
        const type = String(req.query.type || '').trim();
        const area = String(req.query.area || '').trim().toLowerCase();
        const furnishing = String(req.query.furnishing || '').trim();
        const sort = String(req.query.sort || 'suggested').trim();
        const min = num(req.query.min);
        const max = num(req.query.max);
        const rooms = num(req.query.rooms);       // capacity: 1 = private, 2 = twin, 3+ = sharing
        const lat = num(req.query.lat);
        const lng = num(req.query.lng);
        const within = num(req.query.within);     // kilometres

        const [rows] = await db.query(BASE_SQL);

        // The candidate set, with the derived fields the filters and the ranking
        // both read. Built once so a listing cannot be scored on one rent and
        // filtered on another.
        let items = rows.map((r) => {
            const capacity = Math.max(1, Number(r.capacity) || 1);
            const taken = Number(r.taken) || 0;
            const rent = perHead(r.base_rent, capacity, r.rent_split_type);
            const km = distanceKm(lat, lng, num(r.latitude), num(r.longitude));
            return {
                listing_id: r.listing_id,
                unit_id: r.unit_id,
                property_id: r.property_id,
                owner_id: r.owner_id,
                owner_name: r.owner_name,
                property: r.property_name,
                type: r.property_type,
                locality: r.locality || '',
                city: r.city || '',
                room: r.unit_number,
                room_type: r.room_type || 'Standard',
                capacity,
                taken,
                spots_left: Math.max(0, capacity - taken),
                rent,
                base_rent: Number(r.base_rent) || 0,
                shared: r.rent_split_type === 'Equal' && capacity > 1,
                deposit: Math.round(rent * (Number(r.deposit_months) || 1)),
                deposit_months: Number(r.deposit_months) || 1,
                furnishing: r.furnishing,
                preferred: r.preferred,
                amenities: parseAmenities(r.amenities),
                headline: r.headline || '',
                description: r.description || '',
                available_from: r.available_from,
                image: r.unit_image || r.property_image || null,
                lat: num(r.latitude),
                lng: num(r.longitude),
                distance_km: km === null ? null : Math.round(km * 10) / 10,
                listed_at: r.listed_at
            };
        });

        // A room with nobody's space left in it is not a result. This is the one
        // filter that is not optional.
        items = items.filter((it) => it.spots_left > 0);

        const matchesText = (it) =>
            !q ||
            [it.property, it.locality, it.city, it.room, it.room_type, it.headline, it.description, it.type]
                .join(' ')
                .toLowerCase()
                .includes(q);

        items = items.filter((it) => {
            if (!matchesText(it)) return false;
            if (type && it.type !== type) return false;
            if (furnishing && it.furnishing !== furnishing) return false;
            if (area && !`${it.locality} ${it.city}`.toLowerCase().includes(area)) return false;
            if (min !== null && it.rent < min) return false;
            if (max !== null && it.rent > max) return false;
            // 3 means "three or more", because nobody filtering for sharing means
            // exactly three.
            if (rooms !== null) {
                if (rooms >= 3 ? it.capacity < 3 : it.capacity !== rooms) return false;
            }
            if (within !== null && lat !== null && lng !== null) {
                if (it.distance_km === null || it.distance_km > within) return false;
            }
            return true;
        });

        // ── Ranking ──────────────────────────────────────────────────────────
        // "Suggested" has to mean something, so each listing earns points and is
        // told why. The `why` lines are generated from the same comparisons that
        // produced the score: a card can never claim a reason the ranking did not
        // actually use.
        const rents = items.map((i) => i.rent).sort((a, b) => a - b);
        const median = rents.length ? rents[Math.floor(rents.length / 2)] : 0;
        const today = new Date();

        items.forEach((it) => {
            let score = 0;
            const why = [];

            if (max !== null && it.rent <= max) {
                score += 30;
                const under = max - it.rent;
                if (under >= 1000) why.push(`₹${under.toLocaleString('en-IN')} under your budget`);
                else why.push('Within your budget');
            } else if (median && it.rent < median * 0.9) {
                score += 18;
                why.push('Cheaper than most around here');
            }

            if (it.distance_km !== null) {
                // Nearness is worth a lot and falls away quickly: 1 km and 2 km are
                // different answers, 18 km and 19 km are the same answer.
                score += Math.max(0, 34 - it.distance_km * 4);
                if (it.distance_km <= 1) why.push('Walking distance');
                else if (it.distance_km <= 5) why.push(`${it.distance_km} km away`);
            }

            const from = it.available_from ? new Date(it.available_from) : null;
            if (!from || from <= today) {
                score += 16;
                why.push('Available now');
            } else {
                const days = Math.ceil((from - today) / 86400000);
                score += Math.max(0, 16 - days / 4);
                if (days <= 30) why.push(`Free in ${days} day${days === 1 ? '' : 's'}`);
            }

            if (it.spots_left === 1 && it.capacity > 1) why.push('Last spot');
            if (it.amenities.length >= 4) score += 6;
            if (it.furnishing === 'Fully furnished') score += 4;

            // A listing posted this week beats an identical one posted in March.
            const ageDays = (today - new Date(it.listed_at)) / 86400000;
            score += Math.max(0, 8 - ageDays / 7);

            it.score = Math.round(score);
            it.why = why.slice(0, 3);
        });

        const sorters = {
            suggested: (a, b) => b.score - a.score,
            cheapest: (a, b) => a.rent - b.rent,
            nearest: (a, b) =>
                (a.distance_km === null ? Infinity : a.distance_km) -
                (b.distance_km === null ? Infinity : b.distance_km),
            newest: (a, b) => new Date(b.listed_at) - new Date(a.listed_at)
        };
        items.sort(sorters[sort] || sorters.suggested);

        // Facets come from the published set rather than from the filtered one, so
        // the filter sheet can offer a locality that the current filters happen to
        // exclude. Offering only what is already showing makes a filter sheet that
        // can never widen a search.
        const all = rows.map((r) => ({
            type: r.property_type,
            locality: r.locality || '',
            city: r.city || '',
            rent: perHead(r.base_rent, r.capacity, r.rent_split_type)
        }));
        const allRents = all.map((a) => a.rent).filter((n) => n > 0);

        res.json({
            results: items.slice(0, 60),
            total: items.length,
            facets: {
                types: [...new Set(all.map((a) => a.type).filter(Boolean))].sort(),
                areas: [...new Set(all.map((a) => a.locality).filter(Boolean))].sort(),
                cities: [...new Set(all.map((a) => a.city).filter(Boolean))].sort(),
                rent_min: allRents.length ? Math.min(...allRents) : 0,
                rent_max: allRents.length ? Math.max(...allRents) : 0,
                published: rows.length
            }
        });
    } catch (error) {
        console.error('Discover failed:', error.message);
        res.status(500).json({ message: 'Could not load places right now.' });
    }
};

// GET /api/tenant-portal/discover/:id — one listing, in full.
//
// Separate from the list because the list is deliberately lean and this is where a
// tenant decides. It returns the landlord's name and the property's other published
// rooms, which is the question anybody asks next: "is there a cheaper one here?"
const discoverOne = async (req, res) => {
    if (!discoverEnabled()) return res.status(404).json({ message: 'That place is no longer listed.' });
    try {
        const id = Number(req.params.id);
        if (!id) return res.status(400).json({ message: 'Which listing?' });

        const [rows] = await db.query(`${BASE_SQL} AND l.id = ? LIMIT 1`, [id]);
        if (!rows.length) {
            // Covers both "never existed" and "the landlord unpublished it while you
            // were looking at the list", which to a tenant are the same event.
            return res.status(404).json({ message: 'That place is no longer listed.' });
        }
        const r = rows[0];
        const capacity = Math.max(1, Number(r.capacity) || 1);
        const rent = perHead(r.base_rent, capacity, r.rent_split_type);

        const [siblings] = await db.query(
            `${BASE_SQL} AND p.id = ? AND l.id <> ? LIMIT 6`,
            [r.property_id, id]
        );

        res.json({
            listing: {
                listing_id: r.listing_id,
                unit_id: r.unit_id,
                property_id: r.property_id,
                property: r.property_name,
                type: r.property_type,
                locality: r.locality || '',
                city: r.city || '',
                room: r.unit_number,
                room_type: r.room_type || 'Standard',
                capacity,
                spots_left: Math.max(0, capacity - (Number(r.taken) || 0)),
                rent,
                shared: r.rent_split_type === 'Equal' && capacity > 1,
                deposit: Math.round(rent * (Number(r.deposit_months) || 1)),
                deposit_months: Number(r.deposit_months) || 1,
                furnishing: r.furnishing,
                preferred: r.preferred,
                amenities: parseAmenities(r.amenities),
                headline: r.headline || '',
                description: r.description || '',
                available_from: r.available_from,
                image: r.unit_image || r.property_image || null,
                lat: num(r.latitude),
                lng: num(r.longitude),
                owner_name: r.owner_name
            },
            also: siblings.map((s) => ({
                listing_id: s.listing_id,
                room: s.unit_number,
                rent: perHead(s.base_rent, s.capacity, s.rent_split_type),
                spots_left: Math.max(0, (Number(s.capacity) || 1) - (Number(s.taken) || 0))
            })).filter((s) => s.spots_left > 0)
        });
    } catch (error) {
        console.error('Discover detail failed:', error.message);
        res.status(500).json({ message: 'Could not load that place.' });
    }
};

module.exports = { discover, discoverOne, discoverEnabled, perHead, distanceKm, parseAmenities, AMENITY_LABELS };
