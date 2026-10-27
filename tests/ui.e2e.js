// The actual app, in a browser engine, clicking actual buttons.
//
// Not the emulator the user asked for — this container has no KVM, so an Android
// emulator cannot start. What this IS: the same JavaScript the phone runs. Same
// AppContext, same deriveVm, same screens, same api.js, same axios interceptors,
// talking to a real server and a real MySQL. react-native-web lays it out, which is
// exactly what `expo export --platform web` does.
//
// What it therefore CANNOT cover, said plainly so nobody mistakes a green run for
// full coverage: the camera, the image picker, push notifications, the UPI intent
// hand-off, and anything else behind a native module. Those are native code; the web
// build stubs them.
const path = require('path');
const { chromium } = require(path.join(__dirname, 'node_modules/playwright-core'));
const fs = require('fs');

const SHOTS = path.join(__dirname, 'uishots');
fs.mkdirSync(SHOTS, { recursive: true });

let ok = 0, bad = 0;
const fails = [];
const chk = (n, c, got) => {
    if (c) { ok++; console.log('  ok   ' + n); }
    else { bad++; fails.push(n); console.log('  FAIL ' + n + (got !== undefined ? '  -> ' + String(got).slice(0, 200) : '')); }
};
const section = (s) => console.log('\n' + s);

// Console errors and failed requests are collected for the whole run. A screen that
// renders but logs "Cannot read property 'map' of undefined" is broken, and a human
// clicking through would not notice.
const consoleErrors = [];
const failedRequests = [];

const OWNER = process.env.E2E_OWNER;
const TENANT = process.env.E2E_TENANT;
const PASS = 'Test@1234';

(async () => {
const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // Font loading and a react-native-web shim warning are noise in this harness, not
    // app faults. Everything else is recorded.
    if (/Failed to load resource.*\.ttf|favicon|Download the React DevTools/i.test(t)) return;
    consoleErrors.push(t);
});
page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message));
page.on('requestfailed', (r) => {
    if (/\.ttf|favicon/i.test(r.url())) return;
    failedRequests.push(`${r.method()} ${r.url()} — ${r.failure() && r.failure().errorText}`);
});

const shot = async (name) => {
    await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: false });
    return path.join(SHOTS, name + '.png');
};
const settle = (ms = 900) => page.waitForTimeout(ms);
// react-native-web renders text into nested divs, so a text selector is the way in —
// but `text=Sign in` is a case-insensitive SUBSTRING match, and on the login screen it
// matches the "OWNER SIGN IN" eyebrow before it reaches the button. The first version
// of this harness spent its whole run clicking that heading and concluding the app was
// broken. Exact match first (`text="..."`), substring only as a fallback.
const exact = (t) => page.locator(`text="${t}"`);
const loose = (t) => page.locator(`text=${t}`);
const findVisible = async (t, timeout) => {
    for (const loc of [exact(t), loose(t)]) {
        const n = await loc.count();
        for (let i = 0; i < Math.min(n, 5); i += 1) {
            const el = loc.nth(i);
            try { await el.waitFor({ state: 'visible', timeout: Math.min(timeout, 1500) }); return el; }
            catch (e) { /* try the next */ }
        }
    }
    return null;
};
const seeText = async (t, timeout = 6000) => !!(await findVisible(t, timeout));
const tap = async (t, timeout = 6000) => {
    const el = await findVisible(t, timeout);
    if (!el) return false;
    try { await el.click({ timeout: 4000 }); await settle(); return true; }
    catch (e) { return false; }
};
// Fields are RNW <input>s; they carry the placeholder from the Field component.
const fill = async (placeholder, value) => {
    try {
        const el = page.locator(`input[placeholder="${placeholder}"]`).first();
        await el.waitFor({ state: 'visible', timeout: 5000 });
        await el.click();
        await el.fill('');
        await el.pressSequentially(String(value), { delay: 8 });
        return true;
    } catch (e) { return false; }
};
const fillNth = async (n, value) => {
    try {
        const el = page.locator('input').nth(n);
        await el.waitFor({ state: 'visible', timeout: 5000 });
        await el.click();
        await el.fill('');
        await el.pressSequentially(String(value), { delay: 8 });
        return true;
    } catch (e) { return false; }
};

