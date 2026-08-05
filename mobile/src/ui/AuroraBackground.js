// File: mobile/src/ui/AuroraBackground.js
// Animated ambient background: a themed base gradient plus slow-drifting colour
// "blobs". This is the canvas every glass surface floats on, and it's what makes
// the app feel alive without costing a frame budget — all motion runs on the
// native driver (transform/opacity only).
//
// Composition (bottom → top):
//   1. base gradient   — t.colors.bgGradient
//   2. soft blobs      — drifting diffused light (see SoftBlob below)
//   3. vignette        — very subtle edge falloff so centred glass cards pop
//   4. children        — always above every decorative layer
//
// Why layered gradients instead of a full-screen BlurView over the blobs:
// this renders on EVERY screen, and every GlassView above it already stacks its
// own BlurView. On Android expo-blur's only backdrop option is
// `dimezisBlurView`, which the library itself documents as "may lead to
// decreased performance" — it snapshots the hierarchy behind it each pass, so
// putting one under a screenful of nested glass panes is the worst case for it.
// The concentric-gradient falloff below is pure static compositing: it costs
// nothing per frame and looks identical on both platforms.
import React, { useEffect, useRef } from 'react';
import { StyleSheet, Animated, Easing, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, withAlpha } from '../theme';

// Fake-gaussian falloff. Concentric circles, each smaller and brighter, each
// individually ramping to fully transparent — the overlap approximates a radial
// blur, and no single ring has a visible edge because the outermost is faint.
// Ordered outer → inner so `layers` can trim the bright core off dim blobs.
const HALO = [
    { scale: 1, alpha: 0.2 },
    { scale: 0.7, alpha: 0.3 },
    { scale: 0.44, alpha: 0.44 }
];

function SoftBlob({ size, colors, layers }) {
    const t = useTheme();
    const [c0, c1] = colors;

    return HALO.slice(0, layers).map(({ scale, alpha }, i) => {
        const d = size * scale;
        const inset = (size - d) / 2; // centre each ring inside the blob box
        return (
            <View
                key={i}
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    width: d,
                    height: d,
                    left: inset,
                    top: inset,
                    borderRadius: t.radii.pill,
                    overflow: 'hidden'
                }}
            >
                <LinearGradient
                    // Ramp to alpha 0 so the circular clip never shows as a hard rim.
                    colors={[withAlpha(c0, alpha), withAlpha(c1, alpha * 0.6), withAlpha(c1, 0)]}
                    locations={[0, 0.5, 1]}
                    start={{ x: 0.15, y: 0 }}
                    end={{ x: 0.85, y: 1 }}
                    style={styles.fill}
                />
            </View>
        );
    });
}

// Static geometry — kept at module scope so it isn't rebuilt every render.
// Blobs are deliberately larger than the old hard circles: a wider footprint at
// lower alpha reads as diffused light rather than a shape.
const BLOBS = [
    {
        palette: 'blobA',
        size: 440,
        layers: 3,
        dim: 1,
        pos: { top: -170, left: -150 },
        drift: { fromY: 0, toY: -46, fromX: 0, toX: 18, scaleTo: 1.12 }
    },
    {
        palette: 'blobB',
        size: 520,
        layers: 3,
        dim: 0.9,
        pos: { bottom: -220, right: -170 },
        drift: { fromY: 0, toY: 52, fromX: 0, toX: -24, scaleTo: 1.16 }
    },
    {
        // Only the two outer rings: this one is meant to be a faint wash, not a light source.
        palette: 'blobA',
        size: 360,
        layers: 2,
        dim: 0.55,
        pos: { top: '38%', right: -130 },
        drift: { fromY: 0, toY: -30, fromX: 0, toX: -30, scaleTo: 1.2 }
    }
];

export default function AuroraBackground({ children, style, intensity = 1 }) {
    const t = useTheme();
    const drift1 = useRef(new Animated.Value(0)).current;
    const drift2 = useRef(new Animated.Value(0)).current;
    const drift3 = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const loop = (value, duration, delay = 0) =>
            Animated.loop(
                Animated.sequence([
                    Animated.timing(value, {
                        toValue: 1,
                        duration,
                        delay,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true
                    }),
                    Animated.timing(value, {
                        toValue: 0,
                        duration,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true
                    })
                ])
            );

        const a = loop(drift1, 9000);
        const b = loop(drift2, 12000, 600);
        const c = loop(drift3, 15000, 1200);
        a.start(); b.start(); c.start();
        return () => { a.stop(); b.stop(); c.stop(); };
    }, [drift1, drift2, drift3]);

    const drivers = [drift1, drift2, drift3];

    // Blobs are dimmer in light mode so text keeps its contrast.
    const blobOpacity = (t.isDark ? 0.62 : 0.4) * intensity;

    // Vignette darkens the edges on dark (bg is near-black) and lightens them on
    // light (bgAlt is pure white) — same gradient, theme-derived colour.
    const vignette = t.isDark ? t.colors.bg : t.colors.bgAlt;
    const vAlpha = t.isDark ? 0.5 : 0.44;
    const vClear = withAlpha(vignette, 0);

    return (
        <View style={[styles.root, style]}>
            {/* Every decorative layer lives inside one non-interactive, clipping wrapper. */}
            <View style={styles.decor} pointerEvents="none">
                <LinearGradient
                    colors={t.colors.bgGradient}
                    start={{ x: 0.1, y: 0 }}
                    end={{ x: 0.9, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />

                {BLOBS.map((b, i) => {
                    const v = drivers[i];
                    const base = Math.min(1, blobOpacity * b.dim);
                    return (
                        <Animated.View
                            key={i}
                            style={[
                                styles.blob,
                                b.pos,
                                { width: b.size, height: b.size },
                                {
                                    // Breathing opacity is native-driver-legal and adds the
                                    // "dreamy" drift without touching layout or colour props.
                                    opacity: v.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [base, Math.min(1, base * 1.18)]
                                    }),
                                    transform: [
                                        { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [b.drift.fromY, b.drift.toY] }) },
                                        { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [b.drift.fromX, b.drift.toX] }) },
                                        { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, b.drift.scaleTo] }) }
                                    ]
                                }
                            ]}
                        >
                            <SoftBlob size={b.size} colors={t.colors[b.palette]} layers={b.layers} />
                        </Animated.View>
                    );
                })}

                {/* Above the blobs, so it also softens any blob mass sitting in a corner. */}
                <LinearGradient
                    colors={[withAlpha(vignette, vAlpha), vClear, vClear, withAlpha(vignette, vAlpha)]}
                    locations={[0, 0.3, 0.7, 1]}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />
                <LinearGradient
                    colors={[withAlpha(vignette, vAlpha * 0.6), vClear, vClear, withAlpha(vignette, vAlpha * 0.6)]}
                    locations={[0, 0.26, 0.74, 1]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={StyleSheet.absoluteFill}
                />
            </View>

            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, overflow: 'hidden' },
    decor: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
    fill: { flex: 1 },
    // No overflow:'hidden' here — the rings clip themselves, and clipping the
    // container would crop the scale-up drift.
    blob: { position: 'absolute' }
});
