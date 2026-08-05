// File: mobile/src/ui/PageDots.js
// Page indicator for the onboarding carousel. The active dot stretches into a
// pill so progress is legible at a glance.
import React from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { useTheme } from '../theme';

export default function PageDots({ count, index, scrollX, width, style }) {
    const t = useTheme();

    return (
        <View style={[styles.row, style]}>
            {Array.from({ length: count }).map((_, i) => {
                // When a scroll position is supplied the dots track the finger.
                if (scrollX && width) {
                    const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
                    const dotWidth = scrollX.interpolate({
                        inputRange,
                        outputRange: [8, 26, 8],
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
                            style={[styles.dot, { width: dotWidth, opacity, backgroundColor: t.colors.primary }]}
                        />
                    );
                }
                const active = i === index;
                return (
                    <View
                        key={i}
                        style={[
                            styles.dot,
                            {
                                width: active ? 26 : 8,
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
    dot: { height: 8, borderRadius: 4, marginHorizontal: 4 }
});