// ══ BOOT ════════════════════════════════════════════════════════════════════
section('THE APP BOOTS');
await page.goto(process.env.UI_URL || 'http://127.0.0.1:4173', { waitUntil: 'networkidle', timeout: 60000 });
await settle(2500);
chk('the page loads without a blank screen', (await page.locator('body').innerText()).trim().length > 0);
await shot('01-boot');
const bootText = await page.locator('body').innerText();
chk('...and shows something recognisable', /TenantPro|Sign in|landlord|tenant|Get started|Continue/i.test(bootText), bootText.slice(0, 160));

// ══ ONBOARDING / ROLE ═══════════════════════════════════════════════════════
section('GETTING TO A SIGN-IN SCREEN');
// Walk the first-run flow: the carousel, then the permissions primer whose button
// ("Not now" / "Continue") sits BELOW the fold on a phone-sized viewport. The first
// version of this harness never got past that screen, and because it asserted the
// ABSENCE of strings the primer also lacks, half the suite passed vacuously. Every
// check below is positive for that reason.
const dismissAll = async () => {
    for (let round = 0; round < 12; round += 1) {
        let moved = false;
        for (const label of ['Get started', 'Next', 'Not now', 'Continue', 'Skip']) {
            // Scroll to the end first: Playwright auto-scrolls to click, but the label
            // has to be IN the DOM, and a long scroller renders it anyway.
            await page.mouse.wheel(0, 2000);
            await page.waitForTimeout(120);
            if (await tap(label, 900)) { moved = true; break; }
        }
        if (!moved) break;
    }
};
await dismissAll();
await shot('02-after-intro');
const sawRole = await seeText("I'm a Landlord", 5000);
chk('the role picker is reached', sawRole, (await page.locator('body').innerText()).slice(0, 240));
chk("...offering the tenant side too", await seeText("I'm a Tenant", 2000));
await tap("I'm a Landlord", 4000);
await settle(1200);
await shot('03-role-picked');

// ══ LANDLORD SIGN IN ════════════════════════════════════════════════════════
section('LANDLORD SIGN IN');
const onSignIn = await seeText('OWNER SIGN IN', 6000) || await seeText('Hello', 6000);
chk('the sign-in screen is shown', onSignIn, (await page.locator('body').innerText()).slice(0, 240));
chk('...with two fields to fill', (await page.locator('input').count()) >= 2, await page.locator('input').count());
await shot('04-signin');

// Wrong password first: the error has to be visible and must NOT sign anyone out.
await fillNth(0, OWNER);
await fillNth(1, 'definitely-wrong');
await tap('Sign in', 4000);
await settle(2000);
const wrongText = await page.locator('body').innerText();
chk('a wrong password shows an error', /incorrect|invalid|wrong|not match|credential/i.test(wrongText), wrongText.slice(0, 260));
// The regression that mattered: this said "Your session expired. Please sign in
// again." on the screen you were signing in on, over the top of the server's own
// WRONG_PASSWORD message.
chk('...and NOT a sentence about an expired session', !/session expired/i.test(wrongText), (wrongText.match(/.{0,60}session expired.{0,40}/i) || [])[0]);
chk('...and stays on the sign-in screen', /OWNER SIGN IN/i.test(wrongText));
await shot('05-wrong-password');

