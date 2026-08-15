// File: backend/utils/pushRules.js
//
// What a push notification SAYS, who it is allowed to reach, and where tapping it
// lands. Pure, so all three are tested rather than discovered on somebody's phone.
//
// ── Why this is a module and not a string at each call site ────────────────────
// A push is the only part of this app that reaches a person when they are not using
// it. That makes it the least forgiving surface here: it arrives on a lock screen, out
// of context, possibly at a bad moment, and it cannot be edited or taken back. Copy
// written inline at thirteen call sites drifts, and a notification that says the wrong
// thing about somebody's rent is worse than no notification.
//
// ── The one safety property worth stating ──────────────────────────────────────
// Every kind declares its AUDIENCE. A landlord-facing message can never be delivered
// to a tenant, even if a caller passes the wrong account id, because the sender checks
// the audience against the token's role before it sends. Getting that wrong would mean
// telling a tenant about another tenant's rent.

// Who each kind is written for. Checked at send time — see pushService.
const AUDIENCE = {
    // ── To the tenant ─────────────────────────────────────────────────────────
    id_requested: 'tenant',
    rent_due: 'tenant',
    rent_overdue: 'tenant',
    payment_confirmed: 'tenant',
    payment_rejected: 'tenant',
    join_accepted: 'tenant',
    join_rejected: 'tenant',
    ticket_replied: 'tenant',
    // ── To the landlord ───────────────────────────────────────────────────────
    join_requested: 'owner',
    phone_matched: 'owner',
    payment_declared: 'owner',
    ticket_raised: 'owner',
    notice_given: 'owner',
    id_uploaded: 'owner',
    // ── To whoever asked for it ───────────────────────────────────────────────
    // The one kind readable by either role, and the only one that will ever be. It
    // exists to answer "does this phone receive notifications at all", which is a
    // question about the DEVICE and so has the same answer for both roles.
    //
    // 'any' does not weaken the guarantee above, because the guarantee is about
    // somebody else's information reaching the wrong person and this message has none
    // to leak: no name, no amount, no property, no id. See COPY.push_test — it is the
    // same eleven words whoever receives it.
    push_test: 'any'
};

// A lock screen shows roughly this much before truncating, and a body that gets cut
// mid-sentence reads as broken rather than brief.
const TITLE_MAX = 60;
const BODY_MAX = 140;

const clip = (s, max) => {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
};

// First name only. A push is a message from a person, and "Anush Kulal asked for your
// ID" reads like a letter where "Anush asked for your ID" reads like a person.
const first = (name, fallback) => {
    const n = String(name || '').trim().split(/\s+/)[0];
    return n || fallback;
};

// Null when there is no amount, so a caller that forgot to pass one gets a sentence
// with the figure MISSING rather than a sentence claiming the figure is zero. "Rent
// due in 3 days · ₹0" is not a smaller mistake than saying nothing; it is a wrong
// number about somebody's money, on their lock screen.
const money = (n) => {
    const v = Number(n);
    return Number.isFinite(v) && v > 0 ? `₹${v.toLocaleString('en-IN')}` : null;
};

// A date as a person says it — "14 Sep" — or null when there isn't one to say.
//
// Call sites hold SQL dates, and "Last day 2026-09-14" on a lock screen reads like a
// log line rather than a message. Parsed rather than trusted: an unparseable value
// drops the clause instead of printing "Invalid Date", which is the same rule as
// money() and for the same reason.
const dayMonth = (d) => {
    if (!d) return null;
    const t = d instanceof Date ? d : new Date(String(d).slice(0, 10));
    if (isNaN(t.getTime())) return null;
    return `${t.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][t.getMonth()]}`;
};

