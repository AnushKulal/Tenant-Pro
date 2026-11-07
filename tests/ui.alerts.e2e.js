// File: tests/ui.alerts.e2e.js
//
// The bell: in-app notifications on both sides.
//
// This app has no server push in the web build — a phone's notification tray is
// a native surface and nothing here can reach it. What it does have is the bell
// in the header, and that is the surface a person actually looks at: a count of
// what is waiting, a sheet listing it, and a seen-stamp that stops the same
// thing shouting twice. All three are testable, and all three are the sort of
// thing that breaks silently.
//
// Three questions:
//
//   1. Can you get to it at all? The bell is an icon with no text, so if its
//      accessible name is missing it is a control that a screen reader announces
//      as "button" and a test can only reach by guessing pixels. Both of those
//      are the same bug.
//   2. Does the sheet say something true — rows, or an honest "all clear" —
//      without the two words that mean a value never arrived?
//   3. Does opening it actually clear the unread marker, and does that survive a
//      reload? The stamp is written to the server, so a reload is the only way to
//      tell the difference between "marked seen" and "hidden until next time".
//
// Then the one that crosses the gap: a tenant raises a ticket and the landlord's
// bell has to start counting it.
//
//   cd backend && node server.js &
//   cd mobile  && EXPO_PUBLIC_API_URL=http://127.0.0.1:5000 npx expo export --platform web --output-dir /tmp/web
//   npx serve -s /tmp/web -l 8080
//   UI_URL=http://127.0.0.1:8080 node tests/ui.alerts.e2e.js
const { chromium } = require('playwright');
const fs = require('fs');

const UI_URL = process.env.UI_URL || 'http://127.0.0.1:8080';
const TENANT = process.env.E2E_TENANT || 'sandeep.naik1000@example.com';
const OWNER = process.env.E2E_OWNER || 'landlord20260101@example.com';
const PASSWORD = 'Test@1234';
const SHOT = __dirname + '/alertshots';
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

const tab = async (page, label, wait = 2400) => {
  const el = page.getByText(label, { exact: true }).last();
  if (await el.count() && await el.isVisible().catch(() => false)) {
    await el.click({ timeout: 5000 }).catch(async () => { await el.click({ force: true }).catch(() => {}); });
    await page.waitForTimeout(wait);
    return true;
  }
  return false;
};

// The bell, by name. The name carries the state as well — "Notifications",
// "Notifications, something new", "Notifications, 3 waiting on you" — so this
// also reads what the bell is claiming without looking at a badge's pixels.
const bell = (page) => page.getByLabel(/^Notifications/).first();
const bellSays = async (page) => {
  const el = bell(page);
  if (!await el.count()) return null;
  return el.getAttribute('aria-label');
};

const openBell = async (page, wait = 1600) => {
  const el = bell(page);
  if (!await el.count()) return false;
  await el.click({ timeout: 5000 }).catch(async () => { await el.click({ force: true }).catch(() => {}); });
  await page.waitForTimeout(wait);
  return true;
};

const raiseTicket = async (page, title) => {
  let opened = false;
  for (const t of ['Raise a ticket', 'New request', 'Raise a request', '+ NEW']) {
    if (await clickLoose(page, t, 1600)) { opened = true; break; }
  }
  if (!opened) return false;
  const ins = page.locator('input, textarea');
  const n = await ins.count();
  if (n) await ins.nth(0).fill(title).catch(() => {});
  if (n > 1) await ins.nth(1).fill('The bell should start counting this.').catch(() => {});
  for (const t of ['Send', 'Submit', 'Raise request', 'Send request', 'Save']) {
    if (await clickExact(page, t, 2500)) return true;
  }
  for (const t of ['Send', 'Submit']) { if (await clickLoose(page, t, 2500)) return true; }
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
  // The tour would sit on top of the bell. Close it by its own name.
  const closer = page.getByLabel('Close tour').first();
  if (await closer.count()) { await closer.click().catch(() => {}); await page.waitForTimeout(900); }
  return body(page);
};

