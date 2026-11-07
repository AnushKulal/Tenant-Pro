// File: tests/ui.signout.e2e.js
//
// Does the app tell you it is signing out?
//
// It makes two calls to the server before anything on screen changes. On a
// free-tier host that has gone to sleep the first can take most of a minute, and
// until this was fixed the sheet just sat there with the button looking untapped.
// A tester reported it as the app being broken and laggy, which is the correct
// reading of what they could see.
//
// The assertion that matters is the one in the middle: the button must say it is
// working WHILE the request is in flight — not after, when the screen has changed
// anyway and nothing needed saying. So the server is made slow on purpose, by
// pointing the app at a port that accepts connections and never answers. That is
// also the exact condition being fixed, rather than an imitation of it.
//
//   cd mobile && EXPO_PUBLIC_API_URL=http://127.0.0.1:5055 npx expo export --platform web --output-dir /tmp/web
//   npx serve -s /tmp/web -l 8080
//   node tests/ui.signout.e2e.js
//
// Run against a NORMAL build (pointing at a working API) it still passes: the
// sign-out completes and the second assertion is reached by the screen changing.
const { chromium } = require('playwright');
const fs = require('fs');
const { dismissTour } = require('./lib/tour');

const UI_URL = process.env.UI_URL || 'http://127.0.0.1:8080';
const SHOT = __dirname + '/signoutshots';
fs.mkdirSync(SHOT, { recursive: true });

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  if (c) { pass += 1; console.log(`  PASS  ${n}`); }
  else { fail += 1; console.log(`  FAIL  ${n}${extra ? '  <- ' + extra : ''}`); }
};

const click = async (page, text) => {
  for (const sel of [`text="${text}"`, `text=${text}`]) {
    const el = page.locator(sel).first();
    if (await el.count() && await el.isVisible().catch(() => false)) {
      await el.click({ timeout: 4000 }).catch(async () => { await el.click({ force: true }).catch(() => {}); });
      await page.waitForTimeout(700);
      return true;
    }
  }
  return false;
};

const body = (page) => page.locator('body').innerText();

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));

  await page.goto(UI_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  await click(page, 'SKIP');
  await page.waitForTimeout(700);
  await page.mouse.move(210, 600);
  for (let i = 0; i < 12; i += 1) { await page.mouse.wheel(0, 900); await page.waitForTimeout(110); }
  await click(page, 'Not now');
  await page.waitForTimeout(1100);
  await click(page, "I'm a tenant");
  await page.waitForTimeout(900);

  const ins = page.locator('input');
  await ins.nth(0).fill('sandeep.naik1000@example.com');
  await ins.nth(1).fill('Test@1234');
  await click(page, 'Sign in');
  await page.waitForTimeout(6500);
  // The tour greets a first-time sign-in and its dim layer eats every click
  // until it is closed. See tests/lib/tour.js.
  await dismissTour(page);

  const signedIn = /WELCOME BACK|RENT DUE/i.test(await body(page));
  ok('the tenant is signed in to begin with', signedIn);
  if (!signedIn) {
    console.log('\nStopping: not signed in, so nothing below would mean anything.');
    await b.close();
    process.exit(1);
  }

  console.log('\nTHE CONFIRMATION STILL ASKS FIRST');
  await click(page, 'SIGN OUT');
  await page.waitForTimeout(900);
  const sheet = await body(page);
  ok('it asks before signing anybody out', /Sign out\?/i.test(sheet), sheet.slice(0, 160));
  ok('...and offers a way not to', /No, stay/i.test(sheet));
  ok('...with the button in its resting state', /Yes, sign out/i.test(sheet));
  await page.screenshot({ path: `${SHOT}/01-asked.png`, fullPage: false });

  console.log('\nTHE BUTTON SAYS IT IS WORKING, WHILE IT IS WORKING');
  // From here the server is made unreachable, so the sign-out cannot complete
  // quickly and the busy state has to be visible on its own merits.
  await page.route('**/api/**', async (route) => {
    await new Promise((r) => setTimeout(r, 30000));
    await route.abort().catch(() => {});
  });
  await click(page, 'Yes, sign out');
  await page.waitForTimeout(600);
  const during = await body(page);
  ok('the button says it is signing out', /Signing out/i.test(during), during.slice(0, 200));
  ok('...and no longer offers the untapped label', !/Yes, sign out/i.test(during), during.slice(0, 200));
  await page.screenshot({ path: `${SHOT}/02-signing-out.png`, fullPage: false });

  console.log('\nAND IT FINISHES WITHOUT THE SERVER');
  // The waits are capped, so an unreachable server costs a few seconds, not the
  // sign-out. Before the cap this sat until the request itself gave up.
  await page.waitForTimeout(9000);
  const after = await body(page);
  ok('it reaches the sign-in screen anyway',
    /I'm a tenant|I am a tenant|Sign in|SIGN IN/i.test(after) && !/RENT DUE/i.test(after),
    after.slice(0, 200));
  await page.screenshot({ path: `${SHOT}/03-signed-out.png`, fullPage: false });

  console.log('\nNOTHING THREW');
  ok('no runtime errors anywhere in that run', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log('Screenshots: ' + SHOT);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