// The copy, one place. Each returns { title, body } and may read whatever the caller
// passes; anything missing degrades to a sentence that is still true rather than one
// with a hole in it.
const COPY = {
    id_requested: (d) => ({
        title: `${first(d.landlordName, 'Your landlord')} asked for your ID`,
        body: d.docLabel
            ? `They need a photo of your ${d.docLabel}.`
            : 'They need a photo of a government ID.'
    }),
    rent_due: (d) => ({
        title: d.days === 0 ? 'Rent is due today' : `Rent due in ${d.days} ${d.days === 1 ? 'day' : 'days'}`,
        body: [money(d.amount), d.property, d.unit && `room ${d.unit}`].filter(Boolean).join(' · ')
    }),
    rent_overdue: (d) => ({
        // Stated as a fact, not an accusation. The person reading it usually knows.
        title: `Rent is ${d.days} ${d.days === 1 ? 'day' : 'days'} overdue`,
        body: [money(d.amount), d.property, d.unit && `room ${d.unit}`].filter(Boolean).join(' · ')
    }),
    payment_confirmed: (d) => ({
        title: `${first(d.landlordName, 'Your landlord')} confirmed your payment`,
        body: money(d.amount)
            ? `${money(d.amount)} received. Your receipt is ready.`
            : 'Your receipt is ready.'
    }),
    payment_rejected: (d) => ({
        // Never "rejected" to the tenant. They believe they paid, and most of the time
        // they did — the landlord could not match it, which is a different sentence and
        // the one that leads somewhere useful.
        title: `${first(d.landlordName, 'Your landlord')} could not match your payment`,
        body: d.note
            ? clip(d.note, BODY_MAX)
            : `They could not find ${money(d.amount) || 'that payment'}. Tap to check the reference.`
    }),
    join_accepted: (d) => ({
        title: `You're in at ${d.property || 'your new place'}`,
        body: d.unit ? `Room ${d.unit}. Your rent and documents are here now.` : 'Your rent and documents are here now.'
    }),
    join_rejected: (d) => ({
        title: `${d.property || 'That property'} did not confirm your request`,
        body: 'Check the details with your landlord, or try another property.'
    }),
    ticket_replied: (d) => ({
        title: `${first(d.landlordName, 'Your landlord')} replied`,
        body: clip(d.subject || 'Your maintenance request has an update.', BODY_MAX)
    }),

    join_requested: (d) => ({
        title: `${first(d.tenantName, 'Someone')} wants to join ${d.property || 'your property'}`,
        body: 'Tap to accept or decline.'
    }),
    phone_matched: (d) => ({
        // Deliberately not "wants to join" — this is somebody the landlord entered
        // themselves, and that wording gets a real tenant declined. Same reasoning as
        // the inbox row it mirrors.
        title: `${first(d.tenantName, 'Your tenant')} registered on TenantPro`,
        body: d.unit ? `Is this your tenant in room ${d.unit}?` : 'Is this your tenant?'
    }),
    payment_declared: (d) => ({
        title: money(d.amount)
            ? `${first(d.tenantName, 'A tenant')} says they paid ${money(d.amount)}`
            : `${first(d.tenantName, 'A tenant')} declared a payment`,
        body: [d.method, d.unit && `room ${d.unit}`].filter(Boolean).join(' · ') || 'Tap to confirm or reject.'
    }),
    ticket_raised: (d) => ({
        title: `${first(d.tenantName, 'A tenant')} raised a repair`,
        body: clip([d.subject, d.unit && `room ${d.unit}`].filter(Boolean).join(' · '), BODY_MAX)
    }),
    notice_given: (d) => ({
        title: `${first(d.tenantName, 'A tenant')} gave notice`,
        body: [dayMonth(d.leaveOn) && `Last day ${dayMonth(d.leaveOn)}`, d.unit && `room ${d.unit}`].filter(Boolean).join(' · ')
    }),
    id_uploaded: (d) => ({
        title: `${first(d.tenantName, 'A tenant')} added their ${d.docLabel || 'ID'}`,
        body: 'Tap to check it.'
    }),

    // Fixed text, ignoring everything the caller passes. That is the point: it is the
    // only kind either role can receive, and it is safe to send to either precisely
    // because there is nothing personal in it to get wrong. It also has no entry in
    // DEST, so tapping it opens the app and leaves the reader where they were rather
    // than throwing them onto a screen that has nothing to do with why they tapped.
    push_test: () => ({
        title: 'TenantPro notifications are on',
        body: 'This is a test. Real ones tell you about rent, repairs and requests.'
    })
};

// Where tapping it should land — as a ROUTE and, where the destination is a sheet
// rather than a screen, an OVERLAY over it.
//
// Both, explicitly, because the app has two navigation concepts and they are not
// interchangeable. The landlord's join inbox and payment queue are overlays drawn over
// the dashboard, not routes; sending 'joins' as a route would set a route that does not
// exist AND close the overlay it meant to open. Guessing which one a name is would be
// the same bug with extra steps.
//
// A notification that opens nothing is the worst kind of broken here — the person
// already went to the trouble of responding to it.
const DEST = {
    id_requested: { route: 'tdocs' },
    rent_due: { route: 'portal' },
    rent_overdue: { route: 'portal' },
    payment_confirmed: { route: 'portal' },
    payment_rejected: { route: 'portal' },
    join_accepted: { route: 'portal' },
    join_rejected: { route: 'portal' },
    ticket_replied: { route: 'thelp' },
    join_requested: { route: 'home', overlay: 'joins' },
    phone_matched: { route: 'home', overlay: 'joins' },
    payment_declared: { route: 'home', overlay: 'declared' },
    ticket_raised: { route: 'support' },
    notice_given: { route: 'people' },
    id_uploaded: { route: 'people' }
};

// Expo's own token shape. Anything else is a client bug or somebody probing the
// endpoint, and posting it to Expo would just earn an error back.
const isExpoToken = (t) => /^Expo(nent)?PushToken\[[^\]\s]+\]$/.test(String(t || '').trim());

// The whole message, or null.
//
// Null rather than a placeholder on an unknown kind: a push with empty or default text
// is worse than silence, because the person cannot tell what it was about and cannot
// get it back.
const buildPush = (kind, data = {}) => {
    const make = COPY[kind];
    if (!make) return null;
    const { title, body } = make(data) || {};
    if (!title) return null;
    return {
        kind,
        audience: AUDIENCE[kind],
        title: clip(title, TITLE_MAX),
        // A body that came out empty is dropped rather than sent blank — some launchers
        // render an empty second line as a visible gap.
        body: body ? clip(body, BODY_MAX) : undefined,
        data: {
            kind,
            route: (DEST[kind] && DEST[kind].route) || null,
            // Only when there is one. An `overlay: null` in the payload would read to
            // the app as "close whatever is open", which is a different instruction.
            ...(DEST[kind] && DEST[kind].overlay ? { overlay: DEST[kind].overlay } : {}),
            // Whatever the screen needs to open the right row. Passed through rather
            // than interpreted here.
            ...(data.id != null ? { id: data.id } : {})
        }
    };
};

module.exports = { AUDIENCE, DEST, buildPush, isExpoToken, TITLE_MAX, BODY_MAX };
