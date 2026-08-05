// File: mobile/src/screens/RoleSelectionScreen.js
// The front door: pick landlord or tenant. Nothing here touches the API — it
// only routes to the matching login screen.
//
// navigate() (not reset/replace) is deliberate: the login screens are pushed on
// top of this one so they can offer a Back affordance to change role. The stack
// reset happens later, inside the auth helpers, once a session actually exists.
import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Screen, GlassCard, GlassView, BrandMark } from '../ui';
import { useTheme } from '../theme';

const ROLES = [
    {
        key: 'landlord',
        icon: 'business-outline',
        title: "I'm a Landlord",
        desc: 'Manage properties, rooms, tenants and rent.',
        route: 'Login',
        hint: 'Opens the landlord sign in screen'
    },
    {
        key: 'tenant',
        icon: 'person-outline',
        title: "I'm a Tenant",
        desc: 'View your dues, pay rent and raise requests.',
        route: 'TenantLogin',
        hint: 'Opens the tenant sign in screen'
    }
];

function RoleCard({ role, delay, gradient, iconColor, onPress }) {
    const t = useTheme();
    const press = useRef(new Animated.Value(0)).current;

    // Spring rather than timing so the card feels weighted on release.
    const springTo = (toValue) => {
        Animated.spring(press, {
            toValue,
            friction: t.motion.spring.friction,
            tension: t.motion.spring.tension,
            useNativeDriver: true
        }).start();
    };

    const pressStyle = {
        transform: [{ scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.965] }) }]
    };

    return (
        <Animated.View style={pressStyle}>
            <Pressable
                onPress={onPress}
                onPressIn={() => springTo(1)}
                onPressOut={() => springTo(0)}
                accessibilityRole="button"
                accessibilityLabel={role.title}
                accessibilityHint={role.hint}
            >
                <GlassCard
                    delay={delay}
                    elevation="lg"
                    padding={t.spacing.xl}
                    style={{ marginBottom: t.spacing.lg }}
                >
                    <View style={styles.cardRow}>
                        <GlassView
                            radius={t.radii.lg}
                            sheen={false}
                            style={[styles.tile, t.shadows.glow]}
                        >
                            <LinearGradient
                                colors={gradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={[StyleSheet.absoluteFill, { opacity: t.isDark ? 0.28 : 0.2 }]}
                            />
                            <Ionicons name={role.icon} size={28} color={iconColor} />
                        </GlassView>

                        <View style={[styles.cardCopy, { marginHorizontal: t.spacing.lg }]}>
                            <Text style={[t.typography.heading, { color: t.colors.text }]}>
                                {role.title}
                            </Text>
                            <Text
                                style={[
                                    t.typography.body,
                                    styles.cardDesc,
                                    { color: t.colors.textMuted, marginTop: t.spacing.xs }
                                ]}
                            >
                                {role.desc}
                            </Text>
                        </View>

                        <Ionicons name="chevron-forward" size={22} color={t.colors.textFaint} />
                    </View>
                </GlassCard>
            </Pressable>
        </Animated.View>
    );
}

export default function RoleSelectionScreen({ navigation }) {
    const t = useTheme();
    // Screen skips its own entrance when scroll is set, so the header fades in here.
    const header = useRef(new Animated.Value(0)).current;

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

    return (
        <Screen scroll edges={['top', 'bottom']}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollBody, { paddingVertical: t.spacing.xxl }]}
            >
                <Animated.View style={[styles.header, { marginBottom: t.spacing.xxxl }, headerStyle]}>
                    <BrandMark size={76} showWordmark pulse />
                    <Text
                        style={[
                            t.typography.subheading,
                            styles.question,
                            { color: t.colors.text, marginTop: t.spacing.xxl }
                        ]}
                    >
                        How will you use TenantPro?
                    </Text>
                </Animated.View>

                {ROLES.map((role, i) => (
                    <RoleCard
                        key={role.key}
                        role={role}
                        delay={140 + i * 130}
                        gradient={i === 0 ? t.colors.primaryGradient : t.colors.blobB}
                        iconColor={i === 0 ? t.colors.primary : t.colors.accent}
                        onPress={() => navigation.navigate(role.route)}
                    />
                ))}

                <Text
                    style={[
                        t.typography.caption,
                        styles.footer,
                        { color: t.colors.textFaint, marginTop: t.spacing.xl }
                    ]}
                >
                    You can switch anytime by signing out.
                </Text>
            </ScrollView>
        </Screen>
    );
}

const styles = StyleSheet.create({
    // grow + centre so the chooser sits mid-screen on tall phones but still
    // scrolls instead of clipping on short ones.
    scrollBody: { flexGrow: 1, justifyContent: 'center' },
    header: { alignItems: 'center' },
    question: { textAlign: 'center' },

    cardRow: { flexDirection: 'row', alignItems: 'center' },
    tile: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
    cardCopy: { flex: 1 },
    cardDesc: { lineHeight: 21 },

    footer: { textAlign: 'center' }
});
