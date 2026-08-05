// File: mobile/src/screens/SplashScreen.js
// Boot screen. Shows the brand for a beat, then hands off to the right root.
//
// Routing is a stack RESET, never replace(): replace() leaves Splash on the
// stack, so Android back from Home walked straight back into the splash and
// bounced forward again. Resetting makes the destination the only route.
import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Screen, GlassView, BrandMark, ProgressBar } from '../ui';
import { hasSeenOnboarding, resetTo, enterOwnerApp, enterTenantApp } from '../navigation/flow';
import { useTheme } from '../theme';

// The storage reads finish in a few ms; hold the brand moment so the entrance
// animation reads as intentional instead of a flash.
const MIN_HOLD_MS = 1200;

export default function SplashScreen({ navigation }) {
    const t = useTheme();

    const fade = useRef(new Animated.Value(0)).current;
    const rise = useRef(new Animated.Value(0)).current;   // spring: lockup settles in
    const loader = useRef(new Animated.Value(0)).current; // loader trails the lockup

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fade, {
                toValue: 1,
                duration: t.motion.slow,
                useNativeDriver: true
            }),
            Animated.spring(rise, {
                toValue: 1,
                friction: t.motion.spring.friction,
                tension: t.motion.spring.tension,
                useNativeDriver: true
            }),
            Animated.timing(loader, {
                toValue: 1,
                duration: t.motion.normal,
                delay: 420,
                useNativeDriver: true
            })
        ]).start();
    }, [fade, rise, loader, t.motion]);

    useEffect(() => {
        let timer;
        let cancelled = false;

        const boot = async () => {
            const startedAt = Date.now();

            // Default to "seen" so a storage failure can never trap a returning
            // user in onboarding — worst case they land on the role chooser.
            let seen = true;
            let dest;

            try {
                seen = await hasSeenOnboarding();
                const userToken = await AsyncStorage.getItem('userToken');
                const tenantToken = await AsyncStorage.getItem('tenantToken');

                if (userToken) dest = 'Home';
                else if (tenantToken) dest = 'TenantHome';
                else dest = seen ? 'RoleSelection' : 'Onboarding';
            } catch (error) {
                // Never get stuck on the splash: fall through to the unauthenticated
                // decision rather than waiting on storage that will not answer.
                console.log('Error checking token:', error);
                dest = seen ? 'RoleSelection' : 'Onboarding';
            }

            const remaining = Math.max(0, MIN_HOLD_MS - (Date.now() - startedAt));
            timer = setTimeout(() => {
                if (cancelled) return;
                if (dest === 'Home') enterOwnerApp(navigation);
                else if (dest === 'TenantHome') enterTenantApp(navigation);
                else resetTo(navigation, dest);
            }, remaining);
        };

        boot();

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [navigation]);

    const lockupStyle = {
        opacity: fade,
        transform: [
            { scale: rise.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) },
            { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) }
        ]
    };

    const loaderStyle = {
        opacity: loader,
        transform: [{ translateY: loader.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }]
    };

    return (
        <Screen center auroraIntensity={1.15}>
            <View style={styles.body}>
                <Animated.View style={lockupStyle}>
                    <BrandMark size={92} showWordmark pulse />
                </Animated.View>

                <Animated.View
                    style={[styles.loaderZone, { marginTop: t.spacing.huge }, loaderStyle]}
                    accessible
                    accessibilityRole="progressbar"
                    accessibilityLabel="Loading TenantPro"
                >
                    <GlassView
                        radius={t.radii.pill}
                        sheen={false}
                        style={[styles.loaderPane, { padding: t.spacing.xs }]}
                    >
                        <ProgressBar indeterminate height={6} />
                    </GlassView>

                    <View style={[styles.statusRow, { marginTop: t.spacing.lg }]}>
                        <Ionicons name="shield-checkmark-outline" size={13} color={t.colors.textFaint} />
                        <Text
                            style={[
                                t.typography.caption,
                                { color: t.colors.textFaint, marginLeft: t.spacing.sm }
                            ]}
                        >
                            Restoring your secure session
                        </Text>
                    </View>
                </Animated.View>
            </View>
        </Screen>
    );
}

const styles = StyleSheet.create({
    body: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loaderZone: { alignItems: 'center', width: '100%' },
    // Pane sits at ~46% so the bar inside reads as a ~40%-width sliver.
    loaderPane: { width: '46%' },
    statusRow: { flexDirection: 'row', alignItems: 'center' }
});
