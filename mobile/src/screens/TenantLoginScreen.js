// File: mobile/src/screens/TenantLoginScreen.js
// Tenant sign-in, rebuilt on the glass design system.
//
// Deliberately mirrors the owner LoginScreen's rhythm (back row → brand lockup →
// Sign In / Sign Up pill → frosted form card → footer link) so the two doors feel
// like one product; only the "Tenant Portal" tagline and the tenant-auth endpoint
// distinguish them.
import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Animated,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Pressable
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';
import { useTheme, withAlpha } from '../theme';
import { Screen, GlassCard, GlassView, GlassButton, GlassInput, BrandMark, SegmentedTabs } from '../ui';
import { enterTenantApp } from '../navigation/flow';

export default function TenantLoginScreen({ navigation }) {
    const t = useTheme();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // <Screen scroll> skips its own entrance transform, so the header animates here.
    const headerIn = useRef(new Animated.Value(0)).current;
    const errorIn = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(headerIn, {
            toValue: 1,
            duration: t.motion.entrance,
            useNativeDriver: true
        }).start();
    }, [headerIn, t.motion.entrance]);

    useEffect(() => {
        Animated.timing(errorIn, {
            toValue: error ? 1 : 0,
            duration: t.motion.fast,
            useNativeDriver: true
        }).start();
    }, [error, errorIn, t.motion.fast]);

    const handleLogin = async () => {
        setError('');
        if (!email.trim() || !password) { setError('Please enter your email and password.'); return; }
        setLoading(true);
        try {
            const res = await client.post('/tenant-auth/login', { email: email.trim(), password });
            await AsyncStorage.setItem('tenantToken', res.data.token);
            await AsyncStorage.setItem('tenantData', JSON.stringify(res.data.tenant));
            // RESET the stack (not replace) so back from the portal exits the app.
            enterTenantApp(navigation);
        } catch (e) {
            setError(e.response?.data?.message || 'Unable to sign in. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const headerStyle = {
        opacity: headerIn,
        transform: [{ translateY: headerIn.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }]
    };

    const errorStyle = {
        opacity: errorIn,
        transform: [{ translateY: errorIn.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }]
    };

    return (
        <Screen scroll edges={['top', 'bottom']}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.flex}
            >
                <ScrollView
                    contentContainerStyle={[styles.scrollBody, { paddingBottom: t.spacing.huge }]}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <Animated.View style={headerStyle}>
                        <Pressable
                            onPress={() => navigation.navigate('RoleSelection')}
                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                            style={styles.backRow}
                            accessibilityRole="button"
                            accessibilityLabel="Back to role selection"
                        >
                            <Ionicons name="arrow-back" size={22} color={t.colors.text} />
                            <Text
                                style={[
                                    t.typography.bodyStrong,
                                    { color: t.colors.textMuted, marginLeft: t.spacing.xs }
                                ]}
                            >
                                Back
                            </Text>
                        </Pressable>

                        <BrandMark size={72} tagline="Tenant Portal" style={{ marginTop: t.spacing.lg }} />

                        <Text
                            style={[
                                t.typography.caption,
                                styles.centerText,
                                { color: t.colors.textFaint, marginTop: t.spacing.sm }
                            ]}
                        >
                            Access your dues, payments and requests.
                        </Text>
                    </Animated.View>

                    <Animated.View style={[headerStyle, { marginTop: t.spacing.xxl }]}>
                        <SegmentedTabs
                            options={[{ label: 'Sign In', value: 'login' }, { label: 'Sign Up', value: 'signup' }]}
                            value="login"
                            // Back SHOULD work between Login and Register, so plain navigate.
                            onChange={(v) => { if (v === 'signup') navigation.navigate('TenantRegister'); }}
                        />
                    </Animated.View>

                    <GlassCard delay={140} style={{ marginTop: t.spacing.xl }} elevation="lg">
                        {error ? (
                            <Animated.View style={[errorStyle, { marginBottom: t.spacing.lg }]}>
                                <GlassView
                                    radius={t.radii.md}
                                    sheen={false}
                                    tintColor={withAlpha(t.colors.danger, t.isDark ? 0.18 : 0.12)}
                                    style={[styles.errorStrip, { borderColor: withAlpha(t.colors.danger, 0.45) }]}
                                >
                                    <Ionicons name="alert-circle" size={18} color={t.colors.danger} />
                                    <Text
                                        style={[
                                            t.typography.caption,
                                            styles.errorText,
                                            { color: t.colors.danger, marginLeft: t.spacing.sm }
                                        ]}
                                    >
                                        {error}
                                    </Text>
                                </GlassView>
                            </Animated.View>
                        ) : null}

                        <GlassInput
                            value={email}
                            onChangeText={(text) => { setEmail(text); setError(''); }}
                            placeholder="Email address"
                            icon="mail-outline"
                            editable={!loading}
                            autoCapitalize="none"
                            keyboardType="email-address"
                            returnKeyType="next"
                        />

                        <GlassInput
                            value={password}
                            onChangeText={(text) => { setPassword(text); setError(''); }}
                            placeholder="Password"
                            icon="lock-closed-outline"
                            secure
                            editable={!loading}
                            autoCapitalize="none"
                            returnKeyType="go"
                            onSubmitEditing={handleLogin}
                            style={{ marginTop: t.spacing.lg }}
                        />

                        <GlassButton
                            label="Sign In"
                            size="lg"
                            icon="arrow-forward"
                            iconRight
                            loading={loading}
                            loadingLabel="Signing in..."
                            disabled={loading}
                            onPress={handleLogin}
                            style={{ marginTop: t.spacing.xl }}
                        />
                    </GlassCard>

                    <View style={[styles.footer, { marginTop: t.spacing.xxxl }]}>
                        <Text style={[t.typography.body, { color: t.colors.textMuted }]}>
                            New tenant?{' '}
                        </Text>
                        <Pressable
                            onPress={() => navigation.navigate('TenantRegister')}
                            disabled={loading}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            accessibilityRole="link"
                            accessibilityLabel="Create a tenant account"
                        >
                            <Text style={[t.typography.bodyStrong, { color: t.colors.primary }]}>
                                Create Account
                            </Text>
                        </Pressable>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </Screen>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    // Centres the stack vertically on tall phones but still scrolls when the
    // keyboard shrinks the viewport.
    scrollBody: { flexGrow: 1, justifyContent: 'center' },
    backRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingVertical: 4 },
    centerText: { textAlign: 'center' },
    errorStrip: { flexDirection: 'row', alignItems: 'center', padding: 12 },
    errorText: { flex: 1, fontWeight: '700' },
    footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }
});
