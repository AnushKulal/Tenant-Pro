// File: mobile/src/components/BottomNav.js
// Floating tab bar — the "liquid flow" navbar from the reference video.
//
// Prop contract is unchanged ({ activeTab, setActiveTab }) — HomeScreen passes
// goToTab as setActiveTab, so every press still calls it with the exact tab
// name it switches on, and the TABS set/order below is the same as before.
//
// The look, straight off the reference:
//   • a solid black stadium pill with a thin rail through the middle and one
//     dark circular WELL per tab;
//   • the ICONS STAY DARK/MUTED in every state — they never invert to white and
//     never sit on a glossy sphere. The active tab is not signalled by recolouring
//     its icon;
//   • a PURPLE→BLUE LIQUID flows between tabs. At rest it's a soft glowing blob
//     behind the active icon; in flight it thins and stretches into a flowing
//     strand that bridges the two wells, exactly like the mid-transition frame of
//     the reference — then settles back into a blob. It is matte: a gradient and
//     a glow, with NO specular highlight and NO reflective-bubble sheen (that was
//     the previous take the design explicitly moved away from).
//
// Two colourways: DARK is a black pill with a purple→blue liquid (the reference);
// LIGHT is a white pill with a blue liquid. Same behaviour, different surfaces —
// the icons stay dark/muted and the active glyph is a dark knockout in both.
//
// How the flow is faked without Skia/SVG: the blob springs to the target while a
// second, translucent "trail" blob follows on a slower tween. Mid-motion the two
// overlap and span the gap between wells, reading as one stretched liquid bridge;
// at rest they coincide into a single blob. A true gooey metaball needs SVG/Skia
// (a native build → v2.0); this ships over-the-air on the Animated API.
import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Pressable, Animated, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme';

// Same tab set and order as before — do not reorder or rename. Icons are shown
// OUTLINE in every state; the active tab is marked by the liquid, not the glyph.
const TABS = [
    { name: 'Home', icon: 'home-outline' },
    { name: 'Rooms', icon: 'key-outline' },
    { name: 'Properties', icon: 'grid-outline' },
    { name: 'Tenants', icon: 'people-outline' }
];

// Two palettes. Dark: a black pill with a purple→blue liquid (the reference).
// Light: a WHITE pill with a BLUE liquid — same behaviour, its own colours.
// In both, the icons stay dark/muted and the active glyph is a dark knockout on
// the liquid; only the surfaces and the liquid's hue change with the theme.
const PALETTES = {
    dark: {
        bar: '#0C0C11',
        liquid: ['#8B5CF6', '#6D6BF0', '#3B82F6'], // purple → blue
        glowOuter: '#8B5CF6',                       // purple halo
        glowInner: '#3B82F6',                       // blue core glow
        well: 'rgba(255,255,255,0.03)',
        wellRing: 'rgba(255,255,255,0.06)',
        rail: 'rgba(255,255,255,0.07)',
        icon: 'rgba(255,255,255,0.62)',
        knockout: '#0B0B12'                         // dark icon over the liquid
    },
    light: {
        bar: '#FFFFFF',
        liquid: ['#60A5FA', '#3B82F6', '#2563EB'],  // light blue → blue
        glowOuter: '#3B82F6',
        glowInner: '#60A5FA',
        well: 'rgba(15,23,42,0.03)',
        wellRing: 'rgba(15,23,42,0.08)',
        rail: 'rgba(15,23,42,0.10)',
        icon: 'rgba(30,41,59,0.55)',                // dark-slate muted icon on white
        knockout: '#0B1220'                         // dark icon over the blue liquid
    }
};

const BAR_HEIGHT = 66;
const WELL = 46;          // resting circular well diameter
const BLOB = 44;          // resting liquid blob diameter (sits inside the well)
const GLOW = 74;          // soft glow footprint, overspills the pill on purpose
const ICON_SIZE = 23;

