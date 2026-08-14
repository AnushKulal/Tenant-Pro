// File: backend/utils/idRequest.js
//
// When a landlord may ask a tenant for their ID, and when an upload answers the ask.
//
// ── Why this is a stored row and not a message ─────────────────────────────────
// "Text them and ask" already works and is what landlords do today. What it does not
// do is survive: the tenant reads it once, forgets, and nobody can tell later whether
// they were ever asked. A row means the app can show the ask until it is answered,
// close it by itself when the document arrives, and stop nagging the moment it does.
//
// ── The line this must not cross ───────────────────────────────────────────────
// Asking is a notification aimed at a person about their government ID, sent by
// somebody with power over their housing. Every rule below narrows who can send one,
// how often, and how long it keeps asking. Pure, so those limits are tested rather
// than trusted.

// The kinds of ID that can be asked for. Deliberately the same keys documentController
// accepts on upload -- a request for a type nothing can satisfy is a nag with no
// possible answer. `null` means "any ID", which is what most landlords actually want.
const ASKABLE = ['aadhaar', 'pan', 'voter', 'dl', 'passport', 'other'];

// How long a pending ask keeps showing on the tenant's home screen before it stops
// being a prompt and becomes harassment. It is not deleted -- the landlord's record of
// having asked survives -- it just stops shouting.
const NAG_DAYS = 21;

const dayStart = (d) => {
    const x = d instanceof Date ? new Date(d) : new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
};
const daysBetween = (from, to) => Math.round((dayStart(to) - dayStart(from)) / 86400000);

// May this landlord ask this tenant for an ID, and what should the button say?
//
//   tenancyStatus   'Active' | 'Inactive' -- a move-out is a soft delete here
//   hasAccount      whether anybody has linked a portal account to this tenancy
//   pending         the open request, if there is one
//   summary         { has_any, is_verified } from the documents already on file
const askability = ({ tenancyStatus = 'Active', hasAccount = false, pending = null, summary = null } = {}) => {
    // A tenant who moved out is not somebody to chase for documents. Their records are
    // kept as a history of what was checked; turning that history into a channel for
    // notifying an ex-tenant is a different thing entirely, and not one they agreed to.
    if (String(tenancyStatus) === 'Inactive') {
        return { allowed: false, reason: 'MOVED_OUT', label: 'Asking is closed', note: 'They have moved out.' };
    }

    // Already asked. Reused rather than refused: the landlord tapping again means "did
    // this go through", and the honest answer is when it went and that it is still open.
    if (pending) {
        return { allowed: false, reason: 'ALREADY_ASKED', label: 'Already asked', note: null, pending: true };
    }

    // No portal account means there is nowhere to deliver this yet. It is still worth
    // recording -- the account may link tomorrow, and the ask should be waiting -- but
    // the landlord must be told that nobody will see it today rather than being left to
    // assume a notification went out.
    if (!hasAccount) {
        return {
            allowed: true,
            reason: 'NO_ACCOUNT',
            label: 'Request ID',
            note: 'They have not joined on the app yet — they will see this when they do.'
        };
    }

    // Already verified. Still allowed, because a landlord may legitimately need a
    // second document, but the wording must not imply the first one is missing.
    if (summary && summary.is_verified) {
        return { allowed: true, reason: 'HAS_VERIFIED', label: 'Ask for another ID', note: null };
    }
    if (summary && summary.has_any) {
        return { allowed: true, reason: 'HAS_UNCHECKED', label: 'Ask for another ID', note: 'They have uploaded one you have not checked yet.' };
    }

    return { allowed: true, reason: 'OK', label: 'Request ID', note: null };
};

// Normalise the type asked for. Anything unrecognised becomes "any ID" rather than an
// error: a request the tenant cannot possibly satisfy is worse than a broad one.
const normaliseType = (raw) => {
    const t = String(raw || '').trim().toLowerCase();
    return ASKABLE.includes(t) ? t : null;
};

// Does this upload answer the ask? A request naming no type is answered by any
// document; one naming a type is answered only by that type.
//
// 'other' deliberately does NOT satisfy a request for an Aadhaar. Closing a specific
// ask with an unrelated document would tell the landlord their question was answered
// when it was not, and they would stop looking.
const fulfils = (request, doc) => {
    if (!request || !doc) return false;
    if (String(request.status) !== 'Pending') return false;
    if (!request.doc_type) return true;
    return String(request.doc_type) === String(doc.doc_type);
};

// What the tenant is shown, and whether to show it at all.
//
// Named after the landlord and carrying their number on purpose: an unexplained demand
// for a government ID, from an app, is exactly the shape of a scam. The tenant needs to
// see who is asking and be able to ring them and check.
const prompt = (request, now = new Date()) => {
    if (!request || String(request.status) !== 'Pending') return null;
    const age = daysBetween(request.created_at || now, now);
    return {
        id: request.id,
        // Stops prompting after three weeks. The row stays Pending -- the landlord's
        // record of having asked is not erased -- but a prompt that has been ignored
        // for three weeks is not going to be answered by being shown a hundred more
        // times, and at that point it is just a thing shouting at somebody's home
        // screen.
        show: age <= NAG_DAYS,
        title: request.landlord_name
            ? `${request.landlord_name} asked for your ID`
            : 'Your landlord asked for your ID',
        // The specific document, if one was named. Vague is worse here: "upload an ID"
        // leaves the tenant guessing which, and guessing wrong means being asked again.
        line: request.doc_label
            ? `They need a photo of your ${request.doc_label}.`
            : 'They need a photo of a government ID.',
        note: request.note || '',
        landlordName: request.landlord_name || '',
        landlordPhone: request.landlord_phone || '',
        // So the tenant can check the ask is genuine before photographing their ID.
        verifyLine: request.landlord_phone
            ? 'Not sure? Call them on the number above before you send anything.'
            : '',
        askedDaysAgo: age
    };
};

module.exports = { ASKABLE, NAG_DAYS, askability, normaliseType, fulfils, prompt, daysBetween };
