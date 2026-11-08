// File: mobile/src/redesign/Tour.js
//
// The guided tour a new landlord or tenant gets on their first visit.
//
// ── What it has to do, and why each part is there ────────────────────────────
//
// Somebody opening this app for the first time is looking at a dock with four
// buttons and a screen full of somebody else's words. The tour's whole job is to
// answer "what is this, and what do I do here" without making them read a manual
// or tap things to find out.
//
//   • It DIMS the screen and leaves one area lit, so the explanation has a
//     subject. A card that says "the dock is how you move around" while the
//     whole screen is equally bright is a card about nothing.
//   • It NAVIGATES as it goes, so the thing being described is actually behind
//     the card. Describing the rent screen while the portfolio is on screen is
//     worse than saying nothing.
//   • It POINTS. A caret on the edge of the card aims at the lit area, so the
//     link between "this card" and "that thing" is drawn rather than inferred.
//   • Next, Back, Skip and a close ×, because a tour you cannot leave is a trap
//     and a tour you cannot repeat is a one-shot you will miss while distracted.
//   • It is remembered per portal and replayable from Settings for ever after.
//
// ── Where the light falls, and why it moves ──────────────────────────────────
//
// A step names a TARGET — the real component it is about, which reports its own
// position (see tourTargets.js) — and falls back to a BAND when nothing has
// registered under that name. Bands are the positions this shell already
// controls and knows the height of: the header, the dock, the top of the body.
// So a screen that is redesigned and stops registering loses sharpness and
// nothing else; it cannot end up lighting a rectangle that is not there.
//
// The highlight ANIMATES between steps rather than cutting. That is not
// decoration: the eye follows a thing that moves, so a spotlight that slides
// from the rent card to the dock takes the reader's attention with it. A cut
// leaves them hunting for what changed, which on a dimmed screen is most of the
// work the tour is supposed to be saving them.
import React from 'react';
import { View, Animated, Dimensions, Easing, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVm } from './AppContext';
import { useT } from './ThemeContext';
import { T, Press, Glyph } from './ui';
import { HEADER_H } from './layout';
import { useTourTarget } from './tourTargets';

// The dock's height, measured the same way HEADER_H is: from what builds it
// rather than from a screenshot. Used only to leave it lit.
const DOCK_H = 86;

// How much room to leave around a measured element, so the ring sits OUTSIDE
// what it is lighting rather than clipping its edge.
const PAD = 8;

// Where the light falls when nothing has registered a real rectangle. Each
// returns a rectangle in screen coordinates, given the safe-area insets and the
// window.
const BANDS = {
    header: ({ top }) => ({ top, height: HEADER_H }),
    top: ({ top }) => ({ top: top + HEADER_H, height: 210 }),
    middle: ({ top, h }) => ({ top: top + HEADER_H + 150, height: Math.max(180, h * 0.3) }),
    dock: ({ bottom, h }) => ({ top: h - bottom - DOCK_H, height: DOCK_H }),
    none: () => null
};

