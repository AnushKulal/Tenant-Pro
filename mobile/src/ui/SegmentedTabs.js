// File: mobile/src/ui/SegmentedTabs.js
// Pill switcher with a sliding highlight — the Login / Sign Up control.
// Width is measured at layout time so the thumb lands exactly on each segment
// regardless of screen size or label length.
//
// Public API is unchanged:
//   <SegmentedTabs options={[{ label, value } | 'Bare string']} value onChange style />
//
// Animation contract:
//   • ONE native-driver value (`slide`, in segment-index units) drives the
//     travel, the squash-and-stretch and the label colour cross-fade, so every
//     part of the toggle moves as a single physical object.
//   • The FIRST position is a jump, not a slide (see `placed`): a control that
//     opens on the second segment must not animate in from the left.
import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import GlassView from './GlassView';
import { useTheme } from '../theme';

// Squash-and-stretch peak, applied only mid-flight: the thumb elongates along
// its direction of travel and thins a touch to compensate. Small on purpose —
// enough to read as mass, not enough to look like a bounce.
const STRETCH_X = 1.06;
const SQUASH_Y = 0.96;

// t.motion.spring overshoots past the target, which would push interpolated
// opacities negative and the scale past its intended peak.
const CLAMP = { extrapolate: 'clamp' };

export default function SegmentedTabs({ options = [], value, onChange, style }) {
    const t = useTheme();

    const count = options.length;
    // Unknown/absent `value` clamps to the first segment instead of -1, which
    // would otherwise park the thumb one full segment off-track.
    const found = options.findIndex((o) => (o?.value ?? o) === value);
    const index = found >= 0 ? found : 0;

    // Measured on the row itself, so segment width matches the track the thumb
    // slides along exactly (no assumptions about the track's padding).
    const [rowWidth, setRowWidth] = useState(0);
    const segmentWidth = rowWidth > 0 && count > 0 ? rowWidth / count : 0;

    // Seeded with the mounting index so the very first paint is already correct.
    const slide = useRef(new Animated.Value(index)).current;
    const placed = useRef(false);

    useEffect(() => {
        // Nothing is on screen until a real width exists; positioning before
        // then would animate against a zero-length track.
        if (!segmentWidth) return;

        if (!placed.current) {
            slide.setValue(index);
            placed.current = true;
            return;
        }

        Animated.spring(slide, {
            toValue: index,
            useNativeDriver: true,
            ...t.motion.spring
        }).start();
    }, [index, segmentWidth, slide, t.motion.spring]);

    // Half-step stops are what let a single driver produce both motions: at
    // every .5 (mid-flight) the thumb is stretched, at every integer (parked)
    // it is exactly 1:1. interpolate() needs >= 2 stops, and a single-segment
    // track has nowhere to travel, so it falls back to a no-op range.
    const stops = count > 1
        ? Array.from({ length: count * 2 - 1 }, (_, i) => i / 2)
        : [0, 1];

    const translateX = slide.interpolate({
        inputRange: stops,
        outputRange: stops.map((s) => (count > 1 ? s * segmentWidth : 0)),
        ...CLAMP
    });
    const scaleX = slide.interpolate({
        inputRange: stops,
        outputRange: stops.map((s) => (Number.isInteger(s) ? 1 : STRETCH_X)),
        ...CLAMP
    });
    const scaleY = slide.interpolate({
        inputRange: stops,
        outputRange: stops.map((s) => (Number.isInteger(s) ? 1 : SQUASH_Y)),
        ...CLAMP
    });

    return (
        <GlassView radius={t.radii.pill} style={[styles.track, { padding: t.spacing.xs }, style]}>
            <View style={styles.inner} onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}>
                {/* Held back until a real width lands: with segmentWidth 0 the
                    travel range collapses and the thumb would flash at 0. */}
                {segmentWidth > 0 ? (
                    <Animated.View
                        pointerEvents="none"
                        style={[
                            styles.thumb,
                            {
                                width: segmentWidth,
                                borderRadius: t.radii.pill,
                                transform: [{ translateX }, { scaleX }, { scaleY }]
                            }
                        ]}
                    >
                        <LinearGradient
                            colors={t.colors.primaryGradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={{ flex: 1, borderRadius: t.radii.pill }}
                        />
                    </Animated.View>
                ) : null}

                {options.map((opt, i) => {
                    const val = opt?.value ?? opt;
                    const label = opt?.label ?? opt;
                    const active = i === index;

                    // Colour cannot animate on the native driver, so each label is
                    // two stacked copies cross-faded by opacity. Keyed off `slide`
                    // rather than the selected index so the text recolours in step
                    // with the thumb passing under it.
                    const fadeRange = { inputRange: [i - 1, i, i + 1], ...CLAMP };
                    const activeOpacity = slide.interpolate({ ...fadeRange, outputRange: [0, 1, 0] });
                    const restOpacity = slide.interpolate({ ...fadeRange, outputRange: [1, 0, 1] });

                    return (
                        <Pressable
                            key={String(val)}
                            onPress={() => onChange && onChange(val)}
                            style={[styles.segment, { paddingVertical: t.spacing.md }]}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: active }}
                        >
                            {/* Sized by the resting copy; the active copy is absolute
                                on top of it, so both glyph runs share one baseline and
                                neither is clipped. */}
                            <View style={styles.labelStack}>
                                <Animated.Text
                                    numberOfLines={1}
                                    style={[
                                        t.typography.bodyStrong,
                                        styles.label,
                                        { color: t.colors.textMuted, opacity: restOpacity }
                                    ]}
                                >
                                    {label}
                                </Animated.Text>

                                <Animated.Text
                                    numberOfLines={1}
                                    style={[
                                        t.typography.bodyStrong,
                                        styles.label,
                                        styles.labelOverlay,
                                        { color: t.colors.onPrimary, opacity: activeOpacity }
                                    ]}
                                >
                                    {label}
                                </Animated.Text>
                            </View>
                        </Pressable>
                    );
                })}
            </View>
        </GlassView>
    );
}

const styles = StyleSheet.create({
    track: { width: '100%' },
    inner: { flexDirection: 'row', position: 'relative' },
    thumb: { position: 'absolute', top: 0, bottom: 0, left: 0 },
    segment: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    labelStack: { position: 'relative' },
    // 1px of horizontal bleed (centred, so it stays aligned): the overlay is
    // measured against the resting copy's rounded-up width, and without the
    // slack a sub-pixel shortfall would ellipsise the active label.
    labelOverlay: { position: 'absolute', top: 0, bottom: 0, left: -1, right: -1, textAlign: 'center' },
    // Heavier and slightly tracked out from typography.bodyStrong so the active
    // label holds its own against the gradient thumb.
    label: { fontWeight: '800', letterSpacing: 0.2 }
});
