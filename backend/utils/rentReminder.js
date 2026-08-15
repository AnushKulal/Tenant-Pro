// File: backend/utils/rentReminder.js
//
// Which mornings a tenant hears about rent.
//
// ── The rule ───────────────────────────────────────────────────────────────────
// Nothing before the due date. Not "due in three days", not "due tomorrow" — a
// reminder about money somebody does not owe yet is a nag, and the app has no business
// chasing rent early on a landlord's behalf.
//
// From the due date onward it keeps asking, because that is the point. But not every
// morning forever: a tenant forty days behind who has been pushed forty times has
// turned notifications off by day five, and then nothing reaches them again — including
// the things that matter more, like a landlord asking for their ID.
//
// So it front-loads and then backs off. Day 0, 1, 3, 7, and weekly after that.
//
// Pure, because "when does the app message somebody about their debt" is exactly the
// kind of decision that should be readable and pinned rather than buried in a cron.

// The early days, where a reminder is most likely to be the reason it gets paid.
const EARLY = [0, 1, 3, 7];
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
    // The whole rule in one line: never early.
    if (d < 0) return false;
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

module.exports = { shouldRemind, reminderKind, daysPastDue, EARLY, WEEKLY_EVERY };
