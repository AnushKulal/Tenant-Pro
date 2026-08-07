// File: mobile/src/redesign/mapping.js
// Translates the backend's API payloads into the exact shapes deriveVm() already
// consumes (the shapes data.js seeds). Keeping this in one place means deriveVm —
// ~900 lines ported from the design prototype — does not have to change to know
// where its data came from: it reads state.data, which is either the seed (demo /
// offline) or the mapped live payload.
//
// Fields the design has but the backend does not model are given neutral
// defaults (empty amenities, blank policy/rating…) rather than being faked, so
// the UI simply shows less instead of inventing facts. Notably the backend has
// no owner-side maintenance-requests route and no expenses route, so `tickets`
// and `expenses` come back empty for a live account.
import { mediaUrl } from './api';

const inr = (n) => {
    const s = String(Math.round(Math.abs(Number(n) || 0)));
    if (s.length <= 3) return s;
    return s.slice(0, -3).replace(/\B(?=(\d\d)+$)/g, ',') + ',' + s.slice(-3);
};

const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const asDate = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
};
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayDiff = (a, b) => Math.round((startOfDay(a) - startOfDay(b)) / 86400000);
// Whole months between two dates, floored at 0.
const monthDiff = (from, to) =>
    Math.max(0, (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()));

// A stable, human-looking property code (the design shows "TP-SUN-8412"); the
// backend has no such column, so derive it from the name + id.
const propCode = (p) => {
    const letters = String(p.name || 'PROP').toUpperCase().replace(/[^A-Z]/g, '');
    return `TP-${(letters.slice(0, 3) || 'PRP')}-${String(1000 + (Number(p.id) || 0) * 7).slice(0, 4)}`;
};

export function mapProperty(p) {
    return {
        id: String(p.id),
        name: p.name || 'Property',
        loc: [p.locality, p.city].filter(Boolean).join(', ').toUpperCase(),
        short: p.locality || p.city || p.name || '',
        img: mediaUrl(p.image_url),
        type: `${String(p.property_type || 'PROPERTY').toUpperCase()} · ${Number(p.units) || 0} UNITS`,
        address: [p.address, p.locality, p.city, p.pincode].filter(Boolean).join(', '),
        code: propCode(p),
        // Not modelled by the backend — left neutral so the UI omits them.
        policy: '', policyIcon: 'business-outline',
        rating: '', reviews: '',
        food: '', foodNote: '',
        amenities: [],
        lat: null, lon: null
    };
}

export function mapUnit(u) {
    return {
        id: u.id,
        no: String(u.unit_number),
        prop: String(u.property_id),
        type: String(u.room_type || '').toUpperCase(),
        rent: `₹${inr(u.base_rent)}`,
        cap: Math.max(1, Number(u.capacity) || 1)
    };
}

// `payments` (mapped transactions) lets us count how many times each tenant has
// actually paid, which is what the credit factors are built from.
export function mapTenant(t, payments, now) {
    const rent = Number(t.rent_share) || 0;
    const due = asDate(t.next_rent_due);
    const movedIn = asDate(t.move_in_date) || asDate(t.created_at);
    // next_rent_due in the past (or today) means rent is outstanding — the same
    // rule the backend's tenant portal uses for its `state`.
    const overdue = !!due && dayDiff(now, due) >= 0;
    const daysLate = due ? Math.abs(dayDiff(now, due)) : 0;
    const paidCount = payments.filter((p) => p.tenantId === String(t.id)).length;

    return {
        id: String(t.id),
        name: t.name || 'Tenant',
        img: mediaUrl(t.image_url),
        unit: t.unit_number ? String(t.unit_number) : null,
        type: t.room_type || '',
        rent: `₹${inr(rent)}`,
        rentFull: `₹${inr(rent)}`,
        co: t.company || '',
        state: overdue ? 'overdue' : 'paid',
        days: daysLate,
        credit: Number(t.credit_score) || 0,
        deposit: `₹${inr(t.deposit)}`,
        // Credit inputs derived from real behaviour: payments actually recorded,
        // tenure from move-in, and how late they are right now. The backend has no
        // per-tenant missed-payment counter, so `late` stays 0 rather than guessed.
        onTime: paidCount,
        late: 0,
        since: `${movedIn ? monthDiff(movedIn, now) : 0} mo`,
        phone: t.phone || '',
        email: t.email || '',
        propertyId: t.property_id != null ? String(t.property_id) : null
    };
}

// /owner/transactions rows → the ledger/recent-payment shape. `month` is how many
// calendar months ago the payment landed (0 = this month), which is how deriveVm
// groups the ledger.
export function mapPayment(row, tenantsByName, now) {
    const d = asDate(row.payment_date) || now;
    const t = tenantsByName[String(row.tenant_name || '').toLowerCase()];
    return {
        id: row.id,
        tenantId: t ? String(t.id) : null,
        who: t ? String(t.id) : null,
        name: row.tenant_name || '',
        unit: row.unit_number ? String(row.unit_number) : '',
        prop: row.property_name || '',
        amt: inr(row.amount_paid),
        amount: Number(row.amount_paid) || 0,
        date: `${d.getDate()} ${MON[d.getMonth()]}`,
        method: String(row.payment_method || '').toUpperCase(),
        ref: row.reference_id || '',
        month: monthDiff(d, now)
    };
}

// Build the whole `state.data` bundle from the five owner endpoints.
// `now` is injected so the result is deterministic and testable.
export function mapOwnerData({ dashboard, properties, units, tenants, transactions }, now = new Date()) {
    const props = (properties || []).map(mapProperty);
    const us = (units || []).map(mapUnit);

    // Tenants first without payment counts, to index them by name for the
    // transaction rows (which only carry tenant_name), then re-map with counts.
    const rawTenants = tenants || [];
    const byName = {};
    rawTenants.forEach((t) => { byName[String(t.name || '').toLowerCase()] = t; });
    const pays = (transactions || []).map((r) => mapPayment(r, byName, now));
    const ts = rawTenants.map((t) => mapTenant(t, pays, now));

    // The design's 6-month bar chart: reuse the backend's own aggregation.
    const chart = (dashboard && Array.isArray(dashboard.chart) ? dashboard.chart : [])
        .filter((c) => c && c.month !== 'No Data');
    const stats = (dashboard && dashboard.stats) || {};

    return {
        props,
        units: us,
        tenants: ts,
        payments: pays,
        // No owner-side endpoint exists for either of these yet.
        tickets: [],
        expenses: [],
        // Backend-authoritative figures, preferred by deriveVm when live.
        stats: {
            activeTenants: Number(stats.activeTenants) || 0,
            pendingDues: Number(stats.pendingDues) || 0,
            vacantUnits: Number(stats.vacantUnits) || 0,
            rentCollected: Number(stats.rentCollected) || 0
        },
        chartLabels: chart.map((c) => String(c.month).toUpperCase().slice(0, 3)),
        chartValues: chart.map((c) => Number(c.value) || 0),
        recent: (dashboard && dashboard.recentPayments ? dashboard.recentPayments : []).map((r) => {
            const d = asDate(r.payment_date) || now;
            return {
                name: r.tenant_name || '',
                img: mediaUrl(r.tenant_image),
                unit: r.unit_number ? String(r.unit_number) : '',
                amt: `₹${inr(r.amount_paid)}`,
                method: String(r.payment_method || '').toUpperCase(),
                date: `${d.getDate()} ${MON[d.getMonth()]}`
            };
        })
    };
}

export { inr as inrMag };
