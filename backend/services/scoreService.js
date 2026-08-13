// File: backend/services/scoreService.js
//
// The bridge between the payments table and utils/tenantScore.js.
//
// tenantScore is pure so its boundaries can be tested (paid on the due date, paid one
// day late, paid on the last day of grace). That leaves exactly one job here: fetch the
// evidence and hand it over. Nothing in this file decides anything about a score.
//
// One query for a whole list, not one per tenant. The landlord's people screen asks for
// every tenant they have, and a per-tenant payments query would turn one screen into
// fifty round trips to a database that is not in the same building as the server.

const db = require('../config/db');
const { scoreTenant } = require('../utils/tenantScore');

// Only Confirmed payments are fetched. A Declared one is a tenant's unverified claim
// and a Rejected one is a disputed claim; scoring either would let somebody improve
// their own record by asserting things. `judge` in tenantScore refuses them too — this
// is here so the rows never cross the wire, not as the rule itself.
const CONFIRMED_ONLY = "p.status = 'Confirmed'";

// Attach `.score` to each row of a tenants result set, in place, and return it.
//
// Each row needs `id`, and uses `next_rent_due` and `move_in_date` when present. Rows
// without them still score — they simply lose the overdue and tenure factors, which is
// the honest outcome for a tenant whose dates were never recorded.
const attachScores = async (rows, now = new Date()) => {
    if (!Array.isArray(rows) || rows.length === 0) return rows;

    const ids = rows.map((r) => r.id).filter((id) => id != null);
    if (!ids.length) {
        // Nothing identifiable. Every row still gets a score object, because a caller
        // that has to check for its absence will eventually forget to.
        rows.forEach((r) => { r.score = scoreTenant({}, now); });
        return rows;
    }

    const [pays] = await db.query(
        `SELECT p.tenant_id, p.payment_date, p.due_date, p.status
           FROM payments p
          WHERE p.tenant_id IN (${ids.map(() => '?').join(',')})
            AND ${CONFIRMED_ONLY}
          ORDER BY p.payment_date`,
        ids
    );

    const byTenant = new Map();
    for (const p of pays) {
        const key = String(p.tenant_id);
        if (!byTenant.has(key)) byTenant.set(key, []);
        byTenant.get(key).push(p);
    }

    for (const row of rows) {
        row.score = scoreTenant({
            payments: byTenant.get(String(row.id)) || [],
            nextRentDue: row.next_rent_due || null,
            moveInDate: row.move_in_date || null
        }, now);
    }
    return rows;
};

// One tenant, by id. Used by the tenant portal, where the caller already knows the
// dates but not the payments.
const scoreForTenant = async (tenantId, { nextRentDue = null, moveInDate = null } = {}, now = new Date()) => {
    if (tenantId == null) return scoreTenant({}, now);
    const [pays] = await db.query(
        `SELECT p.payment_date, p.due_date, p.status
           FROM payments p
          WHERE p.tenant_id = ? AND ${CONFIRMED_ONLY}
          ORDER BY p.payment_date`,
        [tenantId]
    );
    return scoreTenant({ payments: pays, nextRentDue, moveInDate }, now);
};

module.exports = { attachScores, scoreForTenant };
