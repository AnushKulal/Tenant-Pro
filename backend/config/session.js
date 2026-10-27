// File: backend/config/session.js
//
// How long a signed-in session lasts.
//
// ── Why this is one constant and not a string in five files ───────────────────
// Four controllers mint session tokens — owner login, tenant login, tenant
// registration and the Google handshake — and a fifth picks between two lifetimes
// for guests. Every one of them wrote '7d' by hand, which means the real answer to
// "how long does a session last" was five answers that happened to agree. The
// moment one is changed and the others are not, a user's session length depends on
// which door they came in through, and nothing anywhere would say so.
//
// ── Why 30 days ───────────────────────────────────────────────────────────────
// It was 7. For an app somebody opens when rent is due — monthly — a weekly expiry
// means most sessions are dead before they are next needed, so the ordinary
// experience of the app was being logged out and not knowing why. That is a real
// cost paid by every user, every week, against a benefit that only matters in the
// narrow window where a token has been stolen but the password has not.
//
// Thirty days is not security theatre either way: a stolen token is just as usable
// on day one as on day twenty-nine, so the lifetime bounds how long a theft stays
// useful, not whether it works. The honest fix for that is revocation — a refresh
// token that can be withdrawn — not a short window that logs everyone out weekly
// and still leaves a stolen token good for a week.
const SESSION_TTL = '30d';

// A guest has no password and no email, so being signed out is not an
// inconvenience — it is the end of their access to their own tenancy, with no
// reset to ask for. Kept far longer than an ordinary session for that reason; the
// full argument is at the top of controllers/guestController.js.
const GUEST_SESSION_TTL = '90d';

// ── Why a session that is being USED never expires ────────────────────────────
//
// Raising the lifetime from 7 days to 30 did not fix being logged out. It moved it.
// A fixed lifetime measures from when you last SIGNED IN, which is the one thing that
// has no bearing on whether you are still using the app: somebody who opens TenantPro
// every single morning is signed out on day 30 exactly like somebody who has not
// touched it since February. From inside the app the two are indistinguishable, and
// the frequent user is the one it insults.
//
// So the token is re-issued while it is being used. Past the halfway mark of its life,
// any authenticated request hands back a fresh one, and the app swaps it in. An active
// user therefore never reaches an expiry; a token only runs out after a genuine
// absence of half a lifetime — fifteen days of silence for an ordinary account.
//
// Half rather than, say, nine tenths, because the window has to be wider than the gap
// between two ordinary visits. Rent is monthly. Somebody who opens the app once a
// fortnight is a NORMAL user of this app, not a lapsed one, and a renewal threshold
// tighter than their habit would sign them out for behaving exactly as expected.
//
// ── What this is not ──────────────────────────────────────────────────────────
// Not revocation. A stolen token still works until it expires, and renewing it on use
// means a thief who keeps using it keeps it alive — which is the honest cost of this
// trade and the reason refresh tokens with a server-side revocation list are still the
// real answer. What this buys is that the ordinary user, who is not being robbed, is
// not logged out every month for no reason.
const RENEW_AFTER_FRACTION = 0.5;

// The header a renewed token rides back on. Named rather than typed in two files,
// because the client reads the exact string and a typo would silently never renew —
// failing in thirty days' time, as a logout, with nothing to connect it to.
const SESSION_HEADER = 'X-Session-Token';

module.exports = { SESSION_TTL, GUEST_SESSION_TTL, RENEW_AFTER_FRACTION, SESSION_HEADER };
