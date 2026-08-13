// File: mobile/src/redesign/mapping.js
// Translates the backend's API payloads into the exact shapes deriveVm() already
// consumes (the shapes data.js seeds). Keeping this in one place means deriveVm —
// ~900 lines ported from the design prototype — does not have to change to know
// where its data came from: it reads state.data, which is either the seed (demo /
// offline) or the mapped live payload.
//
// Fields the design has but the backend does not model are given neutral
// defaults (empty amenities, blank policy/rating…) rather than being faked, so
// the UI simply shows less instead of inventing facts. The backend still has no
// expenses route, so `expenses` comes back empty for a live account.
import { mediaUrl } from './api';

const inr = (n) => {
    const s = String(Math.round(Math.abs(Number(n) || 0)));
    if (s.length <= 3) return s;
    return s.slice(0, -3).replace(/\B(?=(\d\d)+$)/g, ',') + ',' + s.slice(-3);
};

const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MON_TITLE = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
        // The raw columns as stored, for the edit form. `address` above is a joined
        // display string; putting that back into the address field would write the
        // locality, city and pincode into it as well.
        propType: p.property_type || 'PG',
        addressRaw: p.address || '',
        localityRaw: p.locality || '',
        cityRaw: p.city || '',
        pincodeRaw: p.pincode != null ? String(p.pincode) : '',
        // Not modelled by the backend — left neutral so the UI omits them.
        policy: '', policyIcon: 'business-outline',
        rating: '', reviews: '',
        food: '', foodNote: '',
        amenities: [],
        // Where the landlord pinned it. Null until they do — every property added
        // before the map existed has no pin, and an address is not a coordinate, so
        // there is nothing to fall back to. The UI shows "not pinned" rather than a
        // map of somewhere else.
        lat: p.latitude != null ? Number(p.latitude) : null,
        lon: p.longitude != null ? Number(p.longitude) : null
    };
}