await fillNth(0, OWNER);
await fillNth(1, PASS);
await tap('Sign in', 4000);
await settle(4000);
const afterLogin = await page.locator('body').innerText();
// POSITIVE: the dashboard shows seeded money. Asserting "not the login screen" is how
// the first run of this file reported a pass while still sitting on the primer.
chk('the right password gets in', /₹/.test(afterLogin) && !/OWNER SIGN IN/i.test(afterLogin), afterLogin.slice(0, 240));
await shot('06-dashboard');

// ══ DASHBOARD ═══════════════════════════════════════════════════════════════
section('THE DASHBOARD SHOWS REAL SEEDED DATA');
const dash = await page.locator('body').innerText();
chk('rupee figures are rendered', /₹/.test(dash), dash.slice(0, 200));
chk('...and not NaN', !/NaN/.test(dash), (dash.match(/.{0,40}NaN.{0,40}/) || [])[0]);
chk('...and no literal undefined on screen', !/\bundefined\b/.test(dash), (dash.match(/.{0,40}undefined.{0,40}/) || [])[0]);
chk('...and no "[object Object]"', !/\[object Object\]/.test(dash), 'object leak');

// ══ EVERY TAB ═══════════════════════════════════════════════════════════════
section('EVERY BOTTOM-TAB SCREEN RENDERS');
// Label-driven rather than coordinate-driven, so a renamed tab shows up as a miss
// here rather than as a click into empty space.
const tabs = ['OVERVIEW', 'UNITS', 'PEOPLE', 'LEDGER'];
const reached = [];
for (const t of tabs) {
    if (await tap(t, 1500)) {
        await settle(1400);
        const body = await page.locator('body').innerText();
        reached.push(t);
        chk(`${t} renders content`, body.trim().length > 40, body.slice(0, 100));
        chk(`...${t} has no undefined on screen`, !/\bundefined\b/.test(body), (body.match(/.{0,40}undefined.{0,40}/) || [])[0]);
        chk(`...${t} has no NaN`, !/NaN/.test(body), (body.match(/.{0,30}NaN.{0,30}/) || [])[0]);
        await shot(`tab-${t.toLowerCase()}`);
    }
}
chk('at least three tabs were reachable', reached.length >= 3, reached.join(','));

// ══ A PROPERTY, A ROOM, A TENANT ════════════════════════════════════════════
section('DRILLING INTO THE SEEDED PORTFOLIO');
const wentToPlaces = await tap('UNITS', 3000); await settle(1800);
const placesBody = await page.locator('body').innerText();
chk('the UNITS tab is reachable', wentToPlaces, 'no UNITS tab');
chk('the property list is not empty', /Residency|Nest|Heights|Enclave|Courtyard|Villa|Mansion|Homes|Lotus|Palm|Orchid|Maple|Tulip|Banyan|Cedar|Jasmine|Amber|Silver Oak|Green Meadows/.test(placesBody), placesBody.slice(0, 300));
await shot('07-places');

await tap('PEOPLE', 2500); await settle(1800);
const peopleBody = await page.locator('body').innerText();
chk('the tenant list is not empty', peopleBody.length > 60, peopleBody.slice(0, 200));
chk('...and the unassigned tenant does not render a broken room label',
    !/UNIT\s*(undefined|null|NaN)/i.test(peopleBody), (peopleBody.match(/UNIT\s*\S{0,12}/gi) || []).slice(0, 6).join(' | '));
await shot('08-people');

