// File: mobile/src/screens/TenantRegisterScreen.js
// Tenant sign-up, rebuilt on the glass design system.
//
// Mirrors TenantLoginScreen's skeleton (back row → brand lockup → Sign In / Sign Up
// pill → frosted form card → footer link) and borrows the owner RegisterScreen's
// password-strength meter, so all four auth doors read as one flow.
import React, { useState, useEffect, useMemo, useRef } from 'react';
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

const METER_SEGMENTS = 3;

// Presentational only — never gates submission. The real rule (>= 6 chars) still
// lives in handleRegister so this hint can encourage without blocking.
const scorePassword = (pw) => {
    if (!pw) return 0;
    let score = 0;
    if (pw.length >= 6) score += 1;
    if (pw.length >= 10) score += 1;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
    if (/[0-9]/.test(pw)) score += 1;
    if (/[^A-Za-z0-9]/.test(pw)) score += 1;
    return score;
};

export default function TenantRegisterScreen({ navigation }) {
    const t = useTheme();

    const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    // Editing anything clears the banner — stale errors next to corrected input read as broken.
    const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setError(''); };

    // <Screen scroll> skips its own entrance transform, so the header animates here.
    const headerIn = useRef(new Animated.Value(0)).current;
    const errorIn = useRef(new Animated.Value(0)).current;
    const meter = useRef(new Animated.Value(0)).current;

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

    const strength = useMemo(() => {
        const score = scorePassword(form.password);
        if (!form.password) return null;
        if (score <= 2) return { label: 'Weak', level: 1, color: t.colors.danger, hint: 'Add length, numbers or symbols.' };
        if (score <= 3) return { label: 'Fair', level: 2, color: t.colors.warning, hint: 'Mix upper and lower case for more strength.' };
        return { label: 'Strong', level: 3, color: t.colors.success, hint: 'Nice — this one is hard to guess.' };
    }, [form.password, t.colors.danger, t.colors.warning, t.colors.success]);

    useEffect(() => {
        Animated.spring(meter, {
            toValue: strength ? strength.level : 0,
            useNativeDriver: true,
            ...t.motion.spring
        }).start();
    }, [strength, meter, t.motion.spring]);

    const handleRegister = async () => {
        setError('');
        const { name, email, phone, password, confirm } = form;
        if (!name || !email || !phone || !password) { setError('Please fill in all fields.'); return; }
        if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
        if (password !== confirm) { setError('Passwords do not match.'); return; }
        setLoading(true);
        try {
            const res = await client.post('/tenant-auth/register', {
                name: name.trim(), email: email.trim(), phone: phone.trim(), password
            });
            await AsyncStorage.setItem('tenantToken', res.data.token);
            await AsyncStorage.setItem('tenantData', JSON.stringify(res.data.tenant));
            // RESET the stack (not replace) so back from the portal exits the app.
            enterTenantApp(navigation);
        } catch (e) {
            setError(e.response?.data?.message || 'Unable to create account. Please try again.');
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
                            Sign up to view dues and pay rent.
                        </Text>
                    </Animated.View>

                    <Animated.View style={[headerStyle, { marginTop: t.spacing.xxl }]}>
                        <SegmentedTabs
                            options={[{ label: 'Sign In', value: 'login' }, { label: 'Sign Up', value: 'signup' }]}
                            value="signup"
                            // Back SHOULD work between Register and Login, so plain navigate.
                            onChange={(v) => { if (v === 'login') navigation.navigate('TenantLogin'); }}
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
                            value={form.name}
                            onChangeText={set('name')}
                            placeholder="Full name"
                            icon="person-outline"
                            editable={!loading}
                            autoCapitalize="words"
                            returnKeyType="next"
                        />

                        <GlassInput
                            value={form.email}
                            onChangeText={set('email')}
                            placeholder="Email address"
                            icon="mail-outline"
                            editable={!loading}
                            autoCapitalize="none"
                            keyboardType="email-address"
                            returnKeyType="next"
                            style={{ marginTop: t.spacing.lg }}
                        />

                        <GlassInput
                            value={form.phone}
                            onChangeText={set('phone')}
                            placeholder="Phone number"
                            icon="call-outline"
                            editable={!loading}
                            keyboardType="phone-pad"
                            returnKeyType="next"
                            style={{ marginTop: t.spacing.lg }}
                        />

                        <GlassInput
                            value={form.password}
                            onChangeText={set('password')}
                            placeholder="Password"
                            icon="lock-closed-outline"
                            secure
                            editable={!loading}
                            autoCapitalize="none"
                            returnKeyType="next"
                            style={{ marginTop: t.spacing.lg }}
                        />

                        {strength ? (
                            <View style={[styles.strengthRow, { marginTop: t.spacing.sm }]}>
                                <View style={[styles.meter, { gap: t.spacing.xs }]}>
                                    {Array.from({ length: METER_SEGMENTS }).map((_, i) => (
                                        <Animated.View
                                            key={i}
                                            style={[
                                                styles.meterSegment,
                                                {
                                                    borderRadius: t.radii.pill,
                                                    backgroundColor: i < strength.level ? strength.color : t.colors.textFaint,
                                                    // Unfilled segments stay as a faint track rather than disappearing.
                                                    opacity: meter.interpolate({
                                                        inputRange: [i, i + 1],
                                                        outputRange: [0.18, 1],
                                                        extrapolate: 'clamp'
                                                    })
                                                }
                                            ]}
                                        />
                                    ))}
                                </View>
                                <Text
                                    style={[
                                        t.typography.micro,
                                        { color: strength.color, marginLeft: t.spacing.md }
                                    ]}
                                >
                                    {strength.label.toUpperCase()}
                                </Text>
                            </View>
                        ) : null}

                        {strength ? (
                            <Text
                                style={[
                                    t.typography.caption,
                                    { color: t.colors.textMuted, marginTop: t.spacing.xs, marginLeft: t.spacing.xs }
                                ]}
                            >
                                {strength.hint}
                            </Text>
                        ) : null}

                        <GlassInput
                            value={form.confirm}
                            onChangeText={set('confirm')}
                            placeholder="Confirm password"
                            icon="shield-checkmark-outline"
                            secure
                            editable={!loading}
                            autoCapitalize="none"
                            returnKeyType="go"
                            onSubmitEditing={handleRegister}
                            style={{ marginTop: t.spacing.lg }}
                        />

                        <GlassButton
                            label="Create Account"
                            size="lg"
                            icon="arrow-forward"
                            iconRight
                            loading={loading}
                            loadingLabel="Creating Account..."
                            disabled={loading}
                            onPress={handleRegister}
                            style={{ marginTop: t.spacing.xl }}
                        />
                    </GlassCard>

                    <View style={[styles.footer, { marginTop: t.spacing.xxl }]}>
                        <Text style={[t.typography.body, { color: t.colors.textMuted }]}>
                            Already have an account?{' '}
                        </Text>
                        <Pressable
                            onPress={() => navigation.navigate('TenantLogin')}
                            disabled={loading}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            accessibilityRole="link"
                            accessibilityLabel="Sign in to an existing tenant account"
                        >
                            <Text style={[t.typography.bodyStrong, { color: t.colors.primary }]}>
                                Sign In
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
    // Centres the stack on tall phones but still scrolls once the keyboard
    // shrinks the viewport — this form is taller than the login one.
    scrollBody: { flexGrow: 1, justifyContent: 'center' },
    backRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingVertical: 4 },
    centerText: { textAlign: 'center' },
    errorStrip: { flexDirection: 'row', alignItems: 'center', padding: 12 },
    errorText: { flex: 1, fontWeight: '700' },
    strengthRow: { flexDirection: 'row', alignItems: 'center', marginLeft: 6 },
    meter: { flexDirection: 'row', flex: 1 },
    meterSegment: { flex: 1, height: 4 },
    footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }
});
