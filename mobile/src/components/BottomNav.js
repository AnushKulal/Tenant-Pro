// File: mobile/src/components/BottomNav.js
// Floating frosted tab bar for the owner app. Props are unchanged
// ({ activeTab, setActiveTab }) — HomeScreen passes goToTab as setActiveTab, so
// every press must still call it with the exact tab name it switches on.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
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

export default function BottomNav({ activeTab, setActiveTab }) {
    const t = useTheme();
    const insets = useSafeAreaInsets();

    const activeIndex = TABS.findIndex((tab) => tab.name === activeTab);
    // Drill-in tabs (Settings, TenantProfile, Transactions…) live outside the
    // bar. The old version rendered no indicator for them, so fade it out
    // rather than snapping the pill back to Home.
    const hasActive = activeIndex >= 0;

    // The indicator travels by translateX, which needs a real pixel width.
    const [barWidth, setBarWidth] = useState(0);
    const itemWidth = barWidth ? barWidth / TABS.length : 0;

    const indicatorX = useRef(new Animated.Value(0)).current;
    const indicatorOpacity = useRef(new Animated.Value(0)).current;
    // One 0→1 driver per tab for its lift/scale. Held in a ref so the animation
    // never re-renders the bar.
    const lifts = useRef(TABS.map((_, i) => new Animated.Value(i === activeIndex ? 1 : 0))).current;
    const placed = useRef(false); // first position is a jump, not a slide

    useEffect(() => {
        const anims = [];

        if (barWidth && hasActive) {
            const x = activeIndex * itemWidth;
            if (placed.current) {
                anims.push(Animated.spring(indicatorX, {
                    toValue: x,
                    useNativeDriver: true,
                    ...t.motion.spring
                }));
            } else {
                indicatorX.setValue(x);
                placed.current = true;
            }
        }

        anims.push(Animated.timing(indicatorOpacity, {
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
    }, [activeIndex, hasActive, barWidth, itemWidth]);

    return (
        <View
            // Sits above the gesture bar / home indicator on every device.
            style={[
                styles.container,
                {
                    left: t.spacing.lg,
                    right: t.spacing.lg,
                    bottom: insets.bottom + t.spacing.md
                }
            ]}
            pointerEvents="box-none"
        >
            <View style={[styles.shadowWrap, { borderRadius: t.radii.pill }, t.shadows.lg]}>
                <GlassView strong radius={t.radii.pill} style={styles.bar}>
                    {/* Measured on the row itself so item width matches the track
                        the indicator slides along exactly. */}
                    <View
                        style={styles.row}
                        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
                    >
                        {/* Moving pill behind the active item. Static size + colour
                            so the native driver only animates transform/opacity. */}
                        {itemWidth ? (
                            <Animated.View
                                pointerEvents="none"
                                style={[
                                    styles.indicatorSlot,
                                    {
                                        width: itemWidth,
                                        opacity: indicatorOpacity,
                                        transform: [{ translateX: indicatorX }]
                                    }
                                ]}
                            >
                                <View
                                    style={[
                                        styles.indicatorPill,
                                        {
                                            // Never wider than its slot on small screens.
                                            width: Math.min(58, Math.max(0, itemWidth - 6)),
                                            borderRadius: t.radii.pill,
                                            backgroundColor: withAlpha(t.colors.primary, t.isDark ? 0.22 : 0.14),
                                            borderColor: t.colors.borderStrong
                                        }
                                    ]}
                                />
                            </Animated.View>
                        ) : null}

                        {TABS.map((tab, i) => {
                            const isActive = i === activeIndex;
                            const lift = lifts[i];

                            return (
                                <TouchableOpacity
                                    key={tab.name}
                                    style={styles.navItem}
                                    onPress={() => setActiveTab(tab.name)}
                                    activeOpacity={0.75}
                                    accessibilityRole="tab"
                                    accessibilityLabel={`${tab.name} tab`}
                                    accessibilityState={{ selected: isActive }}
                                >
                                    <Animated.View
                                        style={{
                                            alignItems: 'center',
                                            transform: [
                                                { translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) },
                                                { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }
                                            ]
                                        }}
                                    >
                                        <Feather
                                            name={tab.icon}
                                            size={22}
                                            color={isActive ? t.colors.primary : t.colors.textFaint}
                                        />
                                        <Text
                                            numberOfLines={1}
                                            style={[
                                                t.typography.micro,
                                                styles.label,
                                                { color: isActive ? t.colors.primary : t.colors.textMuted }
                                            ]}
                                        >
                                            {tab.name}
                                        </Text>
                                    </Animated.View>
                                </TouchableOpacity>
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
    // Shadow lives outside GlassView because GlassView clips its own overflow.
    shadowWrap: { width: '100%' },
    bar: { width: '100%', height: 68, paddingHorizontal: 6 },
    row: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    navItem: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center' },
    indicatorSlot: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        alignItems: 'center',
        justifyContent: 'center'
    },
    indicatorPill: { height: 48, borderWidth: 1 },
    // Tighter tracking than typography.micro so "Properties" fits one line.
    label: { marginTop: 3, letterSpacing: 0.2 }
});
