// File: tests/sample.test.js
//
// The showcase rooms that populate the Find screen on a fresh deployment are not
// real: their landlords cannot sign in, so a request to join one is never
// answered by anybody. They have to say so on screen.
//
// This suite covers the decision underneath that badge — which listings count as
// samples — because it is the kind of rule that is easy to get subtly wrong in a
// direction nobody notices. Marking a sample as real is the failure that matters:
// it puts a tenant in front of a room they can ask about and never hear back on.
// Marking a real landlord as a sample is the opposite failure and is worse for
// that landlord, so both directions are asserted here.
//
//   node tests/sample.test.js
//
// No database, no server, no network.
const { isSample, SAMPLE_DOMAIN } = require('../backend/controllers/discoverController');

let pass = 0, fail = 0;
const ok = (what, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ok   ${what}`); }
    else { fail++; console.log(`  FAIL ${what}${detail ? '  — ' + detail : ''}`); }
};

console.log('sample listing detection');

// --- the seeded landlords, who must all be marked
ok('a seeded showcase landlord is a sample', isSample('anita@showcase.invalid'));
ok('every seeded key is caught', ['anita', 'farhan', 'lakshmi', 'joseph', 'devika', 'harish']
    .every((k) => isSample(`${k}@showcase.invalid`)));
ok('the domain constant is the one the seeder writes', SAMPLE_DOMAIN === '@showcase.invalid');

// --- real landlords, who must never be marked
ok('an ordinary gmail landlord is not a sample', !isSample('someone@gmail.com'));
ok('the demo account is not a sample', !isSample('demo@gmail.com'),
   'the demo landlord CAN sign in and CAN accept a request, so its listing is real');
ok('a company address is not a sample', !isSample('owner@tenantpro.in'));

// --- the near misses, which are where a suffix check goes wrong
ok('a lookalike domain is not a sample', !isSample('x@notshowcase.invalid'),
   'the @ in the constant is what stops this matching');
ok('the domain as a local part is not a sample', !isSample('showcase.invalid@gmail.com'));
ok('a subdomain of it is not a sample', !isSample('x@mail.showcase.invalid'));

// --- shapes the column can actually hold
ok('upper case still matches', isSample('ANITA@SHOWCASE.INVALID'));
ok('mixed case still matches', isSample('Anita@Showcase.Invalid'));
ok('null is not a sample', !isSample(null));
ok('undefined is not a sample', !isSample(undefined));
ok('an empty address is not a sample', !isSample(''));
ok('a non-string does not throw', !isSample(12345));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
