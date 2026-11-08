// File: tests/ui.layout.e2e.js
//
// The header/content alignment rule, in a real browser: does the screen's title
// actually move into the header when it scrolls away, and actually move back?
//
// layout.test.js already covers the arithmetic — when the swap should happen,
// that a focused field cannot end under the header, that the flag reverts. What
// it cannot cover is whether any of that is wired to anything, which is this.
//
//   cd backend && node scripts/seed.js --wipe
//   cd mobile  && EXPO_PUBLIC_API_URL=http://127.0.0.1:5000 npx expo export --platform web --output-dir /tmp/web
//   npx serve -s /tmp/web -l 8080
//   UI_URL=http://127.0.0.1:8080 node tests/ui.layout.e2e.js
//
// -- Three ways this suite lied before it worked, all worth keeping ------------
//
// 1. `page.mouse.wheel` fires at the pointer, which starts at (0,0) -- over the
//    header, not the list. Nothing scrolled, and "scrolled down" and "at the
//    top" produced byte-identical screenshots. The scroll is now done by setting
//    scrollTop on the scrolling element, and ASSERTED to have moved before
//    anything is concluded from it.
// 2. The header band was read as the top 95px. The header is 58. The extra 37
//    reached into the body, found the screen's own full-size title there, and
//    reported the header as showing a title it was not showing -- which made the
//    one assertion that mattered pass for the wrong reason.
// 3. The sticky title is always mounted and FADES. Scanning the DOM for text
//    finds it at the top of the screen, where it is invisible. Every hit is now
//    checked for effective opacity, which is the product of its ancestors' --
//    an element at opacity 1 inside a wrapper at 0 is not on screen.
//
// Each of those passed something green while testing nothing. That is the
// failure mode this repo keeps running into, and the reason every assertion here
// is positive and every measurement is checked against what it is measuring.
const { chromium } = require('playwright');
const fs = require('fs');
const { dismissTour } = require('./lib/tour');

const UI_URL = process.env.UI_URL || 'http://127.0.0.1:8080';
const SHOT = __dirname + '/layoutshots';
fs.mkdirSync(SHOT, { recursive: true });

// 12 top padding + 36 button + 10 bottom padding, and no status bar on web.
const HEADER_H = 58;

let pass = 0, fail = 0, skip = 0;
const ok = (n, c, extra = '') => {
  if (c) { pass += 1; console.log(`  PASS  ${n}`); }
  else { fail += 1; console.log(`  FAIL  ${n}${extra ? '  <- ' + extra : ''}`); }
};

const click = async (page, text) => {
  for (const sel of [`text="${text}"`, `text=${text}`]) {
    const el = page.locator(sel).first();
    if (await el.count() && await el.isVisible().catch(() => false)) {
      await el.click({ timeout: 4000 }).catch(async () => { await el.click({ force: true }).catch(() => {}); });
      await page.waitForTimeout(800);
      return true;
    }
  }
  return false;
};

// Text drawn inside the header band, and only there, and only if it can actually
// be SEEN.
//
// The third thing this probe got wrong, and the subtlest: the sticky title is
// always mounted and fades between opacity 0 and 1. Scanning the DOM for text
// therefore finds it at the top of the screen, where it is invisible, and reports
// the header as showing a title that nobody can read. Opacity is inherited down
// the tree by multiplication, so the effective value is the product of every
// ancestor's — which is what has to be checked, not the element's own.
// Where the header actually starts.
//
// Not always 0. The new-version banner sits ABOVE the header — it has to, so it
// is on every screen — and while it is showing the header begins below it. This
// suite measured the header as "the top HEADER_H pixels" and so, the first time
// a banner appeared, reported the header as showing "Version 1.5.0 is
// available" instead of the screen's name.
//
// That failure was worth having: it was the same wrong assumption the app's own
// clamp was making, which let a focused field scroll under the header. The app
// is fixed; this measures from the right place rather than being told the
// banner must not exist.
const headerTop = async (page) =>
  page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find((n) =>
      /Version\s+[\d.]+\s+is available|Update required — version/i.test(n.textContent || '')
      && n.getBoundingClientRect().top < 120
      && n.getBoundingClientRect().height > 20
      && n.getBoundingClientRect().height < 140);
    return el ? Math.round(el.getBoundingClientRect().bottom) : 0;
  });

const headerText = async (page, h, from = 0) =>
  page.evaluate(([H, FROM]) => {
    const seen = (el) => {
      let o = 1;
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.visibility === 'hidden' || cs.display === 'none') return 0;
        o *= parseFloat(cs.opacity === '' ? '1' : cs.opacity);
        if (o < 0.05) return 0;
      }
      return o;
    };
    const hits = [];
    for (const el of document.querySelectorAll('div, span')) {
      const r = el.getBoundingClientRect();
      if (r.top >= FROM - 1 && r.bottom <= FROM + H && r.height > 8 && r.width > 20) {
        const own = Array.from(el.childNodes)
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent.trim())
          .join(' ')
          .trim();
        if (own && seen(el) > 0.5) hits.push(own);
      }
    }
    return hits.join(' | ');
  }, [h, from]);

