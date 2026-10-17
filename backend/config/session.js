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

module.exports = { SESSION_TTL, GUEST_SESSION_TTL };
