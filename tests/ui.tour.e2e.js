// File: tests/ui.tour.e2e.js
//
// The guided tour: does it appear for somebody new, does every control do what
// it says, and can you get back to it afterwards?
//
// The controls are the point. A tour with a Next that skips two steps, a Back
// that does nothing on step one, or a Skip that leaves it running is worse than
// no tour, because the person is now lost AND being talked at. Each one is
// driven here and checked against the step counter the card prints.
//
//   cd backend && node scripts/seed.js --wipe && node server.js &
//   cd mobile  && EXPO_PUBLIC_API_URL=http://127.0.0.1:5000 npx expo export --platform web --output-dir /tmp/web
//   npx serve -s /tmp/web -l 8080
//   UI_URL=http://127.0.0.1:8080 node tests/ui.tour.e2e.js
const { chromium } = require('playwright');
const fs = require('fs');

const UI_URL = process.env.UI_URL || 'http://127.0.0.1:8080';
const SHOT = __dirname + '/tourshots';
fs.mkdirSync(SHOT, { recursive: true });

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  if (c) { pass += 1; console.log(`  PASS  ${n}`); }
  else { fail += 1; console.log(`  FAIL  ${n}${extra ? '  <- ' + extra : ''}`); }
};

const body = (page) => page.locator('body').innerText();

const clickExact = async (page, label, wait = 900) => {
  const el = page.getByText(label, { exact: true }).first();
  if (await el.count() && await el.isVisible().catch(() => false)) {
    await el.click({ timeout: 5000 }).catch(async () => { await el.click({ force: true }).catch(() => {}); });
    await page.waitForTimeout(wait);
    return true;
  }
  return false;
};

const clickLoose = async (page, label, wait = 900) => {
  const el = page.locator(`text=${label}`).first();
  if (await el.count() && await el.isVisible().catch(() => false)) {
    await el.click({ timeout: 5000 }).catch(async () => { await el.click({ force: true }).catch(() => {}); });
    await page.waitForTimeout(wait);
    return true;
  }
  return false;
};

// "STEP 3 OF 7" → { at: 3, of: 7 }. The card prints it, so the test reads the
// same thing a person would rather than counting its own clicks.
const stepOf = async (page) => {
  const m = (await body(page)).match(/STEP\s+(\d+)\s+OF\s+(\d+)/i);
  return m ? { at: Number(m[1]), of: Number(m[2]) } : null;
};

