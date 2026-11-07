// File: tests/ui.crossportal.e2e.js
//
// Does a tenant raising a problem actually reach their landlord — and how fast?
//
// Help and support is the one place in this app where two people are looking at
// the same thing from opposite sides, and the failure mode is silent: the tenant
// sees "sent", the landlord's screen never changes, and nobody finds out until
// somebody rings somebody. So this drives BOTH portals in two browser contexts
// at once and checks the landlord's side for a request the tenant raised seconds
// earlier — with the clock running.
//
// It also answers the other half of "are the pages populating": every screen on
// both sides is visited and checked for the three ways a screen lies — an empty
// body, the word "undefined", and "NaN".
//
//   cd backend && node scripts/seed.js --wipe && node server.js &
//   cd mobile  && EXPO_PUBLIC_API_URL=http://127.0.0.1:5000 npx expo export --platform web --output-dir /tmp/web
//   npx serve -s /tmp/web -l 8080
//   UI_URL=http://127.0.0.1:8080 node tests/ui.crossportal.e2e.js
const { chromium } = require('playwright');
const fs = require('fs');

const UI_URL = process.env.UI_URL || 'http://127.0.0.1:8080';
const TENANT = process.env.E2E_TENANT || 'sandeep.naik1000@example.com';
const OWNER = process.env.E2E_OWNER || 'landlord20260101@example.com';
const PASSWORD = 'Test@1234';
const SHOT = __dirname + '/crossshots';
fs.mkdirSync(SHOT, { recursive: true });

let pass = 0, fail = 0, skip = 0;
const ok = (n, c, extra = '') => {
  if (c) { pass += 1; console.log(`  PASS  ${n}`); }
  else { fail += 1; console.log(`  FAIL  ${n}${extra ? '  <- ' + extra : ''}`); }
};
const note = (n, why) => { skip += 1; console.log(`  SKIP  ${n}  (${why})`); };

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

// Sign in, and close the tour if it greets us — this suite is about other things.
// Dock tabs are clicked by EXACT label, never loosely. `text=ME` is a
// case-insensitive SUBSTRING match, so it matches the "me" inside "frame" — a
// click meant for the ME tab landed on a ticket called "Bed frame creaking
// badly" and the suite then reported the ME screen as showing the wrong thing.
// Short labels make this trap much worse, and this dock has one two letters long.
const tab = async (page, label, wait = 2400) => {
  const el = page.getByText(label, { exact: true }).last();
  if (await el.count() && await el.isVisible().catch(() => false)) {
    await el.click({ timeout: 5000 }).catch(async () => { await el.click({ force: true }).catch(() => {}); });
    await page.waitForTimeout(wait);
    return true;
  }
  return false;
};

