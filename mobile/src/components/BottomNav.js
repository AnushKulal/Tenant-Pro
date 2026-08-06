// File: mobile/src/components/BottomNav.js
// Floating tab bar, rebuilt to match the reference "orb" navbar: a solid black
// stadium pill with a thin rail through the middle, one dark circular WELL per
// tab, and a single glowing, raised ORB (a purple sphere with a white filled
// glyph) that SLIDES to whichever tab is active.
//
// Prop contract is unchanged ({ activeTab, setActiveTab }) — HomeScreen passes
// goToTab as setActiveTab, so every press still calls it with the exact tab
// name it switches on, and the TABS set/order below is the same as before.
//
// Why solid, not glass: the reference is not frosted — it is a matte black pill
// whose whole identity is the black-on-page contrast plus the glowing orb. So
// the bar stays dark in BOTH themes (a black pill on a light page is exactly
// the reference); only the orb takes the active theme's brand colour, which is
// purple in dark (the reference) and blue in light (still on-brand, still a
// glowing sphere on black).
//
// The orb is drawn on a layer that is NOT clipped, so its glow halo can spill
// past the pill's edges the way it does in the reference. The rail + wells sit
// on a lower layer. There is no overflow:hidden anywhere — the pill is a solid
// fill, so its rounded corners need no clip, and clipping would eat the glow.
//
// Liquid feel: a true gooey metaball tail needs Skia/SVG (a native build, so
// v2.0). Here the orb SQUASHES along its travel — a quick stretch that settles
// as it lands — which reads as liquid motion using only the Animated API, so it
// ships over-the-air.
import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Pressable, Animated, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, withAlpha } from '../theme';

// Same tab set and order as before — do not reorder or rename. `icon` is the
// filled glyph shown in the active orb; the outline variant '<icon>-outline'
// is shown in the resting wells.
const TABS = [
    { name: 'Home', icon: 'home' },
    { name: 'Rooms', icon: 'key' },
    { name: 'Properties', icon: 'grid' },
    { name: 'Tenants', icon: 'people' }
];

const BAR_HEIGHT = 66;
const WELL = 46;          // resting circular well diameter
const ORB = 54;           // active sphere — larger than a well, so it reads raised
const HALO = 84;          // soft glow behind the orb; overspills the pill on purpose
const ICON_SIZE = 23;