const signInTenant = async (page) => {
  await page.goto(UI_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  await clickLoose(page, 'SKIP', 800);
  await page.mouse.move(210, 600);
  for (let i = 0; i < 12; i += 1) { await page.mouse.wheel(0, 900); await page.waitForTimeout(110); }
  await clickLoose(page, 'Not now', 1300);
  await clickLoose(page, "I'm a tenant", 1200);
  const ins = page.locator('input');
  await ins.nth(0).fill('sandeep.naik1000@example.com');
  await ins.nth(1).fill('Test@1234');
  // Exact: the screen's own heading is "TENANT SIGN IN", and a substring match
  // hands the click to that instead of the button. This suite has now been bitten
  // by that twice; every button here is clicked by its exact label.
  if (!await clickExact(page, 'Sign in', 1000)) await clickLoose(page, 'SIGN IN', 1000);
  await page.waitForTimeout(7000);
};

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));

  console.log('='.repeat(60));
  console.log('THE GUIDED TOUR');
  console.log('='.repeat(60));

  console.log('\nIT STARTS BY ITSELF FOR SOMEBODY NEW');
  await signInTenant(page);
  await page.waitForTimeout(2500);
  let s = await stepOf(page);
  ok('the tour appears without being asked for', !!s, (await body(page)).slice(0, 150));
  if (!s) {
    console.log('\nStopping: no tour, so nothing below would mean anything.');
    await page.screenshot({ path: `${SHOT}/00-no-tour.png` });
    await b.close();
    process.exit(1);
  }
  ok('...on the first step', s.at === 1, JSON.stringify(s));
  ok('...and says how many there are', s.of > 1, JSON.stringify(s));
  ok('it welcomes the tenant by name of the product', /Welcome to TenantPro/i.test(await body(page)));
  await page.screenshot({ path: `${SHOT}/01-step1.png`, fullPage: false });

  console.log('\nBACK IS ABSENT ON THE FIRST STEP, NOT DEAD');
  const backOnOne = await page.getByText('Back', { exact: true }).first().count();
  ok('no Back button to press on step one', backOnOne === 0, `found ${backOnOne}`);

  console.log('\nNEXT ADVANCES ONE STEP AT A TIME');
  await clickExact(page, 'Next', 1400);
  s = await stepOf(page);
  ok('Next goes to step 2', s && s.at === 2, JSON.stringify(s));
  await page.screenshot({ path: `${SHOT}/02-step2.png`, fullPage: false });
  await clickExact(page, 'Next', 1400);
  s = await stepOf(page);
  ok('...and to step 3', s && s.at === 3, JSON.stringify(s));
  await page.screenshot({ path: `${SHOT}/03-step3.png`, fullPage: false });

  console.log('\nBACK GOES BACK');
  ok('Back exists once you are past the first step',
    (await page.getByText('Back', { exact: true }).first().count()) > 0);
  await clickExact(page, 'Back', 1400);
  s = await stepOf(page);
  ok('Back returns to step 2', s && s.at === 2, JSON.stringify(s));
  await page.screenshot({ path: `${SHOT}/04-back-to-2.png`, fullPage: false });

  console.log('\nTHE TOUR MOVES THE APP WITH IT');
  // Step 4 on the tenant tour is the Find screen. The card should be sitting on
  // top of the real screen, not describing it from elsewhere.
  await clickExact(page, 'Next', 1300);
  await clickExact(page, 'Next', 1600);
  s = await stepOf(page);
  const onFind = /Looking for somewhere/i.test(await body(page));
  ok('step 4 is the Find step', s && s.at === 4 && onFind, JSON.stringify(s));
  ok('...and the Find screen is behind it',
    /Area, property or landmark|FILTERS|Find a place/i.test(await body(page)));
  await page.screenshot({ path: `${SHOT}/05-navigates.png`, fullPage: false });

  console.log('\nSKIP LEAVES');
  await clickExact(page, 'Skip tour', 1800);
  s = await stepOf(page);
  ok('Skip closes the tour', s === null, JSON.stringify(s));
  ok('...and leaves you in the app', /RENT|Find a place|HOME|WELCOME/i.test(await body(page)));
  await page.screenshot({ path: `${SHOT}/06-skipped.png`, fullPage: false });

  console.log('\nIT DOES NOT COME BACK UNINVITED');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(6000);
  s = await stepOf(page);
  ok('a reload does not replay the tour', s === null, JSON.stringify(s));
  await page.screenshot({ path: `${SHOT}/07-after-reload.png`, fullPage: false });

  console.log('\nBUT YOU CAN COME BACK TO IT');
  let reached = false;
  for (const t of ['ME', 'Settings']) { if (await clickLoose(page, t, 1800)) reached = true; }
  await clickLoose(page, 'Settings', 2000);
  const hasRow = /Take the tour again/i.test(await body(page));
  ok('Settings offers the tour again', hasRow, (await body(page)).slice(0, 220));
  await page.screenshot({ path: `${SHOT}/08-settings-row.png`, fullPage: false });
  if (hasRow) {
    await clickLoose(page, 'Take the tour again', 2200);
    s = await stepOf(page);
    ok('...and it restarts from step 1', s && s.at === 1, JSON.stringify(s));
    await page.screenshot({ path: `${SHOT}/09-restarted.png`, fullPage: false });

    console.log('\nTHE CLOSE BUTTON ALSO LEAVES');
    // The × is a separate control from Skip and has to work on its own.
    const x = page.locator('svg').first();
    await clickExact(page, 'Next', 1200);
    const before = await stepOf(page);
    await page.mouse.click(390, 0 + 120); // the × sits top-right of the card
    await page.waitForTimeout(1600);
    const after = await stepOf(page);
    ok('the × closes the tour', after === null,
      `before ${JSON.stringify(before)} after ${JSON.stringify(after)}`);
    await page.screenshot({ path: `${SHOT}/10-closed-with-x.png`, fullPage: false });
  }

  console.log('\nNOTHING THREW');
  ok('no runtime errors anywhere in that run', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log('Screenshots: ' + SHOT);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
