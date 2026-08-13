// File: backend/utils/tenantScore.js
//
// What a tenant's payment record actually says.
//
// ── What this replaces ─────────────────────────────────────────────────────────
// `tenants.credit_score` is an int column with a default of 100 that NOTHING has ever
// written outside the demo seeder. Every real tenant therefore scored exactly 100
// forever, regardless of behaviour. The app then drew a confident dial from it, and
// alongside it a "Payments missed: None missed" row that was hardcoded to zero for
// everybody — including a tenant who had missed every month. It looked authoritative
// and it was decoration.
//
// ── Why it could not have been accurate before ─────────────────────────────────
// Scoring on-time payment needs to know what each payment was DUE for. The payments
// table recorded an amount and a date, and nothing else; `next_rent_due` lives on the
// tenant and is overwritten forward on every confirmation, so the evidence was
// destroyed as it was created. payments.due_date now captures it at insert time, which
// is the only moment it is knowable.
//
// ── Two rules this file holds to ───────────────────────────────────────────────
//
// 1. NEVER SCORE WHAT YOU CANNOT SEE. Payments recorded before due_date existed have
//    none, so they are counted and reported as `unscored` — never guessed at, never
//    quietly treated as on-time. A tenant with no scorable payments comes back
//    `known: false`, and the caller must say "not enough history yet" rather than
//    print a number. A confident score built on two payments is worse than no score.
//
// 2. NEVER INVENT A MISSED PAYMENT. A payment that never happened leaves no row, so
//    "missed" cannot be counted from the payments table at all. What IS knowable is
//    whether rent is overdue RIGHT NOW, from next_rent_due — so that is what is
//    reported, under its own name. The old UI's "missed" row is gone rather than
//    filled with a number derived from arithmetic on move-in dates.
//
// Pure, no database, because a scoring rule wants tests for the boundaries — paid on
// the due date, paid one day after, paid inside the grace period — and those are
// impossible to write against live rows.

const DAY = 24 * 60 * 60 * 1000;

const startOfDay = (value) => {
    if (!value) return null;
    const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
};

// Whole days from `a` to `b`. Positive means b is later.
const daysBetween = (a, b) => {
    const x = startOfDay(a);
    const y = startOfDay(b);
    if (!x || !y) return null;
    return Math.round((y - x) / DAY);
};

// Paying on the due date is on time, and so is paying within the grace period. Rent
// reaching a landlord on the 3rd for a 1st due date is not a late payer, it is a bank
// holiday — and scoring it as a failure would make the number useless to the landlord
// who has to act on it.
const GRACE_DAYS = 3;

