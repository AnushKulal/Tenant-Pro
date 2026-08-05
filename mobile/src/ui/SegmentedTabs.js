// File: mobile/src/ui/SegmentedTabs.js
// Pill switcher with a sliding highlight — the Login / Sign Up control.
// Width is measured at layout time so the thumb lands exactly on each segment
// regardless of screen size or label length.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import GlassView from './GlassView';
import { useTheme } from '../theme';

export default function SegmentedTabs({ options = [], value, onChange, style }) {
    const t = useTheme();
    const [trackWidth, setTrackWidth] = useState(0);
    const slide = useRef(new Animated.Value(0)).current;

    const index = Math.max(0, options.findIndex((o) => (o.value ?? o) === value));
    const segmentWidth = trackWidth > 0 ? trackWidth / options.length : 0;

    useEffect(() => {
        Animated.spring(slide, { toValue: index, useNativeDriver: true, ...t.motion.spring }).start();
    }, [index, slide, t.motion.spring]);

    const translateX = slide.interpolate({
        inputRange: options.map((_, i) => i),
        outputRange: options.map((_, i) => i * segmentWidth),
        extrapolate: 'clamp'
    });

    return (
        <GlassView
            radius={t.radii.pill}
            style={[styles.track, style]}
            onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width - 8)}
        >
            <View style={styles.inner}>
                {segmentWidth > 0 ? (
                    <Animated.View
                        style={[
                            styles.thumb,
                            {
                                width: segmentWidth,
                                borderRadius: t.radii.pill,
                                transform: [{ translateX }]
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

                {options.map((opt) => {
                    const val = opt.value ?? opt;
                    const label = opt.label ?? opt;
                    const active = val === value;
                    return (
                        <Pressable
                            key={String(val)}
                            onPress={() => onChange && onChange(val)}
                            style={styles.segment}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: active }}
                        >
                            <Text
                                style={[
                                    styles.label,
                                    { color: active ? t.colors.onPrimary : t.colors.textMuted }
                                ]}
                            >
                                {label}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>
        </GlassView>
    );
}

const styles = StyleSheet.create({
    track: { width: '100%', padding: 4 },
    inner: { flexDirection: 'row', position: 'relative' },
    thumb: { position: 'absolute', top: 0, bottom: 0, left: 0 },
    segment: { flex: 1, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
    label: { fontSize: 15, fontWeight: '800', letterSpacing: 0.2 }
});
