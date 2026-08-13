// File: backend/utils/idVisibility.js
//
// Whether a landlord may READ a tenant's government ID, or only see that one exists.
//
// ── The rule, in the words it was asked for ────────────────────────────────────
// A landlord can see the ID while that tenant is IN their property. Before that —
// when somebody has found the property and asked to join — it unlocks, because
// checking who you are letting in is the entire reason the document was uploaded.
// When they move out it locks again: the tenancy is over, and a former landlord
// holding a readable copy of somebody's Aadhaar for ever is not something to leave
// switched on by default.
//
// ── Why BLURRED and not simply gone ────────────────────────────────────────────
// The landlord's record of having checked somebody is legitimate and worth keeping:
// which document it was, that they verified it, and when. Deleting the row would
// destroy that. So a lapsed relationship keeps the metadata and loses the CONTENT —
// the picture blurs and the document number is masked. What survives is "I checked
// Rahul's Aadhaar on 4 March", which is the auditable fact. What goes is the number
// itself, which is the part that can be used to impersonate somebody.
//
// ── The blur has to be real ────────────────────────────────────────────────────
// A CSS blur over the true image URL is decoration: the URL is still in the JSON,
// and anyone who reads the response — or the app's own network log — has the
// unblurred ID. So the blur is applied by CLOUDINARY, server-side, and the original
// URL is never sent. The landlord receives a URL that cannot resolve to anything
// but a blurred image.
//
// In disk mode there is no transform, and `/uploads/...` needs no token, so the
// original is one guessed path away. There the URL is WITHHELD entirely rather than
// sent with a promise to blur it in the app. Failing closed is the only honest
// option: a blur nobody enforces is worse than an absent image, because it looks
// like protection.

const { useCloudinary } = require('../middleware/uploadMiddleware');

// How hard to blur. Cloudinary's e_blur runs 1..2000; at 2000 an ID card is a
// smear of colour with no legible text, which is the requirement. Anything gentler
// leaves large print — a name, sometimes a number — readable at full size.
const BLUR_STRENGTH = 2000;

// The three answers. `none` is not "hidden", it is "no relationship ever existed",
// and the caller turns it into the same 404 an unknown person gets — whether an
// account exists is not something an unrelated landlord should be able to learn.
const FULL = 'full';
const BLURRED = 'blurred';
const NONE = 'none';

// Decide from the relationship alone. Pure, so the boundary that matters — the
// moment a tenancy goes Inactive — is a test rather than a hope.
//
//   relationship  'tenant' | 'applicant' | null   (from ownerMaySee)
//   tenancyStatus 'Active' | 'Inactive' | null    (tenants.status, when there is one)
const decideVisibility = ({ relationship = null, tenancyStatus = null } = {}) => {
    // Nobody. Not their tenant, not asking to be.
    if (!relationship) {
        return { level: NONE, reason: 'You have no tenancy or application with this person.' };
    }

    // Asking to join. The document exists precisely so this decision can be made,
    // so it is readable — but only while the request is still open. ownerMaySee
    // already refuses a decided or rejected request, so reaching here means pending.
    if (relationship === 'applicant') {
        return { level: FULL, reason: 'They have asked to join your property.' };
    }

    // In the property right now.
    if (String(tenancyStatus || 'Active') === 'Active') {
        return { level: FULL, reason: 'They are living in your property.' };
    }

    // Moved out. The record stays; the content does not.
    return {
        level: BLURRED,
        reason: 'They have moved out, so their ID is hidden. You can still see that you checked it.'
    };
};

