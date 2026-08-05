// File: mobile/src/screens/RegisterScreen.js
// Owner/landlord sign-up, rebuilt on the glass design system.
//
// Deliberately mirrors LoginScreen's skeleton (back row → brand lockup →
// Login/Sign Up pill → frosted form card → footer link) so switching between the
// two reads as one continuous flow rather than two different screens.
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
import { Screen, GlassCard, GlassView, GlassButton, GlassInput, BrandMark, SegmentedTabs, Avatar } from '../ui';
import { enterOwnerApp } from '../navigation/flow';

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

export default function RegisterScreen({ navigation }) {
    const t = useTheme();

    // Form State
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Error & Loading State
    const [nameError, setNameError] = useState('');
    const [emailError, setEmailError] = useState('');
    const [phoneError, setPhoneError] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [confirmPasswordError, setConfirmPasswordError] = useState('');
    const [generalError, setGeneralError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

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
            toValue: generalError ? 1 : 0,
            duration: t.motion.fast,
            useNativeDriver: true
        }).start();
    }, [generalError, errorIn, t.motion.fast]);

    const strength = useMemo(() => {
        const score = scorePassword(password);
        if (!password) return null;
        if (score <= 2) return { label: 'Weak', level: 1, color: t.colors.danger, hint: 'Add length, numbers or symbols.' };
        if (score <= 3) return { label: 'Fair', level: 2, color: t.colors.warning, hint: 'Mix upper and lower case for more strength.' };
        return { label: 'Strong', level: 3, color: t.colors.success, hint: 'Nice — this one is hard to guess.' };
    }, [password, t.colors.danger, t.colors.warning, t.colors.success]);

    useEffect(() => {
        Animated.spring(meter, {
            toValue: strength ? strength.level : 0,
            useNativeDriver: true,
            ...t.motion.spring
        }).start();
    }, [strength, meter, t.motion.spring]);

    // --- Validation & API Logic ---
    const handleRegister = async () => {
        setGeneralError('');
        let isValid = true;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const phoneRegex = /^[0-9]{10}$/;

        if (!name.trim()) {
            setNameError('Full name is required.');
            isValid = false;
        }

        if (!email.trim()) {
            setEmailError('Email address is required.');
            isValid = false;
        } else if (!emailRegex.test(email)) {
            setEmailError('Please enter a valid email address.');
            isValid = false;
        }

        if (!phone.trim()) {
            setPhoneError('Phone number is required.');
            isValid = false;
        } else if (!phoneRegex.test(phone.replace(/[^0-9]/g, ''))) {
            setPhoneError('Please enter a valid 10-digit phone number.');
            isValid = false;
        }

        if (!password) {
            setPasswordError('Password is required.');
            isValid = false;
        } else if (password.length < 6) {
            setPasswordError('Password must be at least 6 characters.');
            isValid = false;
        }

        // Validate Confirm Password
        if (!confirmPassword) {
            setConfirmPasswordError('Please confirm your password.');
            isValid = false;
        } else if (password !== confirmPassword) {
            setConfirmPasswordError('Passwords do not match.');
            isValid = false;
        }

        if (!isValid) return;

        setIsLoading(true);

        try {
            // 1. Create the account in the database
            await client.post('/auth/register', { name, email, phone, password });

            // 2. Immediately log them in behind the scenes to get the token!
            const loginResponse = await client.post('/auth/login', { email, password });
            const { token, owner } = loginResponse.data;

            // 3. Save to storage
            await AsyncStorage.setItem('userToken', token);
            await AsyncStorage.setItem('ownerData', JSON.stringify(owner));

            // Warm the avatar cache but never await it — entering the app must not
            // wait on the network, and a miss only costs a later cross-fade.
            Avatar.prefetch(owner?.profile_pic);

            // 4. RESET the stack (not replace) so back from Home exits the app.
            enterOwnerApp(navigation);
        } catch (error) {
            console.log('Registration Failed:', error.message);
            const backendError = error.response?.data?.message || 'Unable to create account. Please try again.';
            setGeneralError(backendError);
        } finally {
            setIsLoading(false);
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

                        <BrandMark
                            size={72}
                            tagline="Join TenantPro to manage your properties"
                            style={{ marginTop: t.spacing.lg }}
                        />
                    </Animated.View>

                    <Animated.View style={[headerStyle, { marginTop: t.spacing.xxl }]}>
                        <SegmentedTabs
                            options={[{ label: 'Login', value: 'login' }, { label: 'Sign Up', value: 'signup' }]}
                            value="signup"
                            // Back SHOULD work between Register and Login, so plain navigate.
                            onChange={(v) => { if (v === 'login') navigation.navigate('Login'); }}
                        />
                    </Animated.View>

                    <GlassCard delay={140} style={{ marginTop: t.spacing.xl }} elevation="lg">
                        {generalError ? (
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
                                        {generalError}
                                    </Text>
                                </GlassView>
                            </Animated.View>
                        ) : null}

                        <GlassInput
                            value={name}
                            onChangeText={(text) => {
                                setName(text);
                                setNameError('');
                                setGeneralError('');
                            }}
                            placeholder="Full Name"
                            icon="person-outline"
                            error={nameError}
                            editable={!isLoading}
                            autoCapitalize="words"
                            returnKeyType="next"
                        />

                        <GlassInput
                            value={email}
                            onChangeText={(text) => {
                                setEmail(text);
                                setEmailError('');
                                setGeneralError('');
                            }}
                            placeholder="Email Address"
                            icon="mail-outline"
                            error={emailError}
                            editable={!isLoading}
                            autoCapitalize="none"
                            keyboardType="email-address"
                            returnKeyType="next"
                            style={{ marginTop: t.spacing.lg }}
                        />

                        <GlassInput
                            value={phone}
                            onChangeText={(text) => {
                                setPhone(text);
                                setPhoneError('');
                                setGeneralError('');
                            }}
                            placeholder="Phone Number"
                            icon="call-outline"
                            error={phoneError}
                            editable={!isLoading}
                            keyboardType="phone-pad"
                            returnKeyType="next"
                            style={{ marginTop: t.spacing.lg }}
                        />

                        <GlassInput
                            value={password}
                            onChangeText={(text) => {
                                setPassword(text);
                                setPasswordError('');
                                setGeneralError('');
                            }}
                            placeholder="Password"
                            icon="lock-closed-outline"
                            secure
                            error={passwordError}
                            editable={!isLoading}
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
                            value={confirmPassword}
                            onChangeText={(text) => {
                                setConfirmPassword(text);
                                setConfirmPasswordError('');
                                setGeneralError('');
                            }}
                            placeholder="Confirm Password"
                            icon="shield-checkmark-outline"
                            secure
                            error={confirmPasswordError}
                            editable={!isLoading}
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
                            loading={isLoading}
                            loadingLabel="Creating Account..."
                            disabled={isLoading}
                            onPress={handleRegister}
                            style={{ marginTop: t.spacing.xl }}
                        />
                    </GlassCard>

                    <View style={[styles.footer, { marginTop: t.spacing.xxl }]}>
                        <Text style={[t.typography.body, { color: t.colors.textMuted }]}>
                            Already have an account?{' '}
                        </Text>
                        <Pressable
                            onPress={() => navigation.navigate('Login')}
                            disabled={isLoading}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            accessibilityRole="link"
                            accessibilityLabel="Sign in to an existing TenantPro account"
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
    errorStrip: { flexDirection: 'row', alignItems: 'center', padding: 12 },
    errorText: { flex: 1, fontWeight: '700' },
    strengthRow: { flexDirection: 'row', alignItems: 'center', marginLeft: 6 },
    meter: { flexDirection: 'row', flex: 1 },
    meterSegment: { flex: 1, height: 4 },
    footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }
});
