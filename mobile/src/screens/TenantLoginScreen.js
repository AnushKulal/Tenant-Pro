// File: mobile/src/screens/TenantLoginScreen.js
// The tenant door — ONE screen that morphs between Sign In and Sign Up.
//
// Why one screen: sign-in and sign-up used to be two navigator routes, so
// tapping the pill pushed 'TenantRegister', which slid a whole new page in and
// mounted with "signup" already selected — the thumb had nothing to animate
// from, and the user saw a page transition instead of a toggle. Mode is now
// local state: the pill slides, the shared email/password fields stay mounted,
// and the sign-up-only fields grow into place inside the same GlassCard.
//
// TenantRegisterScreen is now a thin wrapper that renders this with
// mode: 'signup', so the 'TenantRegister' route keeps working.
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

// Shows or hides the fields that belong to only one mode.
//
// It used to animate a measured height while clipping its children with
// overflow:'hidden'. That measurement is the bug that made sign-up unusable: on
// Android the clipped child reports a height of 0, so the natural height never
// became a real number and the block stayed collapsed even in sign-up mode. The
// fields were invisible AND empty, and validation then complained "Please fill in
// all fields" about inputs the user could not see. A browser render showed it
// working, because react-native-web does not clip a child's measured box the way
// Yoga does.
//
// Nothing is measured now: closed means not rendered, open fades and slides in,
// and the card resizes because its content actually changed. Values live in the
// parent's state, so unmounting an input never loses typing.
function Collapsible({ expanded, children }) {
    const t = useTheme();
    const reveal = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!expanded) {
            reveal.setValue(0);
            return;
        }
        Animated.timing(reveal, {
            toValue: 1,
            duration: t.motion.normal,
            useNativeDriver: true
        }).start();
    }, [expanded, reveal, t.motion.normal]);

    if (!expanded) return null;

    return (
        <Animated.View
            style={{
                opacity: reveal,
                transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }]
            }}
        >
            {children}
        </Animated.View>
    );
}

