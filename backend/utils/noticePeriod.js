// File: backend/utils/noticePeriod.js
//
// What happens when a tenant says they want to leave.
//
// ── What this replaces ─────────────────────────────────────────────────────────
// "Leave this property" called no endpoint at all. It set a key on the WALK-THROUGH
// roster — `roster.rahul`, a hardcoded demo tenant id — and flashed "You have left
// this property". On a real tenancy nothing happened whatsoever, which is exactly
// what was reported: the message appears and you are still a member.
//
// Beneath it the screen promised "YOUR LANDLORD IS NOTIFIED · 30 DAYS NOTICE
// APPLIES". Neither was true. Same family as the credit score that was always 100
// and the "None missed" row: authoritative-looking, and made up.
//
// ── Why leaving is a NOTICE and not a deletion ─────────────────────────────────
// A tenant cannot unilaterally end a tenancy on the spot, and it would be wrong to
// let the app pretend otherwise:
//
//   * The landlord has to know. They have a room to re-let and a deposit to settle,
//     and finding out because somebody stopped answering is not a process.
//   * The records are theirs too. Flipping the tenancy to Inactive the instant a
//     button is pressed destroys who owed what at the moment it mattered.
//   * Rent keeps running during the notice period. That is the whole point of a
//     notice period, and an app that hides it is setting up an argument later.
//
// So this computes a DATE and a set of disclosures. The tenancy ends when the
// landlord completes the move-out on or after that date.
//
// ── Nothing is blocked ────────────────────────────────────────────────────────
// Overdue rent, a fixed term not yet run out, an unsettled deposit — all of it is
// reported, none of it refuses the notice. Trapping somebody in a tenancy because
// they owe money is not something an app gets to do, and refusing the notice would
// not collect the money anyway. It would just mean the landlord finds out later.

const DAY = 24 * 60 * 60 * 1000;

// The notice a tenant must give. Thirty days because that is what the screen has
// been telling people all along — the number was fiction, but it was the right
// number to make true rather than quietly change.
const NOTICE_DAYS = 30;

const startOfDay = (value) => {
    if (!value) return null;
    const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
};

const addDays = (date, n) => {
    const d = startOfDay(date);
    if (!d) return null;
    return new Date(d.getTime() + n * DAY);
};

const daysBetween = (a, b) => {
    const x = startOfDay(a);
    const y = startOfDay(b);
    if (!x || !y) return null;
    return Math.round((y - x) / DAY);
};

