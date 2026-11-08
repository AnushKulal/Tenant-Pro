// File: backend/controllers/appVersionController.js
//
// "Is there a newer app than the one I am running?"
//
// ── Why the server has to answer this ────────────────────────────────────────
//
// The app can already update ITSELF when the change is JavaScript: expo-updates
// fetches a new bundle and restarts. That covers most releases.
//
// It cannot do that when the change is NATIVE — a new permission, a new library,
// a version bump. That needs a new APK, installed through Android's package
// installer from the store or a link. An app that downloads and installs its own
// replacement is the behaviour every store rejects, so the app's only honest
// options are to notice and to say so.
//
// And it cannot notice on its own. A phone running 1.4.0 has no way to learn
// that 1.5.0 exists; the update server only ever offers it bundles built for its
// own runtime. Something has to tell it, and that something is here.
//
// ── Why the comparison is done HERE and not in the app ───────────────────────
//
// Because of what this feature is for. If the comparison lived in the app and
// got it wrong — nagging everybody for ever, or never firing — the fix would
// have to reach phones through exactly the mechanism that is broken. Here, it
// is a server deploy.
//
// The app therefore sends the version it is running and renders the verdict it
// is given. It does not second-guess the answer, and when it cannot get one it
// shows nothing: silence is the right failure for a notice nobody asked for.
//
// ── Configuring it ───────────────────────────────────────────────────────────
//
//   APP_LATEST_VERSION   the newest build in the store, e.g. "1.5.0"
//   APP_DOWNLOAD_URL     where to get it (Play listing, or a release link)
//   APP_MIN_VERSION      optional: below this, the update is not optional
//   APP_UPDATE_NOTES     optional: what is in it, one line each (\n separated)
//
// With APP_LATEST_VERSION unset this endpoint reports that nothing is available,
// whatever the caller is running. That is deliberate: an unconfigured server
// must not produce a banner on every phone, so the default is silence rather
// than a guess.

// Compare two dotted version strings.
//
// Returns 1 if a > b, -1 if a < b, 0 if equal or either is unreadable.
//
// Deliberately small, and deliberately NOT a semver library:
//   · segments compare as NUMBERS, so 1.10.0 beats 1.9.0 — the single most
//     common way a hand-rolled version compare is wrong, because "1.10.0" sorts
//     before "1.9.0" as a string;
//   · a missing segment counts as 0, so "1.4" and "1.4.0" are the same version;
//   · anything after a "-" or "+" is ignored, so "1.5.0-beta.2" orders as
//     "1.5.0". A pre-release is not something to push at everybody anyway, and
//     treating it as the release it precedes is the conservative reading;
//   · anything non-numeric makes the whole comparison 0 — "cannot tell" — which
//     callers below turn into "no update". An unreadable version must never be
//     read as "newer than yours".
const compareVersions = (a, b) => {
    const clean = (v) => String(v == null ? '' : v).trim().split(/[-+]/)[0];
    const pa = clean(a).split('.');
    const pb = clean(b).split('.');
    if (!clean(a) || !clean(b)) return 0;
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i += 1) {
        const x = pa[i] === undefined || pa[i] === '' ? 0 : Number(pa[i]);
        const y = pb[i] === undefined || pb[i] === '' ? 0 : Number(pb[i]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
        if (x > y) return 1;
        if (x < y) return -1;
    }
    return 0;
};

const notesFrom = (raw) => String(raw || '')
    .split('\n')
    .map((l) => l.trim().replace(/^[-•*]\s*/, ''))
    .filter(Boolean)
    .slice(0, 6);

// What the server is configured to say, independent of who is asking.
const storeRelease = () => ({
    latest: String(process.env.APP_LATEST_VERSION || '').trim() || null,
    minimum: String(process.env.APP_MIN_VERSION || '').trim() || null,
    url: String(process.env.APP_DOWNLOAD_URL || '').trim() || null,
    notes: notesFrom(process.env.APP_UPDATE_NOTES)
});

/**
 * GET /api/app/version?current=1.4.0
 *
 * Public and unauthenticated on purpose: somebody on a build too old to sign in
 * is exactly who most needs to be told to update.
 */
const getAppVersion = (req, res) => {
    const rel = storeRelease();
    const current = String(req.query.current || '').trim();

    // Nothing configured, or a caller that did not say what it is running.
    // Either way there is no comparison to make, and "no update" is the only
    // honest answer.
    if (!rel.latest || !current) {
        return res.status(200).json({
            updateAvailable: false,
            mandatory: false,
            current: current || null,
            latest: rel.latest,
            url: rel.url,
            notes: [],
            // Named so a misconfiguration is visible from the endpoint itself
            // rather than inferred from a banner that never appears.
            reason: !rel.latest ? 'no-latest-configured' : 'no-current-supplied'
        });
    }

    const cmp = compareVersions(rel.latest, current);
    const available = cmp === 1;
    // Below the minimum the update stops being a suggestion. Still only a
    // stronger notice — the app cannot install it either way, so blocking the
    // screen would strand somebody rather than help them.
    const mandatory = available && !!rel.minimum && compareVersions(rel.minimum, current) === 1;

    res.status(200).json({
        updateAvailable: available,
        mandatory,
        current,
        latest: rel.latest,
        url: rel.url,
        notes: available ? rel.notes : [],
        reason: available ? 'newer-available' : (cmp === 0 ? 'same-or-unreadable' : 'current-is-newer')
    });
};

module.exports = { getAppVersion, compareVersions, storeRelease };
