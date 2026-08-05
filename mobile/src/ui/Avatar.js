// File: mobile/src/ui/Avatar.js
// Avatar that never "pops in".
//
// The old header rendered nothing until the profile picture had downloaded, so
// there was a visible hole then a sudden image. Here the initials are painted
// on a brand gradient IMMEDIATELY (zero network), and the photo cross-fades on
// top only once it has actually decoded. The user therefore always sees a
// complete, correctly-sized avatar — the image arriving is a polish detail, not
// a layout event.
//
// Avatar.prefetch(url) warms the image cache; call it at login so the photo is
// usually already decoded by the time the home screen mounts.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme';
import { mediaUrl } from '../api/client';

export const getInitials = (name) => {
    if (!name || typeof name !== 'string') return '?';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export default function Avatar({ name, uri, size = 44, radius, borderWidth = 0, style, textStyle }) {
    const t = useTheme();
    const [loaded, setLoaded] = useState(false);
    const [failed, setFailed] = useState(false);
    const fade = useRef(new Animated.Value(0)).current;

    const resolved = uri ? mediaUrl(uri) : null;

    // A new photo means a new fade-in.
    useEffect(() => {
        setLoaded(false);
        setFailed(false);
        fade.setValue(0);
    }, [resolved, fade]);

    useEffect(() => {
        if (!loaded) return;
        Animated.timing(fade, {
            toValue: 1,
            duration: t.motion.normal,
            useNativeDriver: true
        }).start();
    }, [loaded, fade, t.motion.normal]);

    const r = radius ?? size / 2;
    const fontSize = Math.max(11, Math.round(size * 0.36));

    return (
        <View
            style={[
                {
                    width: size,
                    height: size,
                    borderRadius: r,
                    overflow: 'hidden',
                    borderWidth,
                    borderColor: t.colors.borderStrong
                },
                style
            ]}
        >
            {/* Always-present base: gradient + initials. Costs nothing, no network. */}
            <LinearGradient
                colors={t.colors.primaryGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[StyleSheet.absoluteFill, styles.center]}
            >
                <Text style={[styles.initials, { fontSize, color: t.colors.onPrimary }, textStyle]}>
                    {getInitials(name)}
                </Text>
            </LinearGradient>

            {resolved && !failed ? (
                <Animated.Image
                    source={{ uri: resolved }}
                    style={[StyleSheet.absoluteFill, { opacity: fade, width: size, height: size }]}
                    resizeMode="cover"
                    onLoad={() => setLoaded(true)}
                    onError={() => setFailed(true)}
                    // Cache aggressively: re-renders shouldn't re-fetch the same photo.
                    fadeDuration={0}
                />
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    center: { alignItems: 'center', justifyContent: 'center' },
    // Size and colour are applied inline (they depend on props/theme); only the
    // weight and tracking are static.
    initials: { fontWeight: '800', letterSpacing: 0.5 }
});

// Warm the cache ahead of time (safe to call with null/undefined).
Avatar.prefetch = async (uri) => {
    if (!uri) return false;
    try {
        const resolved = mediaUrl(uri);
        if (!resolved) return false;
        return await Image.prefetch(resolved);
    } catch (e) {
        return false; // Prefetch is an optimisation; never let it throw.
    }
};
