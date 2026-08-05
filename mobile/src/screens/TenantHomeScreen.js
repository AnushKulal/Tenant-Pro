// File: mobile/src/screens/TenantHomeScreen.js
// Tenant landing page. The tenant portal has no property link yet, so this is
// deliberately a HONEST shell: it shows the real account state and previews the
// features that are coming, rather than faking dues or payment history.
//
// Sign out goes through signOut() from navigation/flow so the session keys are
// cleared in one place and the stack is RESET (replace() left RoleSelection /
// TenantLogin underneath, which let hardware back walk straight back in).
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Screen, GlassCard, GlassView, GlassButton, Avatar } from '../ui';
import { useTheme } from '../theme';
import { signOut } from '../navigation/flow';

// Everything here is unbuilt. Each tile is inert on purpose — no onPress, no
// Pressable — so nothing can look tappable and then do nothing.
const UPCOMING = [
    { key: 'dues', icon: 'wallet-outline', label: 'View dues' },
    { key: 'pay', icon: 'card-outline', label: 'Pay rent' },
    { key: 'history', icon: 'receipt-outline', label: 'Payment history' },
    { key: 'request', icon: 'construct-outline', label: 'Raise a request' }
];

function SoonTile({ item, delay }) {
    const t = useTheme();
    const appear = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(appear, {
            toValue: 1,
            duration: t.motion.entrance,
            delay,
            useNativeDriver: true
        }).start();
    }, [appear, delay, t.motion.entrance]);

    const tileStyle = {
        // Caps below 1 — the dimming IS the "not available yet" signal, and it
        // has to survive the entrance animation rather than fade up to full.
        opacity: appear.interpolate({ inputRange: [0, 1], outputRange: [0, 0.58] }),
        transform: [
            { translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }
        ]
    };

    return (
        <Animated.View
            style={[styles.tileSlot, tileStyle]}
            accessibilityRole="text"
            accessibilityLabel={`${item.label}. Coming soon, not available yet.`}
        >
            <GlassView
                radius={t.radii.lg}
                // Nested inside a glass card already — a second blur pass costs
                // GPU time on Android for no visible gain.
                blur={false}
                style={[styles.tile, { padding: t.spacing.lg }]}
            >
                <View style={styles.tileTop}>
                    <View
                        style={[
                            styles.tileIcon,
                            { borderRadius: t.radii.md, backgroundColor: t.colors.surfaceAlt }
                        ]}
                    >
                        <LinearGradient
                            colors={t.colors.primaryGradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[StyleSheet.absoluteFill, { opacity: t.isDark ? 0.26 : 0.16 }]}
                        />
                        <Ionicons name={item.icon} size={20} color={t.colors.primary} />
                    </View>

                    <View
                        style={[
                            styles.soonChip,
                            {
                                borderRadius: t.radii.pill,
                                backgroundColor: t.colors.surfaceHigh,
                                borderColor: t.colors.border,
                                paddingHorizontal: t.spacing.sm,
                                paddingVertical: 3
                            }
                        ]}
                    >
                        <Text style={[t.typography.micro, { color: t.colors.textMuted }]}>SOON</Text>
                    </View>
                </View>

                <Text
                    style={[
                        t.typography.bodyStrong,
                        { color: t.colors.text, marginTop: t.spacing.md }
                    ]}
                    numberOfLines={2}
                >
                    {item.label}
                </Text>
            </GlassView>
        </Animated.View>
    );
}

