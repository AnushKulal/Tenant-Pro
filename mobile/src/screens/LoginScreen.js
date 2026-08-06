// File: mobile/src/screens/LoginScreen.js
// Owner/landlord auth — ONE screen that morphs between sign-in and sign-up.
//
// Why one screen: Login and Sign Up used to be two navigator routes, so tapping
// the segmented pill pushed a new screen that mounted with "Sign Up" already
// selected. The thumb never animated and the user saw a page slide instead of a
// toggle. Here the pill only flips local state, so the thumb springs across and
// the card grows/shrinks in place.
//
// Layout: brand lockup → Login/Sign Up pill → frosted form card → guest entry →
// social row → footer link. Everything floats on <Screen>'s aurora canvas; the
// screen itself never paints an opaque surface.
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Animated,
    Easing,
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

// The top toggle picks the sign-in IDENTIFIER. It used to switch login/sign-up,
// which gave creating an account — the rarest action here — equal billing with the
// one people perform daily. Sign-up moved to the link at the bottom of the screen.
const LOGIN_BY = [{ label: 'Email', value: 'email' }, { label: 'Mobile', value: 'phone' }];

const SOCIALS = [
    { provider: 'Google', icon: 'logo-google' },
    { provider: 'Facebook', icon: 'logo-facebook' },
    { provider: 'Twitter', icon: 'logo-twitter' }
];

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

// --- Collapsible ------------------------------------------------------------
// Shows or hides the fields that belong to only one mode.
//
// It used to animate its own `height` from a measured natural height while
// clipping the children with overflow:'hidden'. That measurement is the bug that
// made sign-up unusable: on Android the clipped child reported a height of 0, so
// `natural` never became a real number and the block stayed collapsed even in
// sign-up mode. The fields were therefore invisible AND empty, and validation
// answered "Please fill in all fields" about inputs the user could not see. It
// looked correct in a browser render, because react-native-web does not clip a
// child's own measured box the way Yoga does — the same web/native divergence
// that has bitten this app before, and the reason it survived review.
//
// So nothing is measured any more. The children are simply not rendered when
// closed, and fade + slide in when they open. The GlassCard resizes because its
// content genuinely changed, which needs no animation to be correct. Field VALUES
// live in the parent's state, so unmounting an input never loses typing.
function Collapsible({ open, children, style }) {
    const t = useTheme();
    const reveal = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!open) {
            reveal.setValue(0);
            return;
        }
        Animated.timing(reveal, {
            toValue: 1,
            duration: t.motion.normal,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true
        }).start();
    }, [open, reveal, t.motion.normal]);

    if (!open) return null;

    return (
        <Animated.View
            style={[
                style,
                {
                    opacity: reveal,
                    transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }]
                }
            ]}
        >
            {children}
        </Animated.View>
    );
}

// Defers a value change until an outgoing fade has finished, then fades the new
// one in. Used for copy that differs per mode so words dissolve instead of
// popping (overlaying two copies would need a locked height for wrapping text).
function useCrossfade(value, duration) {
    const [shown, setShown] = useState(value);
    const fade = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        // Already showing the right copy: fade in. This also recovers the case
        // where the user toggles back mid-fade, which would otherwise leave the
        // text stranded at opacity 0.
        if (value === shown) {
            Animated.timing(fade, { toValue: 1, duration: duration / 2, useNativeDriver: true }).start();
            return;
        }
        // Fade out, then swap — the fade-in comes from this effect re-running once
        // `shown` catches up. An interrupted fade is picked up the same way.
        Animated.timing(fade, { toValue: 0, duration: duration / 2, useNativeDriver: true })
            .start(({ finished }) => {
                if (finished) setShown(value);
            });
    }, [value, shown, fade, duration]);

    return [shown, fade];
}

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

