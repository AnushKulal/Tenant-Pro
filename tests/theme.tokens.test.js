// File: tests/theme.tokens.test.js
//
// `t.lime` is a FILL. It is not a text colour.
//
// This guards one mistake that has now been made three times, and it exists
// because the mistake is invisible to whoever makes it. The redesign was built
// dark-first, and in DARK mode `t.lime` and `t.accent` are the same colour --
// byte for byte, both `acc.fill`. So writing `c={t.lime}` looks perfect on the
// machine it was written on, and is unreadable in light mode, where `t.accent`
// drops to `acc.deep` (#5A7A00) and `t.lime` stays #C8F751: pale yellow-green
// text on a near-white card.
//
// It kept happening because lime is the ONE exception in the palette. Every
// other semantic colour is already mode-aware -- light mode's base `amber` is
// '#8A5600', its `coral` '#C22A18', its `pos` '#1B8A55', all the deep readable
// tones. Reach for `t.amber` and light mode is handled for you. Reach for
// `t.lime` and it is not, and nothing says so at the call site.
//
// Until this release it also did not matter much, because Android never
// actually reported the system scheme: `userInterfaceStyle: "automatic"` is a
// no-op there without expo-system-ui, so phones stayed dark whatever the user
// had chosen. 1.5.0 added that dependency. Light mode became reachable for real
// users on Android for the first time, and every latent instance of this bug
// became visible at once. That is why it is worth a guard rather than a fix.
//
// Four things are checked:
//   1. the token definitions still mean what this file assumes -- if `lime`
//      becomes mode-aware the rule is moot, and the test should say so rather
//      than keep policing a rule that no longer applies;
//   2. the arithmetic REASON, not the naming convention: lime genuinely fails
//      WCAG AA on every light surface and accent genuinely passes;
//   3. that swapping lime -> accent is provably invisible in dark mode, which
//      is what makes the fix safe to ship without re-reviewing every screen;
//   4. no foreground use of `t.lime` anywhere in the redesign except the
//      handful that sit on a dark fill, each listed with its reason.
//
//   node tests/theme.tokens.test.js
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
    if (c) { pass += 1; console.log(`  ok   ${n}`); }
    else { fail += 1; console.log(`  FAIL ${n}${extra ? '  <- ' + extra : ''}`); }
};

const ROOT = path.join(__dirname, '..', 'mobile', 'src', 'redesign');
const THEME = fs.readFileSync(path.join(ROOT, 'theme.js'), 'utf8');

console.log('='.repeat(62));
console.log('t.lime IS A FILL, NOT A TEXT COLOUR');
console.log('='.repeat(62));

// ── 1. The definitions this whole file rests on ──────────────────────────────
console.log('\nTHE TOKENS STILL MEAN WHAT THIS TEST ASSUMES');
ok('lime is the raw fill, in both modes', /lime:\s*acc\.fill/.test(THEME),
    'theme.js no longer defines `lime: acc.fill`');
ok('accent is the mode-aware readable tone', /accent:\s*dark\s*\?\s*acc\.fill\s*:\s*acc\.deep/.test(THEME),
    'theme.js no longer defines `accent: dark ? acc.fill : acc.deep`');

// ── 2. The arithmetic reason ─────────────────────────────────────────────────
// Pulled out of theme.js rather than retyped, so the numbers cannot drift apart
// from the ones the app actually renders.
const grab = (re, what) => {
    const m = THEME.match(re);
    if (!m) throw new Error(`could not read ${what} out of theme.js`);
    return m[1];
};
const FILL = grab(/lime:\s*\{\s*fill:\s*'(#[0-9A-Fa-f]{6})'/, 'lime.fill');
const DEEP = grab(/lime:\s*\{[^}]*deep:\s*'(#[0-9A-Fa-f]{6})'/, 'lime.deep');
const LIGHT_SURFACES = grab(/ink:\s*\{\s*d:\s*\[[^\]]*\],\s*l:\s*\[([^\]]*)\]/, 'the light ink surfaces')
    .split(',').map((s) => s.trim().replace(/'/g, ''));

const lum = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
};

console.log(`\nTHE REASON, AS ARITHMETIC  (fill ${FILL}, deep ${DEEP})`);
LIGHT_SURFACES.forEach((bg) => {
    const bad = ratio(FILL, bg);
    const good = ratio(DEEP, bg);
    ok(`on ${bg}: lime fails AA (${bad.toFixed(2)}:1)`, bad < 4.5, `${bad.toFixed(2)}:1 is no longer a failure`);
    ok(`on ${bg}: accent passes AA (${good.toFixed(2)}:1)`, good >= 4.5, `only ${good.toFixed(2)}:1`);
});

// ── 3. Why the fix is safe to ship ───────────────────────────────────────────
console.log('\nTHE SWAP IS INVISIBLE IN DARK MODE');
ok('in dark mode accent and lime are the same colour, so no dark screen moved',
    /accent:\s*dark\s*\?\s*acc\.fill/.test(THEME) && /lime:\s*acc\.fill/.test(THEME));

// ── 4. The scan ──────────────────────────────────────────────────────────────
// Each exemption names the dark thing it sits on. A `t.lime` foreground is only
// correct when the background is dark in BOTH modes -- a `t.on` fill, or a
// hardcoded scrim -- because `t.on` (#08080A) does not move between modes.
const ALLOWED = [
    ['screens/PortalHomeScreen.js', 'IN 24 DAYS', 'on the t.on pill inside the lime rent card'],
    ['screens/PortalHomeScreen.js', 'Pay</T>', 'on the t.on Pay button inside the lime rent card'],
    ['screens/PortalHomeScreen.js', 'arrow-forward', 'on the same t.on Pay button'],
    ['screens/RoleScreen.js', 'arrow-forward', 'on the t.on circle inside the lime role card'],
    ['screens/PropertyScreen.js', 'star', 'on a hardcoded rgba(8,8,10,.66) scrim over the hero image'],
];

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : (e.name.endsWith('.js') ? [p] : []);
});

// Foreground props only: `c=` is the T component's colour, `color=` is Glyph's.
// backgroundColor/borderColor/tintColor/colors=[...] are fills and tints and are
// none of this test's business.
const FOREGROUND = /(?:\bc|\bcolor)=\{[^}]*\bt\.lime\b/;

const hits = [];
walk(ROOT).forEach((p) => {
    const rel = path.relative(ROOT, p).split(path.sep).join('/');
    fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
        if (FOREGROUND.test(line)) hits.push({ rel, line: i + 1, src: line.trim() });
    });
});

console.log(`\nNO t.lime FOREGROUND OUTSIDE THE ${ALLOWED.length} DARK-BACKED SITES`);
const matches = (h, [file, marker]) => h.rel === file && h.src.includes(marker);
const unexplained = hits.filter((h) => !ALLOWED.some((a) => matches(h, a)));
ok(`every t.lime foreground is accounted for (${hits.length} found)`, unexplained.length === 0,
    unexplained.map((h) => `${h.rel}:${h.line}`).join(', ') + ' -- use t.accent, or add it above with the dark background it sits on');

// An exemption that stops matching is an exemption that has quietly become a
// licence for the next one. Fail it rather than let the list rot.
ALLOWED.forEach((a) => {
    ok(`exemption still real: ${a[0].split('/').pop()} "${a[1]}" (${a[2]})`,
        hits.some((h) => matches(h, a)), 'nothing matches it any more -- delete the entry');
});

console.log('\n' + '='.repeat(62));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