// ══ FILTERS ════════════════════════════════════════════════════════════════
section('THE PEOPLE FILTERS ACTUALLY FILTER');
// The seed makes these counts knowable: ten tenants, exactly one overdue, exactly one
// unassigned. A chip that filters nothing would show the same list every time.
const countCards = async () => {
    const b = await page.locator('body').innerText();
    return (b.match(/SCORE\s*[+-]?\d+/g) || []).length;
};
const all = await countCards();
chk('the unfiltered list shows every seeded tenant', all >= 8, all);
if (await tap('OVERDUE', 2500)) {
    await settle(1400);
    const n = await countCards();
    chk('OVERDUE narrows the list', n < all && n >= 1, { all, overdue: n });
    await shot('08b-filter-overdue');
}
if (await tap('UNASSIGNED', 2500)) {
    await settle(1400);
    const n = await countCards();
    const b = await page.locator('body').innerText();
    chk('UNASSIGNED narrows it too', n < all, { all, unassigned: n });
    // The row the seed exists to produce: a tenant with no room must not render a
    // label reading "UNIT undefined".
    chk('...and an unassigned tenant shows no broken room label',
        !/UNIT\s*(undefined|null|NaN)/i.test(b), (b.match(/UNIT\s*\S{0,12}/gi) || []).join(' | '));
    await shot('08c-filter-unassigned');
}
if (await tap('ALL', 2500)) {
    await settle(1400);
    chk('ALL puts everybody back', (await countCards()) === all, { all, back: await countCards() });
}

section('SEARCH NARROWS THE LIST');
const searchBox = page.locator('input[placeholder*="Search"]').first();
if (await searchBox.count()) {
    await searchBox.click();
    await searchBox.pressSequentially('Rahul', { delay: 15 });
    await settle(1400);
    const b = await page.locator('body').innerText();
    chk('searching a real name finds somebody', /Rahul/.test(b), b.slice(0, 200));
    chk('...and drops the others', (await countCards()) < all, { all, found: await countCards() });
    await searchBox.fill('');
    await searchBox.pressSequentially('zzzzz-nobody', { delay: 10 });
    await settle(1400);
    const none = await page.locator('body').innerText();
    chk('a search matching nobody says so', /No one matches/i.test(none), none.slice(0, 200));
    await shot('08d-search-empty');
    await searchBox.fill('');
    await settle(900);
}

// ══ SETTINGS AND THE GATEWAY SHEET ══════════════════════════════════════════
section('SETTINGS, AND THE NEW GATEWAY SHEET');
await tap('YOU', 2500);
await settle(1500);
await shot('09-menu');
const openedSettings = await tap('Settings', 2000);
await settle(1200);
if (openedSettings) await shot('10-settings');
const sawOnline = await seeText('Online payments', 3000);
chk('the Online payments row is on Settings', sawOnline, (await page.locator('body').innerText()).slice(0, 300));
if (sawOnline) {
    await tap('Online payments', 2000);
    await settle(1200);
    const sheet = await page.locator('body').innerText();
    chk('the gateway sheet opens', /Online payments/i.test(sheet), sheet.slice(0, 200));
    chk('...stating what it costs', /2%|GST/i.test(sheet), sheet.slice(0, 400));
    chk('...and what Razorpay will ask for', /PAN|business proof/i.test(sheet), sheet.slice(0, 500));
    chk('...and that UPI is kept', /UPI/i.test(sheet));
    chk('...and that tenants pay only the rent', /only the rent/i.test(sheet));
    await shot('11-gateway-sheet');
    // Connect must be refused while the fields are empty.
    const bodyBefore = await page.locator('body').innerText();
    await tap('Connect', 1500);
    await settle(900);
    chk('Connect with empty fields does not navigate away',
        /Online payments/i.test(await page.locator('body').innerText()), 'left the sheet');
    await tap('Cancel', 1500) || await page.keyboard.press('Escape');
    await settle(800);
}

