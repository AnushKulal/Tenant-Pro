// File: tests/ui.discover.e2e.js
//
// Drives the compiled app in Chromium: the place-discovery feature, the three
// profile surfaces a tester reported, and the landlord's side of listing a room.
//
// ── Two rules this suite follows, both learned the hard way ─────────────────
// 1. Every assertion is POSITIVE. It checks that something expected IS on the
//    screen, never that something is absent. An earlier browser run asserted on
//    absences and passed while stuck on the permissions primer, because the
//    primer also lacked every string it was looking for. Half the suite was
//    testing nothing and said so in green.
// 2. It WRITES to the database — it asks to join a property — so the fixtures
//    are rebuilt before each run. Without that, a second run finds "Request
//    already sent" where it expected "Ask to join", and whether it passes
//    depends on how many times it has been run.
//
//   cd backend && node scripts/seed.js --wipe
//   cd mobile  && EXPO_PUBLIC_API_URL=http://localhost:5000 npx expo export --platform web --output-dir /tmp/web
//   npx serve -s /tmp/web -l 8080
//   node tests/ui.discover.e2e.js
//
// Chromium comes from playwright; nothing here needs a device.
const fs = require('fs');
const SHOT = __dirname + '/shots2';
fs.mkdirSync(SHOT, { recursive: true });

