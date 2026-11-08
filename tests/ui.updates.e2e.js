// File: tests/ui.updates.e2e.js
//
// "Check for updates", on both portals.
//
// The app already announced an update when it found one, on launch and on
// returning to the foreground. What it had no answer for was somebody pressing
// Later: the check lived inside the prompt, so nothing but a relaunch could
// start another one. This is the way back, and it has to be on BOTH Settings
// screens — whoever dismissed the prompt needs it, and which portal they are in
// has nothing to do with that.
//
// What can and cannot be tested here
//
// This runs against the web export, where expo-updates is not compiled in, so
// `Updates.isEnabled` is false and no real check can happen. That is a useful
// test rather than a gap: it is exactly the case where the row must NOT offer a
// download it cannot perform. A row that promised "Downloading…" here would
// promise it on a phone with no update too.
//
// What a real device adds — an actual manifest, actual release notes, an actual
// restart — needs a build with updates compiled in and a published update to
// find. That is listed at the end of the run rather than faked.
//
//   UI_URL=http://127.0.0.1:8080 node tests/ui.updates.e2e.js
const { chromium } = require('playwright');
const fs = require('fs');
const { dismissTour } = require('./lib/tour');

const UI_URL = process.env.UI_URL || 'http://127.0.0.1:8080';
const TENANT = process.env.E2E_TENANT || 'sandeep.naik1000@example.com';
const OWNER = process.env.E2E_OWNER || 'landlord20260101@example.com';
const PASSWORD = 'Test@1234';
const SHOT = __dirname + '/updateshots';
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
  await dismissTour(page);
};

// Walk to Settings on whichever portal we are in, and say so if we could not.
const toSettings = async (page, role) => {
  if (role === 'tenant') { await tab(page, 'ME'); } else { await tab(page, 'YOU'); }
  await clickLoose(page, 'Settings', 2200);
  return /Settings|Sign out|TENANTPRO ·/i.test(await body(page));
};

const checkRow = async (page, role, label) => {
  console.log(`\n${label}`);
  const reached = await toSettings(page, role);
  ok(`${label} — Settings opens`, reached, (await body(page)).slice(0, 140));
  if (!reached) return;

  const txt = await body(page);
  await page.screenshot({ path: `${SHOT}/0${role === 'tenant' ? 2 : 1}-${role}-settings.png`, fullPage: true });

  ok('there is a way to check for updates',
    /Check for updates|Check now|update is ready|latest version|Updates are not available/i.test(txt),
    txt.slice(0, 260));

  // The description is the point of the row: "Update available" on its own asks
  // somebody to accept a download whose contents they cannot see.
  ok('...and it says which version you are on',
    /version\s+\d|TENANTPRO · /i.test(txt), (txt.match(/.{0,70}version.{0,50}/i) || [])[0]);

  // Press it and see that it answers. The automatic check stays quiet when there
  // is nothing to report; a button that does the same looks broken.
  const pressed = await clickExact(page, 'Check now', 2500)
    || await clickExact(page, 'Check again', 2500)
    || await clickExact(page, 'Try again', 2500);
  ok('the check button can be pressed', pressed, 'no check button found');
  if (pressed) {
    const after = await body(page);
    await page.screenshot({ path: `${SHOT}/0${role === 'tenant' ? 4 : 3}-${role}-checked.png`, fullPage: true });
    ok('...and it answers rather than going quiet',
      /latest version|not available here|Could not check|update is ready|Checking/i.test(after),
      after.slice(0, 260));

    // The honest-on-web assertion. expo-updates is not compiled into this
    // export, so a download is impossible — and the row must not offer one.
    const offersDownload = /Downloading|Installing|Restarting TenantPro/i.test(after);
    ok('...and never offers a download it cannot do',
      !offersDownload, 'the row claimed to be downloading on a build with no update machinery');
  }
};

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
  console.log('CHECK FOR UPDATES');
  console.log('='.repeat(62));

  console.log('\nSIGN BOTH IN');
  await signIn(owner, "I'm a landlord", OWNER);
  ok('the landlord is in', /COLLECTED|OVERVIEW|PROPERT|DUE/i.test(await body(owner)));
  await signIn(tenant, "I'm a tenant", TENANT);
  ok('the tenant is in', /RENT DUE|WELCOME BACK/i.test(await body(tenant)));

  await checkRow(owner, 'owner', 'THE LANDLORD PORTAL');
  await checkRow(tenant, 'tenant', 'THE TENANT PORTAL');

  console.log('\nNOTHING THREW');
  ok('no runtime errors on either portal', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log('Screenshots: ' + SHOT);
  console.log('\nNot covered here: finding a real update, reading its release notes');
  console.log('off the manifest, downloading it and restarting into it. That needs a');
  console.log('build with expo-updates compiled in and a published update to find —');
  console.log('this web export has neither, which is why the row correctly says so.');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
