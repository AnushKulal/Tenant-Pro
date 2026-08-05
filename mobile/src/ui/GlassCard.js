// File: mobile/src/ui/GlassCard.js
// A padded, elevated GlassView that fades + lifts in on mount. Use it for any
// grouped content: forms, stat panels, list sections.
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import GlassView from './GlassView';
import { useTheme } from '../theme';

export default function GlassCard({
    children,
    style,
    padding,
    radius,
    strong = false,
    elevation = 'md',       // 'none' | 'sm' | 'md' | 'lg' | 'glow'
    animate = true,
    delay = 0,
    ...rest
}) {
    const t = useTheme();
    const appear = useRef(new Animated.Value(animate ? 0 : 1)).current;

    useEffect(() => {
        if (!animate) return;
        Animated.timing(appear, {
            toValue: 1,
            duration: t.motion.entrance,
            delay,
            useNativeDriver: true
        }).start();
    }, [animate, appear, delay, t.motion.entrance]);

    const animatedStyle = {
        opacity: appear,
        transform: [
            { translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) },
            { scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }
        ]
    };

    return (
        <Animated.View style={[t.shadows[elevation], animatedStyle, style]}>
            <GlassView
                radius={radius ?? t.radii.xxl}
                strong={strong}
                style={[styles.inner, { padding: padding ?? t.spacing.xxl }]}
                {...rest}
            >
                {children}
            </GlassView>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    inner: { width: '100%' }
});
