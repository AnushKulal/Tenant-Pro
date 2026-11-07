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
//   • Next, Back, Skip and a close ×, because a tour you cannot leave is a trap
//     and a tour you cannot repeat is a one-shot you will miss while distracted.
//   • It is remembered per portal and replayable from Settings for ever after.
//
// ── Why the spotlight is a region and not a measured element ─────────────────
//
// The obvious design is for each step to point at a real component, which means
// every component it can point at has to report its position. That is a wire
// into a dozen files for a feature that moves on, and the first screen somebody
// redesigns breaks the tour silently.
//
// Instead a step names a BAND: the header, the dock, the top of the body, the
// middle. Those are positions this shell already controls and already knows the
// height of, so the highlight cannot drift out of step with a screen's internals
// — there are no internals involved.
import React from 'react';
import { View, Animated, Dimensions, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVm } from './AppContext';
import { useT } from './ThemeContext';
import { T, Press, Glyph } from './ui';
import { HEADER_H } from './layout';

// The dock's height, measured the same way HEADER_H is: from what builds it
// rather than from a screenshot. Used only to leave it lit.
const DOCK_H = 86;

// Where the light falls. Each returns a rectangle in screen coordinates, given
// the safe-area insets and the window.
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

    // One value drives the whole card: it fades and rises as each step arrives,
    // so moving between steps reads as a change rather than a redraw.
    const v = React.useRef(new Animated.Value(0)).current;
    React.useEffect(() => {
        if (!tour.open) return;
        v.setValue(0);
        Animated.timing(v, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    }, [tour.open, tour.index, v]);

    if (!tour.open || !step) return null;

    const band = (BANDS[step.spot] || BANDS.none)({ top: insets.top, bottom: insets.bottom, h, w });
    const dim = 'rgba(8,8,10,0.76)';

    // The card goes under the lit band, unless that would push it off the bottom,
    // in which case it goes above. A tour card that is half off the screen is the
    // one thing worse than no tour card.
    const below = !band || band.top + band.height < h * 0.58;
    const cardTop = band ? (below ? band.top + band.height + 14 : undefined) : undefined;
    const cardBottom = band && !below ? h - band.top + 14 : (band ? undefined : h * 0.3);

    const anim = {
        opacity: v,
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }]
    };

    const chip = {
        flexDirection: 'row', alignItems: 'center', columnGap: 6,
        paddingVertical: 11, paddingHorizontal: 16, borderRadius: 999
    };

    return (
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 50 }}>
            {/* Four panels rather than one with a hole: React Native has no cut-out,
                and four plain views are cheaper than a mask and work identically on
                both platforms. With no band they merge into one full dim. */}
            {band ? (
                <>
                    <Press onPress={vm.tour.next} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: band.top, backgroundColor: dim }} />
                    <Press onPress={vm.tour.next} style={{ position: 'absolute', left: 0, right: 0, top: band.top + band.height, bottom: 0, backgroundColor: dim }} />
                    {/* The lit band itself: a ring, no fill, so whatever is under it
                        is readable — which is the entire point of lighting it. */}
                    <View
                        pointerEvents="none"
                        style={{
                            position: 'absolute', left: 6, right: 6,
                            top: band.top, height: band.height,
                            borderRadius: 18, borderWidth: 2, borderColor: t.lime
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
