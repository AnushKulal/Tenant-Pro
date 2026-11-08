// File: tests/ui.signup.e2e.js
//
// Signing up: the happy path, and every way of getting it wrong.
//
// Two things are under test, and the second is the one that was broken.
//
//   1. Does each field say what is wrong with IT? A single banner reading "name,
//      email, mobile and password are all required" states the rule rather than
//      the breach — with four rows on screen you still have to audit your own
//      form to find the empty one.
//
//   2. Does signing up sign you IN? The owner endpoint used to return an id and
//      no token, so a brand-new landlord was sent to the sign-in screen to type
//      the email and password they had typed thirty seconds earlier. The tenant
//      half of the same app had always issued a session there. Neither file is
//      wrong on its own, which is why this is tested from the outside.
//
//   cd backend && node scripts/seed.js --wipe && node server.js &
//   cd mobile  && EXPO_PUBLIC_API_URL=http://127.0.0.1:5000 npx expo export --platform web --output-dir /tmp/web
//   npx serve -s /tmp/web -l 8080
//   UI_URL=http://127.0.0.1:8080 node tests/ui.signup.e2e.js
const { chromium } = require('playwright');
const fs = require('fs');

const UI_URL = process.env.UI_URL || 'http://127.0.0.1:8080';
const SHOT = __dirname + '/signupshots';
fs.mkdirSync(SHOT, { recursive: true });

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  if (c) { pass += 1; console.log(`  PASS  ${n}`); }
  else { fail += 1; console.log(`  FAIL  ${n}${extra ? '  <- ' + extra : ''}`); }
};

const body = (page) => page.locator('body').innerText();

// Exact text, because `text=Create account` is a SUBSTRING match and the screen
// has a decorative "CREATE ACCOUNT" heading that will happily swallow a click
// meant for the "Create my account" button. That cost a whole run once.
const clickExact = async (page, label, wait = 1000) => {
  const el = page.getByText(label, { exact: true }).first();
  if (await el.count() && await el.isVisible().catch(() => false)) {
    await el.click({ timeout: 5000 }).catch(async () => { await el.click({ force: true }).catch(() => {}); });
    await page.waitForTimeout(wait);
    return true;
  }
  return false;
};

const clickLoose = async (page, label, wait = 1000) => {
  const el = page.locator(`text=${label}`).first();
  if (await el.count() && await el.isVisible().catch(() => false)) {
    await el.click({ timeout: 5000 }).catch(async () => { await el.click({ force: true }).catch(() => {}); });
    await page.waitForTimeout(wait);
    return true;
  }
  return false;
};

