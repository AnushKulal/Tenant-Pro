// File: mobile/src/screens/LoginScreen.js
// Owner/landlord sign-in, rebuilt on the glass design system.
//
// Layout: brand lockup → Login/Sign Up pill → frosted form card → guest entry →
// social row → footer link. Everything floats on <Screen>'s aurora canvas; the
// screen itself never paints an opaque surface.
import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Animated,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Pressable,
    Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';
import { useTheme, withAlpha } from '../theme';
import { Screen, GlassCard, GlassView, GlassButton, GlassInput, BrandMark, SegmentedTabs, Avatar } from '../ui';
import { enterOwnerApp } from '../navigation/flow';

const SOCIALS = [
    { provider: 'Google', icon: 'logo-google' },
    { provider: 'Facebook', icon: 'logo-facebook' },
    { provider: 'Twitter', icon: 'logo-twitter' }
];

// Small frosted tile with press feedback. Local because it only exists here and
// needs the same spring feel as GlassButton without the label/gradient chrome.
function SocialTile({ icon, label, onPress, disabled }) {
    const t = useTheme();
    const press = useRef(new Animated.Value(0)).current;

    const to = (v) =>
        Animated.spring(press, { toValue: v, useNativeDriver: true, ...t.motion.spring }).start();

    const scale = press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.92] });

    return (
        <Animated.View style={[{ transform: [{ scale }], opacity: disabled ? 0.5 : 1 }, t.shadows.sm]}>
            <Pressable
                onPress={onPress}
                onPressIn={() => to(1)}
                onPressOut={() => to(0)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ disabled }}
            >
                <GlassView
                    radius={t.radii.lg}
                    style={[styles.socialTile, { borderColor: t.colors.borderStrong }]}
                >
                    <Ionicons name={icon} size={22} color={t.colors.primary} />
                </GlassView>
            </Pressable>
        </Animated.View>
    );
}

