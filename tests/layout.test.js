// The header/content alignment rule, driven through the REAL layout.js.
//
// Three things in that file are pure functions of numbers, and all three are
// things a screenshot cannot check:
//
//   crossed()           when the header takes the title over, and — the part that
//                       matters — when it must NOT, because a value sitting on the
//                       boundary would otherwise strobe the title in and out every
//                       frame of a scroll.
//   clampFocusScroll()  that a field you are typing in can never be scrolled under
//                       the header. This is the WCAG 2.2 requirement, and it is
//                       invisible until it happens to somebody mid-sentence.
//   bodyPad()           that the flag is a real revert: with HEADER_LAYOUT at 'v1'
//                       every screen gets back the exact padding it had, not a
//                       number somebody remembered.
//
// The flag is a build-time constant, so both sides of it are tested by stubbing
// appConfig and loading layout.js again — the same file, told a different answer,
// rather than a copy of its logic that agrees with it today and not tomorrow.
const path = require('path');
const Module = require('module');
const MB = '/home/user/Tenant-Pro/mobile/';

// Same require hook as vm.gateway.test.js: the app's source is ESM with JSX, so
// it is compiled on the way in and the REAL module runs.
const babel = require(MB + 'node_modules/@babel/core');
const BABEL_OPTS = {
    configFile: false,
    babelrc: false,
    presets: [MB + 'node_modules/@babel/preset-react'],
    plugins: [MB + 'node_modules/@babel/plugin-transform-modules-commonjs']
};
const jsLoader = Module._extensions['.js'];
Module._extensions['.js'] = function (mod, filename) {
    if (!filename.startsWith(MB + 'src/')) return jsLoader(mod, filename);
    const out = babel.transformFileSync(filename, BABEL_OPTS);
    return mod._compile(out.code, filename);
};

let ok = 0, bad = 0;
const fails = [];
const chk = (n, c, got) => {
    if (c) { ok++; console.log('  ok   ' + n); }
    else {
        bad++; fails.push(n);
        let shown; try { shown = JSON.stringify(got); } catch (e) { shown = String(got); }
        console.log('  FAIL ' + n + '  -> ' + String(shown === undefined ? '(undefined)' : shown));
    }
};
const section = (s) => console.log('\n' + s);

// ── Stub only what importing layout.js drags in ───────────────────────────────
const stub = (id, exports) => {
    let key = id;
    try { key = require.resolve(id, { paths: [MB] }); } catch (e) { /* virtual */ }
    require.cache[key] = { id: key, exports, loaded: true, children: [], paths: [] };
};
const noop = () => {};
const Animated = { View: 'Animated.View', Value: function () { this.interpolate = () => this; }, timing: () => ({ start: noop }) };
stub('react-native', {
    View: 'View',
    ScrollView: 'ScrollView',
    Platform: { OS: 'android', select: (o) => o.android || o.default },
    Animated
});
stub(MB + 'src/redesign/ThemeContext.js', { useT: () => ({ fg: '#fff', fg2: '#aaa' }) });
stub(MB + 'src/redesign/ui.js', { T: 'T' });

// Load layout.js with the flag at a chosen value. Clearing it from the cache is
// what makes the second load read the stubbed config rather than hand back the
// first load's module.
const loadLayout = (flag) => {
    stub(MB + 'src/appConfig.js', {
        HEADER_LAYOUT: flag,
        UI_VERSION: 'v2',
        isRedesign: () => true,
        isLayoutRule: () => flag === 'v2'
    });
    delete require.cache[require.resolve(MB + 'src/redesign/layout.js')];
    return require(MB + 'src/redesign/layout.js');
};

const L = loadLayout('v2');
const OFF = loadLayout('v1');
// Re-load so the rest of the file is testing the rule as it ships.
const ON = loadLayout('v2');

console.log('='.repeat(60));
console.log('THE ALIGNMENT RULE');
console.log('='.repeat(60));

// ── When the header takes the title over ──────────────────────────────────────
section('THE HEADER TAKES THE TITLE OVER ONLY ONCE THE TITLE IS GONE');
{
    const c = ON.crossed;
    // A title block ending 120px into the content.
    chk('at the top, the header shows no title', c(false, 0, 120) === false, c(false, 0, 120));
    chk('...still not while the title is only half scrolled', c(false, 60, 120) === false, c(false, 60, 120));
    chk('...nor exactly as its last pixel leaves', c(false, 120, 120) === false, c(false, 120, 120));
    chk('...and takes over once it is clear', c(false, 200, 120) === true, c(false, 200, 120));
    chk('scrolling back up hands it back', c(true, 0, 120) === false, c(true, 0, 120));
}

section('A FINGER RESTING ON THE BOUNDARY CANNOT STROBE IT');
{
    const c = ON.crossed;
    // The whole point of the dead band: inside it, the answer is whatever it
    // already was. A single threshold here would flip on every jitter frame.
    chk('just past the edge, already showing: stays showing', c(true, 125, 120) === true, c(true, 125, 120));
    chk('just past the edge, not yet showing: stays hidden', c(false, 125, 120) === false, c(false, 125, 120));
    chk('just before the edge, showing: stays showing', c(true, 115, 120) === true, c(true, 115, 120));
    chk('one scroll gesture through the band changes it once',
        c(c(c(false, 118, 120), 122, 120), 160, 120) === true);
}

section('A SCREEN WITH NO MEASURED TITLE IS LEFT ALONE');
{
    const c = ON.crossed;
    // Before onLayout has run, or on a screen that never registers a title, the
    // edge is 0. Comparing against 0 would show the sticky title the instant you
    // touched the screen, naming something that is still in front of you.
    chk('an unmeasured title never triggers the swap', c(false, 900, 0) === false, c(false, 900, 0));
    chk('...and never un-triggers one either', c(true, 900, 0) === true, c(true, 900, 0));
    chk('a negative edge is treated the same', c(false, 900, -5) === false, c(false, 900, -5));
}

