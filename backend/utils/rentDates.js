// The one place that answers "when is rent next due after this payment".
//
// This used to live inline in paymentController and had to be duplicated the
// moment a second thing could settle a month (a landlord confirming a payment the
// tenant declared). Two copies of a date rule is two answers to "why is my due
// date wrong", so it lives here and both callers use it.

// JavaScript's setMonth overflows rather than clamping: 31 January + 1 month is
// 3 March, because February has no 31st. A tenant who moved in on the 31st would
// have their due date drift forward by two or three days every single month, and
// the drift compounds — after a year they are being billed in the middle of the
// month for no reason anyone could explain.
//
// So the day is clamped to the last day of the target month instead: 31 Jan becomes
// 28 Feb (29 in a leap year), and the month after that is 31 March again, because
// the clamp is applied to the ORIGINAL day rather than to the clamped one. That
// last part is why the anchor day is passed in separately below.
const addMonths = (date, months, anchorDay) => {
    const d = new Date(date.getTime());
    const day = anchorDay || d.getDate();
    // Move to the 1st before shifting the month, so the shift itself can never
    // overflow, then put the day back with a clamp.
    d.setDate(1);
    d.setMonth(d.getMonth() + months);
    const lastDayOfTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastDayOfTargetMonth));
    return d;
};

// MySQL DATE columns want YYYY-MM-DD in local terms. toISOString() would convert to
// UTC first, which in India (UTC+5:30) turns any date into the previous day for
// times before 05:30 — a due date silently one day early.
const toSqlDate = (date) => {
    // NULL in, null out. This used to assume a Date and threw
    // "Cannot read properties of null (reading 'getFullYear')" the first time it was
    // handed a nullable column — tenants.notice_given_on, which is NULL for everyone
    // who has not given notice, i.e. almost every row. A whole endpoint 500'd on the
    // common case. Every caller that passes a real Date is unaffected, and the next
    // nullable column to reach this is no longer a landmine.
    if (!date) return null;
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${da}`;
};

// Advance a tenant's due date by one month, given whatever their due date currently
// is. `fallback` is used when they have no due date on file yet (a tenancy created
// before the billing fields existed), because refusing to record the payment would
// be the wrong way to handle a missing column.
//
// `moveInDay` repairs one specific failure and must not do anything else. The
// failure: a tenant anchored on the 31st gets clamped to 28 Feb, and if the 28th
// then becomes the new anchor they are billed on the 28th forever — the tenancy has
// silently moved. The thing it must NOT do is override a due date the landlord set
// on purpose: somebody billed on the 5th who moved in on the 1st stays on the 5th.
//
// Those two are told apart by asking whether the current day even COULD be a clamp.
// A clamp only ever lands on the last day of a month, and only ever downward. So the
// move-in day is used as the anchor when the current due day is the last day of its
// month AND the move-in day is later than it; in every other case the due date's own
// day is the anchor, which is the behaviour that existed before.
const nextDueAfter = (currentDue, fallback, moveInDay) => {
    let from = currentDue ? new Date(currentDue) : null;
    if (!from || isNaN(from.getTime())) from = new Date(fallback || Date.now());
    if (isNaN(from.getTime())) from = new Date();

    const currentDay = from.getDate();
    const lastDayOfThisMonth = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
    const wasProbablyClamped = currentDay === lastDayOfThisMonth
        && Number.isFinite(moveInDay) && moveInDay > currentDay;

    return toSqlDate(addMonths(from, 1, wasProbablyClamped ? moveInDay : currentDay));
};

// The day of the month a tenancy is anchored to, taken from the move-in date.
// Returns null when there is no usable move-in date, which makes nextDueAfter fall
// back to the current due date's own day — the old behaviour, and the right one
// when there is nothing better to anchor to.
const anchorDayOf = (moveInDate) => {
    if (!moveInDate) return null;
    const d = new Date(moveInDate);
    return isNaN(d.getTime()) ? null : d.getDate();
};

module.exports = { addMonths, toSqlDate, nextDueAfter, anchorDayOf };