export default function LoginScreen({ navigation, route }) {
    const t = useTheme();

    // 'Register' still exists as a route (see RegisterScreen) and lands here with
    // mode: 'signup' so deep links and old navigate() calls keep working.
    const initialMode = route?.params?.mode === 'signup' ? 'signup' : 'login';
    const [mode, setMode] = useState(initialMode);
    const isSignup = mode === 'signup';

    // Which identifier sign-in is using. Sign-up always collects both, so the
    // toggle is hidden there.
    const [loginBy, setLoginBy] = useState('email');
    const useMobile = !isSignup && loginBy === 'phone';
    // Set when the server rejects the credentials, which is the one case where
    // offering a password reset is the useful next step.
    const [wrongCredentials, setWrongCredentials] = useState(false);

    // Shared fields stay mounted in both modes so toggling never drops typing.
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    // Sign-up-only fields.
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Error and Loading States
    const [nameError, setNameError] = useState('');
    const [emailError, setEmailError] = useState('');
    const [phoneError, setPhoneError] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [confirmPasswordError, setConfirmPasswordError] = useState('');
    const [generalError, setGeneralError] = useState(''); // Handles backend errors (e.g., wrong password)
    const [isLoading, setIsLoading] = useState(false); // Controls the "Signing in..." / "Creating Account..." state
    const [isGuestLoading, setIsGuestLoading] = useState(false); // Controls the "Exploring..." guest state

    // <Screen scroll> skips its own entrance transform, so the header animates here.
    const headerIn = useRef(new Animated.Value(0)).current;
    const errorIn = useRef(new Animated.Value(0)).current;
    const meter = useRef(new Animated.Value(0)).current;
    // 0 = login, 1 = signup. Native-driven (opacity/transform only).
    const morph = useRef(new Animated.Value(initialMode === 'signup' ? 1 : 0)).current;

    // Copy that differs per mode lags one half-fade behind so it can dissolve.
    const [copyMode, copyFade] = useCrossfade(mode, t.motion.normal);

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

    // Same duration/easing as Collapsible so the fields fade in exactly as the
    // space for them opens.
    useEffect(() => {
        Animated.timing(morph, {
            toValue: isSignup ? 1 : 0,
            duration: t.motion.normal,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true
        }).start();
    }, [isSignup, morph, t.motion.normal]);

    // Toggling modes must not carry the other mode's complaints across.
    useEffect(() => {
        setNameError('');
        setEmailError('');
        setPhoneError('');
        setPasswordError('');
        setConfirmPasswordError('');
        setGeneralError('');
    }, [mode]);

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

    // --- Connect to Backend API ---
    const handleLogin = async () => {
        // Clear previous general errors
        setGeneralError('');
        setWrongCredentials(false);

        let isValid = true;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        // Validate whichever identifier is in use. The mobile branch only checks for
        // enough digits: numbering plans vary, and rejecting a real number is worse
        // than letting the server answer.
        if (useMobile) {
            const digits = phone.replace(/\D/g, '');
            if (!phone.trim()) {
                setPhoneError('Mobile number is required.');
                isValid = false;
            } else if (digits.length < 10) {
                setPhoneError('Enter your full mobile number.');
                isValid = false;
            }
        } else if (!email.trim()) {
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
            const identifier = (useMobile ? phone : email).trim();
            const response = await client.post('/auth/login', { identifier, password });

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
            // Grab the message sent from the Node.js backend
            const backendError = error.response?.data?.message || 'Unable to connect to server. Please try again later.';
            // 401 means specifically "those details are wrong" — the one failure
            // where a password reset is the likely next step, so the screen
            // promotes that option rather than leaving the user stuck re-typing.
            setWrongCredentials(error.response?.status === 401);
            setGeneralError(backendError);
        } finally {
            // Always stop the loading spinner, whether it succeeded or failed
            setIsLoading(false);
        }
    };

    // --- Validation & API Logic (sign-up) ---
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

            // A guest gets their OWN identity rather than silently appearing as
            // "Demo": a unique id is minted and becomes the display name for the
            // session, while the data underneath is still the demo account's, since
            // that is what makes the app worth exploring. Crockford-style alphabet
            // (no I/O/0/1) so the id can be read aloud or typed without ambiguity.
            const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
            const suffix = Array.from({ length: 6 }, () =>
                ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
            ).join('');
            const guestId = `GUEST-${suffix}`;

            await AsyncStorage.setItem('userToken', token);
            await AsyncStorage.setItem('ownerData', JSON.stringify({
                ...owner,
                // Shown throughout the app in place of the demo owner's name, so it
                // is always obvious this is a guest session and not a real account.
                name: `Guest ${suffix}`,
                isGuest: true,
                guestId,
                // Keep the underlying demo identity for anything that needs it.
                demoEmail: owner?.email ?? null
            }));
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

    // Sign-up-only fields fade + drop into the space the Collapsible opens.
    const signupFieldStyle = {
        opacity: morph,
        transform: [{ translateY: morph.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }]
    };

    const loginOnlyStyle = { opacity: morph.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) };

    // GlassButton renders a plain Text, so its label can't be animated in place.
    // Both buttons are size="lg" with the same icon, so stacking them keeps the
    // geometry identical while the words cross-fade.
    const signInStyle = { opacity: morph.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) };
    const createStyle = { opacity: morph };

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

                        {/* tagline={null}: the lockup's own copy can't cross-fade, so the
                            per-mode line is rendered here instead. */}
                        <BrandMark size={72} tagline={null} style={{ marginTop: t.spacing.lg }} />

                        <Animated.Text
                            style={[
                                t.typography.body,
                                styles.centerText,
                                { color: t.colors.textMuted, marginTop: t.spacing.xs, opacity: copyFade }
                            ]}
                        >
                            {copyMode === 'signup'
                                ? 'Join TenantPro to manage your properties'
                                : 'Smart Property Management'}
                        </Animated.Text>
                    </Animated.View>

                    {!isSignup ? (
                        <Animated.View style={[headerStyle, { marginTop: t.spacing.xxl }]}>
                            <SegmentedTabs options={LOGIN_BY} value={loginBy} onChange={setLoginBy} />
                        </Animated.View>
                    ) : null}

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

                                {/* The recovery action belongs to the failure, not
                                    to the corner of the form. Swapping the standing
                                    "Forgot Password?" link into a bordered button
                                    put a second, differently-shaped control next to
                                    the one the eye was already on. This sits under
                                    the message that prompted it and leaves the rest
                                    of the form alone. */}
                                {wrongCredentials ? (
                                    <Pressable
                                        onPress={() => navigation.navigate('ForgotPassword')}
                                        disabled={anyLoading}
                                        style={({ pressed }) => [
                                            styles.errorAction,
                                            { borderRadius: t.radii.md },
                                            pressed && { backgroundColor: withAlpha(t.colors.danger, 0.14) }
                                        ]}
                                        accessibilityRole="button"
                                        accessibilityLabel="Reset your password"
                                    >
                                        <Text style={[t.typography.caption, styles.errorActionText, { color: t.colors.danger }]}>
                                            Reset your password
                                        </Text>
                                        <Ionicons name="arrow-forward" size={14} color={t.colors.danger} />
                                    </Pressable>
                                ) : null}
                            </Animated.View>
                        ) : null}

                        {/* Identity block. paddingBottom lives inside so the gap above
                            Email collapses with the fields. */}
                        <Collapsible open={isSignup}>
                            <Animated.View
                                style={[signupFieldStyle, { paddingBottom: t.spacing.lg }]}
                                pointerEvents={isSignup ? 'auto' : 'none'}
                                accessibilityElementsHidden={!isSignup}
                                importantForAccessibility={isSignup ? 'auto' : 'no-hide-descendants'}
                            >
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
                                    editable={!anyLoading}
                                    autoCapitalize="words"
                                    returnKeyType="next"
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
                                    editable={!anyLoading}
                                    keyboardType="phone-pad"
                                    returnKeyType="next"
                                    style={{ marginTop: t.spacing.lg }}
                                />
                            </Animated.View>
                        </Collapsible>

                        {/* The identifier field. In sign-up it is always the email;
                            when signing in it follows the Email/Mobile toggle, writing
                            to whichever piece of state that identifier belongs to so
                            neither value is lost by switching. */}
                        <GlassInput
                            value={useMobile ? phone : email}
                            onChangeText={(text) => {
                                if (useMobile) {
                                    setPhone(text);
                                    setPhoneError('');
                                } else {
                                    setEmail(text);
                                    setEmailError('');
                                }
                                setGeneralError(''); // Clear backend error on typing
                            }}
                            placeholder={useMobile ? 'Mobile Number' : 'Email Address'}
                            icon={useMobile ? 'call-outline' : 'mail-outline'}
                            error={useMobile ? phoneError : emailError}
                            editable={!anyLoading}
                            autoCapitalize="none"
                            keyboardType={useMobile ? 'phone-pad' : 'email-address'}
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
                            returnKeyType={isSignup ? 'next' : 'go'}
                            onSubmitEditing={isSignup ? undefined : handleLogin}
                            style={{ marginTop: t.spacing.lg }}
                        />

                        {/* Strength meter + confirmation belong to sign-up only. */}
                        <Collapsible open={isSignup}>
                            <Animated.View
                                style={signupFieldStyle}
                                pointerEvents={isSignup ? 'auto' : 'none'}
                                accessibilityElementsHidden={!isSignup}
                                importantForAccessibility={isSignup ? 'auto' : 'no-hide-descendants'}
                            >
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
                                    editable={!anyLoading}
                                    autoCapitalize="none"
                                    returnKeyType="go"
                                    onSubmitEditing={handleRegister}
                                    style={{ marginTop: t.spacing.lg }}
                                />
                            </Animated.View>
                        </Collapsible>

                        {/* Password recovery only makes sense while signing in. */}
                        <Collapsible open={!isSignup}>
                            <Animated.View
                                style={loginOnlyStyle}
                                pointerEvents={isSignup ? 'none' : 'auto'}
                                accessibilityElementsHidden={isSignup}
                                importantForAccessibility={isSignup ? 'no-hide-descendants' : 'auto'}
                            >
                                <GlassButton
                                    label="Forgot Password?"
                                    variant="ghost"
                                    size="sm"
                                    fullWidth={false}
                                    disabled={anyLoading}
                                    onPress={() => navigation.navigate('ForgotPassword')}
                                    style={styles.forgot}
                                />
                            </Animated.View>
                        </Collapsible>

                        <View style={[styles.submitStack, { marginTop: t.spacing.lg }]}>
                            <Animated.View
                                style={signInStyle}
                                pointerEvents={isSignup ? 'none' : 'auto'}
                                accessibilityElementsHidden={isSignup}
                                importantForAccessibility={isSignup ? 'no-hide-descendants' : 'auto'}
                            >
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
                            </Animated.View>

                            <Animated.View
                                style={[styles.submitOverlay, createStyle]}
                                pointerEvents={isSignup ? 'auto' : 'none'}
                                accessibilityElementsHidden={!isSignup}
                                importantForAccessibility={isSignup ? 'auto' : 'no-hide-descendants'}
                            >
                                <GlassButton
                                    label="Create Account"
                                    size="lg"
                                    icon="arrow-forward"
                                    iconRight
                                    loading={isLoading}
                                    loadingLabel="Creating Account..."
                                    disabled={anyLoading}
                                    onPress={handleRegister}
                                />
                            </Animated.View>
                        </View>
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

                    <Animated.View style={[styles.footer, { marginTop: t.spacing.xxxl, opacity: copyFade }]}>
                        <Text style={[t.typography.body, { color: t.colors.textMuted }]}>
                            {copyMode === 'signup' ? 'Already have an account?' : 'New to TenantPro?'}{' '}
                        </Text>
                        <Pressable
                            // Reads from `mode`, not the lagging copy, so a tap mid-fade
                            // still flips to the other mode.
                            onPress={() => setMode(isSignup ? 'login' : 'signup')}
                            disabled={anyLoading}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            accessibilityRole="link"
                            accessibilityLabel={
                                isSignup
                                    ? 'Sign in to an existing TenantPro account'
                                    : 'Create a new TenantPro account'
                            }
                        >
                            <Text style={[t.typography.bodyStrong, { color: t.colors.primary }]}>
                                {copyMode === 'signup' ? 'Sign In' : 'Create Account'}
                            </Text>
                        </Pressable>
                    </Animated.View>
                </ScrollView>
            </KeyboardAvoidingView>
        </Screen>
    );
}