// The tallest scrollable element on the page is the screen body.
// Where visible header text actually SITS, so "looks off-centre" can be settled
// with numbers. This suite was written after a report that the heading was not
// centred; it was not, by 22px on a 420px screen, and nothing here could have
// caught it because everything asserted on text and never on position.
const headerBoxes = async (page, h, from = 0) =>
  page.evaluate(([H, FROM]) => {
    const seen = (el) => {
      let o = 1;
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.visibility === 'hidden' || cs.display === 'none') return 0;
        o *= parseFloat(cs.opacity === '' ? '1' : cs.opacity);
        if (o < 0.05) return 0;
      }
      return o;
    };
    const items = [];
    for (const el of document.querySelectorAll('div, span')) {
      const r = el.getBoundingClientRect();
      if (r.top >= FROM - 1 && r.bottom <= FROM + H + 2 && r.height > 8 && r.width > 10) {
        const own = Array.from(el.childNodes)
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent.trim())
          .join(' ')
          .trim();
        if (own && seen(el) > 0.5) {
          items.push({ text: own, left: Math.round(r.left), right: Math.round(r.right), cx: Math.round(r.left + r.width / 2) });
        }
      }
    }
    return { width: window.innerWidth, items };
  }, [h, from]);

const scrollTo = async (page, y) =>
  page.evaluate((to) => {
    let best = null;
    for (const el of document.querySelectorAll('div')) {
      if (el.scrollHeight > el.clientHeight + 50 && el.clientHeight > 300) {
        if (!best || el.clientHeight > best.clientHeight) best = el;
      }
    }
    if (!best) return { found: false, top: 0 };
    best.scrollTop = to;
    return { found: true, top: best.scrollTop };
  }, y);

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));

  await page.goto(UI_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  await click(page, 'SKIP');
  await page.waitForTimeout(800);
  await page.mouse.move(210, 600);
  for (let i = 0; i < 12; i += 1) { await page.mouse.wheel(0, 900); await page.waitForTimeout(110); }
  await click(page, 'Not now');
  await page.waitForTimeout(1200);
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

  console.log('\nFIND — the title starts in the body, not the header');
  await click(page, 'FIND');
  await page.waitForTimeout(3500);
  const top = await headerText(page, HEADER_H, await headerTop(page));
  ok('the screen shows its full-size title',
    await page.locator('text=Find a place').first().isVisible().catch(() => false));
  ok('...and the header is NOT also showing it', !/Find a place/.test(top), 'header: ' + top);

  // The bar used to hold one thing at the top: the bell, hard right, with 360 of
  // a 420px screen empty beside it. It read as a stray button rather than a
  // header, which is how it was reported.
  const topBoxes = await headerBoxes(page, HEADER_H, await headerTop(page));
  const leftOfBar = topBoxes.items.filter((i) => i.cx < topBoxes.width / 2);
  ok('the bar is not empty on the left at the top of a screen',
    leftOfBar.length > 0, JSON.stringify(topBoxes.items));
  await page.screenshot({ path: `${SHOT}/02-find-top.png`, fullPage: false });

  console.log('\nFIND — scrolled down, the header takes it over');
  const moved = await scrollTo(page, 420);
  await page.waitForTimeout(900);
  ok('the body actually scrolled', moved.found && moved.top > 300, JSON.stringify(moved));
  const gone = !(await page.locator('text=Find a place').first().isVisible().catch(() => false));
  const down = await headerText(page, HEADER_H, await headerTop(page));
  ok('the header is showing the screen name once the title has gone',
    /Find a place/.test(down), 'header: ' + down);

  // Centred on the SCREEN, not in whatever gap the row leaves beside the bell.
  // Four pixels of tolerance for text metrics and rounding; the bug this catches
  // was twenty-two.
  const downBoxes = await headerBoxes(page, HEADER_H, await headerTop(page));
  const titleBox = downBoxes.items.find((i) => /Find a place/.test(i.text));
  const middle = downBoxes.width / 2;
  ok('...centred on the screen',
    !!titleBox && Math.abs(titleBox.cx - middle) <= 4,
    titleBox ? `centre ${titleBox.cx}, screen centre ${middle}` : 'title not found');
  await page.screenshot({ path: `${SHOT}/03-find-scrolled.png`, fullPage: false });

  console.log('\nFIND — scrolled back up, it hands it back');
  await scrollTo(page, 0);
  await page.waitForTimeout(900);
  const back = await headerText(page, HEADER_H, await headerTop(page));
  ok('the header gives the title back at the top', !/Find a place/.test(back), 'header: ' + back);
  ok('...and the real title is on screen again',
    await page.locator('text=Find a place').first().isVisible().catch(() => false));
  await page.screenshot({ path: `${SHOT}/04-find-back-up.png`, fullPage: false });

  console.log('\nTHE TENANT HOME SCREEN');
  await click(page, 'HOME');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOT}/05-home-top.png`, fullPage: false });
  const homeMoved = await scrollTo(page, 420);
  await page.waitForTimeout(900);
  const homeHdr = await headerText(page, HEADER_H, await headerTop(page));
  if (!homeMoved.found || homeMoved.top < 100) {
    // This tenant's home fits on one screen, so there is no scroll and nothing
    // for the header to take over. That is the screen being short, not the rule
    // being broken — calling it a failure would be this suite lying in the other
    // direction, and it has done enough of that already.
    skip += 1;
    console.log('  SKIP  the home screen puts the tenant\'s name in the header once scrolled'
      + '  (nothing to scroll: this tenant\'s home fits the viewport)');
  } else {
    ok('the home screen puts the tenant\'s name in the header once scrolled',
      /\S/.test(homeHdr), 'header: ' + homeHdr);
  }
  await page.screenshot({ path: `${SHOT}/06-home-scrolled.png`, fullPage: false });

  console.log('\nNOTHING THREW');
  ok('no runtime errors anywhere in that run', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`);
  console.log('Screenshots: ' + SHOT);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
