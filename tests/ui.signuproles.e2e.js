// File: tests/ui.signuproles.e2e.js
//
// A landlord and a tenant are not signing up for the same thing.
//
// Reported as "the mobile application is using the same create account in
// landlord portal and the tenant portal". It is: there is one route, `signup`,
// one screen, CreateAccountScreen, and one set of four fields. The app already
// knows which role it is — `goSignup` records `signupRole` from the login screen
// you came from, and `register()` reads it to pick the right endpoint — but the
// screen itself never looks at it.
//
// The sharpest way to see it is the age question. "HOW OLD ARE YOU? 18 OR OVER /
// UNDER 18", with the note "You can sign your own agreement and pay rent
// directly", is a question about a TENANT's capacity to hold a tenancy. It is
// asked of landlords too, because there is only one screen to ask it from.
//
// (Sign-IN is already two screens, OwnerLoginScreen and TenantLoginScreen. It is
// only account CREATION that is shared.)
//
// This file asserts the difference rather than the fields, so it stays true while
// the field lists are still being decided:
//   · the landlord's form must not ask a tenant's questions;
//   · each form must say which account it is making, because arriving at an
//     unlabelled form after picking a role is how people sign up to the wrong
//     portal — and the two are mutually exclusive by email AND by phone, so
//     undoing it means a different address, not a setting;
//   · the two must actually differ.
//
//   UI_URL=http://127.0.0.1:8080 node tests/ui.signuproles.e2e.js
const { chromium } = require('playwright');
const fs = require('fs');

const UI_URL = process.env.UI_URL || 'http://127.0.0.1:8080';
const SHOT = __dirname + '/rolesignupshots';
fs.mkdirSync(SHOT, { recursive: true });

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  if (c) { pass += 1; console.log(`  PASS  ${n}`); }
  else { fail += 1; console.log(`  FAIL  ${n}${extra ? '  <- ' + extra : ''}`); }
};

const body = (page) => page.locator('body').innerText();

const clickLoose = async (page, label, wait = 900) => {
  const el = page.locator(`text=${label}`).first();
  if (await el.count() && await el.isVisible().catch(() => false)) {
    await el.click({ timeout: 5000 }).catch(async () => { await el.click({ force: true }).catch(() => {}); });
    await page.waitForTimeout(wait);
    return true;
  }
  return false;
};

const clickExact = async (page, label, wait = 900) => {
  const el = page.getByText(label, { exact: true }).first();
  if (await el.count() && await el.isVisible().catch(() => false)) {
    await el.click({ timeout: 5000 }).catch(async () => { await el.click({ force: true }).catch(() => {}); });
    await page.waitForTimeout(wait);
    return true;
  }
  return false;
};