// yyyy-mm-dd in LOCAL time. Not toISOString(), which converts to UTC first and can
// hand back yesterday's date for anyone east of Greenwich — this app's users are in
// IST, so that is every one of them, every evening.
const asSqlDate = (date) => {
    const d = startOfDay(date);
    if (!d) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Work out the leave date and everything the tenant has to be told before they
// confirm.
//
//   stayUntil    the agreed end of stay, when there is one (tenants.stay_until)
//   nextRentDue  for "you are behind right now"
//   rentShare    monthly rent, to say what the notice period costs
//   deposit      what is held
//
// Returns a plain object. Every field is something the confirmation screen prints —
// a dialog that says only "are you sure?" is not a disclosure, it is a speed bump.
const planNotice = ({ stayUntil = null, nextRentDue = null, rentShare = 0, deposit = 0 } = {}, now = new Date()) => {
    const today = startOfDay(now);
    const noticeEnds = addDays(today, NOTICE_DAYS);
    const agreedEnd = startOfDay(stayUntil);

    // Two cases, and the difference is the whole rule the report asked for.
    //
    //   * No agreed end, or an agreed end that is still far off: the notice runs its
    //     full thirty days and the tenant leaves at the end of it. Leaving before an
    //     agreed end is an EARLY EXIT — permitted, but it breaks a term both sides
    //     agreed to, so it is named rather than glossed over.
    //
    //   * An agreed end that arrives BEFORE the notice would run out: the tenancy was
    //     already ending. There is nothing to give notice about beyond that date, and
    //     demanding thirty days would push the leave date PAST the agreement — the app
    //     inventing an obligation nobody signed up for.
    const termEndsFirst = !!(agreedEnd && agreedEnd < noticeEnds);
    // Clamped to today, because an agreed end that has ALREADY PASSED would otherwise
    // produce a leave date in the past — notice served for a day that has gone, and a
    // negative notice period. That tenant is staying on past a term that already
    // expired, so nothing is owed in notice and today is a date they can actually
    // leave on. Without the clamp the app would offer "leave on 1 July" in August.
    const rawLeaveOn = termEndsFirst ? agreedEnd : noticeEnds;
    const lapsed = !!(agreedEnd && rawLeaveOn < today);
    const leaveOn = lapsed ? today : rawLeaveOn;
    const earlyExit = !!(agreedEnd && !termEndsFirst && agreedEnd > leaveOn);

    // How far behind they are right now, which is knowable and is the thing most
    // likely to come out of the deposit.
    const overdueDays = (() => {
        const due = startOfDay(nextRentDue);
        if (!due) return 0;
        const d = daysBetween(due, today);
        return d > 0 ? d : 0;
    })();

    const rent = Number(rentShare) || 0;
    const held = Number(deposit) || 0;
    const noticeDays = daysBetween(today, leaveOn) || 0;

    // Rent for the notice period, pro-rated on a thirty-day month. Deliberately
    // described as an estimate wherever it is shown: the exact figure depends on the
    // billing cycle and on what the landlord has already confirmed, and a precise-
    // looking number that turns out to be wrong is worse than an admitted estimate.
    const rentDuringNotice = rent > 0 ? Math.round((rent / 30) * noticeDays) : 0;

    return {
        noticeDays,
        leaveOn: asSqlDate(leaveOn),
        // The soonest they could have left, kept separate from leaveOn so the caller
        // can explain WHY the date is what it is when a term cut it short.
        noticeEndsOn: asSqlDate(noticeEnds),
        agreedEndOn: asSqlDate(agreedEnd),
        // Leaving before a date both sides agreed to.
        earlyExit,
        // The agreement was already ending, so no notice period is being waived.
        termEndsFirst,
        // The agreed stay ended before today and they are still here. Surfaced because
        // it is the one case where leaving is immediate, and a screen saying "you stay
        // until <today>" needs to explain why rather than look like a glitch.
        lapsed,
        overdueDays,
        rentDuringNotice,
        deposit: held,
        // Everything the tenant must see before confirming, in the order it matters.
        // Built here rather than in the app so the landlord's copy and the tenant's
        // copy cannot end up describing different rules.
        terms: [
            `You stay until ${asSqlDate(leaveOn)} and rent runs until then.`,
            ...(earlyExit
                ? [`This is before ${asSqlDate(agreedEnd)}, the end of stay you agreed with your landlord. Leaving early can affect your deposit.`]
                : []),
            ...(lapsed
                ? [`Your agreed stay already ended on ${asSqlDate(agreedEnd)}, so you can leave straight away — no notice period applies.`]
                : termEndsFirst
                    ? [`Your agreed stay ends on ${asSqlDate(agreedEnd)}, which is sooner than ${NOTICE_DAYS} days, so that is your last day.`]
                    : []),
            ...(overdueDays > 0
                ? [`You are ${overdueDays} ${overdueDays === 1 ? 'day' : 'days'} behind on rent. That is settled before your deposit is returned.`]
                : []),
            ...(held > 0
                ? [`Your deposit of ₹${held.toLocaleString('en-IN')} is returned by your landlord after any rent owed and damage is deducted.`]
                : []),
            'Your landlord is told straight away, and can start looking for someone to take the room.'
        ]
    };
};

module.exports = { planNotice, NOTICE_DAYS, asSqlDate, addDays, daysBetween, startOfDay };