export default function BottomNav({ activeTab, setActiveTab }) {
    const insets = useSafeAreaInsets();
    const t = useTheme();
    const p = t.isDark ? PALETTES.dark : PALETTES.light;

    const activeIndex = TABS.findIndex((tab) => tab.name === activeTab);
    // Drill-in tabs (Settings, TenantProfile, Transactions…) are not in the bar.
    // Fade the liquid out for them rather than snapping it back to Home.
    const hasActive = activeIndex >= 0;

    const [barWidth, setBarWidth] = useState(0);
    const itemWidth = barWidth ? barWidth / TABS.length : 0;

    // Two followers: the blob springs, the trail tween lags — their overlap mid
    // motion is the liquid bridge (see header note).
    const blobX = useRef(new Animated.Value(0)).current;
    const trailX = useRef(new Animated.Value(0)).current;
    const opacity = useRef(new Animated.Value(0)).current;
    const stretch = useRef(new Animated.Value(0)).current; // 0 = round, 1 = mid-flow
    const placed = useRef(false); // the first position is a jump, not a flow

    useEffect(() => {
        const anims = [];

        if (barWidth && hasActive) {
            // Centre the blob in the active slot.
            const x = activeIndex * itemWidth + (itemWidth - BLOB) / 2;
            if (placed.current) {
                stretch.setValue(0);
                anims.push(
                    Animated.sequence([
                        Animated.timing(stretch, { toValue: 1, duration: 150, useNativeDriver: true }),
                        Animated.timing(stretch, { toValue: 0, duration: 240, useNativeDriver: true })
                    ])
                );
                // Blob leads (spring), trail follows (slower tween) → the stretch.
                anims.push(Animated.spring(blobX, { toValue: x, useNativeDriver: true, friction: 9, tension: 70 }));
                anims.push(Animated.timing(trailX, { toValue: x, duration: 340, useNativeDriver: true }));
            } else {
                blobX.setValue(x);
                trailX.setValue(x);
                placed.current = true;
            }
        }

        anims.push(
            Animated.timing(opacity, {
                toValue: barWidth && hasActive ? 1 : 0,
                duration: 180,
                useNativeDriver: true
            })
        );

        Animated.parallel(anims).start();
    }, [activeIndex, hasActive, barWidth, itemWidth, blobX, trailX, opacity, stretch]);

    // Stretch along travel, pinch across it — the liquid squash-and-stretch.
    const scaleX = stretch.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] });
    const scaleY = stretch.interpolate({ inputRange: [0, 1], outputRange: [1, 0.66] });
    // The trail is only visible while flowing, so at rest there's a single blob.
    const trailOpacity = stretch.interpolate({ inputRange: [0, 1], outputRange: [0, 0.85] });
    // The active glyph fades out mid-flight — while the liquid is a stretched
    // strand there is no icon on it (the wells keep theirs), matching the
    // reference — then fades back in once the blob settles.
    const glyphFade = stretch.interpolate({ inputRange: [0, 0.4, 1], outputRange: [1, 0, 0] });

    // Themed surfaces (see PALETTES). Icons stay muted/dark in every state.
    const barColor = p.bar;
    const wellFill = p.well;
    const wellRing = p.wellRing;
    const railColor = p.rail;
    const iconColor = p.icon;

    // A reusable liquid blob (gradient core + glow). `trail` variant is the
    // lagging translucent follower.
    const renderBlob = (xValue, isTrail) => (
        <Animated.View
            pointerEvents="none"
            style={[
                styles.blobLayer,
                {
                    width: BLOB,
                    height: BLOB,
                    opacity: isTrail ? Animated.multiply(opacity, trailOpacity) : opacity,
                    transform: [{ translateX: xValue }, { scaleX }, { scaleY }]
                }
            ]}
        >
            {/* Soft glow — concentric translucent rings give a radial falloff that
                reads on Android/web too, not just where iOS's coloured shadow works.
                The rings carry the liquid's own hue (themed). */}
            <View
                style={[
                    styles.glowOuter,
                    { backgroundColor: withA(p.glowOuter, 0.16), shadowColor: p.glowOuter }
                ]}
            />
            <View style={[styles.glowMid, { backgroundColor: withA(p.glowInner, 0.20) }]} />
            {/* The liquid core: a matte gradient (purple→blue in dark, blue in
                light). No sheen. */}
            <View style={styles.blob}>
                <LinearGradient
                    colors={p.liquid}
                    locations={[0, 0.5, 1]}
                    start={{ x: 0.1, y: 0.2 }}
                    end={{ x: 0.9, y: 0.9 }}
                    style={StyleSheet.absoluteFill}
                />
            </View>
        </Animated.View>
    );

    return (
        <View
            style={[styles.container, { left: 24, right: 24, bottom: insets.bottom + 16 }]}
            pointerEvents="box-none"
        >
            <View style={[styles.shadowWrap, styles.shadow]}>
                {/* The pill: solid matte black. No clip — the liquid's glow needs to
                    breathe past this edge. */}
                <View style={[styles.bar, { backgroundColor: barColor }]}>
                    {/* Rail: one thin line through the centres of the wells. */}
                    <View
                        pointerEvents="none"
                        style={[styles.rail, { backgroundColor: railColor, left: itemWidth / 2, right: itemWidth / 2 }]}
                    />

                    <View style={styles.row} onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}>
                        {TABS.map((tab, i) => (
                            <Pressable
                                key={tab.name}
                                style={styles.navItem}
                                onPress={() => setActiveTab(tab.name)}
                                accessibilityRole="tab"
                                accessibilityLabel={`${tab.name} tab`}
                                accessibilityState={{ selected: i === activeIndex }}
                            >
                                <View style={[styles.well, { backgroundColor: wellFill, borderColor: wellRing }]}>
                                    {/* Icon stays muted in every state; the liquid marks
                                        which tab is active, not the glyph's colour. */}
                                    <Ionicons name={tab.icon} size={ICON_SIZE} color={iconColor} />
                                </View>
                            </Pressable>
                        ))}
                    </View>
                </View>

                {/* Liquid layer — above the pill, never clipped. Trail first so the
                    solid blob sits over it. Icons live UNDER this only visually via
                    the well glyphs; because this layer is pointer-transparent and the
                    blob is translucent-glow + matte core, the dark glyph still reads. */}
                {itemWidth ? (
                    <>
                        {renderBlob(trailX, true)}
                        {renderBlob(blobX, false)}
                        {/* The active icon, redrawn ON TOP of the settled liquid as a
                            DARK knockout — the icon does not light up to white; it
                            stays dark and reads against the bright liquid. It fades out
                            while the liquid is mid-flow (glyphFade). */}
                        <Animated.View
                            pointerEvents="none"
                            style={[
                                styles.activeGlyph,
                                { opacity: Animated.multiply(opacity, glyphFade), transform: [{ translateX: blobX }] }
                            ]}
                        >
                            {hasActive ? (
                                <Ionicons name={TABS[activeIndex].icon} size={ICON_SIZE} color={p.knockout} />
                            ) : null}
                        </Animated.View>
                    </>
                ) : null}
            </View>
        </View>
    );
}

