// File: backend/controllers/listingController.js
//
// The landlord's half of discovery: putting a room in front of people looking, and
// taking it back down again.
//
// Discovery is opt-in per room (see the comment on the `listings` table). This is
// the only place that opt-in can be given, which is why both endpoints check the
// room belongs to the caller before they do anything. That check lives in
// utils/ownership.js rather than being written out here, for the reason recorded
// there: when it was written out at each site, one of three endpoints was missed.
const db = require('../config/db');
const { ownsUnit, NOT_YOUR_ROOM } = require('../utils/ownership');

const PREFERRED = ['Anyone', 'Students', 'Working professionals', 'Families'];
const FURNISHING = ['Unfurnished', 'Semi-furnished', 'Fully furnished'];

const clean = (v, max) => String(v === undefined || v === null ? '' : v).trim().slice(0, max);

// GET /api/units/:id/listing — what this room's listing says today.
//
// Answers for a room that has never been listed too, with published:false and the
// defaults the form should start from. A landlord opening the sheet on an unlisted
// room should see a form, not an error.
const getListing = async (req, res) => {
    try {
        const unitId = Number(req.params.id);
        if (!(await ownsUnit(req.user.id, unitId))) {
            return res.status(404).json({ message: NOT_YOUR_ROOM });
        }
        const [rows] = await db.query('SELECT * FROM listings WHERE unit_id = ? LIMIT 1', [unitId]);
        const l = rows[0];
        res.json({
            listing: {
                exists: !!l,
                published: !!(l && l.published),
                headline: (l && l.headline) || '',
                description: (l && l.description) || '',
                available_from: (l && l.available_from) || null,
                deposit_months: l ? Number(l.deposit_months) : 1,
                preferred: (l && l.preferred) || 'Anyone',
                furnishing: (l && l.furnishing) || 'Semi-furnished',
                amenities: String((l && l.amenities) || '').split(',').map((s) => s.trim()).filter(Boolean)
            }
        });
    } catch (error) {
        console.error('Read listing failed:', error.message);
        res.status(500).json({ message: 'Could not read that listing.' });
    }
};

// PUT /api/units/:id/listing — publish, update or unpublish.
//
// One endpoint rather than three, because to a landlord this is one switch and some
// text next to it. `published` is read as a boolean from whatever the client sent:
// a sheet that sends "false" as a string must not publish somebody's address.
const saveListing = async (req, res) => {
    try {
        const unitId = Number(req.params.id);
        if (!(await ownsUnit(req.user.id, unitId))) {
            return res.status(404).json({ message: NOT_YOUR_ROOM });
        }

        const b = req.body || {};
        const published = b.published === true || b.published === 'true' || b.published === 1 || b.published === '1';

        const preferred = PREFERRED.includes(b.preferred) ? b.preferred : 'Anyone';
        const furnishing = FURNISHING.includes(b.furnishing) ? b.furnishing : 'Semi-furnished';

        let depositMonths = Number(b.deposit_months);
        if (!Number.isFinite(depositMonths) || depositMonths < 0) depositMonths = 1;
        depositMonths = Math.min(12, depositMonths);

        // An empty string is a real answer here and means "available now", so it has
        // to become NULL rather than a zero date MySQL would reject.
        const availableFrom = /^\d{4}-\d{2}-\d{2}$/.test(String(b.available_from || '')) ? b.available_from : null;

        const amenities = Array.isArray(b.amenities)
            ? b.amenities.map((s) => clean(s, 30).toLowerCase()).filter(Boolean).slice(0, 20).join(',')
            : clean(b.amenities, 400).toLowerCase();

        await db.query(
            `INSERT INTO listings
                (unit_id, owner_id, published, headline, description, available_from,
                 deposit_months, preferred, furnishing, amenities)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                published = VALUES(published),
                headline = VALUES(headline),
                description = VALUES(description),
                available_from = VALUES(available_from),
                deposit_months = VALUES(deposit_months),
                preferred = VALUES(preferred),
                furnishing = VALUES(furnishing),
                amenities = VALUES(amenities)`,
            [
                unitId, req.user.id, published ? 1 : 0,
                clean(b.headline, 150) || null,
                clean(b.description, 2000) || null,
                availableFrom, depositMonths, preferred, furnishing, amenities || null
            ]
        );

        res.json({
            message: published ? 'This room is now listed.' : 'This room is no longer listed.',
            published
        });
    } catch (error) {
        console.error('Save listing failed:', error.message);
        res.status(500).json({ message: 'Could not save that listing.' });
    }
};

module.exports = { getListing, saveListing, PREFERRED, FURNISHING };
