// File: mobile/src/screens/ForgotPasswordScreen.js
import React, { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
    KeyboardAvoidingView, Platform, ActivityIndicator, Alert, useColorScheme
} from 'react-native';
import client from '../api/client';

export default function ForgotPasswordScreen({ navigation }) {
    const isDark = useColorScheme() === 'dark';
    const [step, setStep] = useState('request'); // 'request' | 'reset'
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');

    const requestCode = async () => {
        setError(''); setInfo('');
        if (!email.trim()) { setError('Please enter your email.'); return; }
        setIsLoading(true);
        try {
            await client.post('/auth/forgot-password', { email: email.trim() });
            setInfo('If that email is registered, a 6-digit code has been sent. Check your inbox.');
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
                email: email.trim(), code: code.trim(), newPassword
            });
            Alert.alert('Success', 'Your password has been reset. Please sign in.', [
                { text: 'OK', onPress: () => navigation.replace('Login') }
            ]);
        } catch (e) {
            setError(e.response?.data?.message || 'Could not reset password. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const theme = isDark ? darkTheme : lightTheme;

    return (
        <View style={[styles.container, theme.container]}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                    <Text style={[styles.title, theme.text]}>Reset Password</Text>
                    <Text style={[styles.subtitle, theme.subtext]}>
                        {step === 'request'
                            ? 'Enter your email and we\'ll send you a reset code.'
                            : 'Enter the code we emailed you and choose a new password.'}
                    </Text>

                    <View style={[styles.card, theme.card]}>
                        {error ? <Text style={styles.error}>⚠️ {error}</Text> : null}
                        {info ? <Text style={styles.info}>✅ {info}</Text> : null}

                        {step === 'request' ? (
                            <>
                                <TextInput
                                    style={[styles.input, theme.input]}
                                    placeholder="Email address"
                                    placeholderTextColor={isDark ? '#94a3b8' : '#9ca3af'}
                                    autoCapitalize="none"
                                    keyboardType="email-address"
                                    value={email}
                                    onChangeText={setEmail}
                                />
                                <TouchableOpacity style={[styles.button, isLoading && styles.buttonDisabled]} onPress={requestCode} disabled={isLoading}>
                                    {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send Code</Text>}
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                <TextInput
                                    style={[styles.input, theme.input]}
                                    placeholder="6-digit code"
                                    placeholderTextColor={isDark ? '#94a3b8' : '#9ca3af'}
                                    keyboardType="number-pad"
                                    maxLength={6}
                                    value={code}
                                    onChangeText={setCode}
                                />
                                <TextInput
                                    style={[styles.input, theme.input]}
                                    placeholder="New password"
                                    placeholderTextColor={isDark ? '#94a3b8' : '#9ca3af'}
                                    secureTextEntry
                                    value={newPassword}
                                    onChangeText={setNewPassword}
                                />
                                <TextInput
                                    style={[styles.input, theme.input]}
                                    placeholder="Confirm new password"
                                    placeholderTextColor={isDark ? '#94a3b8' : '#9ca3af'}
                                    secureTextEntry
                                    value={confirmPassword}
                                    onChangeText={setConfirmPassword}
                                />
                                <TouchableOpacity style={[styles.button, isLoading && styles.buttonDisabled]} onPress={resetPassword} disabled={isLoading}>
                                    {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Reset Password</Text>}
                                </TouchableOpacity>
                                <TouchableOpacity onPress={requestCode} disabled={isLoading} style={styles.resend}>
                                    <Text style={styles.linkText}>Resend code</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>

                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
                        <Text style={styles.linkText}>← Back to Sign In</Text>
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
    title: { fontSize: 30, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
    subtitle: { fontSize: 15, textAlign: 'center', marginBottom: 24, lineHeight: 21 },
    card: { borderRadius: 16, padding: 20 },
    input: {
        borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10,
        paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, marginBottom: 14
    },
    button: {
        backgroundColor: '#3b82f6', borderRadius: 12, paddingVertical: 15,
        alignItems: 'center', marginTop: 4
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    error: { color: '#dc2626', marginBottom: 12, fontWeight: '600' },
    info: { color: '#059669', marginBottom: 12, fontWeight: '600' },
    resend: { alignItems: 'center', marginTop: 16 },
    back: { alignItems: 'center', marginTop: 24 },
    linkText: { color: '#3b82f6', fontWeight: '600', fontSize: 15 }
});

const lightTheme = StyleSheet.create({
    container: { backgroundColor: '#f8fafc' },
    text: { color: '#111827' },
    subtext: { color: '#6b7280' },
    card: { backgroundColor: '#ffffff' },
    input: { backgroundColor: '#ffffff', color: '#111827' }
});

const darkTheme = StyleSheet.create({
    container: { backgroundColor: '#0f172a' },
    text: { color: '#f1f5f9' },
    subtext: { color: '#94a3b8' },
    card: { backgroundColor: '#1e293b' },
    input: { backgroundColor: '#0f172a', color: '#f1f5f9', borderColor: '#334155' }
});
