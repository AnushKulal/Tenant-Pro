// File: backend/utils/guestStay.js
//
// When a guest's access ends.
//
// A guest joins with a phone number and an ID and nothing else — no email, no
// password. That is deliberate: somebody moving into a PG for three months should not
// have to create an account first. But an identity with no email cannot be recovered
// and cannot be revoked by its owner, so it must not last forever. The landlord sets
// the dates of the stay, and access ends with it.
//
// The way out is upward, not sideways: a guest who wants to stay longer completes a
// profile, and a full account is not governed by these dates at all — its identity was
// never tied to one stay. That is the whole shape of the feature, so the rule below is
// deliberately narrow: it gates GUESTS ONLY.
//
// Pure functions, no database, because "has this stay ended" is the kind of rule that
// wants a test for the day before, the day of, and the day after, and those are
// impossible to write against a live clock.

// Midnight, local, so a comparison is between days and not between moments. A stay
// ending "on the 12th" means the 12th is still theirs — a guest whose access died at
// 00:00 on their last morning would be locked out of the room they are still in.
const startOfDay = (value) => {
    if (!value) return null;
    const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
};

const DAY = 24 * 60 * 60 * 1000;

// Whole days from `now` to `until`. Positive means the future.
const daysBetween = (now, until) => Math.round((startOfDay(until) - startOfDay(now)) / DAY);

// The one question every caller actually asks. `isGuest` matters as much as the date:
// a full account with a stay_until still set (because they upgraded mid-stay) must not
// be locked out by it.
//
//   expired  — access must be refused
//   daysLeft — null when open-ended, 0 on the last day, negative once past
//   endsSoon — worth telling them about without being shrill
const stayState = ({ stayUntil, isGuest }, now = new Date()) => {
    const until = startOfDay(stayUntil);
    const guest = !!isGuest;

    // No end date is a legitimate state, not a missing value: a guest a landlord has
    // not put dates on, and every full account. Open-ended never expires.
    if (!until) {
        return { open: true, expired: false, daysLeft: null, endsSoon: false, endsOn: null };
    }

    const daysLeft = daysBetween(now, until);
    return {
        open: false,
        // Only a guest is gated. Upgrading is the documented way to keep access, so it
        // has to actually work — and it would not if the date outranked the account.
        expired: guest && daysLeft < 0,
        daysLeft,
        endsSoon: guest && daysLeft >= 0 && daysLeft <= 7,
        endsOn: until
    };
};

// A date from a landlord, checked. Returns { ok, value } or { ok: false, message } so
// the caller can answer with a sentence rather than a 500.
//
// `notBefore` is the move-in date where there is one: a stay that ends before it
// begins is a typo, and accepting it would create a tenancy that is expired the moment
// it exists.
const parseStayUntil = (raw, { notBefore = null, now = new Date() } = {}) => {
    if (raw === null || raw === undefined || String(raw).trim() === '') {
        // Clearing the date is allowed and means open-ended.
        return { ok: true, value: null };
    }
    const d = startOfDay(raw);
    if (!d) return { ok: false, message: 'That end date is not a date we can read.' };

    const today = startOfDay(now);
    if (d < today) {
        return { ok: false, message: 'That end date has already passed. Pick today or later.' };
    }
    const floor = startOfDay(notBefore);
    if (floor && d < floor) {
        return { ok: false, message: 'The stay cannot end before it starts.' };
    }
    // Ten years is not a real guest stay; it is a mistyped year, and it would quietly
    // recreate the never-expiring guest ID this feature exists to remove.
    if (daysBetween(today, d) > 3650) {
        return { ok: false, message: 'That end date is too far away. Check the year.' };
    }
    return { ok: true, value: d };
};

// YYYY-MM-DD for MySQL DATE, without dragging a timezone through it.
const toSqlDate = (d) => {
    const x = startOfDay(d);
    if (!x) return null;
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const day = String(x.getDate()).padStart(2, '0');
    return `${x.getFullYear()}-${m}-${day}`;
};

module.exports = { stayState, parseStayUntil, startOfDay, daysBetween, toSqlDate };
