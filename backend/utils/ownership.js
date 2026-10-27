// File: backend/utils/ownership.js
//
// "Is this row actually yours?" — asked in one place.
//
// ── Why this is a file and not three inline queries ───────────────────────────
// There are three endpoints that take a `unit_id` straight from a request body and
// write it onto a tenant: creating a tenant, assigning an unassigned one, and moving
// one between rooms. TWO of them checked that the room belonged to the caller. The
// third did not, and an end-to-end run found it by filing one landlord's tenant into
// another landlord's room and getting a cheerful "Tenant assigned successfully".
//
// The consequence was not catastrophic — every read is scoped by owner_id, so the
// other landlord never saw the intruder — but it was real: the FIRST landlord's tenant
// list then displayed the other's property name and room number, which is a stranger's
// data arriving by guessing an integer.
//
// What makes it worth a shared file rather than a third copy of the query is that the
// codebase already predicted this. authMiddleware.js says it in as many words about
// requireOwner: "added handler by handler, the next endpoint written would forget it
// and nothing would fail visibly." That is precisely what happened here, one layer
// down. A fourth endpoint that takes a unit_id will be written one day; this is so it
// has something to call.
//
// ── Why these return a boolean and not a response ────────────────────────────
// Callers differ on what refusal means. Creating a tenant with a bad room is a 404
// ("that room is not one of yours"), but a tenant whose room was deleted mid-edit may
// deserve something softer. Keeping the HTTP shape with the caller means this stays
// usable from a place that is not an Express handler — a cron job, a webhook — without
// pretending to have a `res`.
const db = require('../config/db');

// A room belongs to a landlord through its property. There is no owner_id on `units`,
// which is exactly why this join keeps being forgotten: the check is not local to the
// row being written.
const ownsUnit = async (ownerId, unitId) => {
    if (!ownerId || !unitId) return false;
    const [rows] = await db.query(
        `SELECT u.id FROM units u
         JOIN properties p ON u.property_id = p.id
         WHERE u.id = ? AND p.owner_id = ?
         LIMIT 1`,
        [unitId, ownerId]
    );
    return rows.length > 0;
};

const ownsProperty = async (ownerId, propertyId) => {
    if (!ownerId || !propertyId) return false;
    const [rows] = await db.query(
        'SELECT id FROM properties WHERE id = ? AND owner_id = ? LIMIT 1',
        [propertyId, ownerId]
    );
    return rows.length > 0;
};

const ownsTenant = async (ownerId, tenantId) => {
    if (!ownerId || !tenantId) return false;
    const [rows] = await db.query(
        'SELECT id FROM tenants WHERE id = ? AND owner_id = ? LIMIT 1',
        [tenantId, ownerId]
    );
    return rows.length > 0;
};

// The one sentence every caller should use when a room is not theirs.
//
// Deliberately identical whether the room belongs to somebody else or does not exist
// at all. Two different messages would turn this endpoint into a way to find out which
// room ids are real, which is the thing the check exists to prevent.
const NOT_YOUR_ROOM = 'That room is not one of yours.';

module.exports = { ownsUnit, ownsProperty, ownsTenant, NOT_YOUR_ROOM };
