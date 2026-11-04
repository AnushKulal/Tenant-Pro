// File: mobile/src/redesign/buildinfo.js
//
// What am I actually running?
//
// This exists because of a real failure that cost days. Build 17 was compiled when
// `runtimeVersion` was the literal string "1.0.0". Every update published afterwards
// carried runtime "1.3.0". An installed app only accepts updates whose runtime
// version matches its own, so build 17 asked the update server for "1.0.0", was
// correctly told there was nothing, and stayed silent — no popup, no error, no clue.
// Meanwhile every publish was green. Features were shipped, confirmed published, and
// simply never arrived, and nobody could tell because the app displayed no version
// anywhere at all.
//
// The runtime version is the single number that explains that class of problem, so it
// is now on screen. `describeBuild` is separated from `readBuild` for the usual
// reason: the interesting logic is the wording, and testing it must not require the
// native modules to exist.
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

// Everything worth knowing, as plain strings. Written so a missing value reads as a
// missing value — a blank where a version should be is itself the diagnosis.
export function describeBuild(raw = {}) {
    const version = String(raw.version || '').trim();
    const runtime = String(raw.runtime || '').trim();
    const channel = String(raw.channel || '').trim();
    const updateId = String(raw.updateId || '').trim();
    const embedded = !!raw.embedded;
    const createdAt = raw.createdAt || null;

    const day = (() => {
        if (!createdAt) return '';
        const d = createdAt instanceof Date ? createdAt : new Date(createdAt);
        if (Number.isNaN(d.getTime())) return '';
        const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
    })();

    return {
        // "1.3.0 · runtime 1.3.0". Both, because they are usually equal and the one
        // time they differ is the one time it matters.
        versionLine: [version ? `v${version}` : 'version unknown', runtime ? `runtime ${runtime}` : 'runtime unknown']
            .join(' · '),
        version,
        runtime,
        channel: channel || '',
        // Which bundle is executing. `embedded` means the JS that was compiled into
        // the APK; anything else means a downloaded update replaced it. That is the
        // difference between "the update never arrived" and "the update arrived and
        // the feature still is not there", which are two completely different bugs.
        bundleLine: embedded
            ? "Running this build's own bundle — no update applied yet"
            : day
                ? `Running an update from ${day}`
                : updateId
                    ? 'Running a downloaded update'
                    // Nothing said either way. Claiming "a downloaded update" here
                    // would be a guess dressed as a fact, and this line exists
                    // precisely so that guessing stops.
                    : 'Bundle source unknown',
        embedded,
        // Short and copyable. The full id is a UUID and unreadable on a phone; the
        // first segment is enough to match against a publish log.
        updateShort: updateId ? updateId.split('-')[0] : '',
        updateId,
        hasUpdate: !!updateId,
        // Development has no update machinery at all, so saying "no update applied"
        // there would be a lie about a build that cannot have one.
        dev: !!raw.dev
    };
}

// Gather the same fields from the native modules. Every read is defensive: in Expo Go,
// in development, and in a web export these are variously absent, and a settings
// screen must not be the thing that crashes the app.
export function readBuild() {
    const cfg = (Constants && Constants.expoConfig) || {};
    let u = {};
    try {
        u = {
            runtime: Updates.runtimeVersion,
            channel: Updates.channel,
            updateId: Updates.updateId,
            createdAt: Updates.createdAt,
            // isEmbeddedLaunch is the honest source for "did an update replace the
            // bundle" — updateId is also set for the embedded manifest on some
            // versions, so it cannot carry that meaning on its own.
            embedded: Updates.isEmbeddedLaunch !== false && !Updates.updateId
        };
    } catch (e) {
        u = {};
    }
    return describeBuild({
        version: cfg.version,
        runtime: u.runtime,
        channel: u.channel,
        updateId: u.updateId,
        createdAt: u.createdAt,
        embedded: u.embedded,
        dev: typeof __DEV__ !== 'undefined' && __DEV__
    });
}
