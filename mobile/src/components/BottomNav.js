// File: mobile/src/components/BottomNav.js
// Floating frosted tab bar for the owner app. Props are unchanged
// ({ activeTab, setActiveTab }) — HomeScreen passes goToTab as setActiveTab, so
// every press must still call it with the exact tab name it switches on.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
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

const ICON_SIZE = 22;
// Every interpolation is clamped: t.motion.spring overshoots past 1, which would
// push opacity negative and scale beyond the intended lift.
const CLAMP = { extrapolate: 'clamp' };

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

    // Indicator geometry is derived from the content it has to CONTAIN, so the
    // rounded rect can never clip the icon or the label:
    //   icon 22 + gap 4 + label line 13 + 8 padding top/bottom = 55
    const labelLine = Math.round(t.typography.micro.fontSize * 1.2);
    const indicatorHeight = ICON_SIZE + t.spacing.xs + labelLine + t.spacing.sm * 2;
    // Full cell minus a hairline of breathing room — wide enough for
    // "Properties" (~56px at micro/700) plus side padding.
    const indicatorWidth = Math.max(0, itemWidth - t.spacing.sm);

    const indicatorX = useRef(new Animated.Value(0)).current;
    const indicatorOpacity = useRef(new Animated.Value(0)).current;
    // One 0→1 driver per tab for its lift/scale and colour cross-fade. Held in a
    // ref so the animation never re-renders the bar.
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

    // Low-alpha brand wash + a white specular top edge: reads as tinted glass
    // without a second BlurView (the bar already owns the only one).
    const fillGradient = [
        withAlpha(t.colors.primary, t.isDark ? 0.22 : 0.14),
        withAlpha(t.colors.primaryAlt, t.isDark ? 0.10 : 0.06)
    ];
    const sheenLine = [
        withAlpha(t.colors.onPrimary, 0),
        withAlpha(t.colors.onPrimary, t.isDark ? 0.34 : 0.7),
        withAlpha(t.colors.onPrimary, 0)
    ];

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
                        {/* Moving highlight behind the active item. Size, radius and
                            colour are static so the native driver only ever animates
                            transform/opacity. */}
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
                                        styles.indicatorFill,
                                        {
                                            width: indicatorWidth,
                                            height: indicatorHeight,
                                            // radii.lg, NOT radii.pill: a stadium curve
                                            // cuts across the icon + label stack.
                                            borderRadius: t.radii.lg,
                                            borderColor: t.colors.borderStrong
                                        }
                                    ]}
                                >
                                    <LinearGradient
                                        colors={fillGradient}
                                        start={{ x: 0.1, y: 0 }}
                                        end={{ x: 0.9, y: 1 }}
                                        style={StyleSheet.absoluteFill}
                                    />
                                    <LinearGradient
                                        colors={sheenLine}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                        style={[styles.sheenEdge, { marginHorizontal: t.spacing.sm }]}
                                    />
                                </View>
                            </Animated.View>
                        ) : null}

                        {TABS.map((tab, i) => {
                            const isActive = i === activeIndex;
                            const lift = lifts[i];
                            // Two stacked copies cross-faded by opacity — the only way
                            // to animate a colour change on the native driver.
                            const activeOpacity = lift.interpolate({ inputRange: [0, 1], outputRange: [0, 1], ...CLAMP });
                            const restOpacity = lift.interpolate({ inputRange: [0, 1], outputRange: [0.72, 0], ...CLAMP });
                            const iconScale = lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08], ...CLAMP });

                            const stack = (color, iconColor) => (
                                <>
                                    {/* Only the glyph scales: scaling the whole stack would
                                        grow "Properties" toward the indicator's edges. */}
                                    <Animated.View style={{ transform: [{ scale: iconScale }] }}>
                                        <Feather name={tab.icon} size={ICON_SIZE} color={iconColor} />
                                    </Animated.View>
                                    <Text
                                        numberOfLines={1}
                                        style={[
                                            t.typography.micro,
                                            styles.label,
                                            { marginTop: t.spacing.xs, lineHeight: labelLine, color }
                                        ]}
                                    >
                                        {tab.name}
                                    </Text>
                                </>
                            );

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
                                        style={[
                                            styles.stack,
                                            {
                                                opacity: restOpacity,
                                                transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -2], ...CLAMP }) }]
                                            }
                                        ]}
                                    >
                                        {stack(t.colors.textMuted, t.colors.textFaint)}
                                    </Animated.View>

                                    <Animated.View
                                        pointerEvents="none"
                                        style={[
                                            styles.stack,
                                            styles.stackOverlay,
                                            {
                                                opacity: activeOpacity,
                                                transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -2], ...CLAMP }) }]
                                            }
                                        ]}
                                    >
                                        {stack(t.colors.primary, t.colors.primary)}
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
    stack: { alignItems: 'center', justifyContent: 'center' },
    // The active copy sits exactly on top of the resting copy.
    stackOverlay: { ...StyleSheet.absoluteFillObject },
    indicatorSlot: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        alignItems: 'center',
        justifyContent: 'center'
    },
    indicatorFill: { borderWidth: 1, overflow: 'hidden' },
    sheenEdge: { height: StyleSheet.hairlineWidth * 2 },
    // Tighter tracking than typography.micro so "Properties" fits one line.
    label: { letterSpacing: 0.2 }
});
