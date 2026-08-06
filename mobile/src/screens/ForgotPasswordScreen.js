// File: mobile/src/screens/ForgotPasswordScreen.js
// Password recovery, rebuilt on the glass design system.
//
// Three presentation states over the same two-request flow:
//   'request' → POST /auth/forgot-password  (emails a 6-digit code)
//   'reset'   → POST /auth/reset-password   (code + new password)
//   'done'    → success pane (replaces the old blocking Alert)
// Everything floats on <Screen>'s aurora canvas; the screen paints no surface.
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
import client from '../api/client';
import { useTheme, withAlpha } from '../theme';
import { Screen, GlassCard, GlassView, GlassButton, GlassInput, BrandMark, ProgressBar } from '../ui';

// The stepper only tracks the two data-entry steps; 'done' reads as complete.
const STEPS = [
    { key: 'request', label: 'Your account' },
    { key: 'reset', label: 'New password' }
];

export default function ForgotPasswordScreen({ navigation, route }) {
    const t = useTheme();

    // Owners and tenants are separate accounts in separate tables, so the flow has
    // to say which one it is resetting. Defaults to owner, which is how the screen
    // has always behaved and what the owner login still navigates in as.
    const role = route?.params?.role === 'tenant' ? 'tenant' : 'owner';
    const isTenant = role === 'tenant';

    const [step, setStep] = useState('request'); // 'request' | 'reset' | 'done'
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');

    // <Screen scroll> skips its own entrance transform, so the header animates here.
    const headerIn = useRef(new Animated.Value(0)).current;
    const noticeIn = useRef(new Animated.Value(0)).current;
    const successPop = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(headerIn, {
            toValue: 1,
            duration: t.motion.entrance,
            useNativeDriver: true
        }).start();
    }, [headerIn, t.motion.entrance]);

    // One animator drives both banners — only ever one of them is mounted.
    useEffect(() => {
        Animated.timing(noticeIn, {
            toValue: error || info ? 1 : 0,
            duration: t.motion.fast,
            useNativeDriver: true
        }).start();
    }, [error, info, noticeIn, t.motion.fast]);

    useEffect(() => {
        if (step !== 'done') return;
        Animated.spring(successPop, {
            toValue: 1,
            useNativeDriver: true,
            ...t.motion.spring
        }).start();
    }, [step, successPop, t.motion.spring]);

    const requestCode = async () => {
        setError(''); setInfo('');
        if (!email.trim()) { setError('Enter your registered email or mobile number.'); return; }
        setIsLoading(true);
        try {
            const res = await client.post('/auth/forgot-password', { identifier: email.trim(), email: email.trim(), role });
            // The server echoes the masked destination, so the message can say WHERE
            // to look. A code sent to an address you forgot you used is otherwise
            // indistinguishable from one that was never sent.
            const sentTo = res?.data?.sentTo;
            setInfo(sentTo
                ? `A 6-digit code has been sent to ${sentTo}. Check that inbox.`
                : 'A 6-digit code has been sent. Check your inbox.');
            setStep('reset');
        } catch (e) {
            setError(e.response?.data?.message || 'Something went wrong. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const resetPassword = async () => {
        setError(''); setInfo('');
        if (!code.trim()) { setError('Enter the code from your email.'); return; }
        if (newPassword.length < 6) { setError('Password must be at least 6 characters.'); return; }
        if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }
        setIsLoading(true);
        try {
            await client.post('/auth/reset-password', {
                identifier: email.trim(), email: email.trim(), code: code.trim(), newPassword, role
            });
            setStep('done');
        } catch (e) {
            setError(e.response?.data?.message || 'Could not reset password. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    // Back SHOULD work between the auth screens, so this is a plain navigate and
    // never a stack reset (those are reserved for post-authentication moves).
    const goToLogin = () => navigation.navigate('Login');

    const stepIndex = step === 'request' ? 0 : 1;
    const progress = step === 'done' ? 1 : (stepIndex + 1) / STEPS.length;

    const headerStyle = {
        opacity: headerIn,
        transform: [{ translateY: headerIn.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }]
    };

    const noticeStyle = {
        opacity: noticeIn,
        transform: [{ translateY: noticeIn.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }]
    };

    const successIconStyle = {
        opacity: successPop,
        transform: [{ scale: successPop.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }]
    };

    // Naming the account type matters here: someone who holds both a landlord and a
    // tenant account with one email needs to know which password this resets.
    const subtitle = step === 'request'
        ? `Enter the email or mobile number on your ${isTenant ? 'tenant account' : 'account'} and we'll send a code to its registered email.`
        : 'Enter the code we emailed you and choose a new password.';

    const notice = ({ text, tone, icon }) => (
        <Animated.View style={[noticeStyle, { marginBottom: t.spacing.lg }]}>
            <GlassView
                radius={t.radii.md}
                sheen={false}
                tintColor={withAlpha(tone, t.isDark ? 0.18 : 0.12)}
                style={[styles.noticeStrip, { borderColor: withAlpha(tone, 0.45) }]}
            >
                <Ionicons name={icon} size={18} color={tone} />
                <Text
                    style={[
                        t.typography.caption,
                        styles.noticeText,
                        { color: tone, marginLeft: t.spacing.sm }
                    ]}
                >
                    {text}
                </Text>
            </GlassView>
        </Animated.View>
    );

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
                            onPress={goToLogin}
                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                            style={styles.backRow}
                            accessibilityRole="button"
                            accessibilityLabel="Back to sign in"
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
                            size={60}
                            showWordmark={false}
                            pulse={step !== 'done'}
                            style={{ marginTop: t.spacing.lg }}
                        />

                        <Text
                            style={[
                                t.typography.title,
                                styles.centerText,
                                { color: t.colors.text, marginTop: t.spacing.xl }
                            ]}
                        >
                            Reset Password
                        </Text>

                        {step !== 'done' ? (
                            <Text
                                style={[
                                    t.typography.body,
                                    styles.centerText,
                                    styles.subtitle,
                                    { color: t.colors.textMuted, marginTop: t.spacing.sm }
                                ]}
                            >
                                {subtitle}
                            </Text>
                        ) : null}
                    </Animated.View>

                    {step === 'done' ? (
                        <GlassCard delay={80} elevation="lg" style={{ marginTop: t.spacing.xxl }}>
                            <View style={styles.successBody}>
                                <Animated.View style={successIconStyle}>
                                    <Ionicons name="checkmark-circle" size={72} color={t.colors.success} />
                                </Animated.View>

                                <Text
                                    style={[
                                        t.typography.heading,
                                        styles.centerText,
                                        { color: t.colors.text, marginTop: t.spacing.lg }
                                    ]}
                                >
                                    Success
                                </Text>
                                <Text
                                    style={[
                                        t.typography.body,
                                        styles.centerText,
                                        styles.subtitle,
                                        { color: t.colors.textMuted, marginTop: t.spacing.sm }
                                    ]}
                                >
                                    Your password has been reset. Please sign in.
                                </Text>

                                <GlassButton
                                    label="Back to Sign In"
                                    size="lg"
                                    icon="arrow-forward"
                                    iconRight
                                    onPress={goToLogin}
                                    style={{ marginTop: t.spacing.xxl }}
                                />
                            </View>
                        </GlassCard>
                    ) : (
                        <GlassCard delay={140} elevation="lg" style={{ marginTop: t.spacing.xxl }}>
                            {/* Subtle stepper: label + count above a themed progress track. */}
                            <View style={styles.stepperHead}>
                                <Text style={[t.typography.micro, { color: t.colors.primary }]}>
                                    {STEPS[stepIndex].label.toUpperCase()}
                                </Text>
                                <Text style={[t.typography.micro, { color: t.colors.textFaint }]}>
                                    {`STEP ${stepIndex + 1} OF ${STEPS.length}`}
                                </Text>
                            </View>
                            <ProgressBar
                                progress={progress}
                                height={5}
                                trackColor={withAlpha(t.colors.primary, t.isDark ? 0.16 : 0.12)}
                                style={{ marginBottom: t.spacing.xl }}
                            />

                            {error ? notice({ text: error, tone: t.colors.danger, icon: 'alert-circle' }) : null}
                            {info ? notice({ text: info, tone: t.colors.success, icon: 'mail-open-outline' }) : null}

                            {step === 'request' ? (
                                <>
                                    {/* Either identifier, matching what sign-in
                                        accepts — someone who signs in with their
                                        mobile number should not have to remember
                                        which email they used. The code still goes to
                                        the address on the account, never to anything
                                        typed here. */}
                                    <GlassInput
                                        value={email}
                                        onChangeText={setEmail}
                                        placeholder="Email or mobile number"
                                        icon="person-outline"
                                        editable={!isLoading}
                                        autoCapitalize="none"
                                        keyboardType="email-address"
                                        returnKeyType="send"
                                        onSubmitEditing={requestCode}
                                    />

                                    <GlassButton
                                        label="Send Code"
                                        size="lg"
                                        icon="paper-plane-outline"
                                        loading={isLoading}
                                        loadingLabel="Sending…"
                                        disabled={isLoading}
                                        onPress={requestCode}
                                        style={{ marginTop: t.spacing.xl }}
                                    />
                                </>
                            ) : (
                                <>
                                    <GlassInput
                                        value={code}
                                        onChangeText={setCode}
                                        placeholder="6-digit code"
                                        icon="keypad-outline"
                                        editable={!isLoading}
                                        keyboardType="number-pad"
                                        maxLength={6}
                                        returnKeyType="next"
                                    />

                                    <GlassInput
                                        value={newPassword}
                                        onChangeText={setNewPassword}
                                        placeholder="New password"
                                        icon="lock-closed-outline"
                                        secure
                                        editable={!isLoading}
                                        autoCapitalize="none"
                                        returnKeyType="next"
                                        style={{ marginTop: t.spacing.lg }}
                                    />

                                    <GlassInput
                                        value={confirmPassword}
                                        onChangeText={setConfirmPassword}
                                        placeholder="Confirm new password"
                                        icon="lock-closed-outline"
                                        secure
                                        editable={!isLoading}
                                        autoCapitalize="none"
                                        returnKeyType="go"
                                        onSubmitEditing={resetPassword}
                                        style={{ marginTop: t.spacing.lg }}
                                    />

                                    <GlassButton
                                        label="Reset Password"
                                        size="lg"
                                        icon="shield-checkmark-outline"
                                        loading={isLoading}
                                        loadingLabel="Resetting…"
                                        disabled={isLoading}
                                        onPress={resetPassword}
                                        style={{ marginTop: t.spacing.xl }}
                                    />

                                    {/* Same handler as step 1 — re-issues the code for this email. */}
                                    <GlassButton
                                        label="Resend code"
                                        variant="ghost"
                                        size="sm"
                                        icon="refresh-outline"
                                        disabled={isLoading}
                                        onPress={requestCode}
                                        style={{ marginTop: t.spacing.sm }}
                                    />
                                </>
                            )}
                        </GlassCard>
                    )}

                    {step !== 'done' ? (
                        <GlassButton
                            label="Back to Sign In"
                            variant="ghost"
                            icon="arrow-back"
                            disabled={isLoading}
                            onPress={goToLogin}
                            style={{ marginTop: t.spacing.lg }}
                        />
                    ) : null}
                </ScrollView>
            </KeyboardAvoidingView>
        </Screen>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    // Centres the stack on tall phones but still scrolls once the keyboard opens.
    scrollBody: { flexGrow: 1, justifyContent: 'center' },
    backRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
    centerText: { textAlign: 'center' },
    subtitle: { lineHeight: 21 },
    stepperHead: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8
    },
    noticeStrip: { flexDirection: 'row', alignItems: 'center', padding: 12 },
    noticeText: { flex: 1, fontWeight: '600', lineHeight: 18 },
    successBody: { alignItems: 'center' }
});
