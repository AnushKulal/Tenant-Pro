// File: mobile/src/ui/ProgressBar.js
// Animated progress track. Two modes:
//   • determinate   — pass progress 0..1
//   • indeterminate — pass indeterminate, a shimmer sweeps the track
// Used by the update sheet to show download state, and reusable for uploads.
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme';

export default function ProgressBar({
    progress = 0,               // 0..1
    indeterminate = false,
    height = 8,
    style,
    trackColor
}) {
    const t = useTheme();
    const width = useRef(new Animated.Value(0)).current;
    const sweep = useRef(new Animated.Value(0)).current;

    // Animate to each new value so the bar glides instead of jumping.
    useEffect(() => {
        if (indeterminate) return;
        const clamped = Math.max(0, Math.min(1, progress));
        Animated.timing(width, {
            toValue: clamped,
            duration: 420,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false // animating width %
        }).start();
    }, [progress, indeterminate, width]);

    useEffect(() => {
        if (!indeterminate) return;
        const anim = Animated.loop(
            Animated.timing(sweep, {
                toValue: 1,
                duration: 1150,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true
            })
        );
        anim.start();
        return () => anim.stop();
    }, [indeterminate, sweep]);

    const widthPct = width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

    return (
        <View
            style={[
                styles.track,
                { height, borderRadius: height / 2, backgroundColor: trackColor ?? t.colors.surfaceHigh },
                style
            ]}
        >
            {indeterminate ? (
                <Animated.View
                    style={[
                        styles.indeterminate,
                        {
                            height,
                            transform: [
                                {
                                    translateX: sweep.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [-140, 320]
                                    })
                                }
                            ]
                        }
                    ]}
                >
                    <LinearGradient
                        colors={['transparent', t.colors.primary, 'transparent']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={{ flex: 1, borderRadius: height / 2 }}
                    />
                </Animated.View>
            ) : (
                <Animated.View style={{ width: widthPct, height }}>
                    <LinearGradient
                        colors={t.colors.primaryGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={{ flex: 1, borderRadius: height / 2 }}
                    />
                </Animated.View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    track: { width: '100%', overflow: 'hidden' },
    indeterminate: { width: 140, position: 'absolute', left: 0 }
});
