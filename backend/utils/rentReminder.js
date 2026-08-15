// File: backend/utils/rentReminder.js
//
// Which mornings a tenant hears about rent.
//
// ── The rule ───────────────────────────────────────────────────────────────────
// A short run-up, then the day itself, then it keeps asking.
//
// Two days of notice, no more. Enough for somebody paid monthly to move money or
// notice they are away from their bank; not so early that the reminder is about a bill
// they cannot act on yet and will have forgotten by the time it lands.
//
// From the due date onward it does not stop, because that is the point. But not every
// morning forever: a tenant forty days behind who has been pushed forty times has
// turned notifications off by day five, and then nothing reaches them again — including
// the things that matter more, like a landlord asking for their ID.
//
// So it front-loads and then backs off. Days -2, -1, 0, 1, 3, 7, and weekly after that.
//
// Pure, because "when does the app message somebody about their debt" is exactly the
// kind of decision that should be readable and pinned rather than buried in a cron.

// How much notice, in days. Exported because the cron's WHERE clause has to look this
// far ahead too — a schedule that is willing to remind somebody two days early is no
// use if the query only selects rent that is already due.
const LEAD_DAYS = 2;

// The days around the due date, where a reminder is most likely to be the reason it
// gets paid. Negative is before, 0 is the day, positive is late.
const EARLY = [-2, -1, 0, 1, 3, 7];
// After that, one a week. Frequent enough to be a real reminder, rare enough that it
// does not become the thing they mute.
const WEEKLY_EVERY = 7;

// Should a reminder go out today?
//
//   daysPastDue  0 on the due date, positive after it, negative before.
const shouldRemind = (daysPastDue) => {
    // A NUMBER, strictly. `Number(null)` is 0, so a coercing check would read a tenant
    // with no due date on file as "due today" — and since daysPastDue() returns null for
    // exactly that case, they would be reminded every morning, for ever, about a date
    // nobody ever set. Which is the runaway this whole schedule exists to avoid.
    if (typeof daysPastDue !== 'number' || !Number.isFinite(daysPastDue)) return false;
    const d = daysPastDue;
    // Never earlier than the run-up. Without this the weekly arm below would fire on
    // day -7, -14 and so on — reminding somebody about rent a fortnight before they owe
    // it, which is how an app teaches people to ignore it.
    if (d < -LEAD_DAYS) return false;
    if (EARLY.includes(d)) return true;
    // Weekly from then on. Deliberately uncapped — "we stopped mentioning your unpaid
    // rent" is a strange thing for a rent app to do, and the landlord has other ways to
    // escalate when it gets that far.
    return d > 7 && d % WEEKLY_EVERY === 0;
};

// Which message it is. Two kinds because they are two different sentences: one is a
// reminder, the other is a statement of fact about being late, and using the "due
// today" wording on day thirty would read as though nothing had happened since.
const reminderKind = (daysPastDue) => (Number(daysPastDue) > 0 ? 'rent_overdue' : 'rent_due');

// Whole days between the due date and today, both floored to midnight.
//
// Floored because the comparison is between two DATES, not two instants: a due date
// read out of MySQL arrives at midnight while "now" is whatever time the cron ran, and
// subtracting those raw makes day 0 look like day -1 for anyone whose reminder fires
// after midnight — which is every reminder.
const daysPastDue = (dueDate, now = new Date()) => {
    if (!dueDate) return null;
    const due = dueDate instanceof Date ? new Date(dueDate) : new Date(dueDate);
    if (Number.isNaN(due.getTime())) return null;
    due.setHours(0, 0, 0, 0);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    return Math.round((today - due) / 86400000);
};

module.exports = { shouldRemind, reminderKind, daysPastDue, EARLY, WEEKLY_EVERY, LEAD_DAYS };