// ══ PAYMENT SETTINGS VALIDATION ═════════════════════════════════════════════
section('PAYMENT SETTINGS VALIDATES BEFORE IT SENDS');
// The UPI row lives inline on Settings and opens the sheet; there is no separate
// "Payment settings" entry to tap.
// The whole row is one Press; clicking its stored VALUE lands inside it. Tried by
// text first, then by walking up to the nearest clickable ancestor, because an
// eyebrow label and a hint line are both children of the same pressable.
let openedUpi = false;
const upiValue = page.locator('text=rohit@okaxis').first();
if (await upiValue.count()) {
    try { await upiValue.click({ timeout: 3000 }); await settle(1200); openedUpi = true; } catch (e) {}
}
if (!openedUpi) openedUpi = await tap('UPI ID', 2000);
if (openedUpi && await seeText('Save', 2500)) {
    await settle(1000);
    await shot('12-paysettings');
    await fillNth(0, 'not-a-upi-id');
    await tap('Save', 1500);
    await settle(900);
    const t = await page.locator('body').innerText();
    chk('a malformed UPI ID is refused in the form', /name@bank|does not look right|invalid/i.test(t), t.slice(0, 300));
    chk('...before anything is sent to the server', !/saved/i.test(t), t.slice(0, 200));
    await shot('13-upi-invalid');
    await tap('Cancel', 1500) || await page.keyboard.press('Escape');
    await settle(700);
} else {
    // Said out loud rather than reported as a pass. The server-side half of this rule
    // IS covered — the API run asserts a malformed UPI ID is refused — but the form's
    // own check is not, and a silent skip would read as coverage that does not exist.
    console.log('  SKIP the UPI form check — this harness could not open that sheet');
}

