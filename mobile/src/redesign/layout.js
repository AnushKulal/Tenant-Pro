// File: mobile/src/redesign/layout.js
//
// Where the header goes, where the content goes, and how they stay out of each
// other's way. One file, because the rule only works if there is one copy of it.
//
// ── The rule ─────────────────────────────────────────────────────────────────
//
// A phone screen is three regions, outermost first:
//
//   1. the system bars          — the OS owns these; we only leave room
//   2. the header               — directly below them, above ALL content
//   3. the body                 — anchored directly below the header
//
// Header at the top → content anchored below it → the header sets context →
// the header never hides the thing you are looking at or typing in.
//
// ── What was actually wrong ──────────────────────────────────────────────────
//
// The shell had the three regions right. Everything inside them did not:
//
//   • The header region existed for the LANDLORD only. A tenant had no header at
//     all, so the back chevron, the title and the bell were each re-drawn inside
//     whichever screen wanted them, differently.
//   • Every screen chose its own top padding. Measured across the 28 of them:
//     12, 13, 14, 15, 16, 22, 24 and 26. Nothing decided those numbers; they are
//     what each screen happened to be written with, and the body therefore
//     started in a slightly different place every time you navigated.
//   • The title scrolled away and was simply gone. Three screens deep, half a
//     page down, nothing on screen said where you were.
//
// ── Why the title is sticky rather than fixed ────────────────────────────────
//
// A header pinned open on every screen costs ~56px of a phone's height forever,
// and if it carries the title then the title is on screen twice while you are at
// the top — once full size in the body, once small in the header. Reading the
// same words twice is not context, it is noise.
//
// So: the screen keeps its full-size title, and the header's copy fades in only
// once the body has scrolled past it. Nothing is duplicated, nothing is lost, and
// the header stays empty of text exactly while the body is already saying it.
//
// The threshold is MEASURED, not guessed. `ScreenTitle` reports its own height
// through onLayout, so the swap happens the moment the real title leaves rather
// than at a hardcoded offset that is wrong on the first screen with a subtitle.
//
// ── The flag ─────────────────────────────────────────────────────────────────
//
// appConfig.HEADER_LAYOUT = 'v1' puts all of this back: ScreenTitle renders the
// same markup each screen had, bodyPad returns each screen's original padding,
// and the sticky title never mounts. Every call site below passes its old value
// alongside the new one for that reason — the revert has to be a flag, not an
// exercise in remembering what the numbers used to be.
import React from 'react';
import { View, Animated, Platform, ScrollView } from 'react-native';
import { isLayoutRule } from '../appConfig';
import { useT } from './ThemeContext';
import { T } from './ui';

// ── The numbers ──────────────────────────────────────────────────────────────
// GUTTER is 18 because 63 of the existing content rows already use 18 and the
// rest were drifting around it; this makes the common case the only case.
// ANCHOR is the single distance between the header and the first thing in the
// body. 14 for the same reason: it was already the most common top padding.
export const GUTTER = 18;
export const ANCHOR = 14;

// The header's own height, used to keep a focused field out from under it. It is
// the padding this header is built from (12 top + 10 bottom) plus the 36px touch
// target inside it; it is a constant rather than a measurement because the thing
// that needs it (a keyboard handler in another module) runs before any layout
// pass it could read.
export const HEADER_H = 58;

// Title sizes. The big one is what screens already use; the sticky one is sized
// to sit on one line next to two action buttons on a narrow phone.
export const TITLE_S = 32;
export const STICKY_S = 16;

// ── Reporting scroll position up to the header ───────────────────────────────
//
// The header is a SIBLING of the body, above it in the tree, so it cannot see the
// body's scroll offset. This context is the one wire between them: the body
// reports, the header reads.
//
// It deliberately carries no scroll value in state. A scroll event fires every
// frame, and a setState per frame re-renders the whole shell — the title fade
// would cost more than the screen it decorates. Instead the crossing is latched
// to a boolean that changes at most twice per scroll gesture, with a dead band so
// a fingertip resting exactly on the boundary cannot flutter it.
const Ctx = React.createContext(null);

