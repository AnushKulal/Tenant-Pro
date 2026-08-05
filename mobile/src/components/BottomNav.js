// File: mobile/src/components/BottomNav.js
// Floating frosted tab bar. Props are unchanged ({ activeTab, setActiveTab }) —
// HomeScreen passes goToTab as setActiveTab, so every press must still call it
// with the exact tab name it switches on.
//
// Design: icon-only, with the active tab marked by a glowing orb that slides
// between slots. Dropping the labels is deliberate — the previous version put a
// rounded highlight behind an icon+label stack and the highlight's curve cut
// across the text. A circle around a lone glyph has nothing to clip, so that bug
// cannot recur by construction.
//
// The orb's glow is concentric uniform-alpha circles. Neither RN nor
// expo-linear-gradient can draw a radial gradient, and a LinearGradient inside a
// circular clip does NOT substitute: it ramps alpha along one axis only, so
// perpendicular to that axis it is still opaque where it meets the clip, leaving
// a hard crescent (this was seen on device with the aurora blobs). Uniform alpha
// has no direction, so many faint circles composite into a smooth bloom.
import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Pressable, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, withAlpha } from '../theme';
import { GlassView } from '../ui';

// Same tab set, order and Feather icon names as the previous version
// (Rooms replaced Profile here — do not reorder or rename).
const TABS = [
    { name: 'Home', icon: 'home' },
    { name: 'Rooms', icon: 'key' },
    { name: 'Properties', icon: 'grid' },
    { name: 'Tenants', icon: 'users' }
];

const ICON_SIZE = 23;
const BAR_HEIGHT = 72;
const ORB = 52;          // solid core diameter
const BLOOM_MAX = 98;    // outermost glow ring
// Ring count and per-ring alpha trade smoothness against draw calls. At 7 rings
// the size step was ~5px and each ring contributed ~0.05 alpha, which was
// visible as banding in a 3x render. 14 rings halves the geometric step and
// halves the alpha step, putting the seams below the perceptual threshold.
const BLOOM_RINGS = 14;

// Every interpolation is clamped: t.motion.spring overshoots past 1, which would
// push opacity negative and scale beyond the intended lift.
const CLAMP = { extrapolate: 'clamp' };

// Precomputed once — ring geometry never depends on theme or props.
const BLOOM = Array.from({ length: BLOOM_RINGS }, (_, i) => {
    const p = i / (BLOOM_RINGS - 1);              // 0 = outermost, 1 = innermost
    return {
        // Ease the radii so rings bunch up near the core, where the falloff of a
        // real glow is steepest, and spread out toward the faint outer edge.
        size: BLOOM_MAX + (ORB - BLOOM_MAX) * Math.pow(p, 0.72),
        // Denser toward the core so it reads as a light source, not a flat disc.
        alpha: 0.018 + 0.032 * p
    };
});

