// File: mobile/src/components/BottomNav.js
// Floating glass tab bar. Props unchanged ({ activeTab, setActiveTab }) —
// HomeScreen passes goToTab as setActiveTab, so every press must still call it
// with the exact tab name it switches on.
//
// Deliberately RESTRAINED. Earlier versions stacked a sheen gradient, a vertical
// edge wash and a specular hairline on top of the tint, and the sum read as milky
// plastic rather than glass. Real glass is mostly just transparency: a strong
// blur, a very low tint, and one thin bright rim. Everything else was removed.
//
// Active tab: a darker rounded capsule, not a coloured fill and not a rim-lit
// lens — the selection reads because it is a quieter, deeper hole in the glass
// with a filled white glyph, which is what the reference does.
//
// Geometry rule that keeps the old cropping bug dead: the capsule's radius is
// exactly half its height (a true stadium), and it is sized to contain its
// content rather than sit behind part of it.
import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Pressable, Animated, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, withAlpha } from '../theme';

// Same tab set and order as before — do not reorder or rename. `icon` is the
// filled glyph; the outline variant is '<icon>-outline'.
const TABS = [
    { name: 'Home', icon: 'home' },
    { name: 'Rooms', icon: 'key' },
    { name: 'Properties', icon: 'grid' },
    { name: 'Tenants', icon: 'people' }
];

const ICON_SIZE = 24;
const BAR_HEIGHT = 70;
const CAPSULE_H = 52;
const CAPSULE_INSET = 8;

// t.motion.spring overshoots past 1, which would push interpolations past their
// intended peak.
const CLAMP = { extrapolate: 'clamp' };