export default function TenantHomeScreen({ navigation }) {
    const t = useTheme();
    const [tenant, setTenant] = useState(null);
    const [signingOut, setSigningOut] = useState(false);

    // Screen skips its own entrance when scroll is set, so the header animates here.
    const header = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        (async () => {
            const raw = await AsyncStorage.getItem('tenantData');
            if (raw) {
                const parsed = JSON.parse(raw);
                setTenant(parsed);
                // Warm the cache so the photo cross-fades in rather than popping.
                Avatar.prefetch(parsed?.profile_pic);
            }
        })();
    }, []);

    useEffect(() => {
        Animated.timing(header, {
            toValue: 1,
            duration: t.motion.entrance,
            useNativeDriver: true
        }).start();
    }, [header, t.motion.entrance]);

    const headerStyle = {
        opacity: header,
        transform: [{ translateY: header.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }]
    };

    const logout = async () => {
        if (signingOut) return;
        setSigningOut(true);
        // signOut clears every session key (owner + tenant) then resets the stack.
        await signOut(navigation);
    };

    return (
        <Screen scroll edges={['top', 'bottom']}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.body, { paddingVertical: t.spacing.xxl }]}
            >
                <Animated.View style={[styles.header, headerStyle]}>
                    <Avatar name={tenant?.name} uri={tenant?.profile_pic} size={46} borderWidth={1} />
                    <View style={[styles.headerCopy, { marginLeft: t.spacing.lg }]}>
                        <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>
                            Welcome back,
                        </Text>
                        <Text
                            style={[t.typography.heading, { color: t.colors.text, marginTop: 2 }]}
                            numberOfLines={1}
                        >
                            {tenant?.name || 'Tenant'}
                        </Text>
                    </View>
                </Animated.View>

                <GlassCard
                    delay={120}
                    elevation="lg"
                    style={{ marginTop: t.spacing.xxl }}
                >
                    <View
                        style={[
                            styles.pill,
                            {
                                borderRadius: t.radii.pill,
                                backgroundColor: t.colors.surfaceAlt,
                                borderColor: t.colors.borderStrong,
                                paddingHorizontal: t.spacing.md,
                                paddingVertical: 5
                            }
                        ]}
                    >
                        <View
                            style={[
                                styles.dot,
                                { backgroundColor: t.colors.success, marginRight: t.spacing.sm }
                            ]}
                        />
                        <Text style={[t.typography.micro, { color: t.colors.success }]}>
                            ACCOUNT CREATED
                        </Text>
                    </View>

                    <Text
                        style={[
                            t.typography.subheading,
                            { color: t.colors.text, marginTop: t.spacing.lg }
                        ]}
                    >
                        You're not linked to a property yet
                    </Text>

                    <Text
                        style={[
                            t.typography.body,
                            styles.copy,
                            { color: t.colors.textMuted, marginTop: t.spacing.sm }
                        ]}
                    >
                        Next, you'll find your building and request to join — your landlord approves it, and then
                        your rent, dues and payments show up right here.
                    </Text>

                    <View
                        style={[
                            styles.nextRow,
                            {
                                marginTop: t.spacing.xl,
                                paddingTop: t.spacing.lg,
                                borderTopColor: t.colors.border
                            }
                        ]}
                    >
                        <Ionicons name="time-outline" size={16} color={t.colors.textFaint} />
                        <Text
                            style={[
                                t.typography.caption,
                                { color: t.colors.textFaint, marginLeft: t.spacing.sm, flex: 1 }
                            ]}
                        >
                            Coming soon: Find & join your property
                        </Text>
                    </View>
                </GlassCard>

                <Text
                    style={[
                        t.typography.micro,
                        { color: t.colors.textFaint, marginTop: t.spacing.xxxl, marginBottom: t.spacing.md }
                    ]}
                >
                    COMING SOON
                </Text>

                <GlassCard delay={220} elevation="md" padding={t.spacing.lg}>
                    <View style={styles.grid}>
                        {UPCOMING.map((item, i) => (
                            <SoonTile key={item.key} item={item} delay={300 + i * 90} />
                        ))}
                    </View>
                </GlassCard>

                <View style={[styles.footer, { marginTop: t.spacing.xxxl }]}>
                    <GlassButton
                        label="Sign out"
                        icon="log-out-outline"
                        variant="danger"
                        loading={signingOut}
                        loadingLabel="Signing out…"
                        onPress={logout}
                    />
                    <Text
                        style={[
                            t.typography.caption,
                            styles.footerNote,
                            { color: t.colors.textFaint, marginTop: t.spacing.md }
                        ]}
                    >
                        Signing out returns you to role selection.
                    </Text>
                </View>
            </ScrollView>
        </Screen>
    );
}

const styles = StyleSheet.create({
    body: { flexGrow: 1, paddingBottom: 40 },

    header: { flexDirection: 'row', alignItems: 'center' },
    headerCopy: { flex: 1 },

    pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderWidth: 1 },
    dot: { width: 7, height: 7, borderRadius: 4 },
    copy: { lineHeight: 22 },
    nextRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1 },

    // Two-up grid via wrapping + 48% slots, so it reflows on narrow phones
    // without needing measured widths.
    // -12 cancels the last row's tile margin so the card isn't bottom-heavy.
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: -12 },
    tileSlot: { width: '48%', marginBottom: 12 },
    tile: { width: '100%' },
    tileTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    tileIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    soonChip: { borderWidth: 1 },

    footer: { width: '100%' },
    footerNote: { textAlign: 'center' }
});