export default function BottomNav({ activeTab, setActiveTab }) {
    const t = useTheme();
    const insets = useSafeAreaInsets();

    const activeIndex = TABS.findIndex((tab) => tab.name === activeTab);
    // Drill-in tabs (Settings, TenantProfile, Transactions…) are not in the bar.
    // Fade the orb out for them rather than snapping it back to Home.
    const hasActive = activeIndex >= 0;

    // translateX needs a real pixel width, so the row is measured.
    const [barWidth, setBarWidth] = useState(0);
    const itemWidth = barWidth ? barWidth / TABS.length : 0;

    const orbX = useRef(new Animated.Value(0)).current;
    const orbOpacity = useRef(new Animated.Value(0)).current;
    // One 0→1 driver per tab for its icon lift. Held in a ref so animating never
    // re-renders the bar.
    const lifts = useRef(TABS.map((_, i) => new Animated.Value(i === activeIndex ? 1 : 0))).current;
    const placed = useRef(false); // the first position is a jump, not a slide

    useEffect(() => {
        const anims = [];

        if (barWidth && hasActive) {
            const x = activeIndex * itemWidth;
            if (placed.current) {
                anims.push(Animated.spring(orbX, { toValue: x, useNativeDriver: true, ...t.motion.spring }));
            } else {
                orbX.setValue(x);
                placed.current = true;
            }
        }

        anims.push(Animated.timing(orbOpacity, {
            toValue: barWidth && hasActive ? 1 : 0,
            duration: t.motion.fast,
            useNativeDriver: true
        }));

        lifts.forEach((value, i) => {
            anims.push(Animated.spring(value, {
                toValue: i === activeIndex ? 1 : 0,
                useNativeDriver: true,
                ...t.motion.spring
            }));
        });

        Animated.parallel(anims).start();
    }, [activeIndex, hasActive, barWidth, itemWidth, orbX, orbOpacity, lifts, t.motion]);

    return (
        <View
            style={[
                styles.container,
                { left: t.spacing.lg, right: t.spacing.lg, bottom: insets.bottom + t.spacing.md }
            ]}
            pointerEvents="box-none"
        >
            {/* Shadow sits outside GlassView, which clips its own overflow. */}
            <View style={[styles.shadowWrap, { borderRadius: t.radii.pill }, t.shadows.lg]}>
                <GlassView
                    strong
                    radius={t.radii.pill}
                    style={[styles.bar, { borderColor: withAlpha(t.colors.primaryAlt, 0.28) }]}
                >
                    <View style={styles.row} onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}>
                        {itemWidth ? (
                            <Animated.View
                                pointerEvents="none"
                                style={[
                                    styles.orbSlot,
                                    { width: itemWidth, opacity: orbOpacity, transform: [{ translateX: orbX }] }
                                ]}
                            >
                                {/* Outer bloom: faint concentric circles → smooth glow. */}
                                {BLOOM.map(({ size, alpha }, i) => (
                                    <View
                                        key={i}
                                        style={[
                                            styles.centred,
                                            {
                                                width: size,
                                                height: size,
                                                borderRadius: size / 2,
                                                backgroundColor: withAlpha(t.colors.primaryAlt, alpha)
                                            }
                                        ]}
                                    />
                                ))}

                                {/* Core: gradient fill plus a crisp light rim. */}
                                <View
                                    style={[
                                        styles.centred,
                                        styles.orbCore,
                                        { borderColor: withAlpha(t.colors.onPrimary, 0.5) }
                                    ]}
                                >
                                    <LinearGradient
                                        colors={[t.colors.primaryAlt, t.colors.primary, t.colors.primaryDeep]}
                                        start={{ x: 0.2, y: 0 }}
                                        end={{ x: 0.8, y: 1 }}
                                        style={styles.fill}
                                    />
                                    {/* Specular highlight on the upper-left, so the orb
                                        reads as a lit sphere rather than a flat disc. */}
                                    <View
                                        style={[
                                            styles.specular,
                                            { backgroundColor: withAlpha(t.colors.onPrimary, 0.22) }
                                        ]}
                                    />
                                </View>
                            </Animated.View>
                        ) : null}

                        {TABS.map((tab, i) => {
                            const isActive = i === activeIndex;
                            const lift = lifts[i];
                            return (
                                <Pressable
                                    key={tab.name}
                                    style={styles.navItem}
                                    onPress={() => setActiveTab(tab.name)}
                                    accessibilityRole="tab"
                                    // Labels are a casualty of the icon-only design;
                                    // screen readers still get the tab name.
                                    accessibilityLabel={`${tab.name} tab`}
                                    accessibilityState={{ selected: isActive }}
                                >
                                    <Animated.View
                                        style={{
                                            transform: [{
                                                scale: lift.interpolate({
                                                    inputRange: [0, 1],
                                                    outputRange: [1, 1.06],
                                                    ...CLAMP
                                                })
                                            }]
                                        }}
                                    >
                                        <Feather
                                            name={tab.icon}
                                            size={ICON_SIZE}
                                            color={isActive ? t.colors.onPrimary : t.colors.textMuted}
                                        />
                                    </Animated.View>
                                </Pressable>
                            );
                        })}
                    </View>
                </GlassView>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { position: 'absolute', alignItems: 'center', zIndex: 50 },
    shadowWrap: { width: '100%' },
    bar: { width: '100%', height: BAR_HEIGHT, borderWidth: 1 },
    row: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    navItem: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center' },
    fill: { flex: 1 },

    // The slot spans one cell; every glow layer is centred inside it, so the orb
    // stays concentric with the icon regardless of cell width.
    orbSlot: { position: 'absolute', top: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
    centred: { position: 'absolute' },
    orbCore: { width: ORB, height: ORB, borderRadius: ORB / 2, borderWidth: 1.5, overflow: 'hidden' },
    specular: {
        position: 'absolute',
        top: 5,
        left: 8,
        width: ORB * 0.5,
        height: ORB * 0.34,
        borderRadius: ORB / 2
    }
});
