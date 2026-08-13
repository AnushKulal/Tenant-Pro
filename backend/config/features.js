// File: backend/config/features.js
//
// Switches that turn a whole feature off without a deploy.
//
// There is one so far: guest access. It exists because "join as a guest" is a
// judgement call, not a fact — a landlord running a PG with weekly churn wants it, and
// a landlord with four long-term tenants does not. Rather than argue the question in
// code, it is one environment variable.
//
// ── Why this is not a boolean ──────────────────────────────────────────────────
// A guest has no email and no password (schema.sql: both columns are nullable for
// exactly this reason), so there is no password reset and no recovery path. Their whole
// credential is a six-character code plus a phone number. Turning guest access off with
// a single boolean would therefore lock out every guest already living in a property the
// moment they reinstalled the app or changed phone — people who are paying rent, whose
// documents are on file, and who did nothing wrong.
//
// So there are three states, and the middle one is the one an operator actually reaches
// for: stop taking new guests, do not strand the ones already inside.
//
//   on          new guests welcome, existing guests sign in
//   login-only  NO new guests, existing guests still sign in         (wind it down)
//   off         nothing guest-related works at all                   (DEFAULT)
//
// The default is OFF, because the guest flow has been withdrawn from the app. That
// direction matters: the screens are gone, so if the server still accepted guest joins
// the only things that could reach it would be an old build or a hand-made API call —
// creating accounts with no way to sign into them. A withdrawn feature should be shut at
// both ends.
//
// Turning it back on is one variable, and 'login-only' is what to reach for if guests
// ever need reinstating for existing residents only.
const RAW = () => String(process.env.GUEST_ACCESS_ENABLED || '').trim().toLowerCase();

// Read at CALL time, never captured in a module-scope const. server.js requires
// dotenv/config on its first line, but this file could be required by something loaded
// earlier, and a const evaluated before dotenv ran would read undefined — pinning the
// answer before the environment was even loaded. It happens to fail closed now, but it
// would silently ignore an operator who later set the variable to turn guests back on.
const guestAccessMode = () => {
    const v = RAW();
    if (v === 'true' || v === '1' || v === 'on' || v === 'yes') return 'on';
    if (v === 'login-only' || v === 'loginonly' || v === 'closing') return 'login-only';
    // Unset, empty, or anything unrecognised is OFF. Fail closed: a typo in a variable
    // that re-enables a withdrawn feature is far worse than a typo that leaves it shut.
    return 'off';
};

// Deliberately NOT written as `!== 'false'`. That shape appears in dbOptions.js for
// DB_SSL and is right there, but inverted here it would read GUEST_ACCESS_ENABLED=off
// as ON — a kill switch that silently ignores the two spellings an operator is most
// likely to type.
const guestJoinEnabled = () => guestAccessMode() === 'on';
const guestLoginEnabled = () => guestAccessMode() !== 'off';

// One code, so every refusal across both guest routes is recognisable by the app with a
// single branch rather than by matching on message text.
const GUEST_ACCESS_DISABLED = 'GUEST_ACCESS_DISABLED';

// Called once at boot. An invisible kill switch is the one that gets left on by
// accident, so a non-default state says so in the log next to everything else.
const logFeatures = () => {
    const mode = guestAccessMode();
    if (mode === 'on') console.log('🎟️  Guest access: OPEN — new guests may join. (Withdrawn from the app by default.)');
    else if (mode === 'login-only') console.log('🎟️  Guest access: LOGIN ONLY — no new guests; existing guest IDs still work.');
    // `off` is the default and says nothing: a log line for the normal state is noise.
};

module.exports = {
    guestAccessMode,
    guestJoinEnabled,
    guestLoginEnabled,
    GUEST_ACCESS_DISABLED,
    logFeatures
};
