// File: mobile/src/ui/BrandMark.js
// The TenantPro lockup: logo tile in a glass frame with an optional glow pulse,
// wordmark and tagline. Reused on splash, onboarding, role select and auth so
// the brand entrance is identical everywhere.
import React, { useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, Animated, Easing } from 'react-native';
import { useTheme } from '../theme';

export default function BrandMark({
    size = 76,
    showWordmark = true,
    tagline = 'Smart Property Management',
    pulse = true,
    style
}) {
    const t = useTheme();
    const halo = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!pulse) return;
        const anim = Animated.loop(
            Animated.sequence([
                Animated.timing(halo, { toValue: 1, duration: 1900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
                Animated.timing(halo, { toValue: 0, duration: 1900, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
            ])
        );
        anim.start();
        return () => anim.stop();
    }, [pulse, halo]);

    const haloStyle = {
        opacity: halo.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.42] }),
        transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] }) }]
    };

    return (
        <View style={[styles.wrap, style]}>
            <View style={styles.logoZone}>
                {pulse ? (
                    <Animated.View
                        pointerEvents="none"
                        style={[
                            styles.halo,
                            {
                                width: size * 1.5,
                                height: size * 1.5,
                                borderRadius: size,
                                backgroundColor: t.colors.primary
                            },
                            haloStyle
                        ]}
                    />
                ) : null}

                <View
                    style={[
                        styles.tile,
                        t.shadows.glow,
                        {
                            width: size,
                            height: size,
                            borderRadius: size * 0.28,
                            borderColor: t.colors.glassBorder
                        }
                    ]}
                >
                    <Image
                        source={require('../../assets/logo.png')}
                        style={{ width: size, height: size, borderRadius: size * 0.28 }}
                        resizeMode="cover"
                    />
                </View>
            </View>

            {showWordmark ? (
                <>
                    <Text style={[styles.wordmark, { color: t.colors.text }]}>
                        Tenant<Text style={{ color: t.colors.primary }}>Pro</Text>
                    </Text>
                    {tagline ? (
                        <Text style={[styles.tagline, { color: t.colors.textMuted }]}>{tagline}</Text>
                    ) : null}
                </>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { alignItems: 'center' },
    logoZone: { alignItems: 'center', justifyContent: 'center' },
    halo: { position: 'absolute' },
    tile: { overflow: 'hidden', borderWidth: 1 },
    wordmark: { fontSize: 34, fontWeight: '900', letterSpacing: -0.8, marginTop: 16 },
    tagline: { fontSize: 14.5, fontWeight: '600', marginTop: 4 }
});
