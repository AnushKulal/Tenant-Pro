// File: mobile/src/ui/Screen.js
// Standard page shell: aurora background + safe-area padding + a consistent
// entrance animation. Wrapping every screen in this is what makes navigation
// feel like one designed product rather than a pile of views.
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AuroraBackground from './AuroraBackground';
import { useTheme } from '../theme';

export default function Screen({
    children,
    scroll = false,          // caller supplies its own ScrollView when true
    edges = ['top', 'bottom'],
    padded = true,
    center = false,
    animate = true,
    style,
    contentStyle,
    auroraIntensity = 1
}) {
    const t = useTheme();
    const enter = useRef(new Animated.Value(animate ? 0 : 1)).current;

    useEffect(() => {
        if (!animate) return;
        Animated.timing(enter, {
            toValue: 1,
            duration: t.motion.entrance,
            useNativeDriver: true
        }).start();
    }, [animate, enter, t.motion.entrance]);

    const animatedStyle = {
        opacity: enter,
        transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }]
    };

    return (
        <AuroraBackground intensity={auroraIntensity} style={style}>
            {/* Status bar icons must flip with the theme or they vanish. */}
            <StatusBar style={t.isDark ? 'light' : 'dark'} />
            <SafeAreaView style={styles.safe} edges={edges}>
                <Animated.View
                    style={[
                        styles.content,
                        padded && { paddingHorizontal: t.spacing.xxl },
                        center && styles.center,
                        !scroll && animatedStyle,
                        contentStyle
                    ]}
                >
                    {scroll ? <View style={styles.flex}>{children}</View> : children}
                </Animated.View>
            </SafeAreaView>
        </AuroraBackground>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1 },
    content: { flex: 1 },
    flex: { flex: 1 },
    center: { justifyContent: 'center' }
});