// The tenant's own home, from /tenant-portal/me, in the same shapes the rest of the
// view-model already expects for a property and a unit.
//
// Why this exists: the portal used to find the tenant's property by matching their
// unit NUMBER against the demo unit list, so a real tenant living in a room called
// "101" was shown the demo property's name, photo, code, policy and address. Their
// own home card named somebody else's building.
export function mapMyPlace(me) {
    const home = (me && me.home) || {};
    if (home.property_id == null) return { place: null, unit: null };
    const id = String(home.property_id);
    return {
        place: {
            ...mapProperty({
                id: home.property_id,
                name: home.property_name,
                address: home.address,
                locality: home.locality,
                city: home.city,
                image_url: home.property_image,
                property_type: home.property_type,
                latitude: home.latitude,
                longitude: home.longitude,
                units: 1
            }),
            // The room type is the closest thing the backend has to the design's
            // "policy" line, and it is at least true.
            policy: String(home.room_type || '').toUpperCase(),
            policyIcon: /shar/i.test(String(home.room_type || '')) ? 'people-outline' : 'bed-outline'
        },
        unit: home.unit_number == null ? null : {
            id: home.unit_id != null ? String(home.unit_id) : null,
            no: String(home.unit_number),
            prop: id,
            type: home.room_type || '',
            cap: 1,
            rent: `₹${inr(home.base_rent)}`,
            base: Number(home.base_rent) || 0
        }
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

// A relative age in the design's voice: "2H AGO" / "3D AGO" / "2W AGO". The
// maintenance queue is read as "how long has this been waiting", never as a date.
const ageLabel = (from, now) => {
    if (!from) return '';
    const mins = Math.max(0, Math.round((now - from) / 60000));
    if (mins < 60) return `${Math.max(1, mins)}M AGO`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}H AGO`;
    const days = Math.round(hours / 24);
    if (days < 7) return `${days}D AGO`;
    const weeks = Math.round(days / 7);
    if (weeks < 5) return `${weeks}W AGO`;
    return `${Math.round(days / 30)}MO AGO`;
};

// The backend's status enum has four values; the design's ticket list only knows
// three states. 'Closed' is a resolved request that has been filed away, so it
// reads as Resolved (which is also what keeps it out of the open queue).
const TICKET_STATUS = { Open: 'Open', 'In Progress': 'In progress', Resolved: 'Resolved', Closed: 'Resolved' };
// The design ranks a 'Critical' band the backend's enum does not have; a High
// request maps to High and nothing is invented above it.
const TICKET_PRIORITY = { High: 'High', Medium: 'Medium', Low: 'Low' };

// /owner/requests rows → the ticket shape deriveVm reads (data.js TICKETS).
// `who` is the vm tenant id so a ticket resolves to the person who raised it —
// that link is the whole point of the landlord's queue.
export function mapRequest(r, now) {
    const created = asDate(r.created_at);
    return {
        id: r.id,
        who: r.tenant_id != null ? String(r.tenant_id) : null,
        name: r.tenant_name || '',
        img: mediaUrl(r.tenant_image),
        unit: r.unit_number ? String(r.unit_number) : '—',
        prop: r.property_name || '',
        title: r.title || 'Request',
        cat: String(r.category || 'GENERAL').toUpperCase(),
        priority: TICKET_PRIORITY[r.priority] || 'Medium',
        status: TICKET_STATUS[r.status] || 'Open',
        age: ageLabel(created, now),
        body: r.description || '',
        // One optional photo of the problem; the design's ticket sheet renders a
        // list, so it arrives as a list of nought or one.
        photos: r.image_url ? [mediaUrl(r.image_url)] : []
    };
}

// The tone the tenant portal shows a request's state in. Same three-state view as
// the landlord's queue, so 'Closed' reads as resolved on both sides.
const REQ_DOT = { Open: 'fg2', 'In Progress': 'amber', Resolved: 'pos', Closed: 'pos' };

// /tenant-portal/requests rows → the shape the Help screen and the request-detail
// sheet read. This is the tenant's own view of a request: no tenant identity (it
// is theirs), but the raised date and the photo they attached.
export function mapPortalRequest(r) {
    const d = asDate(r.created_at);
    const cat = String(r.category || 'General');
    const display = TICKET_STATUS[r.status] || 'Open';
    return {
        id: r.id,
        title: r.title || 'Request',
        category: cat,
        priority: r.priority || 'Medium',
        body: r.description || '',
        sub: `${cat.toUpperCase()} · ${d ? `${d.getDate()} ${MON[d.getMonth()]}` : ''}`.replace(/ · $/, ''),
        // The sheet's status ladder matches on these, so they stay upper-case and
        // in the backend's own vocabulary.
        status: display.toUpperCase(),
        dot: REQ_DOT[r.status] || 'fg2',
        raised: d ? `${d.getDate()} ${MON_TITLE[d.getMonth()]} ${d.getFullYear()}` : '',
        photos: r.image_url ? [mediaUrl(r.image_url)] : []
    };
}

// /payments/declared rows → the landlord's confirm queue.
//
// A declared payment is a CLAIM, not money received. The tenant has said "I paid
// ₹9,000 by UPI on the 3rd" and nothing has happened to any total yet — it stays
// that way until the landlord decides. So this shape leads with the three things
// that decision is actually made on: how much, when, and by what method, plus
// the reference the tenant typed so it can be matched against a bank statement.
//
// `matchesRent` exists because the commonest reason to hesitate is an amount that
// is not the expected one, and comparing two rupee strings by eye is exactly the
// kind of check a screen should have already done for you.
export function mapDeclaredPayment(p, now = new Date()) {
    const paid = asDate(p.payment_date);
    const claimed = asDate(p.created_at);
    const amount = Number(p.amount_paid) || 0;
    const rent = Number(p.rent_share) || 0;
    return {
        id: p.id,
        tenantId: p.tenant_id != null ? String(p.tenant_id) : null,
        name: p.tenant_name || '',
        img: mediaUrl(p.tenant_image),
        unit: p.unit_number ? String(p.unit_number) : '—',
        prop: p.property_name || '',
        propertyId: p.property_id != null ? String(p.property_id) : null,
        amount: `₹${inr(amount)}`,
        amountRaw: amount,
        method: String(p.payment_method || '').toUpperCase() || '—',
        // Empty rather than a dash: the sheet hides the row entirely when a tenant
        // paid in cash and had no reference to give.
        reference: p.reference_id ? String(p.reference_id) : '',
        paidOn: paid ? `${paid.getDate()} ${MON_TITLE[paid.getMonth()]} ${paid.getFullYear()}` : '',
        // How long the landlord has been sitting on it, which is the thing that
        // makes an unconfirmed payment rude rather than merely pending.
        age: ageLabel(claimed, now),
        rent: rent ? `₹${inr(rent)}` : '',
        rentRaw: rent,
        matchesRent: rent > 0 ? amount === rent : null,
        shortBy: rent > 0 && amount < rent ? `₹${inr(rent - amount)}` : '',
        overBy: rent > 0 && amount > rent ? `₹${inr(amount - rent)}` : ''
    };
}

// /owner/join-requests rows → what the landlord's inbox shows. The requester is a
// `tenant_users` account, not a tenant record yet — that is the whole point of the
// request — so their name and contact come off the login account.
// The ID-proof badge. Both the tenant list and the join inbox get the same three
// states from the same two counts, so a landlord reads one vocabulary everywhere.
// Colours are token keys, resolved by the screens.
export function idBadge(count, verified) {
    const n = Number(count) || 0;
    const v = Number(verified) || 0;
    if (v > 0) return { state: 'verified', label: 'ID VERIFIED', fg: 'pos', icon: 'shield-checkmark', count: n, verified: v };
    if (n > 0) return { state: 'pending', label: `${n} ID TO CHECK`, fg: 'amber', icon: 'shield-outline', count: n, verified: 0 };
    return { state: 'none', label: 'NO ID ON FILE', fg: 'fg3', icon: 'shield-outline', count: 0, verified: 0 };
}

// One uploaded document as the sheets render it. `open` is left to the caller: the
// file may be a PDF, so it is handed to the phone rather than drawn inline.
export function mapDocument(d, now) {
    const made = asDate(d.created_at);
    const decided = asDate(d.verified_at);
    const status = d.status || 'Pending';
    return {
        id: d.id,
        type: d.doc_type || 'other',
        label: d.doc_label || 'ID document',
        number: d.doc_number || '',
        url: mediaUrl(d.file_url),
        // Cheap but reliable: a PDF cannot be shown in an <Image>, so the row shows
        // a document glyph instead of a broken thumbnail.
        isPdf: /\.pdf($|\?)/i.test(String(d.file_url || '')),
        status,
        pending: status === 'Pending',
        verified: status === 'Verified',
        rejected: status === 'Rejected',
        statusFg: status === 'Verified' ? 'pos' : status === 'Rejected' ? 'coral' : 'amber',
        note: d.note || '',
        by: d.verified_by_name || '',
        age: ageLabel(made, now),
        decidedAge: decided ? ageLabel(decided, now) : '',
        // Whether the server blurred this before sending it. The URL above is ALREADY
        // the blurred one when this is true — the app never receives the original and
        // has nothing to un-blur, which is the point. This flag only decides what to
        // SAY about the image, never whether to obscure it.
        blurred: !!d.blurred,
        // False when no blurred copy could be produced at all (a file stored before
        // Cloudinary was switched on), so the row shows a locked placeholder rather
        // than an <Image> pointed at null.
        canPreview: d.blurred ? !!d.can_preview : true
    };
}

export function mapJoinRequest(r, now) {
    const created = asDate(r.created_at);
    // What the applicant said when they asked. Kept in both shapes on purpose: the
    // ISO string is what goes back to the server on accept, and the label is what the
    // landlord reads. Deriving the label at render time from the string would mean
    // parsing a date in three different sheets.
    const wants = asDate(r.requested_stay_until);
    const iso = wants
        ? `${wants.getFullYear()}-${String(wants.getMonth() + 1).padStart(2, '0')}-${String(wants.getDate()).padStart(2, '0')}`
        : null;
    return {
        id: r.id,
        name: r.requester_name || 'Someone',
        email: r.requester_email || '',
        phone: r.requester_phone || '',
        propertyId: r.property_id != null ? String(r.property_id) : null,
        property: r.property_name || '',
        unit: r.unit_number ? String(r.unit_number) : null,
        status: r.status || 'Pending',
        pending: (r.status || 'Pending') === 'Pending',
        note: r.note || '',
        age: ageLabel(created, now),
        askedOn: created ? `${created.getDate()} ${MON_TITLE[created.getMonth()]} ${created.getFullYear()}` : '',
        // The stay they asked for. null means they did not say, or said "not sure" —
        // both of which are answers, and neither of which is a date.
        askedStay: iso,
        askedStayLabel: wants ? `${wants.getDate()} ${MON_TITLE[wants.getMonth()]} ${wants.getFullYear()}` : '',
        // Whether that ask is still ahead of us. A request left sitting long enough
        // outlives the date it asked for, and offering the landlord a chip that the
        // server will refuse is worse than not offering it.
        askedStayStale: !!wants && !!now && wants < new Date(new Date(now).setHours(0, 0, 0, 0)),
        // The room they asked for. Separate from `unit` above, which is where the
        // landlord actually put them — the two differ whenever an accept overrides the
        // ask, and both are worth showing.
        askedUnit: r.requested_unit_id != null ? String(r.requested_unit_id) : null,
        askedUnitLabel: r.requested_unit_number ? String(r.requested_unit_number) : '',
        // Whether this stranger has put an ID up at all — the first thing worth
        // knowing before letting them into a building. NOT called `id`: that is
        // already this request's primary key.
        idProof: idBadge(r.doc_count, r.doc_verified)
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
        // The unformatted figures, kept alongside the display strings because the
        // write endpoints take numbers — parsing them back out of "₹12,000" would
        // be a needless round trip through a string that exists for the eye.
        rentRaw: rent,
        depositRaw: Number(t.deposit) || 0,
        co: t.company || '',
        state: overdue ? 'overdue' : 'paid',
        days: daysLate,
        credit: Number(t.credit_score) || 0,
        deposit: `₹${inr(t.deposit)}`,
        // The scored payment record, straight from the server. `credit_score` above is
        // the dead column it replaces — an int defaulting to 100 that nothing ever
        // wrote, so every real tenant scored 100 for ever. Still read only so nothing
        // downstream breaks on the day the column is finally dropped.
        score: t.score || null,
        // These two fed the OLD arithmetic in creditOf and now only matter on the
        // walk-through, where `score` is absent. `late` stayed 0 because the backend
        // had no missed-payment counter — that is exactly the number the server now
        // refuses to invent, reporting days overdue instead.
        onTime: paidCount,
        late: 0,
        since: `${movedIn ? monthDiff(movedIn, now) : 0} mo`,
        phone: t.phone || '',
        email: t.email || '',
        propertyId: t.property_id != null ? String(t.property_id) : null,
        // NULL when the landlord typed this tenant in by hand and they have never
        // signed in — there is then nowhere for a document to have come from, which
        // the documents sheet reports rather than showing an empty list.
        userId: t.tenant_user_id != null ? String(t.tenant_user_id) : null,
        // Set only for someone who joined as a guest and has not completed a
        // profile yet. It is the whole of their credential, which is why the
        // landlord can see it: they are the only way back in for a person who has
        // changed phones.
        guestCode: t.guest_code || null,
        idProof: idBadge(t.doc_count, t.doc_verified),
        // Notice to leave. Rides along free because getAllTenants selects t.*, and it
        // has to reach the landlord SOMEWHERE: the tenant's screen has been promising
        // "your landlord is notified" under a button that notified nobody. A row the
        // landlord cannot see is the same bug in a new place.
        leaveOn: t.leave_on ? asDate(t.leave_on) : null,
        noticeGivenOn: t.notice_given_on ? asDate(t.notice_given_on) : null
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
export function mapOwnerData({ dashboard, properties, units, tenants, transactions, requests, paySettings, joinRequests, declaredPayments }, now = new Date()) {
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
        tickets: (requests || []).map((r) => mapRequest(r, now)),
        joins: (joinRequests || []).map((r) => mapJoinRequest(r, now)),
        // Oldest first, matching the backend's ORDER BY: the claim that has been
        // waiting longest is the one to deal with, not the newest arrival.
        declared: (declaredPayments || []).map((r) => mapDeclaredPayment(r, now)),
        // The owner's UPI details, as tenants will see them. Null until they set
        // them up — an empty state, not a missing one.
        pay: paySettings
            ? {
                upiId: paySettings.upi_id || '',
                upiNumber: paySettings.upi_number || '',
                qr: paySettings.qr_code_url ? mediaUrl(paySettings.qr_code_url) : null
            }
            : { upiId: '', upiNumber: '', qr: null },
        // No owner-side endpoint exists for expenses yet.
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
