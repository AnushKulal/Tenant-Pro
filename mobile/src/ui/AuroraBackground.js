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

// Fake radial falloff, built from many concentric UNIFORM-alpha circles.
//
// The obvious approach — a LinearGradient inside a circular clip — does not work
// and was visibly wrong on device: a linear gradient ramps alpha along ONE axis,
// so perpendicular to that axis the fill is still near-full opacity when it
// reaches the circular clip, leaving a hard arc. Screenshots showed exactly that,
// a set of stacked crescents instead of a glow.
//
// Uniform alpha per ring has no direction, so the only edge is the circle itself.
// Keep each step small (a few percent) and the compositing 1-(1-a)^k curve reads
// as a smooth radial gradient with no perceptible banding. All static: no blur
// pass, nothing per-frame.
const RING_COUNT = 12;
const OUTER_SCALE = 1;
const INNER_SCALE = 0.16;

// Precomputed once: ring geometry never depends on theme or props.
const RINGS = Array.from({ length: RING_COUNT }, (_, i) => {
    const p = i / (RING_COUNT - 1);              // 0 = outermost, 1 = core
    return {
        scale: OUTER_SCALE + (INNER_SCALE - OUTER_SCALE) * p,
        // Slightly denser toward the core so the centre reads as a light source
        // rather than a flat disc.
        weight: 0.55 + 0.45 * p,
        mix: p                                    // hue blend, outer c0 → inner c1
    };
});

function SoftBlob({ size, colors, layers }) {
    const [c0, c1] = colors;
    // `layers` previously trimmed the bright core off dim blobs; preserve that
    // meaning by scaling the per-ring alpha instead of dropping rings, which
    // would reintroduce a visible outer edge.
    const density = layers >= 3 ? 1 : 0.62;

    return RINGS.map(({ scale, weight, mix }, i) => {
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
                    borderRadius: d / 2,
                    backgroundColor: withAlpha(mix < 0.5 ? c0 : c1, 0.032 * weight * density)
                }}
            />
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