// ── The keyboard and the header ───────────────────────────────────────────────
section('A FIELD YOU ARE TYPING IN NEVER ENDS UP UNDER THE HEADER');
{
    const clamp = ON.clampFocusScroll;
    const H = ON.HEADER_H;
    // A field near the bottom of a long page: masses of room above it, so the
    // handler's own figure is used untouched. This is the common case and the
    // clamp must not interfere with it.
    chk('a field low on the page scrolls by exactly what the keyboard covers',
        clamp(180, 700, 24) === 180, clamp(180, 700, 24));

    // A field close to the top — 150px down a tall page, which happens as soon as
    // a form's first field is focused on a page long enough to scroll. The
    // keyboard wants it moved 180px up; there are only (150 - 24 - HEADER_H - 12)
    // px between it and the header, so it gets those and not a pixel more.
    const room = 150 - 24 - H - 12;
    chk('a field near the top is moved only as far as the header allows',
        clamp(180, 150, 24) === room, { got: clamp(180, 150, 24), room });
    chk('...which is much less than the keyboard asked for', room > 0 && room < 180, room);

    // Already behind the header: scrolling at all makes it worse.
    chk('a field already under the header is not scrolled further under it',
        clamp(180, 30, 24) === 0, clamp(180, 30, 24));
    chk('a field exactly at the header edge is left alone',
        clamp(180, 24 + H, 24) === 0, clamp(180, 24 + H, 24));

    // The status bar is part of the offset: the same field on a phone with a
    // taller status bar has less room, not the same.
    chk('a taller status bar leaves less room, not the same',
        clamp(180, 150, 48) < clamp(180, 150, 24),
        { tall: clamp(180, 150, 48), short: clamp(180, 150, 24) });

    // Nonsense in, the handler's own figure out — a missing measurement must not
    // silently become "do not scroll", which would leave the field under the
    // keyboard instead.
    chk('an unmeasurable field falls back to the keyboard handler',
        clamp(180, undefined, 24) === 180, clamp(180, undefined, 24));
    chk('...and so does a NaN', clamp(180, NaN, 24) === 180, clamp(180, NaN, 24));
}

section('WITH THE FLAG OFF, THE KEYBOARD BEHAVES EXACTLY AS IT DID');
{
    // This is the revert that matters most: the clamp is new behaviour inside a
    // handler that was working, so 'v1' has to be a straight pass-through.
    chk('no clamping at all', OFF.clampFocusScroll(180, 30, 24) === 180, OFF.clampFocusScroll(180, 30, 24));
    chk('...for a field near the top either', OFF.clampFocusScroll(180, 300, 24) === 180);
}

// ── The anchor ────────────────────────────────────────────────────────────────
section('CONTENT IS ANCHORED ONE CONSISTENT DISTANCE BELOW THE HEADER');
{
    // The eight different top paddings the screens used to carry, each asking for
    // the same anchor now.
    const tops = [12, 13, 14, 15, 16, 22, 24, 26];
    const got = tops.map((top) => ON.bodyPad({ bottom: 22, was: { top } }).paddingTop);
    chk('every screen starts in the same place', got.every((v) => v === ON.ANCHOR), got);
    chk('...and that place is the anchor, not zero', ON.ANCHOR > 0, ON.ANCHOR);

    const pad = ON.bodyPad({ bottom: 22, was: { top: 26 } });
    chk('the gutter is the gutter', pad.paddingHorizontal === ON.GUTTER, pad);
    chk('the screen still chooses its own bottom padding', pad.paddingBottom === 22, pad);

    // A full-bleed screen says so and keeps its edge-to-edge content.
    const bleed = ON.bodyPad({ bottom: 0, edge: true });
    chk('a full-width screen keeps no side padding', bleed.paddingHorizontal === 0, bleed);

    // An explicit top wins over the anchor, for the screen that genuinely needs
    // a different one.
    chk('a screen can still ask for its own top', ON.bodyPad({ top: 40 }).paddingTop === 40);
}

section('WITH THE FLAG OFF, EVERY SCREEN GETS ITS OWN PADDING BACK');
{
    const tops = [12, 13, 14, 15, 16, 22, 24, 26];
    const got = tops.map((top) => OFF.bodyPad({ bottom: 22, was: { top } }).paddingTop);
    chk('each of the eight original top paddings returns', got.join() === tops.join(), got);
    chk('a screen with an unusual gutter gets that back too',
        OFF.bodyPad({ was: { side: 22 } }).paddingHorizontal === 22,
        OFF.bodyPad({ was: { side: 22 } }));
    chk('bottom padding is the screen\'s either way',
        OFF.bodyPad({ bottom: 26, was: { top: 14 } }).paddingBottom === 26);
}

section('THE HEADER HEIGHT THE CLAMP USES MATCHES THE HEADER');
{
    // The clamp cannot measure the header — it runs inside a keyboard event, long
    // before any layout pass it could read — so the height is a constant, and a
    // constant that disagrees with the bar is a field half under it. The bar is
    // 12 + 36 + 10 in Header.js.
    chk('58 = 12 top padding + 36 button + 10 bottom padding', ON.HEADER_H === 12 + 36 + 10, ON.HEADER_H);
}

console.log('\n' + '='.repeat(60));
if (bad) console.log('FAILED: ' + fails.join(', '));
console.log(ok + ' passed, ' + bad + ' failed');
process.exit(bad ? 1 : 0);