const DEAD_BAND = 10;

// Should the header be showing the title, given where it was and where the body
// is now? Pulled out of the component because it is the whole behaviour and a
// pure function of three numbers — it can be tested, which a hook reading a
// scroll event cannot.
//
//   latched  whether the header is currently showing the title
//   y        the body's scroll offset
//   edge     where the screen's own title ends, 0 if it has not been measured
//
// The dead band is why both comparisons use it rather than one threshold: a
// finger resting exactly on the boundary, or the one-pixel jitter a scroll view
// emits when it settles, would otherwise flip this every frame and strobe the
// title in and out.
export function crossed(latched, y, edge) {
    if (!(Number(edge) > 0)) return latched;   // nothing measured: nothing to swap to
    const at = Number(y) || 0;
    if (!latched && at > edge + DEAD_BAND) return true;
    if (latched && at < edge - DEAD_BAND) return false;
    return latched;
}

export function LayoutProvider({ children }) {
    // What the current screen calls itself, reported by ScreenTitle.
    const [title, setTitle] = React.useState('');
    // Whether the body has scrolled past that title.
    const [past, setPast] = React.useState(false);
    // Where the title ends, in content coordinates. A ref, not state: it is read
    // inside the scroll handler and must never cause a render of its own.
    const edge = React.useRef(0);
    const latched = React.useRef(false);

    const register = React.useCallback((text, bottom) => {
        setTitle(text || '');
        edge.current = Number(bottom) || 0;
    }, []);

    const report = React.useCallback((y) => {
        const now = crossed(latched.current, y, edge.current);
        if (now === latched.current) return;   // the common case, every frame
        latched.current = now;
        setPast(now);
    }, []);

    // A new screen starts at the top with its own title, so the latch has to let
    // go. Without this, navigating from halfway down one screen to the top of the
    // next arrives with the previous screen's name stuck in the header.
    const reset = React.useCallback(() => {
        latched.current = false;
        edge.current = 0;
        setPast(false);
        setTitle('');
    }, []);

    const value = React.useMemo(
        () => ({ title, past, register, report, reset }),
        [title, past, register, report, reset]
    );

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Safe outside a provider: the sheets render these components too, and a sheet is
// not a screen. Everything degrades to "no sticky title".
const EMPTY = { title: '', past: false, register: () => {}, report: () => {}, reset: () => {} };
export const useLayout = () => React.useContext(Ctx) || EMPTY;

// The onScroll handler a scrolling body should carry. Returned as a stable
// callback so passing it to a ScrollView does not re-subscribe every render.
export function useBodyScroll(onScroll) {
    const { report } = useLayout();
    return React.useCallback((e) => {
        report(e && e.nativeEvent && e.nativeEvent.contentOffset
            ? e.nativeEvent.contentOffset.y
            : 0);
        if (onScroll) onScroll(e);
    }, [report, onScroll]);
}

// ── The body's padding ───────────────────────────────────────────────────────
//
// `was` is the padding the screen had before the rule. Passing it is what makes
// the flag a real revert rather than a guess, and it is why every call site reads
// slightly oddly: both numbers are there on purpose.
//
//   bodyPad({ bottom: 26, was: { top: 14 } })
//
// Horizontal padding is the gutter unless a screen genuinely bleeds to the edge,
// which it says with `edge: true` — a full-width map or image strip.
export function bodyPad({ top, bottom = 0, edge = false, was = {} } = {}) {
    const on = isLayoutRule();
    const wasTop = was.top === undefined ? ANCHOR : was.top;
    const wasSide = was.side === undefined ? GUTTER : was.side;
    return {
        paddingTop: on ? (top === undefined ? ANCHOR : top) : wasTop,
        paddingHorizontal: edge ? 0 : (on ? GUTTER : wasSide),
        paddingBottom: bottom
    };
}

// ── A scrolling body ─────────────────────────────────────────────────────────
//
// A ScrollView that is anchored below the header and reports its position to it.
// A drop-in replacement for the plain `<ScrollView contentContainerStyle={{…}}>`
// most screens were written with: the padding moves from the call site into
// `bodyPad`, which is what makes it one rule rather than 28 opinions.
//
// Screens that need the keyboard handled use KeyboardScroll instead, which does
// the same reporting — see keyboard.js.
export const Body = React.forwardRef(function Body(
    { children, top, bottom = 0, edge = false, was, contentContainerStyle, onScroll, scrollEventThrottle = 16, ...rest },
    ref
) {
    const spy = useBodyScroll(onScroll);
    return (
        <ScrollView
            ref={ref}
            onScroll={spy}
            scrollEventThrottle={scrollEventThrottle}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[bodyPad({ top, bottom, edge, was }), contentContainerStyle]}
            {...rest}
        >
            {children}
        </ScrollView>
    );
});

