// File: tests/appversion.test.js
//
// Does the app know a newer BUILD exists?
//
// The app updates itself when the change is JavaScript. When the change is
// native it cannot — that needs a new APK through the store — so all it can do
// is notice and say so. It cannot notice on its own either: a phone on 1.4.0
// has no way to learn 1.5.0 exists. The server tells it.
//
// The comparison lives on the server precisely so a mistake in it is fixable by
// deploying, rather than through the update mechanism that is already broken.
// Which makes this file the place that mistake has to be caught.
//
// The failure that matters most is the quiet one: a bad compare either nags
// every phone for ever, or never fires at all, and nobody notices the second
// one until a release goes nowhere.
//
//   node tests/appversion.test.js
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
    if (c) { pass += 1; console.log(`  ok   ${n}`); }
    else { fail += 1; console.log(`  FAIL ${n}${extra !== '' ? '  -> ' + JSON.stringify(extra) : ''}`); }
};
const section = (s) => console.log('\n' + s);

const MOD = path.join(__dirname, '..', 'backend', 'controllers', 'appVersionController.js');
const { compareVersions } = require(MOD);

// Drive the handler without a server.
const callWith = (env, query) => {
    const saved = {};
    for (const k of Object.keys(env)) { saved[k] = process.env[k]; process.env[k] = env[k]; }
    delete require.cache[require.resolve(MOD)];
    const { getAppVersion } = require(MOD);
    let body = null;
    getAppVersion({ query: query || {} }, { status() { return this; }, json(j) { body = j; return this; } });
    for (const k of Object.keys(env)) {
        if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    }
    delete require.cache[require.resolve(MOD)];
    return body;
};

console.log('='.repeat(60));
console.log('IS THERE A NEWER BUILD?');
console.log('='.repeat(60));

section('THE COMPARISON ITSELF');
ok('a higher patch is newer', compareVersions('1.4.1', '1.4.0') === 1);
ok('a higher minor is newer', compareVersions('1.5.0', '1.4.9') === 1);
ok('a higher major is newer', compareVersions('2.0.0', '1.9.9') === 1);
ok('equal is equal', compareVersions('1.4.0', '1.4.0') === 0);
ok('older is older', compareVersions('1.4.0', '1.5.0') === -1);

// The single most common way a hand-rolled version compare is wrong: as
// strings, "1.10.0" sorts BEFORE "1.9.0", so a release at 1.10.0 would reach
// nobody and nothing would look broken.
ok('1.10.0 is newer than 1.9.0, not older', compareVersions('1.10.0', '1.9.0') === 1,
    compareVersions('1.10.0', '1.9.0'));
ok('...and 1.9.0 is older than 1.10.0', compareVersions('1.9.0', '1.10.0') === -1);
ok('2.0.0 beats 1.100.100', compareVersions('2.0.0', '1.100.100') === 1);

section('RAGGED AND ODD VERSIONS');
ok('a missing segment counts as zero', compareVersions('1.4', '1.4.0') === 0);
ok('...both ways round', compareVersions('1.4.0', '1.4') === 0);
ok('1.4.1 beats 1.4', compareVersions('1.4.1', '1.4') === 1);
ok('a pre-release orders as its release', compareVersions('1.5.0-beta.2', '1.5.0') === 0);
ok('...and still beats an older release', compareVersions('1.5.0-beta.2', '1.4.0') === 1);
ok('build metadata is ignored', compareVersions('1.4.0+build99', '1.4.0') === 0);

section('AN UNREADABLE VERSION IS NEVER "NEWER"');
// Treating garbage as newer is the failure that nags every phone for ever.
for (const bad of ['', null, undefined, 'latest', 'v1.4.0', '1.x.0', 'nineteen']) {
    ok(`${JSON.stringify(bad)} compares as "cannot tell"`,
        compareVersions(bad, '1.4.0') === 0 && compareVersions('1.4.0', bad) === 0,
        [compareVersions(bad, '1.4.0'), compareVersions('1.4.0', bad)]);
}

section('WITH NOTHING CONFIGURED, IT SAYS NOTHING');
{
    const r = callWith({ APP_LATEST_VERSION: '', APP_DOWNLOAD_URL: '', APP_MIN_VERSION: '' }, { current: '1.4.0' });
    ok('no update is announced', r.updateAvailable === false, r);
    ok('...and it names why, so a misconfiguration is findable',
        r.reason === 'no-latest-configured', r);
}
{
    const r = callWith({ APP_LATEST_VERSION: '1.9.0' }, {});
    ok('a caller that does not say what it runs gets no verdict',
        r.updateAvailable === false && r.reason === 'no-current-supplied', r);
}

section('WITH A NEWER BUILD ANNOUNCED');
{
    const r = callWith({
        APP_LATEST_VERSION: '1.5.0',
        APP_DOWNLOAD_URL: 'https://example.com/app',
        APP_UPDATE_NOTES: '- Faster rent screen\n- Fixes the landlord signup\n'
    }, { current: '1.4.0' });
    ok('an update is announced', r.updateAvailable === true, r);
    ok('...with somewhere to get it', r.url === 'https://example.com/app', r);
    ok('...and what is in it', Array.isArray(r.notes) && r.notes.length === 2, r.notes);
    ok('...with the bullet markers stripped', r.notes[0] === 'Faster rent screen', r.notes);
    ok('...and it is not mandatory without a minimum', r.mandatory === false, r);
}

section('THE SAME VERSION, AND NEWER-THAN-ANNOUNCED');
{
    const r = callWith({ APP_LATEST_VERSION: '1.4.0' }, { current: '1.4.0' });
    ok('the current version is not an update', r.updateAvailable === false, r);
    ok('...and no notes are sent for an update that is not happening',
        r.notes.length === 0, r.notes);
}
{
    // Somebody running a build newer than the server knows about — a tester, or
    // a server whose env was never bumped. They must not be told to downgrade.
    const r = callWith({ APP_LATEST_VERSION: '1.4.0' }, { current: '1.6.0' });
    ok('a tester ahead of the store is left alone',
        r.updateAvailable === false && r.reason === 'current-is-newer', r);
}

section('A MINIMUM MAKES IT MORE THAN A SUGGESTION');
{
    const r = callWith({ APP_LATEST_VERSION: '1.5.0', APP_MIN_VERSION: '1.5.0' }, { current: '1.4.0' });
    ok('below the minimum, the update is mandatory', r.mandatory === true, r);
}
{
    const r = callWith({ APP_LATEST_VERSION: '1.6.0', APP_MIN_VERSION: '1.5.0' }, { current: '1.5.0' });
    ok('at the minimum, it is only a suggestion',
        r.updateAvailable === true && r.mandatory === false, r);
}
{
    const r = callWith({ APP_LATEST_VERSION: '1.4.0', APP_MIN_VERSION: '9.9.9' }, { current: '1.4.0' });
    // A minimum above the latest release is a misconfiguration. It must not
    // make an update mandatory that does not exist — there would be nothing to
    // install.
    ok('a minimum above the latest cannot make a non-existent update mandatory',
        r.updateAvailable === false && r.mandatory === false, r);
}

section('A GARBLED CONFIGURATION DOES NOT NAG EVERYBODY');
{
    const r = callWith({ APP_LATEST_VERSION: 'latest' }, { current: '1.4.0' });
    ok('an unreadable latest version announces nothing',
        r.updateAvailable === false, r);
}
{
    const r = callWith({ APP_LATEST_VERSION: '1.5.0' }, { current: 'not-a-version' });
    ok('an unreadable current version announces nothing',
        r.updateAvailable === false, r);
}

console.log('\n' + '='.repeat(60));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
