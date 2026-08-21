// File: mobile/src/redesign/Loading.js
// The screen you look at while your data arrives. There are three of these moments
// (a landlord's portfolio, a tenant's tenancy, and the session check on launch) and
// they were all a monogram, a stock spinner and a line of mono text on an empty
// field — the least characterful surface in the app, and the one every single user
// sees first.
//
// What it does instead, in the app's own vocabulary:
//   • the TP mark breathes — a slow 4% scale, so the brand is the thing moving
//     rather than a generic wheel;
//   • a lime arc sweeps a ring around it, which is the spinner, drawn in the
//     accent colour instead of the platform's;
//   • three bars fill left to right underneath, echoing the revenue chart on the
//     dashboard — the shape you are waiting for, previewed.
//
// All native-driver transforms, so it stays smooth on the cheap phone this app is
// meant for, and it loops until it unmounts.
import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing } from 'react-native';
import { useT } from './ThemeContext';
import { T, Monogram } from './ui';

// One bar of the little chart, rising and settling on a stagger.
function Bar({ delay, t }) {
    const grow = useRef(new Animated.Value(0.25)).current;

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.delay(delay),
                Animated.timing(grow, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                Animated.timing(grow, { toValue: 0.25, duration: 520, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
                Animated.delay(760 - delay)
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [grow, delay]);

    return (
        <View style={{ width: 26, height: 34, justifyContent: 'flex-end' }}>
            <Animated.View
                style={{
                    height: 34,
                    borderRadius: 7,
                    backgroundColor: t.lime,
                    // scaleY from the bottom edge, so it grows upward like the chart.
                    transform: [{ scaleY: grow }, { translateY: 0 }],
                    transformOrigin: 'bottom'
                }}
            />
        </View>
    );
}

export default function Loading({ line = 'LOADING' }) {
    const t = useT();
    const spin = useRef(new Animated.Value(0)).current;
    const breathe = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const a = Animated.loop(
            Animated.timing(spin, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true })
        );
        const bshow = Animated.loop(
            Animated.sequence([
                Animated.timing(breathe, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
                Animated.timing(breathe, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true })
            ])
        );
        a.start();
        bshow.start();
        return () => { a.stop(); bshow.stop(); };
    }, [spin, breathe]);

    const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
    const scale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
    const RING = 96;

    return (
        <View style={{ flex: 1, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: RING, height: RING, alignItems: 'center', justifyContent: 'center' }}>
                {/* The track, barely there — it is the arc that reads as motion. */}
                <View
                    style={{
                        position: 'absolute',
                        width: RING,
                        height: RING,
                        borderRadius: RING / 2,
                        borderWidth: 2,
                        borderColor: t.line
                    }}
                />
                {/* One lit quadrant, rotating: a spinner in the accent colour. */}
                <Animated.View
                    style={{
                        position: 'absolute',
                        width: RING,
                        height: RING,
                        borderRadius: RING / 2,
                        borderWidth: 2,
                        borderColor: 'transparent',
                        borderTopColor: t.lime,
                        borderRightColor: t.lime,
                        transform: [{ rotate }]
                    }}
                />
                <Animated.View style={{ transform: [{ scale }] }}>
                    <Monogram size={52} />
                </Animated.View>
            </View>

            <View style={{ flexDirection: 'row', columnGap: 7, marginTop: 30 }}>
                <Bar delay={0} t={t} />
                <Bar delay={130} t={t} />
                <Bar delay={260} t={t} />
            </View>

            <T mono w={600} s={9} ls={0.14} c={t.fg3} style={{ marginTop: 26 }}>{line}</T>
        </View>
    );
}