// ── The screen's own title ───────────────────────────────────────────────────
//
// The full-size title at the top of a body. Two jobs: draw it, and tell the
// header where it ends so the header knows when to take over.
//
// `sub` is an optional second line. It is measured together with the title
// because the header should not appear while a subtitle explaining the screen is
// still on screen — that is still context, and two lots of it is still noise.
// Spread onto whatever block a screen uses as its title, when that block is not
// a plain ScreenTitle — the tenant's home screen leads with their photograph and
// name, which is a title in every sense except the markup.
//
//   const anchor = useTitleAnchor(me.name || 'Home');
//   <Row {...anchor}> … </Row>
//
// It reports the block's text and where it ENDS, in the scroll content's own
// coordinates — which is exactly the number a scroll offset is compared against,
// so there is no window measurement to get wrong on a re-layout.
export function useTitleAnchor(text) {
    const { register } = useLayout();
    const label = typeof text === 'string' ? text : '';
    const onLayout = React.useCallback((e) => {
        if (!isLayoutRule()) return;
        const l = e && e.nativeEvent && e.nativeEvent.layout;
        if (!l) return;
        register(label, (l.y || 0) + (l.height || 0));
    }, [register, label]);
    return { onLayout };
}

export function ScreenTitle({ children, sub, s = TITLE_S, style, subStyle }) {
    const t = useT();
    const anchor = useTitleAnchor(typeof children === 'string' ? children : '');

    return (
        <View {...anchor}>
            <T w={700} s={s} lh={1.02} style={[{ letterSpacing: -1.6, marginBottom: sub ? 4 : 0 }, style]}>
                {children}
            </T>
            {sub ? (
                <T w={400} s={13} lh={1.4} c={t.fg2} style={[{ marginBottom: 0 }, subStyle]}>
                    {sub}
                </T>
            ) : null}
        </View>
    );
}

// ── One value, two things ────────────────────────────────────────────────────
//
// 0 while the screen's own title is on show, 1 once the header has taken over.
// The header's title fades IN on it and whatever the bar shows instead at the
// top fades OUT on the same value, so the two can never both be visible or both
// be missing — which they could if each ran its own animation.
//
// Native-driven: the animation runs on the UI thread rather than competing with
// the scroll that triggered it.
export function usePastFade() {
    const { past } = useLayout();
    const v = React.useRef(new Animated.Value(0)).current;
    React.useEffect(() => {
        Animated.timing(v, {
            toValue: past ? 1 : 0,
            duration: past ? 180 : 120,
            useNativeDriver: true
        }).start();
    }, [past, v]);
    return v;
}

