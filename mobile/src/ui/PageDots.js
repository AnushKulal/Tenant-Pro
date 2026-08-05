// File: mobile/src/ui/PageDots.js
// Page indicator for the onboarding carousel. The active dot stretches into a
// pill so progress is legible at a glance.
//
// When a scroll position is supplied the dots track the finger. That value comes
// from an Animated.event running on the NATIVE driver, so the animation may only
// touch properties the native animated module allows — transform and opacity.
// `width` is NOT on that allowlist: interpolating a native-owned value into
// width throws "Style property 'width' is not supported by native animated
// module" at mount. So the pill effect is produced with transform scaleX on a
// fixed-width box instead. Layout is unaffected by transforms, which is also why
// the dot spacing stays stable as the active dot grows.
import React from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { useTheme } from '../theme';

const DOT_MAX = 26;   // width of the expanded (active) pill
const DOT_MIN = 8;    // visual width of an inactive dot
const MIN_SCALE = DOT_MIN / DOT_MAX;

export default function PageDots({ count, index, scrollX, width, style }) {
    const t = useTheme();

    return (
        <View style={[styles.row, style]}>
            {Array.from({ length: count }).map((_, i) => {
                if (scrollX && width) {
                    const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
                    const scaleX = scrollX.interpolate({
                        inputRange,
                        outputRange: [MIN_SCALE, 1, MIN_SCALE],
                        extrapolate: 'clamp'
                    });
                    const opacity = scrollX.interpolate({
                        inputRange,
                        outputRange: [0.35, 1, 0.35],
                        extrapolate: 'clamp'
                    });
                    return (
                        <Animated.View
                            key={i}
                            style={[
                                styles.dot,
                                styles.dotAnimated,
                                { opacity, backgroundColor: t.colors.primary, transform: [{ scaleX }] }
                            ]}
                        />
                    );
                }

                // Static fallback when no scroll position is provided.
                const active = i === index;
                return (
                    <View
                        key={i}
                        style={[
                            styles.dot,
                            {
                                width: active ? DOT_MAX : DOT_MIN,
                                opacity: active ? 1 : 0.35,
                                backgroundColor: active ? t.colors.primary : t.colors.textFaint
                            }
                        ]}
                    />
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    dot: { height: 8, borderRadius: 4, marginHorizontal: 4 },
    // Fixed box so scaleX has a stable basis; the transform never shifts layout.
    dotAnimated: { width: DOT_MAX, marginHorizontal: 2 }
});