// The weights, in one place, on a -100..+100 scale so the existing dial keeps working.
// These are a heuristic and are deliberately readable rather than tuned: the point is
// that a landlord can be told exactly why a number is what it is.
const W = {
    onTimeEach: 6,
    onTimeCap: 60,
    lateEach: -8,
    latePerDayBeyondGrace: -1,
    lateFloor: -60,
    overduePerDay: -1.5,
    overdueFloor: -25,
    tenurePerMonth: 1.5,
    tenureCap: 20
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// One payment, classified. Returns null when it cannot be judged, which the caller
// counts as unscored rather than resolving either way.
const judge = (p) => {
    // Only a payment the landlord has confirmed says anything about reliability. A
    // Declared one is an unverified claim and a Rejected one is a disputed claim;
    // counting either would let a tenant improve their own score by asserting things.
    if (String(p.status || 'Confirmed') !== 'Confirmed') return null;
    const paid = startOfDay(p.payment_date);
    const due = startOfDay(p.due_date);
    if (!paid || !due) return null;
    const lateBy = daysBetween(due, paid);
    return { lateBy, onTime: lateBy <= GRACE_DAYS };
};

// The whole picture for one tenant.
//
//   payments     [{ payment_date, due_date, status }]
//   nextRentDue  the tenant's current next_rent_due, for "overdue right now"
//   moveInDate   for tenure
//
// Returns { known, score, band, factors[], onTime, late, unscored, ... }. `factors` is
// the explanation, and it is not optional: a score that moves money or reputation and
// cannot be explained is one nobody can contest.
const scoreTenant = ({ payments = [], nextRentDue = null, moveInDate = null } = {}, now = new Date()) => {
    const judged = payments.map(judge);
    const scorable = judged.filter(Boolean);
    const unscored = judged.length - scorable.length;

    const onTime = scorable.filter((j) => j.onTime).length;
    const lateOnes = scorable.filter((j) => !j.onTime);
    const late = lateOnes.length;
    const lateDays = lateOnes.reduce((sum, j) => sum + Math.max(0, j.lateBy - GRACE_DAYS), 0);
    const worstLate = lateOnes.reduce((worst, j) => Math.max(worst, j.lateBy), 0);

    // Overdue right now, which is knowable even with no payment history at all.
    const overdueDays = (() => {
        const due = startOfDay(nextRentDue);
        if (!due) return 0;
        const d = daysBetween(due, now);
        return d > 0 ? d : 0;
    })();

    const months = (() => {
        const inDate = startOfDay(moveInDate);
        if (!inDate) return 0;
        const d = daysBetween(inDate, now);
        return d > 0 ? Math.floor(d / 30) : 0;
    })();

    // Not enough to say anything. Reported rather than papered over: the caller shows
    // "no payment history yet", which is true and useful, instead of a dial pointing at
    // a number that means nothing.
    if (!scorable.length) {
        return {
            known: false,
            score: 0,
            band: 'unknown',
            bandLabel: 'No record yet',
            onTime: 0,
            late: 0,
            lateDays: 0,
            worstLate: 0,
            unscored,
            overdueDays,
            months,
            scoredFrom: null,
            factors: [],
            // The reason there is nothing to show, in the caller's words if it wants them.
            why: unscored > 0
                ? 'Their payments were recorded before this app started tracking due dates, so there is nothing to score yet.'
                : 'No confirmed payments yet.'
        };
    }

    const onTimePoints = Math.min(W.onTimeCap, onTime * W.onTimeEach);
    const latePoints = Math.max(W.lateFloor, (late * W.lateEach) + (lateDays * W.latePerDayBeyondGrace));
    // overduePerDay is ALREADY negative. Negating it again here made being overdue
    // raise the score — a tenant 589 days behind scored +100. Caught by the test that
    // asserted a terrible record lands negative; the weaker assertion next to it
    // ("cannot go below -100") had passed happily on +100 and proved nothing.
    const overduePoints = Math.max(W.overdueFloor, overdueDays * W.overduePerDay);
    const tenurePoints = Math.min(W.tenureCap, Math.round(months * W.tenurePerMonth));

    const score = clamp(Math.round(onTimePoints + latePoints + overduePoints + tenurePoints), -100, 100);

    const band = score >= 40 ? 'positive' : score >= 0 ? 'neutral' : 'negative';

    // Earliest due date actually scored, so the UI can say what window this covers
    // rather than implying it covers the whole tenancy.
    const scoredFrom = payments
        .filter((p) => judge(p))
        .map((p) => startOfDay(p.due_date))
        .filter(Boolean)
        .sort((a, b) => a - b)[0] || null;

    // Every factor that moved the number, with its points. Zero-value factors are kept
    // when they are reassuring ("nothing overdue") and dropped when they are just noise.
    const factors = [
        {
            key: 'on_time',
            label: 'Paid on time',
            detail: onTime === 1 ? '1 payment on time' : `${onTime} payments on time`,
            points: onTimePoints
        },
        (late > 0 ? {
            key: 'late',
            label: 'Paid late',
            detail: late === 1
                ? `1 payment, ${worstLate} ${worstLate === 1 ? 'day' : 'days'} after it was due`
                : `${late} payments, worst was ${worstLate} ${worstLate === 1 ? 'day' : 'days'} late`,
            points: latePoints
        } : {
            key: 'late',
            label: 'Paid late',
            detail: 'Never late',
            points: 0
        }),
        {
            key: 'overdue',
            label: 'Currently overdue',
            detail: overdueDays > 0
                ? `${overdueDays} ${overdueDays === 1 ? 'day' : 'days'} overdue now`
                : 'Nothing pending',
            points: overduePoints
        },
        (months > 0 ? {
            key: 'tenure',
            label: 'Length of stay',
            detail: `${months} ${months === 1 ? 'month' : 'months'} with you`,
            points: tenurePoints
        } : null)
    ].filter(Boolean);

    return {
        known: true,
        score,
        band,
        bandLabel: band === 'positive' ? 'Positive' : band === 'neutral' ? 'Building' : 'Negative',
        onTime,
        late,
        lateDays,
        worstLate,
        // Payments that exist but cannot be judged. Surfaced so a thin score is visibly
        // thin rather than looking like a complete picture.
        unscored,
        overdueDays,
        months,
        scoredFrom,
        factors,
        why: ''
    };
};

module.exports = { scoreTenant, GRACE_DAYS, WEIGHTS: W, startOfDay, daysBetween };