// ── The header's copy of the title ───────────────────────────────────────────
//
// CENTRED, and centred properly: laid out across the whole bar and centred in
// it, rather than placed in a row and left to land wherever the things beside it
// leave room. The first version did the latter and measured 22px off centre on a
// 420px screen — close enough to look like a mistake, which it was.
//
// `inset` is the room kept clear at each end for whatever sits there. It is the
// same on both sides on purpose: a title centred between a 36px button on one
// side and nothing on the other is not centred on the screen, and the eye reads
// the screen, not the row.
export function StickyTitle({ inset = 60, style }) {
    const { title, past } = useLayout();
    const t = useT();
    const v = usePastFade();

    if (!isLayoutRule() || !title) return null;

    return (
        <Animated.View
            // Invisible is not the same as absent: a title faded to nothing must
            // not still be read out or offer itself to a screen reader, and must
            // not swallow a tap aimed at whatever is behind it.
            pointerEvents="none"
            accessibilityElementsHidden={!past}
            importantForAccessibility={past ? 'yes' : 'no-hide-descendants'}
            style={[
                {
                    position: 'absolute',
                    left: inset,
                    right: inset,
                    top: 0,
                    bottom: 0,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: v,
                    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }]
                },
                style
            ]}
        >
            <T
                w={600}
                s={STICKY_S}
                lh={1.1}
                c={t.fg}
                numberOfLines={1}
                style={{ letterSpacing: -0.4, textAlign: 'center' }}
            >
                {title}
            </T>
        </Animated.View>
    );
}

// ── Keeping the header off the field you are typing in ───────────────────────
//
// WCAG 2.2 is explicit that a sticky header must not cover the focused element,
// and the keyboard handler is exactly where that gets broken: it scrolls the
// focused field UP by however much the keyboard overlaps it, and a field near the
// top of a long page can be scrolled clean under the header by that move. You
// then type into something the header is sitting on.
//
// This caps that shift so the field's top stays below the header, with a little
// air. Everything is in WINDOW coordinates, because that is what measureInWindow
// hands back and what the header's own position is known in — converting into the
// scroll view's content space would need the content's offset from the window,
// which is one more measurement to get wrong.
//
//   want      how far the keyboard handler wants to scroll up
//   fieldTop  the field's top edge, in the window, right now
//   safeTop   the status bar inset, i.e. where the header starts
//
// It can only ever reduce the shift, never add to it: in the common case — a
// field near the bottom of the page — the room above is far larger than `want`
// and this returns it untouched. A field already tucked under the header returns
// 0, because scrolling would only push it further under.
// ── Anything the shell puts ABOVE the header ─────────────────────────────────
//
// The header is not always the first thing below the system bars. The
// new-version banner sits above it, and when it is showing, the header starts
// that much further down.
//
// That matters here and nowhere else: clampFocusScroll works out how far a
// field can be scrolled before it disappears under the header, and it did that
// from safeTop + HEADER_H — which, with a banner on screen, is a band ending
// well above where the header actually begins. The clamp allowed too much
// scroll and a field being typed into could end up underneath the header. That
// is exactly the thing the rule exists to prevent (WCAG 2.2: a sticky header
// must not cover the focused element), so the rule has to know.
//
// A module-level number rather than context: the banner renders outside
// LayoutProvider (it has to, so it is above the header on every screen), so it
// cannot publish into it. It reports its measured height and clears it on
// unmount; with nothing above the header this is 0 and every calculation below
// is what it was.
let chromeAbove = 0;
export const setChromeAbove = (px) => {
    const n = Number(px);
    chromeAbove = Number.isFinite(n) && n > 0 ? n : 0;
};
export const getChromeAbove = () => chromeAbove;

export function clampFocusScroll(want, fieldTop, safeTop = 0) {
    if (!isLayoutRule()) return want;
    const top = Number(fieldTop);
    if (!Number.isFinite(top)) return want;
    const room = top - (Number(safeTop) || 0) - chromeAbove - HEADER_H - 12;
    if (!(room > 0)) return 0;
    return Math.min(want, room);
}

// Android draws a translucent status bar that the ink field runs under; iOS
// reports it as an inset. Only used for a comment's worth of difference, kept
// here so the header does not have to know the platform.
export const UNDER_STATUS_BAR = Platform.OS === 'android';