export default function Tour() {
    const vm = useVm();
    const t = useT();
    const insets = useSafeAreaInsets();
    const { width: w, height: h } = Dimensions.get('window');

    const tour = vm.tour || {};
    const steps = tour.steps || [];
    const step = steps[tour.index] || null;

    // Subscribed unconditionally — a hook cannot be called behind a condition,
    // and a step with no target simply asks for nothing and is handed null.
    const measured = useTourTarget(step && step.target);

    // One value drives the card: it fades and rises as each step arrives, so
    // moving between steps reads as a change rather than a redraw.
    const v = React.useRef(new Animated.Value(0)).current;
    React.useEffect(() => {
        if (!tour.open) return;
        v.setValue(0);
        Animated.timing(v, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    }, [tour.open, tour.index, v]);

    // ── The travelling spotlight ─────────────────────────────────────────────
    //
    // Four separate values rather than a transform, because the dim panels have
    // to stay stitched to the ring's edges — a scaled ring would leave the dim
    // behind and show a seam. These drive layout, so useNativeDriver is off;
    // it is four interpolations on one overlay, which is cheap, and the
    // alternative is a highlight that visibly lags the hole it is cut from.
    const lit = React.useMemo(() => {
        if (!step) return null;
        if (measured) {
            return {
                top: Math.max(insets.top, measured.top - PAD),
                height: measured.height + PAD * 2,
                left: Math.max(6, measured.left - PAD),
                width: Math.min(w - 12, measured.width + PAD * 2)
            };
        }
        const band = (BANDS[step.spot] || BANDS.none)({ top: insets.top, bottom: insets.bottom, h, w });
        return band ? { ...band, left: 6, width: w - 12 } : null;
    }, [step, measured, insets.top, insets.bottom, h, w]);

    const aTop = React.useRef(new Animated.Value(0)).current;
    const aHeight = React.useRef(new Animated.Value(0)).current;
    const aLeft = React.useRef(new Animated.Value(6)).current;
    const aWidth = React.useRef(new Animated.Value(Math.max(0, w - 12))).current;
    const aGlow = React.useRef(new Animated.Value(0)).current;
    // False until the first lit rectangle has been placed, so the ring does not
    // fly in from the top of the screen on the step it first appears.
    const placed = React.useRef(false);

    React.useEffect(() => {
        if (!tour.open) { placed.current = false; return; }
        if (!lit) { aGlow.setValue(0); return; }
        const to = [
            [aTop, lit.top], [aHeight, lit.height], [aLeft, lit.left], [aWidth, lit.width]
        ];
        if (!placed.current) {
            // First placement: be where you are told, immediately.
            to.forEach(([anim, value]) => anim.setValue(value));
            placed.current = true;
        } else {
            Animated.parallel(to.map(([anim, value]) => Animated.timing(anim, {
                toValue: value,
                duration: 420,
                // Out-cubic: leaves quickly, arrives gently. A linear slide reads
                // as a thing being dragged; this reads as a thing settling.
                easing: Easing.out(Easing.cubic),
                useNativeDriver: false
            }))).start();
        }
        // A single pulse on arrival. Not a loop — a ring that breathes for ever
        // is a ring people stop seeing, and it competes with the card they are
        // meant to be reading.
        aGlow.setValue(0);
        Animated.sequence([
            Animated.timing(aGlow, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: false }),
            Animated.timing(aGlow, { toValue: 0, duration: 520, easing: Easing.in(Easing.quad), useNativeDriver: false })
        ]).start();
    }, [tour.open, tour.index, lit, aTop, aHeight, aLeft, aWidth, aGlow]);

    if (!tour.open || !step) return null;

    const dim = 'rgba(8,8,10,0.76)';

    // The card goes under the lit area, unless that would push it off the
    // bottom, in which case it goes above. A tour card that is half off the
    // screen is the one thing worse than no tour card.
    const below = !lit || lit.top + lit.height < h * 0.58;
    const cardTop = lit ? (below ? lit.top + lit.height + 18 : undefined) : undefined;
    const cardBottom = lit && !below ? h - lit.top + 18 : (lit ? undefined : h * 0.3);

    const anim = {
        opacity: v,
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }]
    };

    const chip = {
        flexDirection: 'row', alignItems: 'center', columnGap: 6,
        paddingVertical: 11, paddingHorizontal: 16, borderRadius: 999
    };

    // The caret, centred on the lit area's own centre rather than on the card,
    // so it aims at the thing even when the card spans the screen and the thing
    // does not.
    const pointerLeft = lit
        ? Math.min(Math.max(lit.left + lit.width / 2 - 9, 28), w - 46)
        : w / 2 - 9;

    const Caret = () => (
        <View
            pointerEvents="none"
            style={{
                position: 'absolute',
                left: pointerLeft - 14,
                [below ? 'top' : 'bottom']: -9,
                width: 18, height: 18,
                backgroundColor: t.ink2,
                borderLeftWidth: 1, borderTopWidth: 1,
                borderColor: t.line,
                transform: [{ rotate: below ? '45deg' : '-135deg' }]
            }}
        />
    );

    return (
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 50 }}>
            {/* Four panels rather than one with a hole: React Native has no
                cut-out, and four plain views are cheaper than a mask and work
                identically on both platforms. They are animated alongside the
                ring so the opening travels with it instead of snapping to the
                new position a frame later. With no lit area they merge into one
                full dim. */}
            {lit ? (
                <>
                    <Animated.View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: aTop, backgroundColor: dim }}>
                        <Press onPress={vm.tour.next} style={{ flex: 1 }} />
                    </Animated.View>
                    <Animated.View
                        style={{
                            position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: dim,
                            top: Animated.add(aTop, aHeight)
                        }}
                    >
                        <Press onPress={vm.tour.next} style={{ flex: 1 }} />
                    </Animated.View>
                    {/* The two side panels. Without them a measured target that
                        is narrower than the screen would sit in a lit strip
                        running the full width, which is the coarseness this was
                        meant to fix. */}
                    <Animated.View
                        style={{ position: 'absolute', left: 0, top: aTop, height: aHeight, width: aLeft, backgroundColor: dim }}
                        pointerEvents="none"
                    />
                    <Animated.View
                        style={{
                            position: 'absolute', right: 0, top: aTop, height: aHeight, backgroundColor: dim,
                            left: Animated.add(aLeft, aWidth)
                        }}
                        pointerEvents="none"
                    />

                    {/* The lit area itself: a ring, no fill, so whatever is
                        under it is readable — which is the entire point of
                        lighting it. The glow is a second ring that swells once
                        on arrival and fades, drawing the eye to where the light
                        has just moved to. */}
                    <Animated.View
                        pointerEvents="none"
                        style={{
                            position: 'absolute',
                            left: aLeft, top: aTop, width: aWidth, height: aHeight,
                            borderRadius: 18, borderWidth: 2, borderColor: t.lime
                        }}
                    />
                    <Animated.View
                        pointerEvents="none"
                        style={{
                            position: 'absolute',
                            left: Animated.subtract(aLeft, 6),
                            top: Animated.subtract(aTop, 6),
                            width: Animated.add(aWidth, 12),
                            height: Animated.add(aHeight, 12),
                            borderRadius: 24,
                            borderWidth: 2,
                            borderColor: t.lime,
                            opacity: aGlow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] })
                        }}
                    />
                </>
            ) : (
                <Press onPress={vm.tour.next} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: dim }} />
            )}

            <Animated.View
                style={[{
                    position: 'absolute', left: 14, right: 14,
                    ...(cardTop !== undefined ? { top: cardTop } : {}),
                    ...(cardBottom !== undefined ? { bottom: cardBottom } : {}),
                    backgroundColor: t.ink2,
                    borderRadius: 24,
                    borderWidth: 1,
                    borderColor: t.line,
                    padding: 18
                }, anim]}
            >
                {/* Drawn before the content so the card's own background covers
                    the caret's inner two sides, leaving a triangle. */}
                {lit ? <Caret /> : null}

                <View style={{ flexDirection: 'row', alignItems: 'flex-start', columnGap: 10, marginBottom: 10 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <T mono w={600} s={9} ls={0.12} c={t.accent}>
                            {`STEP ${tour.index + 1} OF ${steps.length}`}
                        </T>
                        <T w={700} s={19} lh={1.15} style={{ letterSpacing: -0.6, marginTop: 6 }}>{step.title}</T>
                    </View>
                    {/* The ×. Separate from Skip on purpose: Skip is "I do not want
                        the tour", × is "not now" — people reach for different ones
                        and both have to be there. */}
                    <Press
                        onPress={vm.tour.close}
                        hitSlop={10}
                        // A button whose whole content is an icon has no name: a
                        // screen reader announces "button" and nothing else, and a
                        // test can only reach it by guessing coordinates. Both are
                        // the same problem — the control is not addressable.
                        accessibilityRole="button"
                        accessibilityLabel="Close tour"
                        style={{ width: 32, height: 32, borderRadius: 11, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}
                    >
                        <Glyph name="close" size={16} color={t.fg2} />
                    </Press>
                </View>

                <T w={400} s={13.5} lh={1.5} c={t.fg2}>{step.body}</T>

                {/* How far along, as dots. Cheaper to read than "3 of 7" alone and
                    it shows the tour is short, which is the thing that stops people
                    skipping it. */}
                <View style={{ flexDirection: 'row', columnGap: 5, marginTop: 14, marginBottom: 14 }}>
                    {steps.map((s, i) => (
                        <View
                            key={s.key || i}
                            style={{
                                height: 4, flex: 1, borderRadius: 999,
                                backgroundColor: i <= tour.index ? t.lime : t.line
                            }}
                        />
                    ))}
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 8 }}>
                    {/* Back is absent on the first step rather than disabled: a dead
                        button is a question ("why can I not?"), a missing one is not. */}
                    {tour.index > 0 ? (
                        <Press onPress={vm.tour.back} style={{ ...chip, borderWidth: 1, borderColor: t.line }}>
                            <Glyph name="chevron-back" size={14} color={t.fg} />
                            <T w={600} s={13} c={t.fg}>Back</T>
                        </Press>
                    ) : null}

                    <Press onPress={vm.tour.skip} style={{ ...chip }}>
                        <T w={600} s={13} c={t.fg3}>{tour.index === steps.length - 1 ? 'Close' : 'Skip tour'}</T>
                    </Press>

                    <View style={{ flex: 1 }} />

                    <Press onPress={vm.tour.next} style={{ ...chip, backgroundColor: t.lime }}>
                        <T w={700} s={13} c={t.on}>
                            {tour.index === steps.length - 1 ? 'Finish' : 'Next'}
                        </T>
                        {tour.index === steps.length - 1
                            ? null
                            : <Glyph name="chevron-forward" size={14} color={t.on} />}
                    </Press>
                </View>
            </Animated.View>
        </View>
    );
}