const signIn = async (page, who, id) => {
  await page.goto(UI_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  await clickLoose(page, 'SKIP', 800);
  await page.mouse.move(210, 600);
  for (let i = 0; i < 12; i += 1) { await page.mouse.wheel(0, 900); await page.waitForTimeout(110); }
  await clickLoose(page, 'Not now', 1300);
  await clickLoose(page, who, 1200);
  const ins = page.locator('input');
  await ins.nth(0).fill(id);
  await ins.nth(1).fill(PASSWORD);
  if (!await clickExact(page, 'Sign in', 1000)) await clickLoose(page, 'SIGN IN', 1000);
  await page.waitForTimeout(7000);
  const closer = page.getByLabel('Close tour').first();
  if (await closer.count()) { await closer.click().catch(() => {}); await page.waitForTimeout(900); }
  return body(page);
};

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const errs = [];

  // Two people, two browser contexts. Sharing one context would share the
  // storage that holds the session, and the second sign-in would evict the first
  // — which is exactly the thing this suite needs to not happen.
  const tctx = await b.newContext({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
  const octx = await b.newContext({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
  const tenant = await tctx.newPage();
  const owner = await octx.newPage();
  tenant.on('pageerror', (e) => errs.push('TENANT ' + String(e).slice(0, 120)));
  owner.on('pageerror', (e) => errs.push('OWNER ' + String(e).slice(0, 120)));

  console.log('='.repeat(62));
  console.log('BOTH SIDES AT ONCE');
  console.log('='.repeat(62));

  console.log('\nSIGN BOTH IN');
  const tHome = await signIn(tenant, "I'm a tenant", TENANT);
  const oHome = await signIn(owner, "I'm a landlord", OWNER);
  ok('the tenant is in', /RENT|WELCOME BACK|Pay/i.test(tHome), tHome.slice(0, 120));
  ok('the landlord is in', /PORTFOLIO|OVERVIEW|PROPERTIES|COLLECTED|VACANT/i.test(oHome), oHome.slice(0, 120));
  if (!/RENT|WELCOME BACK/i.test(tHome) || !/PORTFOLIO|OVERVIEW|PROPERTIES|COLLECTED|VACANT/i.test(oHome)) {
    console.log('\nStopping: both sides must be signed in for anything below to mean anything.');
    await b.close();
    process.exit(1);
  }

  console.log('\nEVERY PAGE POPULATES — TENANT');
  // The three ways a screen lies: nothing on it, "undefined" on it, "NaN" on it.
  for (const [tabName, expect] of [['HOME', /RENT|DEPOSIT/i], ['FIND', /Find a place/i], ['HELP', /Help|REQUEST/i], ['ME', /profile|DOCUMENT|My profile/i]]) {
    await tab(tenant, tabName);
    const txt = await body(tenant);
    ok(`tenant ${tabName} has content`, txt.trim().length > 80, `${txt.trim().length} chars`);
    ok(`tenant ${tabName} shows what it should`, expect.test(txt), txt.slice(0, 120));
    ok(`tenant ${tabName} has no "undefined"`, !/\bundefined\b/i.test(txt), txt.slice(0, 160));
    ok(`tenant ${tabName} has no "NaN"`, !/\bNaN\b/.test(txt), txt.slice(0, 160));
  }
  await tenant.screenshot({ path: `${SHOT}/01-tenant-pages.png`, fullPage: false });

  console.log('\nEVERY PAGE POPULATES — LANDLORD');
  for (const [tabName, expect] of [['HOME', /COLLECTED|OVERVIEW|DUE/i], ['UNITS', /PROPERT|ROOM|UNIT/i], ['PEOPLE', /TENANT|PEOPLE|Everyone/i], ['LEDGER', /LEDGER|PAYMENT|EXPENSE/i]]) {
    await tab(owner, tabName);
    const txt = await body(owner);
    ok(`landlord ${tabName} has content`, txt.trim().length > 80, `${txt.trim().length} chars`);
    ok(`landlord ${tabName} shows what it should`, expect.test(txt), txt.slice(0, 120));
    ok(`landlord ${tabName} has no "undefined"`, !/\bundefined\b/i.test(txt), txt.slice(0, 160));
    ok(`landlord ${tabName} has no "NaN"`, !/\bNaN\b/.test(txt), txt.slice(0, 160));
  }
  await owner.screenshot({ path: `${SHOT}/02-landlord-pages.png`, fullPage: false });

  console.log('\nA TENANT RAISES A PROBLEM');
  const mark = `Leaking tap ${Date.now().toString().slice(-6)}`;
  await tab(tenant, 'HELP');
  let opened = false;
  // The button says "Raise a ticket". Taken from the screen rather than guessed:
  // the first version of this listed five plausible labels, none of which was the
  // real one, and reported the whole cross-portal check as unreachable.
  for (const t of ['Raise a ticket', 'New request', 'Raise a request', '+ NEW']) {
    if (await clickLoose(tenant, t, 1600)) { opened = true; break; }
  }
  if (!opened) {
    note('the landlord sees it', 'could not find the button that raises a request');
  } else {
    const ins = tenant.locator('input, textarea');
    const n = await ins.count();
    if (n) await ins.nth(0).fill(mark).catch(() => {});
    if (n > 1) await ins.nth(1).fill('The kitchen tap drips all night.').catch(() => {});
    await tenant.screenshot({ path: `${SHOT}/03-raising.png`, fullPage: false });
    let sent = false;
    for (const t of ['Send', 'Submit', 'Raise request', 'Send request', 'Save']) {
      if (await clickExact(tenant, t, 2500)) { sent = true; break; }
    }
    if (!sent) for (const t of ['Send', 'Submit']) { if (await clickLoose(tenant, t, 2500)) { sent = true; break; } }
    await tenant.waitForTimeout(2500);
    const after = await body(tenant);
    ok('the tenant sees their request on their own list', sent && after.includes(mark.slice(0, 12)), after.slice(0, 180));
    await tenant.screenshot({ path: `${SHOT}/04-raised.png`, fullPage: false });

    console.log('\nAND THE LANDLORD SEES IT — WITH THE CLOCK RUNNING');
    const started = Date.now();
    let seen = false;
    // How the landlord actually finds out, and why the budget is what it is.
    //
    // The landlord's app does not sit on a socket. It polls /pulse every 25
    // seconds — about 94 bytes of counts carrying a stamp — and refetches the
    // real data only when that stamp changes. So the arrival is not instant by
    // design, and anything under ~25s is luck about where in the cycle we
    // landed. The first version of this gave up at 21s and reported the feature
    // broken when it was about to work.
    //
    // There is no SUPPORT tab on the landlord's dock either: tickets reach them
    // through the bell's alerts sheet or the Overview screen. This now opens the
    // real route rather than clicking a tab that does not exist.
    for (let i = 0; i < 30 && !seen; i += 1) {
      await tab(owner, 'HOME', 700);
      const o1 = await body(owner);
      if (o1.includes(mark.slice(0, 12))) { seen = true; break; }
      // The real control, taken from the screen: Overview carries a
      // "View all N tickets" press that opens the tickets sheet. The previous
      // guess ("open ticket") was the wording of a row inside the BELL's alerts
      // sheet, which this never opened — so the list was never on screen and the
      // run reported the landlord as never seeing a request the server had
      // already handed them.
      if (await clickLoose(owner, 'View all', 1500)) {
        const o2 = await body(owner);
        if (o2.includes(mark.slice(0, 12))) { seen = true; break; }
        await owner.keyboard.press('Escape').catch(() => {});
        await owner.waitForTimeout(400);
      }
      await owner.waitForTimeout(2000);
    }
    const took = Math.round((Date.now() - started) / 100) / 10;
    ok(`the landlord sees it (took ${took}s)`, seen, 'never appeared on the landlord side');
    // 40s allows one full 25s pulse cycle plus the fetch and a render. Tighter
    // than that is testing our luck rather than the app.
    if (seen) ok('...within one poll cycle', took < 40, `${took}s`);
    await owner.screenshot({ path: `${SHOT}/05-landlord-sees-it.png`, fullPage: false });
  }

  console.log('\nNOTHING THREW ON EITHER SIDE');
  ok('no runtime errors', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`);
  console.log('Screenshots: ' + SHOT);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
