// Encryption at rest for somebody else's gateway credentials.
const { execFileSync } = require('child_process');
const B = '/home/user/Tenant-Pro/backend/';
let ok = 0, bad = 0;
const chk = (n, c, got) => { if (c) { ok++; console.log('  ok   ' + n); } else { bad++; console.log('  FAIL ' + n + '  -> ' + JSON.stringify(got)); } };

const KEY = 'a'.repeat(64);
const KEY2 = 'b'.repeat(64);
// Fresh child per key: the module reads the environment at call time, but a child
// keeps each case honest about what was configured.
const run = (env, script) => JSON.parse(execFileSync('node', ['-e', `
  const sb = require('${B}utils/secretBox.js');
  console.log('@@' + JSON.stringify((${script})(sb)));
`], { env: { ...process.env, CREDENTIALS_KEY: '', ...env }, encoding: 'utf8' }).split('@@').pop().trim());

const SECRET = 'rzp_test_SECRETVALUE1234567890';

console.log('A SEALED SECRET IS NOT THE SECRET');
let r = run({ CREDENTIALS_KEY: KEY }, `(sb) => { const s = sb.seal('${SECRET}'); return { s, opened: sb.open(s) }; }`);
chk('it opens back to the original', r.opened === SECRET, r.opened);
chk('...and the stored form is not the plaintext', !r.s.includes(SECRET), r.s.slice(0, 30));
chk('...and does not contain a recognisable chunk of it', !r.s.includes('SECRETVALUE'), r.s.slice(0, 30));
chk('...it is iv:tag:ciphertext', r.s.split(':').length === 3, r.s.split(':').length);

console.log('\nTHE SAME SECRET SEALS DIFFERENTLY EVERY TIME');
// A deterministic ciphertext would let anyone with the table see which landlords
// share a key, and would leak that a key had NOT changed after a rotation.
r = run({ CREDENTIALS_KEY: KEY }, `(sb) => [sb.seal('${SECRET}'), sb.seal('${SECRET}')]`);
chk('two seals of one value differ', r[0] !== r[1], [r[0].slice(0, 20), r[1].slice(0, 20)]);

console.log('\nTHE WRONG KEY DOES NOT OPEN IT');
r = run({ CREDENTIALS_KEY: KEY }, `(sb) => sb.seal('${SECRET}')`);
const sealed = r;
const withOtherKey = run({ CREDENTIALS_KEY: KEY2 }, `(sb) => ({ opened: sb.open(${JSON.stringify(sealed)}) })`);
chk('a different key returns null, not rubbish', withOtherKey.opened === null, withOtherKey.opened);

console.log('\nTAMPERING IS DETECTED, NOT DECRYPTED');
// GCM authenticates. Without that, a flipped byte would decrypt to garbage that then
// gets sent to a payment gateway as if it were a key.
const parts = sealed.split(':');
const flipped = `${parts[0]}:${parts[1]}:${parts[2].slice(0, -2)}${parts[2].slice(-2) === 'ff' ? '00' : 'ff'}`;
r = run({ CREDENTIALS_KEY: KEY }, `(sb) => ({ opened: sb.open(${JSON.stringify(flipped)}) })`);
chk('a flipped ciphertext byte fails to open', r.opened === null, r.opened);
const badTag = `${parts[0]}:${'0'.repeat(32)}:${parts[2]}`;
r = run({ CREDENTIALS_KEY: KEY }, `(sb) => ({ opened: sb.open(${JSON.stringify(badTag)}) })`);
chk('a forged auth tag fails to open', r.opened === null, r.opened);

console.log('\nMALFORMED INPUT NEVER THROWS');
// open() runs inside a request a tenant is waiting on; a crash there is worse than a
// null the caller already knows how to report.
for (const junk of ['', 'not-sealed', 'a:b', 'a:b:c:d', ':::', 'zz:zz:zz']) {
    r = run({ CREDENTIALS_KEY: KEY }, `(sb) => ({ opened: sb.open(${JSON.stringify(junk)}) })`);
    chk(`"${junk}" returns null`, r.opened === null, r.opened);
}

console.log('\nNO KEY MEANS THE FEATURE IS SIMPLY OFF');
r = run({}, `(sb) => ({ ready: sb.secretsReady(), why: sb.secretsProblem(), opened: sb.open(${JSON.stringify(sealed)}) })`);
chk('not ready', r.ready === false, r.ready);
chk('...and says which variable is missing', /CREDENTIALS_KEY/.test(r.why), r.why);
chk('...and opening returns null rather than throwing', r.opened === null, r.opened);
// Sealing must refuse loudly: silently storing plaintext would be the worst outcome.
r = run({}, `(sb) => { try { sb.seal('x'); return { threw: false }; } catch (e) { return { threw: true, msg: e.message }; } }`);
chk('sealing without a key REFUSES', r.threw === true, r);
chk('...rather than storing plaintext', /not configured/i.test(r.msg || ''), r.msg);

console.log('\nA BAD KEY IS REFUSED, NOT STRETCHED');
// A short key that "works" by being padded is a weak key nobody notices.
r = run({ CREDENTIALS_KEY: 'tooshort' }, `(sb) => ({ ready: sb.secretsReady(), why: sb.secretsProblem() })`);
chk('a short key is not accepted', r.ready === false, r.ready);
chk('...and the reason names the format', /64 hex/.test(r.why), r.why);
r = run({ CREDENTIALS_KEY: 'z'.repeat(64) }, `(sb) => ({ ready: sb.secretsReady() })`);
chk('64 non-hex characters are refused', r.ready === false, r.ready);

console.log('\nTHE HINT RECOGNISES WITHOUT REVEALING');
r = run({ CREDENTIALS_KEY: KEY }, `(sb) => ({ h: sb.hint('${SECRET}') })`);
chk('shows only the last four', r.h === '••••7890', r.h);
chk('...and nothing else of the key', !r.h.includes('SECRET'), r.h);

console.log(`\n${ok} ok, ${bad} failed`);
process.exit(bad ? 1 : 0);