const styles = StyleSheet.create({
    errorAction: {
        flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
        gap: 6, marginTop: 8, paddingVertical: 6, paddingHorizontal: 10
    },
    errorActionText: { fontWeight: '700' },
    flex: { flex: 1 },
    // Centres the stack vertically on tall phones but still scrolls when the
    // keyboard shrinks the viewport.
    scrollBody: { flexGrow: 1, justifyContent: 'center' },
    backRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingVertical: 4 },
    errorStrip: { flexDirection: 'row', alignItems: 'center', padding: 12 },
    errorText: { flex: 1, fontWeight: '700' },
    // overflow: hidden is what turns the animated height into a reveal.
    collapsible: { overflow: 'hidden' },
    forgot: { alignSelf: 'flex-end', marginVertical: 4 },
    strengthRow: { flexDirection: 'row', alignItems: 'center', marginLeft: 6 },
    meter: { flexDirection: 'row', flex: 1 },
    meterSegment: { flex: 1, height: 4 },
    submitStack: { width: '100%' },
    submitOverlay: { ...StyleSheet.absoluteFillObject },
    centerText: { textAlign: 'center' },
    dividerRow: { flexDirection: 'row', alignItems: 'center' },
    hairline: { flex: 1, height: StyleSheet.hairlineWidth },
    socialRow: { flexDirection: 'row', justifyContent: 'center' },
    socialTile: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
    footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }
});