// Walk a fresh browser profile as far as one role's Create account form.
const signupFormFor = async (b, role) => {
  const ctx = await b.newContext({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 140)));

  await page.goto(UI_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  await clickLoose(page, 'SKIP', 800);
  await page.mouse.move(210, 600);
  for (let i = 0; i < 12; i += 1) { await page.mouse.wheel(0, 900); await page.waitForTimeout(110); }
  await clickLoose(page, 'Not now', 1300);
  await clickLoose(page, role === 'tenant' ? "I'm a tenant" : "I'm a landlord", 1400);
  // Exact: the login screen's own heading is "OWNER SIGN IN" / "TENANT SIGN IN",
  // and the link under the form is "Create account".
  const went = await clickExact(page, 'Create account', 1800);
  return { page, errs, went, ctx };
};

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });

  console.log('='.repeat(62));
  console.log('TWO ROLES, TWO FORMS');
  console.log('='.repeat(62));

  console.log('\nTHE LANDLORD FORM');
  const L = await signupFormFor(b, 'owner');
  ok('the landlord can reach a create-account form', L.went);
  const lt = L.went ? await body(L.page) : '';
  await L.page.screenshot({ path: `${SHOT}/01-landlord-signup.png`, fullPage: true });
  ok('it says which account it is making', /landlord|owner|property|your places/i.test(lt), lt.slice(0, 220));
  // The one that proves the screens are shared rather than merely similar.
  ok('it does NOT ask a tenant’s age question',
    !/HOW OLD ARE YOU/i.test(lt),
    'the under-18 question is about holding a tenancy, not about owning property');
  ok('...nor tell a landlord they can pay rent directly',
    !/pay rent directly/i.test(lt), (lt.match(/.{0,50}pay rent directly.{0,30}/i) || [])[0]);

  console.log('\nTHE TENANT FORM');
  const T = await signupFormFor(b, 'tenant');
  ok('the tenant can reach a create-account form', T.went);
  const tt = T.went ? await body(T.page) : '';
  await T.page.screenshot({ path: `${SHOT}/02-tenant-signup.png`, fullPage: true });
  ok('it says which account it is making', /tenant|renting|your place|move in/i.test(tt), tt.slice(0, 220));
  ok('it DOES ask the age question, which is a tenant question',
    /HOW OLD ARE YOU/i.test(tt), tt.slice(0, 220));

  console.log('\nAND THEY ARE NOT THE SAME FORM');
  // Compared on the words, not on a screenshot: two screens that differ only by
  // a heading would still be the bug.
  const same = lt.trim() === tt.trim();
  ok('the two forms are not identical', !same, 'character-for-character the same screen');

  const lFields = (lt.match(/FULL NAME|EMAIL|MOBILE|PASSWORD|PAN|UPI|ADDRESS|CITY|PIN|WORK|EMPLOYER|OCCUPATION/gi) || []).map(s => s.toUpperCase());
  const tFields = (tt.match(/FULL NAME|EMAIL|MOBILE|PASSWORD|PAN|UPI|ADDRESS|CITY|PIN|WORK|EMPLOYER|OCCUPATION/gi) || []).map(s => s.toUpperCase());
  console.log(`        landlord asks: ${[...new Set(lFields)].join(', ') || '(none found)'}`);
  console.log(`        tenant   asks: ${[...new Set(tFields)].join(', ') || '(none found)'}`);
  ok('the two forms ask different things',
    JSON.stringify([...new Set(lFields)].sort()) !== JSON.stringify([...new Set(tFields)].sort()),
    'same field set on both');

  console.log('\nTHE UNDER-18 PATH MUST NOT PROMISE WHAT IT DOES NOT DO');
  // Picking UNDER 18 raises a "GUARDIAN REQUIRED" card, changes the button to
  // "Send for guardian consent", and says a guardian will be texted a link.
  //
  // Nothing is collected and nothing is sent. The guardian rows are static text
  // (`value: 'Required'`, `'Parent · Guardian · Warden'`, `'Upload a signed
  // copy'`), the button calls the same api.register() as the adult path, and the
  // backend has no notion of a guardian or a consent at all. A minor who picks it
  // gets an ordinary account and a sentence that is not true.
  //
  // That matters beyond tidiness: a minor cannot hold a tenancy in their own
  // right, so this is the one place on the form where the wrong answer has a
  // legal consequence.
  const before = await T.page.locator('input').count();
  const picked = await clickExact(T.page, 'UNDER 18', 1400);
  ok('UNDER 18 can be selected', picked);
  const mt = await body(T.page);
  const after = await T.page.locator('input').count();
  await T.page.screenshot({ path: `${SHOT}/03-tenant-under-18.png`, fullPage: true });
  const claimsGuardian = /guardian|warden/i.test(mt);
  const promisesToSend = /consent link|we will text|send for guardian/i.test(mt);
  console.log(`        inputs before ${before}, after ${after}; promises to send: ${promisesToSend}`);
  if (claimsGuardian) {
    ok('...and asking for a guardian actually asks for one',
      after > before,
      `the guardian card appeared but added no fields (${before} inputs before, ${after} after)`);
  }
  ok('...and nothing promises a message the app cannot send',
    !promisesToSend || after > before,
    'the screen says a guardian will be texted a consent link; nothing collects their number');

  console.log('\nNOTHING THREW');
  const errs = [...L.errs, ...T.errs];
  ok('no runtime errors on either form', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log('Screenshots: ' + SHOT);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