export default function BottomNav({ activeTab, setActiveTab }) {
    const t = useTheme();
    const insets = useSafeAreaInsets();

    const activeIndex = TABS.findIndex((tab) => tab.name === activeTab);
    // Drill-in tabs (Settings, TenantProfile, Transactions…) are not in the bar.
    // Fade the orb out for them rather than snapping it back to Home.
    const hasActive = activeIndex >= 0;

    const [barWidth, setBarWidth] = useState(0);
    const itemWidth = barWidth ? barWidth / TABS.length : 0;

    const orbX = useRef(new Animated.Value(0)).current;
    const orbOpacity = useRef(new Animated.Value(0)).current;
    const stretch = useRef(new Animated.Value(0)).current; // 0 = round, 1 = mid-slide squash
    const placed = useRef(false); // the first position is a jump, not a slide

    useEffect(() => {
        const anims = [];

        if (barWidth && hasActive) {
            // Centre the orb inside the active slot.
            const x = activeIndex * itemWidth + (itemWidth - ORB) / 2;
            if (placed.current) {
                // Squash on the way, settle round on arrival — the liquid cue.
                stretch.setValue(0);
                anims.push(
                    Animated.sequence([
                        Animated.timing(stretch, { toValue: 1, duration: 120, useNativeDriver: true }),
                        Animated.timing(stretch, { toValue: 0, duration: 200, useNativeDriver: true })
                    ])
                );
                anims.push(Animated.spring(orbX, { toValue: x, useNativeDriver: true, ...t.motion.spring }));
            } else {
                orbX.setValue(x);
                placed.current = true;
            }
        }

        anims.push(
            Animated.timing(orbOpacity, {
                toValue: barWidth && hasActive ? 1 : 0,
                duration: t.motion.fast,
                useNativeDriver: true
            })
        );

        Animated.parallel(anims).start();
    }, [activeIndex, hasActive, barWidth, itemWidth, orbX, orbOpacity, stretch, t.motion]);

    // Stretch along travel (x) and pinch across it (y) — classic squash-and-stretch.
    const scaleX = stretch.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
    const scaleY = stretch.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] });

    // Constant dark pill in both themes (see header note).
    const barColor = t.isDark ? '#0C0C11' : '#141419';
    const wellFill = 'rgba(255,255,255,0.03)';
    const wellRing = 'rgba(255,255,255,0.06)';
    const railColor = 'rgba(255,255,255,0.07)';

    return (
        <View
            style={[
                styles.container,
                { left: t.spacing.lg, right: t.spacing.lg, bottom: insets.bottom + t.spacing.md }
            ]}
            pointerEvents="box-none"
        >
            <View style={[styles.shadowWrap, { borderRadius: BAR_HEIGHT / 2 }, t.shadows.lg]}>
                {/* The pill itself: solid matte black, rounded to a stadium. No clip —
                    the orb's glow needs to breathe past this edge. */}
                <View style={[styles.bar, { borderRadius: BAR_HEIGHT / 2, backgroundColor: barColor }]}>
                    {/* Rail: one thin line through the centres of the wells. */}
                    <View
                        pointerEvents="none"
                        style={[styles.rail, { backgroundColor: railColor, left: itemWidth / 2, right: itemWidth / 2 }]}
                    />

                    <View style={styles.row} onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}>
                        {TABS.map((tab, i) => {
                            const isActive = i === activeIndex;
                            return (
                                <Pressable
                                    key={tab.name}
                                    style={styles.navItem}
                                    onPress={() => setActiveTab(tab.name)}
                                    accessibilityRole="tab"
                                    accessibilityLabel={`${tab.name} tab`}
                                    accessibilityState={{ selected: isActive }}
                                >
                                    {/* Resting well. Stays put; the orb rides over the
                                        active one, so the well under the orb reads as
                                        its socket. */}
                                    <View style={[styles.well, { backgroundColor: wellFill, borderColor: wellRing }]}>
                                        {/* The well's own (inactive) glyph fades out when
                                            the orb is over it, so the orb's white glyph
                                            isn't doubled. */}
                                        <Ionicons
                                            name={`${tab.icon}-outline`}
                                            size={ICON_SIZE}
                                            color={withAlpha('#FFFFFF', isActive ? 0 : 0.5)}
                                        />
                                    </View>
                                </Pressable>
                            );
                        })}
                    </View>
                </View>

                {/* Orb layer — sibling of the pill, above it, never clipped. */}
                {itemWidth ? (
                    <Animated.View
                        pointerEvents="none"
                        style={[
                            styles.orbLayer,
                            {
                                width: ORB,
                                height: ORB,
                                opacity: orbOpacity,
                                transform: [{ translateX: orbX }, { scaleX }, { scaleY }]
                            }
                        ]}
                    >
                        {/* Soft glow halo behind the sphere. A single translucent
                            disc has a hard edge on Android (no coloured shadow there),
                            so three concentric rings of decreasing alpha fake a radial
                            falloff that reads as glow on every platform; the outer ring
                            also carries iOS's coloured shadow. This is what spills past
                            the pill edge, exactly like the reference. */}
                        <View
                            style={[
                                styles.haloOuter,
                                {
                                    backgroundColor: withAlpha(t.colors.primary, t.isDark ? 0.12 : 0.10),
                                    shadowColor: t.colors.primary
                                }
                            ]}
                        />
                        <View style={[styles.haloMid, { backgroundColor: withAlpha(t.colors.primary, t.isDark ? 0.18 : 0.16) }]} />
                        <View style={[styles.haloInner, { backgroundColor: withAlpha(t.colors.primary, t.isDark ? 0.30 : 0.26) }]} />
                        {/* The sphere: a diagonal brand gradient (light top-left →
                            deep bottom-right) reads as a lit ball. */}
                        <View style={styles.orb}>
                            <LinearGradient
                                colors={[t.colors.primaryAlt, t.colors.primary, t.colors.primaryDeep]}
                                locations={[0, 0.55, 1]}
                                start={{ x: 0.2, y: 0.1 }}
                                end={{ x: 0.85, y: 0.95 }}
                                style={StyleSheet.absoluteFill}
                            />
                            {/* Specular: a small bright bloom at the top-left. */}
                            <View style={styles.orbSheen} />
                            <Ionicons name={hasActive ? TABS[Math.max(activeIndex, 0)].icon : 'ellipse'} size={ICON_SIZE} color="#FFFFFF" style={styles.orbGlyph} />
                        </View>
                    </Animated.View>
                ) : null}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { position: 'absolute', alignItems: 'center', zIndex: 50 },
    shadowWrap: { width: '100%' },
    bar: { width: '100%', height: BAR_HEIGHT, justifyContent: 'center' },

    rail: { position: 'absolute', top: BAR_HEIGHT / 2, height: StyleSheet.hairlineWidth * 2 },

    row: { flexDirection: 'row', alignItems: 'center' },
    navItem: { flex: 1, height: BAR_HEIGHT, alignItems: 'center', justifyContent: 'center' },
    well: {
        width: WELL,
        height: WELL,
        borderRadius: WELL / 2,
        borderWidth: StyleSheet.hairlineWidth,
        alignItems: 'center',
        justifyContent: 'center'
    },

    // Positioned from the left of the bar; translateX drives it to the active
    // slot. Vertically centred on the pill, so it rides a touch proud of the
    // wells (ORB > WELL) — the "raised" read.
    orbLayer: {
        position: 'absolute',
        left: 0,
        top: (BAR_HEIGHT - ORB) / 2,
        alignItems: 'center',
        justifyContent: 'center'
    },
    haloOuter: {
        position: 'absolute',
        width: HALO,
        height: HALO,
        borderRadius: HALO / 2,
        // iOS coloured glow; Android/web lean on the ring stack itself.
        ...Platform.select({
            ios: { shadowOpacity: 0.8, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } },
            default: {}
        })
    },
    haloMid: {
        position: 'absolute',
        width: HALO * 0.78,
        height: HALO * 0.78,
        borderRadius: (HALO * 0.78) / 2
    },
    haloInner: {
        position: 'absolute',
        width: HALO * 0.62,
        height: HALO * 0.62,
        borderRadius: (HALO * 0.62) / 2
    },
    orb: {
        width: ORB,
        height: ORB,
        borderRadius: ORB / 2,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        ...Platform.select({ android: { elevation: 6 }, default: {} })
    },
    orbSheen: {
        position: 'absolute',
        top: ORB * 0.12,
        left: ORB * 0.14,
        width: ORB * 0.42,
        height: ORB * 0.42,
        borderRadius: ORB * 0.21,
        backgroundColor: 'rgba(255,255,255,0.45)'
    },
    orbGlyph: {
        // Above the shade/sheen washes.
        zIndex: 1
    }
});