// Local alpha helper for the fixed hex values in PALETTES.
function withA(hex, a) {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
}

const styles = StyleSheet.create({
    container: { position: 'absolute', alignItems: 'center', zIndex: 50 },
    shadowWrap: { width: '100%', borderRadius: BAR_HEIGHT / 2 },
    shadow: {
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } },
            android: { elevation: 12 },
            default: { boxShadow: '0 10px 24px rgba(0,0,0,0.35)' }
        })
    },
    bar: { width: '100%', height: BAR_HEIGHT, borderRadius: BAR_HEIGHT / 2, justifyContent: 'center' },

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

    // Blobs and the active glyph are positioned from the left of the bar; their
    // translateX drives them to the active slot. Vertically centred on the pill.
    blobLayer: {
        position: 'absolute',
        left: 0,
        top: (BAR_HEIGHT - BLOB) / 2,
        alignItems: 'center',
        justifyContent: 'center'
    },
    glowOuter: {
        position: 'absolute',
        width: GLOW,
        height: GLOW,
        borderRadius: GLOW / 2,
        ...Platform.select({
            ios: { shadowOpacity: 0.8, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } },
            default: {}
        })
    },
    glowMid: {
        position: 'absolute',
        width: GLOW * 0.72,
        height: GLOW * 0.72,
        borderRadius: (GLOW * 0.72) / 2
    },
    blob: {
        width: BLOB,
        height: BLOB,
        borderRadius: BLOB / 2,
        overflow: 'hidden',
        ...Platform.select({ android: { elevation: 4 }, default: {} })
    },
    activeGlyph: {
        position: 'absolute',
        left: 0,
        top: (BAR_HEIGHT - BLOB) / 2,
        width: BLOB,
        height: BLOB,
        alignItems: 'center',
        justifyContent: 'center'
    }
});