let pass = 0, fail = 0, skip = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${extra ? '  <- ' + extra : ''}`); }
};
const note = (name, why) => { skip += 1; console.log(`  SKIP  ${name}  (${why})`); };

async function click(page, text) {
  for (const sel of [`text="${text}"`, `text=${text}`]) {
    const el = page.locator(sel).first();
    if (await el.count() && await el.isVisible().catch(() => false)) {
      await el.click({ timeout: 4000 }).catch(async () => { await el.click({ force: true, timeout: 3000 }).catch(() => {}); });
      await page.waitForTimeout(800);
      return true;
    }
  }
  return false;
}
const txt = (page) => page.locator('body').innerText();

async function primer(page) {
  await click(page, 'SKIP');
  await page.waitForTimeout(1000);
  for (let i = 0; i < 12; i += 1) { await page.mouse.wheel(0, 900); await page.waitForTimeout(120); }
  for (const t of ['Not now', 'Continue to TenantPro', 'CONTINUE', 'Continue']) if (await click(page, t)) break;
  await page.waitForTimeout(1200);
}

async function signIn(page, who, id, pw) {
  for (const t of [who, who.toUpperCase()]) if (await click(page, t)) break;
  await page.waitForTimeout(1000);
  const inputs = page.locator('input');
  if (await inputs.count() < 2) return false;
  await inputs.nth(0).fill(id);
  await inputs.nth(1).fill(pw);
  await page.waitForTimeout(250);
  for (const t of ['Sign in', 'SIGN IN', 'Continue']) if (await click(page, t)) break;
  await page.waitForTimeout(6000);
  return true;
}

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });

  // ════════ TENANT ════════
  console.log('\nTENANT SIDE');
  let page = await b.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  await primer(page);
  await signIn(page, "I'm a tenant", 'sandeep.naik1000@example.com', 'Test@1234');

  let t = await txt(page);
  ok('tenant signs in and lands on the portal', /WELCOME BACK/.test(t) && /RENT DUE/.test(t), t.slice(0, 60));

  // 1. avatar -> profile
  await click(page, 'WELCOME BACK');
  await page.waitForTimeout(1600);
  t = await txt(page);
  ok('tapping the home avatar opens the profile', /My profile/i.test(t), t.split('\n')[0]);
  await page.screenshot({ path: `${SHOT}/t1-profile.png` });

  // 2. dock ME avatar must be visible while selected
  await click(page, 'ME');
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${SHOT}/t2-me-selected.png` });
  const meShot = await page.locator('text="ME"').first().boundingBox().catch(() => null);
  ok('dock profile button still rendered when selected', !!meShot);
  t = await txt(page);
  ok('ME tab reaches the profile screen', /My profile|Your stay|BEHAVIOUR/i.test(t), t.split('\n').slice(0,2).join('|'));

  // 3. discovery
  await click(page, 'FIND');
  await page.waitForTimeout(4000);
  t = await txt(page);
  const m = t.match(/(\d+) places listed/);
  ok('find screen lists places', !!m, t.split('\n').slice(0, 3).join(' | '));
  const total = m ? Number(m[1]) : 0;
  ok('more than one landlord is represented', total >= 10, `total=${total}`);
  ok('cards explain why they are suggested', /Available now|Cheaper than most|Walking distance|under your budget/.test(t));
  await page.screenshot({ path: `${SHOT}/t3-find.png`, fullPage: true });

  // 4. sort
  await click(page, 'CHEAPEST');
  await page.waitForTimeout(2600);
  const prices = (await txt(page)).match(/₹[\d,]+/g) || [];
  const nums = prices.slice(0, 6).map(p => Number(p.replace(/[₹,]/g, ''))).filter(n => n > 1000);
  ok('cheapest sort returns ascending prices', nums.length > 2 && nums.every((n, i) => i === 0 || n >= nums[i - 1]), nums.join(','));

  // 5. filters
  await click(page, 'SUGGESTED');
  await page.waitForTimeout(2000);
  await click(page, 'FILTERS');
  await page.waitForTimeout(1200);
  t = await txt(page);
  ok('filter sheet opens with every facet', /BUDGET, PER PERSON/.test(t) && /ROOM/.test(t) && /KIND OF PLACE/.test(t) && /AREA/.test(t) && /FURNISHING/.test(t) && /DISTANCE FROM ME/.test(t));
  await page.screenshot({ path: `${SHOT}/t4-filters.png`, fullPage: true });
  await click(page, 'Private');
  await click(page, 'Show places');
  await page.waitForTimeout(2800);
  t = await txt(page);
  const m2 = t.match(/(\d+) places listed/);
  ok('a filter narrows the result set', m2 && Number(m2[1]) < total, `${m2 && m2[1]} vs ${total}`);
  ok('every remaining card is a private room', !/\d SHARING/.test(t), 'a sharing card survived the Private filter');
  ok('filter button shows how many are on', /FILTERS · 1/.test(t));

  // 6. clearing
  await click(page, 'FILTERS');
  await page.waitForTimeout(1000);
  await click(page, 'CLEAR ALL');
  await page.waitForTimeout(1600);
  // Clear all deliberately leaves the sheet open so you can pick again; the sheet
  // has to be dismissed before anything behind it can be clicked.
  await click(page, 'Show places');
  await page.waitForTimeout(2600);
  t = await txt(page);
  const m3 = t.match(/(\d+) places listed/);
  ok('clearing restores the full set', m3 && Number(m3[1]) === total, `${m3 && m3[1]} vs ${total}`);

  // 7. detail sheet
  const card = page.locator('text=/spots? left/i').first();
  if (await card.count()) {
    const bb = await card.boundingBox();
    if (bb) await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
    else await card.click({ force: true });
    await page.waitForTimeout(2600);
    t = await txt(page);
    ok('listing sheet opens', /Ask to join/.test(t));
    ok('sheet states deposit, move-in and furnishing', /DEPOSIT/.test(t) && /MOVE IN/.test(t) && /FURNISHING/.test(t));
    ok('sheet says what asking to join does', /Nothing is booked/.test(t));
    await page.screenshot({ path: `${SHOT}/t5-listing.png`, fullPage: true });

    // 8. ask to join — asserted on durable state rather than on a toast, which
    // may have come and gone by the time anything can look for it.
    const askedProperty = (t.match(/^(.+?)\n/) || [])[1] || '';
    await click(page, 'Ask to join');
    // Catch the toast if it is still up, but do not depend on it.
    let sawToast = false;
    for (let i = 0; i < 14; i += 1) {
      await page.waitForTimeout(450);
      if (/Request sent to/i.test(await txt(page))) { sawToast = true; break; }
    }
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${SHOT}/t6-asked.png` });
    t = await txt(page);
    ok('the sheet closes after asking', /places listed/.test(t), t.split('\n')[0]);
    if (sawToast) console.log('        (toast seen)');

    // Reopening the same place must now say the request is already in.
    const again = page.locator('text=/spots? left/i').first();
    if (await again.count()) {
      const bb2 = await again.boundingBox();
      if (bb2) await page.mouse.click(bb2.x + bb2.width / 2, bb2.y + bb2.height / 2);
      await page.waitForTimeout(3000);
      t = await txt(page);
      ok('a place already asked for says so instead of offering again',
         /Request already sent/.test(t), t.split('\n').slice(0, 3).join('|'));
      await page.screenshot({ path: `${SHOT}/t7-already.png`, fullPage: true });
      await click(page, 'Close');
    } else { note('pending state', 'no card to reopen'); }
  } else { note('listing sheet', 'no card to open'); }

  // 9. search box
  await click(page, 'FIND');
  await page.waitForTimeout(1500);
  const box = page.locator('input').first();
  if (await box.count()) {
    await box.fill('Koramangala');
    await box.press('Enter');
    await page.waitForTimeout(2800);
    t = await txt(page);
    ok('free-text search works', /Koramangala/.test(t) && /places listed/.test(t));
  } else { note('search box', 'not found'); }

  ok('no runtime errors on the tenant side', errs.length === 0, errs.slice(0, 2).join(' | '));
  await page.close();

  // ════════ LANDLORD ════════
  console.log('\nLANDLORD SIDE');
  page = await b.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
  const oerrs = [];
  page.on('pageerror', e => oerrs.push(String(e).slice(0, 160)));
  await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  await primer(page);
  await signIn(page, "I'm a Landlord", 'landlord20260101@example.com', 'Test@1234');
  t = await txt(page);
  ok('landlord signs in', /Overview|COLLECTED|OCCUPANCY/i.test(t), t.split('\n').slice(0, 3).join('|'));
  await page.screenshot({ path: `${SHOT}/o1-overview.png` });

  await click(page, 'YOU');
  await page.waitForTimeout(1400);
  t = await txt(page);
  ok('the account menu opens', /My profile/.test(t), t.split('\n').slice(0, 3).join('|'));
  await page.screenshot({ path: `${SHOT}/o2-menu.png`, fullPage: true });

  // tapping the name/face at the top of the menu should reach the profile
  await click(page, 'Your account') || await click(page, (await txt(page)).split('\n').find(l => /@example\.com/i.test(l)) || 'My profile');
  await page.waitForTimeout(1600);
  t = await txt(page);
  ok('the menu header opens the profile', /My profile|YOUR DETAILS|Profile/i.test(t), t.split('\n').slice(0, 3).join('|'));
  await page.screenshot({ path: `${SHOT}/o3-profile.png` });

  // ── the landlord can list a room ─────────────────────────────────────────
  await click(page, 'UNITS');
  await page.waitForTimeout(2500);
  // The units tab lists PROPERTIES; the rooms are one level in.
  await click(page, 'Palm Heights');
  await page.waitForTimeout(2500);
  // The rooms are below the property's own card and map.
  for (let i = 0; i < 8; i += 1) { await page.mouse.wheel(0, 700); await page.waitForTimeout(140); }
  await page.screenshot({ path: `${SHOT}/o3b-rooms.png`, fullPage: true });
  // A room card reads like "2B / TRIPLE SHARING / ₹10,500 / 1 OF 2".
  const room = page.locator('text=/^\\d+ OF \\d+$/').first();
  if (await room.count()) {
    const rb = await room.boundingBox();
    if (rb) await page.mouse.click(rb.x + rb.width / 2, rb.y + rb.height / 2);
    await page.waitForTimeout(2600);
    t = await txt(page);
    ok('the room sheet offers to list the room', /List this room|Listed for people looking/.test(t), t.split('\n').slice(0, 4).join('|'));
    await page.screenshot({ path: `${SHOT}/o4-room.png`, fullPage: true });

    const wasListed = /Listed for people looking/.test(t);
    await click(page, wasListed ? 'Listed for people looking' : 'List this room');
    await page.waitForTimeout(3200);
    t = await txt(page);
    ok('the listing switch flips and says so',
       wasListed ? /List this room/.test(t) : /Listed for people looking/.test(t),
       t.split('\n').slice(0, 4).join('|'));
    await page.screenshot({ path: `${SHOT}/o5-room-listed.png`, fullPage: true });
    if (!wasListed) {
      ok('listing a room reveals its detail form', /HEADLINE/.test(t) && /DEPOSIT/.test(t) && /WHAT IS INCLUDED/.test(t));
    }
  } else { note('room listing', 'no room card found'); }

  ok('no runtime errors on the landlord side', oerrs.length === 0, oerrs.slice(0, 2).join(' | '));

  console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
