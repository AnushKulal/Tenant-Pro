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
                <View
                    style={[
                        styles.bar,
                        {
                            borderRadius: BAR_HEIGHT / 2,
                            // The single bright rim. This one line is what makes the
                            // pane read as a glass edge.
                            borderColor: withAlpha(t.colors.onPrimary, t.isDark ? 0.22 : 0.85)
                        }
                    ]}
                >
                    {/* Frost. Used bare rather than through GlassView so nothing else
                        is layered on top of it. */}
                    <BlurView
                        intensity={t.isDark ? 70 : 60}
                        tint={t.blurTint}
                        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
                        style={StyleSheet.absoluteFill}
                    />
                    {/* Clear. A deliberately WEAK tint — just enough to keep icon
                        contrast, low enough that the backdrop still reads through. */}
                    <View
                        pointerEvents="none"
                        style={[
                            StyleSheet.absoluteFill,
                            { backgroundColor: withAlpha(t.colors.surfaceAlt, t.isDark ? 0.16 : 0.24) }
                        ]}
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
                                <View
                                    style={[
                                        styles.capsule,
                                        {
                                            width: capsuleW,
                                            // Darker than the glass around it, so the
                                            // selection reads as depth rather than colour.
                                            backgroundColor: withAlpha(
                                                t.isDark ? t.colors.bg : t.colors.text,
                                                t.isDark ? 0.55 : 0.1
                                            )
                                        }
                                    ]}
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
    bar: { width: '100%', height: BAR_HEIGHT, borderWidth: 1, overflow: 'hidden' },
    row: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    navItem: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center' },

    capsuleSlot: { position: 'absolute', top: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
    // Radius is exactly half the height: a true stadium, tangent to the content
    // box rather than cutting into it.
    capsule: { height: CAPSULE_H, borderRadius: CAPSULE_H / 2 }
});