export default function BottomNav({ activeTab, setActiveTab }) {
    const t = useTheme();
    const insets = useSafeAreaInsets();

    const activeIndex = TABS.findIndex((tab) => tab.name === activeTab);
    // Drill-in tabs (Settings, TenantProfile, Transactions…) are not in the bar.
    // Fade the capsule out for them rather than snapping it back to Home.
    const hasActive = activeIndex >= 0;

    const [barWidth, setBarWidth] = useState(0);
    const itemWidth = barWidth ? barWidth / TABS.length : 0;
    const capsuleW = itemWidth ? Math.max(0, itemWidth - CAPSULE_INSET * 2) : 0;

    const capsuleX = useRef(new Animated.Value(0)).current;
    const capsuleOpacity = useRef(new Animated.Value(0)).current;
    const placed = useRef(false); // the first position is a jump, not a slide

    useEffect(() => {
        const anims = [];

        if (barWidth && hasActive) {
            const x = activeIndex * itemWidth;
            if (placed.current) {
                anims.push(Animated.spring(capsuleX, { toValue: x, useNativeDriver: true, ...t.motion.spring }));
            } else {
                capsuleX.setValue(x);
                placed.current = true;
            }
        }

        anims.push(Animated.timing(capsuleOpacity, {
            toValue: barWidth && hasActive ? 1 : 0,
            duration: t.motion.fast,
            useNativeDriver: true
        }));

        Animated.parallel(anims).start();
    }, [activeIndex, hasActive, barWidth, itemWidth, capsuleX, capsuleOpacity, t.motion]);

    return (
        <View
            style={[
                styles.container,
                { left: t.spacing.lg, right: t.spacing.lg, bottom: insets.bottom + t.spacing.md }
            ]}
            pointerEvents="box-none"
        >
            {/* Shadow lives on the wrapper: the bar clips its own overflow, so an
                inner shadow would be cut off. */}
            <View style={[styles.shadowWrap, { borderRadius: BAR_HEIGHT / 2 }, t.shadows.lg]}>
                <View style={[styles.bar, { borderRadius: BAR_HEIGHT / 2 }]}>
                    {/* Frost. Bare, so nothing else is layered on top of it.
                        Intensity is kept LOW on purpose: expo-blur's tint lays a wash
                        of its own over the blur, and it scales with intensity — at 70
                        with tint="dark" the bar came out nearly solid navy no matter
                        how weak the tint below it was. Low intensity keeps the frost
                        while letting the backdrop through. */}
                    <BlurView
                        intensity={t.isDark ? 32 : 40}
                        tint={t.blurTint}
                        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
                        style={StyleSheet.absoluteFill}
                    />
                    {/* Clear. Barely-there tint: only enough to hold icon contrast on a
                        light backdrop, not enough to occlude what is behind. */}
                    <View
                        pointerEvents="none"
                        style={[
                            StyleSheet.absoluteFill,
                            { backgroundColor: withAlpha(t.colors.surfaceAlt, t.isDark ? 0.07 : 0.14) }
                        ]}
                    />
                    {/* Soft edge instead of a stroke. A 1px border reads as a drawn
                        outline; real glass shows a diffuse gradient where light grazes
                        its top face. One gradient, fading out well before the bottom,
                        so there is no hard line anywhere. */}
                    <LinearGradient
                        colors={[
                            withAlpha(t.colors.onPrimary, t.isDark ? 0.13 : 0.5),
                            withAlpha(t.colors.onPrimary, t.isDark ? 0.03 : 0.12),
                            'rgba(255,255,255,0)'
                        ]}
                        locations={[0, 0.35, 1]}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                        style={StyleSheet.absoluteFill}
                        pointerEvents="none"
                    />

                    <View style={styles.row} onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}>
                        {capsuleW ? (
                            <Animated.View
                                pointerEvents="none"
                                style={[
                                    styles.capsuleSlot,
                                    { width: itemWidth, opacity: capsuleOpacity, transform: [{ translateX: capsuleX }] }
                                ]}
                            >
                                {/* A LIGHTER pane than the glass around it, with no stroke.
                                    It was previously darker, which made the active tab a
                                    recess — the opposite of highlighting it. Lifting it
                                    instead is what makes the icon it sits under read as
                                    selected, and a soft top-to-bottom falloff keeps it
                                    from looking like a drawn box. */}
                                <LinearGradient
                                    colors={[
                                        withAlpha(t.colors.onPrimary, t.isDark ? 0.16 : 0.5),
                                        withAlpha(t.colors.onPrimary, t.isDark ? 0.07 : 0.26)
                                    ]}
                                    start={{ x: 0.5, y: 0 }}
                                    end={{ x: 0.5, y: 1 }}
                                    style={[styles.capsule, { width: capsuleW }]}
                                />
                            </Animated.View>
                        ) : null}

                        {TABS.map((tab, i) => {
                            const isActive = i === activeIndex;
                            return (
                                <Pressable
                                    key={tab.name}
                                    style={styles.navItem}
                                    onPress={() => setActiveTab(tab.name)}
                                    accessibilityRole="tab"
                                    // Icon-only, matching the reference; screen readers
                                    // still get the tab name.
                                    accessibilityLabel={`${tab.name} tab`}
                                    accessibilityState={{ selected: isActive }}
                                >
                                    <Ionicons
                                        name={isActive ? tab.icon : `${tab.icon}-outline`}
                                        size={ICON_SIZE}
                                        color={
                                            isActive
                                                ? t.colors.onPrimary
                                                : withAlpha(t.colors.onPrimary, t.isDark ? 0.62 : 0.55)
                                        }
                                    />
                                </Pressable>
                            );
                        })}
                    </View>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { position: 'absolute', alignItems: 'center', zIndex: 50 },
    shadowWrap: { width: '100%' },
    bar: { width: '100%', height: BAR_HEIGHT, overflow: 'hidden' },
    row: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    navItem: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center' },

    capsuleSlot: { position: 'absolute', top: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
    // Radius is exactly half the height: a true stadium, tangent to the content
    // box rather than cutting into it.
    capsule: { height: CAPSULE_H, borderRadius: CAPSULE_H / 2 }
});
