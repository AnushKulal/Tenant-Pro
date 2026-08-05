// File: mobile/src/ui/AuroraBackground.js
// Animated ambient background: a themed base gradient plus slow-drifting
// colour "blobs". This is the canvas every glass surface floats on, and it's
// what makes the app feel alive without costing a frame budget — all motion
// runs on the native driver (transform/opacity only).
import React, { useEffect, useRef } from 'react';
import { StyleSheet, Animated, Easing, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme';

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

    const blob = (value, { fromY, toY, fromX, toX, scaleTo }) => ({
        transform: [
            { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [fromY, toY] }) },
            { translateX: value.interpolate({ inputRange: [0, 1], outputRange: [fromX, toX] }) },
            { scale: value.interpolate({ inputRange: [0, 1], outputRange: [1, scaleTo] }) }
        ]
    });

    // Blobs are dimmer in light mode so text keeps its contrast.
    const blobOpacity = (t.isDark ? 0.5 : 0.34) * intensity;

    return (
        <View style={[styles.root, style]}>
            <LinearGradient
                colors={t.colors.bgGradient}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={StyleSheet.absoluteFill}
            />

            <Animated.View
                pointerEvents="none"
                style={[
                    styles.blob,
                    styles.blobTop,
                    { opacity: blobOpacity },
                    blob(drift1, { fromY: 0, toY: -46, fromX: 0, toX: 18, scaleTo: 1.12 })
                ]}
            >
                <LinearGradient colors={t.colors.blobA} style={styles.fill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
            </Animated.View>

            <Animated.View
                pointerEvents="none"
                style={[
                    styles.blob,
                    styles.blobBottom,
                    { opacity: blobOpacity * 0.9 },
                    blob(drift2, { fromY: 0, toY: 52, fromX: 0, toX: -24, scaleTo: 1.16 })
                ]}
            >
                <LinearGradient colors={t.colors.blobB} style={styles.fill} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} />
            </Animated.View>

            <Animated.View
                pointerEvents="none"
                style={[
                    styles.blob,
                    styles.blobMid,
                    { opacity: blobOpacity * 0.55 },
                    blob(drift3, { fromY: 0, toY: -30, fromX: 0, toX: -30, scaleTo: 1.2 })
                ]}
            >
                <LinearGradient colors={t.colors.blobA} style={styles.fill} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} />
            </Animated.View>

            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, overflow: 'hidden' },
    fill: { flex: 1 },
    blob: { position: 'absolute', borderRadius: 999, overflow: 'hidden' },
    blobTop: { width: 340, height: 340, top: -120, left: -110 },
    blobBottom: { width: 400, height: 400, bottom: -160, right: -130 },
    blobMid: { width: 260, height: 260, top: '42%', right: -90 }
});