// Turn a stored file URL into one that can only ever deliver a blurred image.
//
// Cloudinary delivery URLs look like:
//   https://res.cloudinary.com/<cloud>/image/upload/v123/tenantpro/documents/doc-1.jpg
// A transformation is a path segment inserted directly after `/upload/`. Cloudinary
// renders and caches it; the original is never fetched by the client.
//
// Returns null when a blurred version cannot be produced, and null MUST be treated
// as "send no URL at all" — never as "send the original".
const blurredUrl = (url) => {
    const raw = String(url || '');
    if (!raw) return null;

    // Not a Cloudinary URL — a disk-mode `/uploads/...` path, or something stored
    // before Cloudinary was switched on. There is no server-side transform for those
    // and the path is publicly readable, so there is nothing safe to hand over.
    const marker = '/upload/';
    if (!/^https?:\/\/res\.cloudinary\.com\//i.test(raw) || !raw.includes(marker)) return null;

    // Only ever transform the FIRST /upload/ — a public_id could contain the word,
    // and splicing at the wrong one would produce a URL that 404s (visible breakage)
    // or, worse, one that drops the transform.
    const at = raw.indexOf(marker) + marker.length;
    const head = raw.slice(0, at);
    const tail = raw.slice(at);

    // A PDF is not an image and Cloudinary will not blur it in place. Rendering page
    // one as a blurred jpeg is the honest equivalent: the landlord sees a document
    // shaped like their record of it, and can read none of it.
    const isPdf = /\.pdf($|\?)/i.test(tail);
    const t = isPdf
        ? `e_blur:${BLUR_STRENGTH},f_jpg,pg_1,q_auto:low`
        : `e_blur:${BLUR_STRENGTH},q_auto:low`;

    return `${head}${t}/${tail}`;
};

// Mask a document number, keeping just enough for the landlord to recognise WHICH
// document they are looking at without the number being usable.
//
// Blurring the picture while printing "1234 5678 9012" beside it would defeat the
// entire exercise — and that is exactly the kind of leak that survives a redesign
// unless it is handled in the same place as the image.
const maskNumber = (value) => {
    const s = String(value || '').trim();
    if (!s) return null;
    const visible = s.slice(-4);
    return `${'•'.repeat(Math.max(4, s.length - 4))}${visible}`;
};

// Apply a visibility level to the rows going out to a landlord.
//
// Everything that identifies the RECORD survives at every level; only the content
// is removed. Callers must not hand-roll this — one place decides what a blurred
// document looks like, so a new field cannot quietly bypass it.
// `sign` turns a document id into a short-lived URL on THIS server. Required for the
// blurred case — see below for why a Cloudinary URL cannot be sent.
const applyVisibility = (documents, level, sign = null) => {
    if (level === FULL) return documents.map((d) => ({ ...d, visibility: FULL, blurred: false }));
    return documents.map((d) => {
        // A CLOUDINARY TRANSFORMATION URL IS NOT A RESTRICTION.
        //
        // The blurred URL looks like
        //   .../image/upload/e_blur:2000/v1/tenantpro/documents/doc-7.jpg
        // and deleting the `e_blur:2000/` segment yields the ORIGINAL, which is public
        // and needs no token. So handing that URL to the app hands over the unblurred
        // ID to anyone who reads it — the exact "blur that nobody enforces" this was
        // supposed to avoid. Caught by an end-to-end test that grepped the raw
        // response body for the original path rather than trusting the happy path.
        //
        // So nothing Cloudinary ever leaves here. The app gets a URL on our own
        // server, valid for minutes, which re-checks the relationship and streams the
        // blurred bytes. The address of the original is never disclosed at all.
        const canBlur = !!blurredUrl(d.file_url);
        const url = canBlur && typeof sign === 'function' ? sign(d.id) : null;
        return {
            ...d,
            // Null when no blurred copy can be produced (a disk-mode file), which the
            // app renders as a locked placeholder. It NEVER falls back to d.file_url.
            file_url: url,
            doc_number: maskNumber(d.doc_number),
            visibility: BLURRED,
            blurred: true,
            // Whether an image can be shown at all, so the app does not sit on a
            // broken <Image> waiting for a URL that is null by design.
            can_preview: !!url
        };
    });
};

module.exports = {
    decideVisibility,
    blurredUrl,
    maskNumber,
    applyVisibility,
    FULL,
    BLURRED,
    NONE,
    BLUR_STRENGTH,
    // Exposed so a caller can explain WHY nothing can be previewed: in disk mode
    // there is no safe blurred copy to serve, and that is a deployment fact rather
    // than a permission one.
    canBlurAtAll: () => useCloudinary
};