// "4 open tickets" → 4. null when the landlord's sheet does not mention tickets,
// which is itself meaningful: it means there are none.
const openTickets = (txt) => {
  const m = txt.match(/(\d+)\s+open\s+tickets?/i);
  return m ? Number(m[1]) : 0;
};

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const errs = [];
  const tctx = await b.newContext({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
  const octx = await b.newContext({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
  const tenant = await tctx.newPage();
  const owner = await octx.newPage();
  tenant.on('pageerror', (e) => errs.push('TENANT ' + String(e).slice(0, 120)));
  owner.on('pageerror', (e) => errs.push('OWNER ' + String(e).slice(0, 120)));

  console.log('='.repeat(62));
  console.log('THE BELL');
  console.log('='.repeat(62));

  console.log('\nSIGN BOTH IN');
  const t0 = await signIn(tenant, "I'm a tenant", TENANT);
  ok('the tenant is in', /RENT DUE|WELCOME BACK|Palm Heights/i.test(t0), t0.slice(0, 140));
  const o0 = await signIn(owner, "I'm a landlord", OWNER);
  ok('the landlord is in', /COLLECTED|OVERVIEW|PROPERT|DUE/i.test(o0), o0.slice(0, 140));

  console.log('\nTHE TENANT CAN REACH IT WITHOUT GUESSING PIXELS');
  const tName = await bellSays(tenant);
  ok('the tenant bell has an accessible name', !!tName, 'nothing labelled Notifications in the header');
  console.log(`        it currently says: ${JSON.stringify(tName)}`);
  await tenant.screenshot({ path: `${SHOT}/01-tenant-bell.png`, fullPage: false });

  const claimedNew = /something new|waiting on you/i.test(tName || '');

  console.log('\nAND IT OPENS SOMETHING THAT SAYS SOMETHING TRUE');
  const tOpened = await openBell(tenant);
  ok('the tenant bell opens the sheet', tOpened);
  const tSheet = tOpened ? await body(tenant) : '';
  ok('the sheet is the notifications sheet', /Notifications/i.test(tSheet), tSheet.slice(0, 160));
  ok('...and states where it stands', /\d+\s+NEW|NOTHING NEW|ALL CLEAR/i.test(tSheet), tSheet.slice(0, 200));
  ok('the sheet has no "undefined"', !/\bundefined\b/i.test(tSheet), tSheet.slice(0, 200));
  ok('the sheet has no "NaN"', !/\bNaN\b/.test(tSheet), tSheet.slice(0, 200));
  await tenant.screenshot({ path: `${SHOT}/02-tenant-sheet.png`, fullPage: false });

  console.log('\nAND IT CLOSES AGAIN');
  await clickExact(tenant, 'Close', 1400);
  const tClosed = await body(tenant);
  ok('Close closes the sheet', !/NOTHING NEW|ALL CLEAR|\d+\s+NEW/i.test(tClosed), tClosed.slice(0, 160));

  console.log('\nOPENING IT COUNTS AS READING IT — AND THAT SURVIVES A RELOAD');
  // The stamp goes to the server. A reload is the only way to tell "marked seen"
  // apart from "hidden until the next render".
  if (!claimedNew) {
    note('the unread marker clears', `nothing was unread to begin with (bell said ${JSON.stringify(tName)})`);
  } else {
    await tenant.reload({ waitUntil: 'networkidle' });
    await tenant.waitForTimeout(7000);
    const after = await bellSays(tenant);
    ok('the unread marker clears', !/something new|waiting on you/i.test(after || ''),
      `still says ${JSON.stringify(after)}`);
    console.log(`        after reload it says: ${JSON.stringify(after)}`);
    await tenant.screenshot({ path: `${SHOT}/03-tenant-bell-cleared.png`, fullPage: false });
  }

  console.log('\nTHE LANDLORD HAS THE SAME BELL');
  const oName = await bellSays(owner);
  ok('the landlord bell has an accessible name', !!oName, 'nothing labelled Notifications in the header');
  console.log(`        it currently says: ${JSON.stringify(oName)}`);
  const oOpened = await openBell(owner);
  ok('the landlord bell opens the sheet', oOpened);
  const oSheet = oOpened ? await body(owner) : '';
  ok('the sheet is the landlord needs-you sheet', /Needs you/i.test(oSheet), oSheet.slice(0, 160));
  ok('...and states where it stands', /THINGS? TO LOOK AT|ALL CLEAR/i.test(oSheet), oSheet.slice(0, 200));
  ok('the sheet has no "undefined"', !/\bundefined\b/i.test(oSheet), oSheet.slice(0, 200));
  ok('the sheet has no "NaN"', !/\bNaN\b/.test(oSheet), oSheet.slice(0, 200));
  await owner.screenshot({ path: `${SHOT}/04-landlord-sheet.png`, fullPage: false });

  const before = openTickets(oSheet);
  console.log(`        open tickets before: ${before}`);
  await clickExact(owner, 'Close', 1400);

  console.log('\nA NEW TICKET MAKES THE LANDLORD’S BELL COUNT IT');
  await tab(tenant, 'HELP');
  const mark = `Bell check ${Date.now().toString().slice(-6)}`;
  const sent = await raiseTicket(tenant, mark);
  ok('the tenant raises a ticket', sent);
  if (!sent) {
    note('the landlord bell counts it', 'the ticket was never raised');
  } else {
    let rose = false, nowAt = before;
    // The landlord's app polls; a tab press refetches. Up to ~45s, checked by
    // reopening the bell rather than by reading a badge's pixels.
    for (let i = 0; i < 15 && !rose; i += 1) {
      await tab(owner, 'OVERVIEW', 800);
      if (!await openBell(owner, 1200)) break;
      nowAt = openTickets(await body(owner));
      if (nowAt > before) { rose = true; break; }
      await clickExact(owner, 'Close', 800);
      await owner.waitForTimeout(2000);
    }
    ok(`the landlord bell counts it (${before} → ${nowAt})`, rose,
      `still ${nowAt} after waiting`);
    await owner.screenshot({ path: `${SHOT}/05-landlord-counts-it.png`, fullPage: false });
  }

  console.log('\nNOTHING THREW ON EITHER SIDE');
  ok('no runtime errors', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`);
  console.log('Screenshots: ' + SHOT);
  console.log('\nNot covered here, and not coverable here: a notification arriving on a');
  console.log('phone while the app is closed. That is a native surface — it needs a');
  console.log('device build and a registered push token, and /healthz currently reports');
  console.log('"push: no devices registered yet".');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
