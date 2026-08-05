// File: mobile/src/components/BottomNav.js
// Floating frosted tab bar. Props are unchanged ({ activeTab, setActiveTab }) —
// HomeScreen passes goToTab as setActiveTab, so every press must still call it
// with the exact tab name it switches on.
//
// Active tab treatment: a CLEAR glass capsule with a luminous rim, not a filled
// colour blob. The capsule reads as a lens sitting on the bar — its interior is
// slightly darker than the bar and it is defined almost entirely by the light
// caught on its edge.
//
// Two geometry rules keep the old cropping bug from returning:
//   • the capsule is sized to CONTAIN the icon+label stack, never to sit behind
//     part of it, and
//   • its corner radius is exactly half its height, so it is a true stadium and
//     the curve can never intrude on the content box.
//
// Icons come from Ionicons because it ships filled/outline pairs: the active tab
// switches to the filled glyph, which is what makes the selection read at a
// glance. Feather (used previously) is outline-only and cannot do that.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, withAlpha } from '../theme';
import { GlassView } from '../ui';

// Same tab set and order as before — do not reorder or rename. `icon` is the
// filled glyph; the outline variant is derived by appending '-outline'.
const TABS = [
    { name: 'Home', icon: 'home' },
    { name: 'Rooms', icon: 'key' },
    { name: 'Properties', icon: 'grid' },
    { name: 'Tenants', icon: 'people' }
];

const ICON_SIZE = 21;
const BAR_HEIGHT = 76;
const CAPSULE_H = 58;          // tall enough to hold icon + label with breathing room
const CAPSULE_INSET = 7;       // horizontal gap between capsule and cell edge

// Every interpolation is clamped: t.motion.spring overshoots past 1, which would
// push opacity negative and scale beyond the intended lift.
const CLAMP = { extrapolate: 'clamp' };

export default function BottomNav({ activeTab, setActiveTab }) {
    const t = useTheme();
    const insets = useSafeAreaInsets();

    const activeIndex = TABS.findIndex((tab) => tab.name === activeTab);
    // Drill-in tabs (Settings, TenantProfile, Transactions…) are not in the bar.
    // Fade the capsule out for them rather than snapping it back to Home.
    const hasActive = activeIndex >= 0;

    // translateX needs a real pixel width, so the row is measured.
    const [barWidth, setBarWidth] = useState(0);
    const itemWidth = barWidth ? barWidth / TABS.length : 0;
    const capsuleW = itemWidth ? Math.max(0, itemWidth - CAPSULE_INSET * 2) : 0;

    const capsuleX = useRef(new Animated.Value(0)).current;
    const capsuleOpacity = useRef(new Animated.Value(0)).current;
    const lifts = useRef(TABS.map((_, i) => new Animated.Value(i === activeIndex ? 1 : 0))).current;
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

        lifts.forEach((value, i) => {
            anims.push(Animated.spring(value, {
                toValue: i === activeIndex ? 1 : 0,
                useNativeDriver: true,
                ...t.motion.spring
            }));
        });

        Animated.parallel(anims).start();
    }, [activeIndex, hasActive, barWidth, itemWidth, capsuleX, capsuleOpacity, lifts, t.motion]);

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
                    radius={t.radii.pill}
                    // Frost + clear: real blur under a low-alpha tint, so the backdrop
                    // still reads through the bar. `strong` is deliberately unset —
                    // its high-alpha fill would make the pane opaque.
                    blur
                    intensity={t.blurIntensity + 30}
                    tintColor={withAlpha(t.colors.surfaceAlt, t.isDark ? 0.34 : 0.42)}
                    edgeLight
                    style={[styles.bar, { borderColor: withAlpha(t.colors.primaryAlt, 0.3) }]}
                >
                    <View style={styles.row} onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}>
                        {capsuleW ? (
                            <Animated.View
                                pointerEvents="none"
                                style={[
                                    styles.capsuleSlot,
                                    { width: itemWidth, opacity: capsuleOpacity, transform: [{ translateX: capsuleX }] }
                                ]}
                            >
                                {/* No outer halo. A first pass approximated a glow with a
                                    few nested stadium outlines, but at 3x they read as
                                    discrete concentric ripples rather than light — the
                                    concentric trick that works for circles fails here
                                    because a stroked outline stays visible as a line.
                                    The rim alone gives the lens its edge, which is what
                                    the reference does too. */}

                                {/* The lens: a plain bordered View, deliberately NOT a
                                    GlassView. It sits inside the already-blurred bar, so it
                                    gained nothing from a second blur pass, and its stacked
                                    gradient layers were rendering faint concentric arcs
                                    around the capsule at 3x. A flat translucent fill plus a
                                    bright rim is visually identical here and has no layers
                                    to alias. The interior is slightly DARKER than the bar,
                                    which is what makes the rim read as light catching a
                                    raised glass edge. */}
                                <View
                                    style={[
                                        styles.capsule,
                                        {
                                            width: capsuleW,
                                            backgroundColor: withAlpha(t.colors.bg, t.isDark ? 0.5 : 0.16),
                                            borderColor: withAlpha(t.colors.onPrimary, t.isDark ? 0.34 : 0.7)
                                        }
                                    ]}
                                />
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
                                    accessibilityLabel={`${tab.name} tab`}
                                    accessibilityState={{ selected: isActive }}
                                >
                                    <Animated.View
                                        style={[
                                            styles.itemInner,
                                            {
                                                transform: [{
                                                    scale: lift.interpolate({
                                                        inputRange: [0, 1],
                                                        outputRange: [1, 1.04],
                                                        ...CLAMP
                                                    })
                                                }]
                                            }
                                        ]}
                                    >
                                        <Ionicons
                                            // Filled when active, outline when not — the
                                            // clearest possible selected state at 21px.
                                            name={isActive ? tab.icon : `${tab.icon}-outline`}
                                            size={ICON_SIZE}
                                            color={isActive ? t.colors.onPrimary : t.colors.textFaint}
                                        />
                                        <Text
                                            numberOfLines={1}
                                            style={[
                                                t.typography.micro,
                                                styles.label,
                                                { color: isActive ? t.colors.onPrimary : t.colors.textMuted }
                                            ]}
                                        >
                                            {tab.name}
                                        </Text>
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
    itemInner: { alignItems: 'center', justifyContent: 'center' },

    // The slot spans one cell and centres the capsule in it, so the lens stays
    // concentric with the icon+label stack whatever the cell width.
    capsuleSlot: { position: 'absolute', top: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
    // Radius is exactly half the height: a true stadium, so the curve is tangent
    // to the content box rather than cutting into it.
    capsule: { height: CAPSULE_H, borderRadius: CAPSULE_H / 2, borderWidth: 1.5 },

    // Tighter tracking than typography.micro so "Properties" fits on one line
    // inside the capsule.
    label: { marginTop: 3, letterSpacing: 0.1 }
});