// ══ THE TENANT PORTAL, IN A FRESH SESSION ══════════════════════════════════
// A NEW browser context rather than signing out of this one. Two reasons: a fresh
// context is a genuinely fresh install, which is the state a real tenant starts from;
// and chaining the tenant run behind a sign-out made every tenant assertion depend on
// the sign-out path working, so one broken step reported five failures.
section('THE TENANT PORTAL (fresh session)');
const tctx = await browser.newContext({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
const tpage = await tctx.newPage();
tpage.on('pageerror', (e) => consoleErrors.push('PAGEERROR(tenant): ' + e.message));
tpage.on('requestfailed', (r) => { if (!/\.ttf|favicon/i.test(r.url())) failedRequests.push(`${r.method()} ${r.url()}`); });

const tSettle = (ms = 900) => tpage.waitForTimeout(ms);
const tFind = async (t, timeout = 5000) => {
    for (const loc of [tpage.locator(`text="${t}"`), tpage.locator(`text=${t}`)]) {
        const n = await loc.count();
        for (let i = 0; i < Math.min(n, 5); i += 1) {
            try { await loc.nth(i).waitFor({ state: 'visible', timeout: Math.min(timeout, 1500) }); return loc.nth(i); } catch (e) {}
        }
    }
    return null;
};
const tTap = async (t, timeout = 5000) => {
    const el = await tFind(t, timeout);
    if (!el) return false;
    try { await el.click({ timeout: 4000 }); await tSettle(); return true; } catch (e) { return false; }
};
const tType = async (n, v) => {
    const el = tpage.locator('input').nth(n);
    await el.waitFor({ state: 'visible', timeout: 5000 });
    await el.click(); await el.fill('');
    await el.pressSequentially(String(v), { delay: 8 });
};
const tShot = (name) => tpage.screenshot({ path: path.join(SHOTS, name + '.png') });

await tpage.goto(process.env.UI_URL || 'http://127.0.0.1:4173', { waitUntil: 'networkidle', timeout: 60000 });
await tSettle(2500);
for (let round = 0; round < 12; round += 1) {
    let moved = false;
    for (const label of ['Get started', 'Next', 'Not now', 'Continue', 'Skip']) {
        await tpage.mouse.wheel(0, 2000); await tpage.waitForTimeout(120);
        if (await tTap(label, 900)) { moved = true; break; }
    }
    if (!moved) break;
}
chk('a fresh install reaches the role picker', await tTap("I'm a Tenant", 5000));
await tSettle(1500);
await tShot('15-tenant-signin');
await tType(0, TENANT);
await tType(1, PASS);
await tTap('Sign in', 4000);
await tSettle(4500);
const portal = await tpage.locator('body').innerText();
chk('a tenant can sign in', /₹/.test(portal) && !/SIGN IN/i.test(portal), portal.slice(0, 240));
chk('...and sees their rent', /₹/.test(portal), portal.slice(0, 220));
chk('...with no undefined on screen', !/\bundefined\b/.test(portal), (portal.match(/.{0,40}undefined.{0,40}/) || [])[0]);
chk('...and no NaN', !/NaN/.test(portal), (portal.match(/.{0,30}NaN.{0,30}/) || [])[0]);
chk('...and no broken room label', !/UNIT\s*(undefined|null|NaN)/i.test(portal), (portal.match(/UNIT\s*\S{0,12}/gi) || []).join(' | '));
await tShot('16-portal-home');

section('TENANT TABS');
// Run BEFORE the pay flow. The pay screen is a full-screen route with no bottom tab
// bar, so visiting it first left the tab loop with nothing to tap and reported four
// perfectly good screens as unreachable.
let tenantTabsSeen = 0;
for (const t of ['FIND', 'HELP', 'ME', 'HOME']) {
    if (await tTap(t, 1200)) {
        await tSettle(1400);
        const b = await tpage.locator('body').innerText();
        if (b.trim().length < 40) continue;
        tenantTabsSeen += 1;
        chk(`tenant ${t} renders`, b.trim().length > 40, b.slice(0, 100));
        chk(`...${t} has no undefined`, !/\bundefined\b/.test(b), (b.match(/.{0,40}undefined.{0,40}/) || [])[0]);
        chk(`...${t} has no NaN`, !/NaN/.test(b), (b.match(/.{0,30}NaN.{0,30}/) || [])[0]);
        await tShot(`tenant-${t.toLowerCase().replace(/\s+/g, '-')}`);
    }
}
chk('at least three tenant screens were reachable', tenantTabsSeen >= 3, tenantTabsSeen);
section('THE TENANT PAY SCREEN');
const wentToPay = await tTap('Pay rent', 3000) || await tTap('Pay', 3000);
await tSettle(2200);
if (wentToPay) {
    const pay = await tpage.locator('body').innerText();
    chk('the pay screen renders', /Pay|UPI|₹/i.test(pay), pay.slice(0, 220));
    chk('...offering UPI, which is always free', /UPI/i.test(pay), pay.slice(0, 300));
    // The landlord in this seed has NOT connected a gateway, so the online option must
    // not be drawn. Drawing it would send a tenant to a page that cannot be made.
    chk('...and NOT offering online payment, since no gateway is connected',
        !/by card, UPI or netbanking/i.test(pay), 'online option shown with no gateway');
    chk('...with no platform fee', /₹0|NO PLATFORM FEE/i.test(pay), pay.slice(0, 500));
    await tShot('17-pay');
} else {
    chk('the pay screen is reachable', false, 'no Pay button found');
}

await tctx.close();

// ══ THE WHOLE RUN ═══════════════════════════════════════════════════════════
section('NOTHING BROKE ALONG THE WAY');
chk('no uncaught page errors', consoleErrors.filter((e) => e.startsWith('PAGEERROR')).length === 0,
    consoleErrors.filter((e) => e.startsWith('PAGEERROR')).slice(0, 3).join(' | '));
chk('no failed API requests', failedRequests.length === 0, failedRequests.slice(0, 3).join(' | '));
if (consoleErrors.length) {
    console.log('\n  console errors seen (not all are faults):');
    [...new Set(consoleErrors)].slice(0, 12).forEach((e) => console.log('    · ' + e.slice(0, 180)));
}

await browser.close();
console.log(`\n${'='.repeat(60)}`);
console.log(`${ok} passed, ${bad} failed`);
if (fails.length) { console.log('\nFAILURES:'); fails.forEach((f) => console.log('  · ' + f)); }
console.log(`\nScreenshots: ${SHOTS}`);
process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('THREW:', e); process.exit(1); });
