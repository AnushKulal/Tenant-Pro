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
// ── Two tokens, and why ───────────────────────────────────────────────────────
//
// SESSION_TTL below is the ACCESS token: the one every request carries. It used to be
// the only token, and it had one fatal property — nothing could cancel it. The server
// checks a signature and nothing else, so there is no list anywhere of "tokens that
// are still valid". A stolen phone, a tenant who moved out, a password change: none of
// them could end a session. It simply ran its thirty days.
//
// So a session now also has a REFRESH token, which is a random string stored (hashed)
// in the `sessions` table. Its only job is to mint new access tokens. Because it is a
// ROW, it can be deleted — and deleting it is what "sign out everywhere", "this phone
// was stolen" and "I changed my password" all become.
//
// ── Why the access token got shorter, but not much shorter ───────────────────
// The textbook answer is fifteen minutes. The textbook is optimising for the stolen
// token; this app's users have spent the last month being logged out for no reason,
// and every minute of access-token life is a minute the refresh path does NOT have to
// work perfectly. Two hours, with the renewal already in place, means an active user
// never touches the refresh path at all — it exists for the app being opened after a
// gap, and for revocation.
//
// What that buys, stated honestly: revocation is IMMEDIATE on the refresh path and
// lags by at most the access token's life — two hours — on the access path. Making it
// instant would mean a database lookup on every single authenticated request, which is
// the cost essentially nobody pays. Two hours instead of thirty days is the win.
const SESSION_TTL = '2h';

// How long a refresh token is good for. Generous on purpose: this is the number that
// decides when somebody who has not opened the app in a while has to type their
// password again, and for an app opened when rent is due, "a while" is months.
const REFRESH_TTL_DAYS = 60;

// A guest's refresh token outlives an ordinary one for the same reason their session
// always did — see the note on GUEST_SESSION_TTL below.
const GUEST_REFRESH_TTL_DAYS = 120;

// A guest has no password and no email, so being signed out is not an
// inconvenience — it is the end of their access to their own tenancy, with no
// reset to ask for. Kept far longer than an ordinary session for that reason; the
// full argument is at the top of controllers/guestController.js.
// The guest ACCESS token. Same two hours as everybody else now — the thing that kept
// a guest signed in for ninety days is their refresh token, above, which is where that
// lifetime belongs. An access token's length is about theft exposure and nothing else.
const GUEST_SESSION_TTL = '2h';

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

module.exports = {
    SESSION_TTL,
    GUEST_SESSION_TTL,
    REFRESH_TTL_DAYS,
    GUEST_REFRESH_TTL_DAYS,
    RENEW_AFTER_FRACTION,
    SESSION_HEADER
};