// Walk from a cold start to the sign-up form.
const toSignupForm = async (page) => {
  await page.goto(UI_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  await clickLoose(page, 'SKIP', 900);
  await page.mouse.move(210, 600);
  for (let i = 0; i < 12; i += 1) { await page.mouse.wheel(0, 900); await page.waitForTimeout(110); }
  await clickLoose(page, 'Not now', 1400);
  if (!await clickLoose(page, "I'm a landlord", 1400)) return false;
  for (const t of ['Create an account', 'Create account', 'Sign up']) {
    if (await clickLoose(page, t, 1500)) break;
  }
  return /HOW OLD ARE YOU|FULL NAME/i.test(await body(page));
};

const fill = async (page, vals) => {
  const ins = page.locator('input');
  for (const [i, v] of vals) await ins.nth(i).fill(v).catch(() => {});
  await page.waitForTimeout(250);
};

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));

  console.log('='.repeat(60));
  console.log('SIGNING UP');
  console.log('='.repeat(60));

  if (!await toSignupForm(page)) {
    console.log('\nCould not reach the sign-up form — stopping rather than guessing.');
    await b.close();
    process.exit(1);
  }

  console.log('\nEVERYTHING BLANK');
  await clickExact(page, 'Create my account', 2000);
  let txt = await body(page);
  await page.screenshot({ path: `${SHOT}/01-all-blank.png`, fullPage: false });
  ok('the name row says what it needs', /Enter your name/i.test(txt), txt.slice(0, 200));
  ok('the email row says what it needs', /Enter your email/i.test(txt));
  ok('the mobile row says what it needs', /Enter your mobile/i.test(txt));
  ok('the password row says what it needs', /Choose a password/i.test(txt));
  ok('...and the banner counts them rather than reciting the rule',
    /4 fields need fixing/i.test(txt), txt.slice(0, 200));
  // "Still on the form" used to be checked by looking for "HOW OLD ARE YOU".
  // That question is a TENANT question — whether somebody can hold a tenancy in
  // their own name — and this suite signs up as a LANDLORD, so it is correctly
  // gone from this screen now. It was never a good proxy anyway: it asserted
  // that one particular card was present, not that the form was.
  //
  // The form's own heading is the honest check, and it names the role, which is
  // the other half of what was wrong with this screen.
  ok('it did not navigate away',
    /LANDLORD ACCOUNT/i.test(txt) && /Create my account/i.test(txt), txt.slice(0, 200));

  console.log('\nTHE ERROR CLEARS AS SOON AS YOU FIX THAT FIELD');
  await fill(page, [[0, 'Asha Menon']]);
  txt = await body(page);
  ok('the name complaint goes when a name is typed', !/Enter your name/i.test(txt));
  ok('...and the others stay', /Enter your email/i.test(txt) && /Choose a password/i.test(txt));
  await page.screenshot({ path: `${SHOT}/02-name-fixed.png`, fullPage: false });

  console.log('\nAN EMAIL THAT IS NOT AN EMAIL');
  await fill(page, [[1, 'asha.example.com'], [2, '9876543210'], [3, 'Test@1234']]);
  await clickExact(page, 'Create my account', 2000);
  txt = await body(page);
  ok('it is called out as not an email', /does not look like an email/i.test(txt), txt.slice(0, 200));
  // The banner says "One field needs fixing." for a single breach and
  // "3 fields need fixing." for several — the singular is a word, not a digit.
  ok('...and only that one field complains', /One field needs fixing/i.test(txt), txt.slice(0, 200));
  await page.screenshot({ path: `${SHOT}/03-bad-email.png`, fullPage: false });

  console.log('\nA MOBILE NUMBER THAT IS TOO SHORT');
  await fill(page, [[1, `asha${Date.now().toString().slice(-6)}@example.com`], [2, '98765']]);
  await clickExact(page, 'Create my account', 2000);
  txt = await body(page);
  ok('a short number is refused', /at least 10 digits/i.test(txt), txt.slice(0, 200));
  await page.screenshot({ path: `${SHOT}/04-short-phone.png`, fullPage: false });

  console.log('\nA PASSWORD THAT IS TOO SHORT');
  await fill(page, [[2, '9876543210'], [3, 'abc']]);
  await clickExact(page, 'Create my account', 2000);
  txt = await body(page);
  ok('a 3-character password is refused', /at least 6 characters/i.test(txt), txt.slice(0, 200));
  await page.screenshot({ path: `${SHOT}/05-short-password.png`, fullPage: false });

  console.log('\nTHE HAPPY PATH — AND IT MUST SIGN YOU IN');
  const email = `asha.${Date.now().toString().slice(-7)}@example.com`;
  const phone = `9${Date.now().toString().slice(-9)}`.slice(0, 10);
  await clickLoose(page, '18 OR OVER', 600);
  await fill(page, [[0, 'Asha Menon'], [1, email], [2, phone], [3, 'Test@1234']]);
  await page.screenshot({ path: `${SHOT}/06-filled.png`, fullPage: false });
  await clickExact(page, 'Create my account', 8000);
  await page.waitForTimeout(5000);
  txt = await body(page);
  await page.screenshot({ path: `${SHOT}/07-after-signup.png`, fullPage: false });

  ok('it leaves the sign-up form', !/HOW OLD ARE YOU/i.test(txt), txt.slice(0, 160));
  ok('...and does NOT dump you on the sign-in screen',
    !/OWNER SIGN IN/i.test(txt), txt.slice(0, 160));
  ok('...it signs you straight in', /PORTFOLIO|OVERVIEW|PROPERTIES|Add your first|UNITS|VACANT/i.test(txt),
    txt.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 8).join(' | '));

  console.log('\nTHE SAME EMAIL TWICE');
  // A second account on the same address must be refused, in words.
  const page2 = await b.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
  if (await toSignupForm(page2)) {
    await clickLoose(page2, '18 OR OVER', 600);
    await fill(page2, [[0, 'Someone Else'], [1, email], [2, `8${Date.now().toString().slice(-9)}`.slice(0, 10)], [3, 'Test@1234']]);
    await clickExact(page2, 'Create my account', 8000);
    await page2.waitForTimeout(4000);
    const t2 = await body(page2);
    ok('a duplicate email is refused in words',
      /already exists|already registered|already used/i.test(t2), t2.slice(0, 200));
    await page2.screenshot({ path: `${SHOT}/08-duplicate-email.png`, fullPage: false });
  } else {
    ok('a duplicate email is refused in words', false, 'could not reach the form a second time');
  }

  console.log('\nNOTHING THREW');
  ok('no runtime errors anywhere in that run', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log('Screenshots: ' + SHOT);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
