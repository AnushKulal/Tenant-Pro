// File: tests/ui.storebanner.e2e.js
//
// "A new version is available" — on every screen, in both portals.
//
// The app can install an OTA update itself. It cannot install a new BUILD: that
// changes native code and has to come from the store through Android's package
// installer. So for that kind the whole feature is noticing and saying so.
//
// And it cannot notice alone — a phone on 1.4.0 has no way to learn 1.5.0
// exists. The server tells it (GET /api/app/version?current=...). Run this with
// a server that announces a newer version than the bundle:
//
//   APP_LATEST_VERSION=1.5.0 APP_DOWNLOAD_URL=https://example.com/app node server.js
//
// What matters here, in order:
//   1. it appears at all, which means the whole chain works: app version →
//      server comparison → store → banner;
//   2. it is on EVERY screen, which is the actual request. A notice mounted
//      inside one screen is a notice you lose by navigating;
//   3. it names the version and says what is in it — a bare version number asks
//      somebody to go and install something for reasons unstated;
//   4. it can be dismissed, because it cannot be acted on from inside the app
//      and a notice you cannot silence is a wall;
//   5. it does NOT appear when the server announces nothing. That is the
//      failure nobody would report: a banner on every phone for ever.
//
//   UI_URL=http://127.0.0.1:8080 node tests/ui.storebanner.e2e.js
const { chromium } = require('playwright');
const fs = require('fs');
const { dismissTour } = require('./lib/tour');

const UI_URL = process.env.UI_URL || 'http://127.0.0.1:8080';
const TENANT = process.env.E2E_TENANT || 'sandeep.naik1000@example.com';
const OWNER = process.env.E2E_OWNER || 'landlord20260101@example.com';
const PASSWORD = 'Test@1234';
const SHOT = __dirname + '/bannershots';
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

const tab = async (page, label, wait = 2200) => {
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
  await dismissTour(page);
};

// The banner's own words, so this cannot pass on some other element that
// happens to mention a version.
const BANNER = /Version\s+[\d.]+\s+is available|Update required — version/i;

const hasBanner = async (page) => BANNER.test(await body(page));

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const errs = [];
  const octx = await b.newContext({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
  const tctx = await b.newContext({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
  const owner = await octx.newPage();
  const tenant = await tctx.newPage();
  owner.on('pageerror', (e) => errs.push('OWNER ' + String(e).slice(0, 140)));
  tenant.on('pageerror', (e) => errs.push('TENANT ' + String(e).slice(0, 140)));

  console.log('='.repeat(62));
  console.log('A NEW BUILD IS AVAILABLE');
  console.log('='.repeat(62));

  // Confirm the premise before testing anything that depends on it: if the
  // server is not announcing a newer build, every assertion below would fail
  // for a reason that has nothing to do with the app.
  console.log('\nTHE SERVER IS ANNOUNCING ONE');
  const api = process.env.E2E_BASE || 'http://127.0.0.1:5000';
  let announced = null;
  try {
    const r = await fetch(`${api}/api/app/version?current=1.0.0`);
    announced = await r.json();
  } catch (e) { /* reported below */ }
  ok('the version endpoint answers', !!announced, 'could not reach /api/app/version');
  ok('...and announces a newer build than 1.0.0',
    !!(announced && announced.updateAvailable),
    announced ? `reason: ${announced.reason}` : 'no answer');
  if (!announced || !announced.updateAvailable) {
    console.log('\nStopping: with nothing announced there is no banner to test.');
    console.log('Start the API with APP_LATEST_VERSION set above the app version.');
    await b.close();
    process.exit(1);
  }

  console.log('\nTHE LANDLORD SEES IT');
  await signIn(owner, "I'm a landlord", OWNER);
  ok('the landlord is in', /COLLECTED|OVERVIEW|PROPERT|DUE/i.test(await body(owner)));
  ok('the banner is there', await hasBanner(owner), (await body(owner)).slice(0, 200));
  const otxt = await body(owner);
  ok('...and names the version', /Version\s+[\d.]+/i.test(otxt), otxt.slice(0, 200));
  ok('...and says what is in it, not just a number',
    /tour|Settings|signup|installs from the store/i.test(otxt), otxt.slice(0, 300));
  await owner.screenshot({ path: `${SHOT}/01-landlord-banner.png`, fullPage: false });

  console.log('\nON EVERY SCREEN, NOT JUST THE FIRST');
  // The actual request. A notice mounted inside one screen is a notice you lose
  // the moment you navigate, which is the failure this is built to avoid.
  for (const t of ['UNITS', 'PEOPLE', 'LEDGER', 'OVERVIEW']) {
    const went = await tab(owner, t);
    ok(`${t} still shows it`, went && await hasBanner(owner), went ? 'banner gone' : `no ${t} tab`);
  }

  console.log('\nAND IN THE TENANT PORTAL TOO');
  await signIn(tenant, "I'm a tenant", TENANT);
  ok('the tenant is in', /RENT DUE|WELCOME BACK/i.test(await body(tenant)));
  ok('the banner is there as well', await hasBanner(tenant), (await body(tenant)).slice(0, 200));
  await tenant.screenshot({ path: `${SHOT}/02-tenant-banner.png`, fullPage: false });
  for (const t of ['FIND', 'HELP', 'HOME']) {
    const went = await tab(tenant, t);
    ok(`${t} still shows it`, went && await hasBanner(tenant), went ? 'banner gone' : `no ${t} tab`);
  }

  console.log('\nSETTINGS SAYS SO TOO');
  // Somebody who came to Settings to ask should get the whole answer there:
  // "you are on the latest version" is true of the bundle and misleading about
  // the app when a new build exists.
  await tab(tenant, 'ME');
  await clickLoose(tenant, 'Settings', 2200);
  const stxt = await body(tenant);
  ok('Settings mentions the store build',
    /is available in the store/i.test(stxt), stxt.slice(0, 300));
  await tenant.screenshot({ path: `${SHOT}/03-tenant-settings.png`, fullPage: true });

  console.log('\nIT CAN BE SILENCED');
  // It cannot be acted on from inside the app, so a notice you cannot dismiss
  // is a wall rather than a notice.
  const hid = await owner.getByLabel('Hide this notice').first().click({ timeout: 4000 })
    .then(() => true).catch(() => false);
  ok('the notice can be hidden', hid, 'no dismiss control found');
  if (hid) {
    await owner.waitForTimeout(900);
    ok('...and it goes', !(await hasBanner(owner)), (await body(owner)).slice(0, 160));
    // Dismissal lasts for this run only — the thing it announces still has not
    // been done, and the app has no way to know whether it ever will be.
    await tab(owner, 'UNITS');
    ok('...and stays gone while you move around', !(await hasBanner(owner)));
    await owner.screenshot({ path: `${SHOT}/04-dismissed.png`, fullPage: false });
  }

  console.log('\nNOTHING THREW');
  ok('no runtime errors on either portal', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log('Screenshots: ' + SHOT);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