export default function LoginScreen({ navigation }) {
    const t = useTheme();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    // Error and Loading States
    const [emailError, setEmailError] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [generalError, setGeneralError] = useState(''); // Handles backend errors (e.g., wrong password)
    const [isLoading, setIsLoading] = useState(false); // Controls the "Signing in..." state
    const [isGuestLoading, setIsGuestLoading] = useState(false); // Controls the "Exploring..." guest state

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
            toValue: generalError ? 1 : 0,
            duration: t.motion.fast,
            useNativeDriver: true
        }).start();
    }, [generalError, errorIn, t.motion.fast]);

    // --- Connect to Backend API ---
    const handleLogin = async () => {
        // Clear previous general errors
        setGeneralError('');

        let isValid = true;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        // Validate Email
        if (!email.trim()) {
            setEmailError('Email address is required.');
            isValid = false;
        } else if (!emailRegex.test(email)) {
            setEmailError('Please enter a valid email address.');
            isValid = false;
        }

        // Validate Password
        if (!password) {
            setPasswordError('Password is required.');
            isValid = false;
        }

        // Stop execution if front-end validation fails
        if (!isValid) return;

        // Start loading state
        setIsLoading(true);

        try {
            // Hit the backend login route
            const response = await client.post('/auth/login', { email, password });

            console.log('Login Success:', response.data.message);

            // Extract the token and owner details from the response
            const { token, owner } = response.data;

            // Save the token and user data securely to the device's storage
            await AsyncStorage.setItem('userToken', token);
            await AsyncStorage.setItem('ownerData', JSON.stringify(owner));

            // Warm the avatar image cache but never await it — the reset must not
            // wait on the network, and a miss only costs a later cross-fade.
            Avatar.prefetch(owner?.profile_pic);

            // RESET the stack (not replace) so back from Home exits the app.
            enterOwnerApp(navigation);
        } catch (error) {
            // Grab the message sent from the Node.js backend (e.g., "Invalid email or password")
            const backendError = error.response?.data?.message || 'Unable to connect to server. Please try again later.';
            setGeneralError(backendError);
        } finally {
            // Always stop the loading spinner, whether it succeeded or failed
            setIsLoading(false);
        }
    };

    // --- Guest Login: drop straight into the fully-loaded demo account ---
    const handleGuestLogin = async () => {
        setGeneralError('');
        setIsGuestLoading(true);
        try {
            // Sign in to the shared demo landlord account (pre-filled with sample data).
            const response = await client.post('/auth/login', {
                email: 'demo@gmail.com',
                password: 'Kajal@2004'
            });
            const { token, owner } = response.data;

            // Tag a friendly guest id so the session is recognisable as a guest visit.
            const guestId = 'GUEST-' + Math.random().toString(36).slice(2, 7).toUpperCase();
            await AsyncStorage.setItem('userToken', token);
            await AsyncStorage.setItem('ownerData', JSON.stringify({ ...owner, isGuest: true, guestId }));
            await AsyncStorage.setItem('guestId', guestId);

            Avatar.prefetch(owner?.profile_pic);

            enterOwnerApp(navigation);
        } catch (error) {
            const backendError = error.response?.data?.message ||
                'Guest demo is warming up (the server may be waking up). Please try again in a moment.';
            setGeneralError(backendError);
        } finally {
            setIsGuestLoading(false);
        }
    };

    // --- Social login: not wired to real providers yet ---
    const handleSocialLogin = (provider) => {
        Alert.alert(
            `${provider} sign-in`,
            `Signing in with ${provider} is coming soon. For now, use your email and password, or tap "Explore as Guest" to try the app instantly.`,
            [{ text: 'Got it' }]
        );
    };

    const anyLoading = isLoading || isGuestLoading;

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

                        <BrandMark size={72} style={{ marginTop: t.spacing.lg }} />
                    </Animated.View>

                    <Animated.View style={[headerStyle, { marginTop: t.spacing.xxl }]}>
                        <SegmentedTabs
                            options={[{ label: 'Login', value: 'login' }, { label: 'Sign Up', value: 'signup' }]}
                            value="login"
                            // Back SHOULD work between Login and Register, so plain navigate.
                            onChange={(v) => { if (v === 'signup') navigation.navigate('Register'); }}
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
                            value={email}
                            onChangeText={(text) => {
                                setEmail(text);
                                setEmailError('');
                                setGeneralError(''); // Clear backend error on typing
                            }}
                            placeholder="Email Address"
                            icon="mail-outline"
                            error={emailError}
                            editable={!anyLoading}
                            autoCapitalize="none"
                            keyboardType="email-address"
                            returnKeyType="next"
                        />

                        <GlassInput
                            value={password}
                            onChangeText={(text) => {
                                setPassword(text);
                                setPasswordError('');
                                setGeneralError(''); // Clear backend error on typing
                            }}
                            placeholder="Password"
                            icon="lock-closed-outline"
                            secure
                            error={passwordError}
                            editable={!anyLoading}
                            autoCapitalize="none"
                            returnKeyType="go"
                            onSubmitEditing={handleLogin}
                            style={{ marginTop: t.spacing.lg }}
                        />

                        <GlassButton
                            label="Forgot Password?"
                            variant="ghost"
                            size="sm"
                            fullWidth={false}
                            disabled={anyLoading}
                            onPress={() => navigation.navigate('ForgotPassword')}
                            style={styles.forgot}
                        />

                        <GlassButton
                            label="Sign In"
                            size="lg"
                            icon="arrow-forward"
                            iconRight
                            loading={isLoading}
                            loadingLabel="Signing in..."
                            disabled={anyLoading}
                            onPress={handleLogin}
                        />
                    </GlassCard>

                    <View style={{ marginTop: t.spacing.lg }}>
                        <GlassButton
                            label="Explore as Guest"
                            variant="glass"
                            icon="rocket-outline"
                            loading={isGuestLoading}
                            loadingLabel="Loading demo…"
                            disabled={anyLoading}
                            onPress={handleGuestLogin}
                        />
                        <Text
                            style={[
                                t.typography.caption,
                                styles.centerText,
                                { color: t.colors.textMuted, marginTop: t.spacing.sm }
                            ]}
                        >
                            Jump into a fully-loaded demo — no account needed.
                        </Text>
                    </View>

                    <View style={[styles.dividerRow, { marginVertical: t.spacing.xxl }]}>
                        <View style={[styles.hairline, { backgroundColor: t.colors.border }]} />
                        <Text
                            style={[
                                t.typography.caption,
                                { color: t.colors.textFaint, marginHorizontal: t.spacing.md }
                            ]}
                        >
                            Or continue with
                        </Text>
                        <View style={[styles.hairline, { backgroundColor: t.colors.border }]} />
                    </View>

                    <View style={[styles.socialRow, { gap: t.spacing.lg }]}>
                        {SOCIALS.map((s) => (
                            <SocialTile
                                key={s.provider}
                                icon={s.icon}
                                label={`Continue with ${s.provider}`}
                                disabled={anyLoading}
                                onPress={() => handleSocialLogin(s.provider)}
                            />
                        ))}
                    </View>

                    <View style={[styles.footer, { marginTop: t.spacing.xxxl }]}>
                        <Text style={[t.typography.body, { color: t.colors.textMuted }]}>
                            New to TenantPro?{' '}
                        </Text>
                        <Pressable
                            onPress={() => navigation.navigate('Register')}
                            disabled={anyLoading}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            accessibilityRole="link"
                            accessibilityLabel="Create a new TenantPro account"
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
    errorStrip: { flexDirection: 'row', alignItems: 'center', padding: 12 },
    errorText: { flex: 1, fontWeight: '700' },
    forgot: { alignSelf: 'flex-end', marginVertical: 4 },
    centerText: { textAlign: 'center' },
    dividerRow: { flexDirection: 'row', alignItems: 'center' },
    hairline: { flex: 1, height: StyleSheet.hairlineWidth },
    socialRow: { flexDirection: 'row', justifyContent: 'center' },
    socialTile: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
    footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }
});