export default function TenantLoginScreen({ navigation, route }) {
    const t = useTheme();

    const initialMode = route?.params?.mode === 'signup' ? 'signup' : 'login';
    const [mode, setMode] = useState(initialMode);
    const isSignup = mode === 'signup';

    // Sign-in identifier. The top toggle chooses which one you are using; sign-up
    // always needs both, so the toggle is hidden there.
    const [loginBy, setLoginBy] = useState('email');
    const useMobile = !isSignup && loginBy === 'phone';
    // Set when the server rejects the credentials, so the screen can offer a reset
    // right where the failure happened instead of making the user hunt for it.
    // 'password' -> offer a reset, 'account' -> offer sign-up. null when there is
    // no actionable failure.
    const [failureKind, setFailureKind] = useState(null);
    const wrongCredentials = failureKind === 'password';
    const notRegistered = failureKind === 'account';

    const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    // Editing anything clears the banner — stale errors next to corrected input read as broken.
    const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setError(''); };

    // <Screen scroll> skips its own entrance transform, so the header animates here.
    const headerIn = useRef(new Animated.Value(0)).current;
    const errorIn = useRef(new Animated.Value(0)).current;
    const meter = useRef(new Animated.Value(0)).current;
    // Drives every cross-fade between the two modes' copy (0 = login, 1 = signup).
    const swap = useRef(new Animated.Value(initialMode === 'signup' ? 1 : 0)).current;

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

    useEffect(() => {
        Animated.timing(swap, {
            toValue: isSignup ? 1 : 0,
            duration: t.motion.normal,
            useNativeDriver: true
        }).start();
    }, [isSignup, swap, t.motion.normal]);

    // A caller can still deep-link the mode (RoleSelection, the TenantRegister
    // wrapper). Only re-runs when the param actually changes, so it never fights
    // the user's own toggling.
    const paramMode = route?.params?.mode;
    useEffect(() => {
        if (paramMode === 'signup' || paramMode === 'login') setMode(paramMode);
    }, [paramMode]);

    const switchMode = (next) => {
        if (next === mode) return;
        setError(''); // an error about the other form is noise here
        setMode(next);
    };

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

    const handleLogin = async () => {
        setError('');
        setFailureKind(null);
        const { password } = form;
        const identifier = (loginBy === 'phone' ? form.phone : form.email).trim();
        if (!identifier || !password) {
            setError(`Enter your ${loginBy === 'phone' ? 'mobile number' : 'email'} and password.`);
            return;
        }
        setLoading(true);
        try {
            const res = await client.post('/tenant-auth/login', { identifier, password });
            await AsyncStorage.setItem('tenantToken', res.data.token);
            await AsyncStorage.setItem('tenantData', JSON.stringify(res.data.tenant));
            // RESET the stack (not replace) so back from the portal exits the app.
            enterTenantApp(navigation);
        } catch (e) {
            // 401 is specifically "those details are wrong", which is the one case
            // where offering a password reset is the useful next step.
            const code = e.response?.data?.code;
            setFailureKind(
                code === 'NOT_REGISTERED' ? 'account'
                    : code === 'WRONG_PASSWORD' || e.response?.status === 401 ? 'password'
                        : null
            );
            setError(e.response?.data?.message || 'Unable to sign in. Please try again.');
        } finally {
            setLoading(false);
        }
    };

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

    const submit = isSignup ? handleRegister : handleLogin;

    const headerStyle = {
        opacity: headerIn,
        transform: [{ translateY: headerIn.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }]
    };

    const errorStyle = {
        opacity: errorIn,
        transform: [{ translateY: errorIn.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }]
    };

    // Mode-specific copy is stacked and cross-faded rather than swapped in place,
    // so no string ever pops. The outgoing layer is always pointerEvents: none.
    const loginFade = { opacity: swap.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) };
    const signupFade = { opacity: swap };

    const subtitleStyle = [t.typography.caption, styles.centerText, { color: t.colors.textFaint }];

    return (
        <Screen scroll edges={['top', 'bottom']}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.flex}
            >
                <ScrollView
                    // style flex:1 bounds the scroll viewport to the screen. Without
                    // it, contentContainerStyle's `flexGrow:1 + justifyContent:center`
                    // centres correctly on tall screens but CLIPS the top on short
                    // ones — the header scrolls off above the top and can't be reached.
                    // Bounded height turns that same centering into "centre when it
                    // fits, scroll when it doesn't", which is what makes it work on
                    // every screen size and with the keyboard open.
                    style={styles.flex}
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

                        <View style={{ marginTop: t.spacing.sm }}>
                            <Animated.Text style={[subtitleStyle, loginFade]}>
                                Access your dues, payments and requests.
                            </Animated.Text>
                            <Animated.Text style={[subtitleStyle, styles.overlay, signupFade]}>
                                Sign up to view dues and pay rent.
                            </Animated.Text>
                        </View>
                    </Animated.View>

                    {/* Sign in with either identifier. This used to toggle
                        login/sign-up, which put the rarest action (creating an
                        account) at the top of the screen with equal weight to the
                        one people do daily. Sign-up now lives in the link at the
                        bottom, where it belongs. */}
                    {!isSignup ? (
                        <Animated.View style={[headerStyle, { marginTop: t.spacing.xxl }]}>
                            <SegmentedTabs
                                options={[{ label: 'Email', value: 'email' }, { label: 'Mobile', value: 'phone' }]}
                                value={loginBy}
                                onChange={setLoginBy}
                            />
                        </Animated.View>
                    ) : null}

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

                                {/* The recovery action belongs to the failure, not
                                    to the corner of the form. Swapping the standing
                                    "Forgot Password?" link into a bordered button
                                    put a second, differently-shaped control next to
                                    the one the eye was already on. This sits under
                                    the message that prompted it and leaves the rest
                                    of the form alone. */}
                                {failureKind ? (
                                    <Pressable
                                        onPress={() => {
                                            if (notRegistered) switchMode('signup');
                                            else navigation.navigate('ForgotPassword', { role: 'tenant' });
                                        }}
                                        disabled={loading}
                                        style={({ pressed }) => [
                                            styles.errorAction,
                                            { borderRadius: t.radii.md },
                                            pressed && { backgroundColor: withAlpha(t.colors.danger, 0.14) }
                                        ]}
                                        accessibilityRole="button"
                                        accessibilityLabel={notRegistered ? 'Create an account' : 'Reset your password'}
                                    >
                                        <Text style={[t.typography.caption, styles.errorActionText, { color: t.colors.danger }]}>
                                            {notRegistered ? 'Create an account' : 'Reset your password'}
                                        </Text>
                                        <Ionicons name="arrow-forward" size={14} color={t.colors.danger} />
                                    </Pressable>
                                ) : null}
                            </Animated.View>
                        ) : null}

                        {/* Sign-up extras carry their own margins INSIDE the
                            collapsible, so the spacing collapses with them. */}
                        <Collapsible expanded={isSignup}>
                            <GlassInput
                                value={form.name}
                                onChangeText={set('name')}
                                placeholder="Full name"
                                icon="person-outline"
                                editable={!loading}
                                autoCapitalize="words"
                                returnKeyType="next"
                                style={{ marginBottom: t.spacing.lg }}
                            />
                        </Collapsible>

                        <GlassInput
                            value={useMobile ? form.phone : form.email}
                            onChangeText={useMobile ? set('phone') : set('email')}
                            placeholder={useMobile ? 'Mobile number' : 'Email address'}
                            icon={useMobile ? 'call-outline' : 'mail-outline'}
                            editable={!loading}
                            autoCapitalize="none"
                            keyboardType={useMobile ? 'phone-pad' : 'email-address'}
                            returnKeyType="next"
                        />

                        <Collapsible expanded={isSignup}>
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
                        </Collapsible>

                        <GlassInput
                            value={form.password}
                            onChangeText={set('password')}
                            placeholder="Password"
                            icon="lock-closed-outline"
                            secure
                            editable={!loading}
                            autoCapitalize="none"
                            returnKeyType={isSignup ? 'next' : 'go'}
                            // In sign-up mode the confirm field below owns the "go" key.
                            onSubmitEditing={isSignup ? undefined : handleLogin}
                            style={{ marginTop: t.spacing.lg }}
                        />

                        <Collapsible expanded={isSignup}>
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
                        </Collapsible>

                        {/* Password recovery only makes sense while signing in — and
                            it goes to the shared reset screen with role: 'tenant', so
                            the emailed code resets the tenant account rather than a
                            landlord account that happens to use the same address.
                            After a rejected sign-in it is emphasised, because at that
                            moment it is the most likely thing the user needs. */}
                        <Collapsible expanded={!isSignup}>
                            <Animated.View
                                style={loginFade}
                                pointerEvents={isSignup ? 'none' : 'auto'}
                                accessibilityElementsHidden={isSignup}
                                importantForAccessibility={isSignup ? 'no-hide-descendants' : 'auto'}
                            >
                                <GlassButton
                                    label="Forgot Password?"
                                    variant="ghost"
                                    size="sm"
                                    fullWidth={false}
                                    disabled={loading}
                                    onPress={() => navigation.navigate('ForgotPassword', { role: 'tenant' })}
                                    style={styles.forgot}
                                />
                            </Animated.View>
                        </Collapsible>

                        {/* Two stacked buttons cross-fade so the label never pops
                            and a filled button stays visible throughout. */}
                        <View style={{ marginTop: t.spacing.lg }}>
                            <Animated.View style={loginFade} pointerEvents={isSignup ? 'none' : 'auto'}>
                                <GlassButton
                                    label="Sign In"
                                    size="lg"
                                    icon="arrow-forward"
                                    iconRight
                                    loading={loading && !isSignup}
                                    loadingLabel="Signing in..."
                                    disabled={loading}
                                    onPress={submit}
                                />
                            </Animated.View>
                            <Animated.View
                                style={[StyleSheet.absoluteFill, signupFade]}
                                pointerEvents={isSignup ? 'auto' : 'none'}
                            >
                                <GlassButton
                                    label="Create Account"
                                    size="lg"
                                    icon="arrow-forward"
                                    iconRight
                                    loading={loading && isSignup}
                                    loadingLabel="Creating Account..."
                                    disabled={loading}
                                    onPress={submit}
                                />
                            </Animated.View>
                        </View>
                    </GlassCard>

                    <View style={{ marginTop: t.spacing.xxxl }}>
                        <Animated.View
                            style={[styles.footer, loginFade]}
                            pointerEvents={isSignup ? 'none' : 'auto'}
                        >
                            <Text style={[t.typography.body, { color: t.colors.textMuted }]}>
                                New tenant?{' '}
                            </Text>
                            <Pressable
                                onPress={() => switchMode('signup')}
                                disabled={loading}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                accessibilityRole="button"
                                accessibilityLabel="Switch to creating a tenant account"
                            >
                                <Text style={[t.typography.bodyStrong, { color: t.colors.primary }]}>
                                    Create Account
                                </Text>
                            </Pressable>
                        </Animated.View>

                        <Animated.View
                            style={[styles.footer, StyleSheet.absoluteFill, signupFade]}
                            pointerEvents={isSignup ? 'auto' : 'none'}
                        >
                            <Text style={[t.typography.body, { color: t.colors.textMuted }]}>
                                Already have an account?{' '}
                            </Text>
                            <Pressable
                                onPress={() => switchMode('login')}
                                disabled={loading}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                accessibilityRole="button"
                                accessibilityLabel="Switch to signing in to an existing tenant account"
                            >
                                <Text style={[t.typography.bodyStrong, { color: t.colors.primary }]}>
                                    Sign In
                                </Text>
                            </Pressable>
                        </Animated.View>
                    </View>
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
    forgot: { alignSelf: 'flex-end', marginVertical: 4 },
    flex: { flex: 1 },
    // Centres the stack vertically on tall phones but still scrolls when the
    // keyboard (or the taller sign-up form) shrinks the viewport.
    scrollBody: { flexGrow: 1, justifyContent: 'center', paddingTop: 8 },
    backRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingVertical: 4 },
    centerText: { textAlign: 'center' },
    // Cross-fade partner: sits on top of the in-flow copy, which owns the height.
    overlay: { position: 'absolute', left: 0, right: 0, top: 0 },
    collapsible: { overflow: 'hidden' },
    errorStrip: { flexDirection: 'row', alignItems: 'center', padding: 12 },
    errorText: { flex: 1, fontWeight: '700' },
    strengthRow: { flexDirection: 'row', alignItems: 'center', marginLeft: 6 },
    meter: { flexDirection: 'row', flex: 1 },
    meterSegment: { flex: 1, height: 4 },
    footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }
});
