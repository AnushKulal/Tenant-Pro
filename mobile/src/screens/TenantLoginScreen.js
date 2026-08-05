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

// Collapsible wrapper for the fields that only one mode owns.
//
// Only this small block animates its height — never the whole card — so the
// surrounding GlassCard grows and shrinks naturally around it. Height is a
// layout prop, so it MUST run on the JS driver (useNativeDriver: true throws for
// anything but transform/opacity); the fade + slide of the contents run on the
// native driver alongside it.
//
// Measuring: `overflow: 'hidden'` clips paint but Yoga still lays the children
// out at their natural size, so onLayout on the inner view reports a real height
// even while collapsed. Zero readings are ignored so a stale 0 can never become
// the target, and a later, taller reading (the strength meter appearing while
// the block is open) re-animates instead of clipping.
function Collapsible({ expanded, children }) {
    const t = useTheme();
    const height = useRef(new Animated.Value(0)).current;                // px — JS driver
    const reveal = useRef(new Animated.Value(expanded ? 1 : 0)).current; // native driver
    const natural = useRef(0);
    const measured = useRef(false);

    useEffect(() => {
        Animated.parallel([
            Animated.timing(height, {
                toValue: expanded ? natural.current : 0,
                duration: t.motion.normal,
                useNativeDriver: false
            }),
            Animated.timing(reveal, {
                toValue: expanded ? 1 : 0,
                duration: t.motion.normal,
                // Opening: let the gap start to appear first so the fields slide
                // into space instead of over their neighbours.
                delay: expanded ? Math.round(t.motion.normal * 0.25) : 0,
                useNativeDriver: true
            })
        ]).start();
    }, [expanded, height, reveal, t.motion.normal]);

    const onLayout = (e) => {
        const h = Math.round(e.nativeEvent.layout.height);
        if (!h || h === natural.current) return;
        natural.current = h;
        const first = !measured.current;
        measured.current = true;
        if (!expanded) return;
        // Arriving already in sign-up mode: snap, there is nothing to grow from.
        if (first) height.setValue(h);
        else Animated.timing(height, { toValue: h, duration: t.motion.fast, useNativeDriver: false }).start();
    };

    return (
        <Animated.View
            style={[styles.collapsible, { height }]}
            // Collapsed fields stay mounted (values survive a mode switch) but
            // must not be reachable by touch or the keyboard's next-field jump.
            pointerEvents={expanded ? 'auto' : 'none'}
        >
            <Animated.View
                onLayout={onLayout}
                style={{
                    opacity: reveal,
                    transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }]
                }}
            >
                {children}
            </Animated.View>
        </Animated.View>
    );
}

export default function TenantLoginScreen({ navigation, route }) {
    const t = useTheme();

    const initialMode = route?.params?.mode === 'signup' ? 'signup' : 'login';
    const [mode, setMode] = useState(initialMode);
    const isSignup = mode === 'signup';

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
        const { email, password } = form;
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

                    <Animated.View style={[headerStyle, { marginTop: t.spacing.xxl }]}>
                        <SegmentedTabs
                            options={[{ label: 'Sign In', value: 'login' }, { label: 'Sign Up', value: 'signup' }]}
                            value={mode}
                            // State only — navigating is what broke the toggle animation.
                            onChange={switchMode}
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
                            value={form.email}
                            onChangeText={set('email')}
                            placeholder="Email address"
                            icon="mail-outline"
                            editable={!loading}
                            autoCapitalize="none"
                            keyboardType="email-address"
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

                        {/* Two stacked buttons cross-fade so the label never pops
                            and a filled button stays visible throughout. */}
                        <View style={{ marginTop: t.spacing.xl }}>
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
    flex: { flex: 1 },
    // Centres the stack vertically on tall phones but still scrolls when the
    // keyboard (or the taller sign-up form) shrinks the viewport.
    scrollBody: { flexGrow: 1, justifyContent: 'center' },
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
