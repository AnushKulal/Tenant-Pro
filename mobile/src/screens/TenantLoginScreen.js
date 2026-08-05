// File: mobile/src/screens/TenantLoginScreen.js
import React, { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
    KeyboardAvoidingView, Platform, ActivityIndicator, useColorScheme
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';

export default function TenantLoginScreen({ navigation }) {
    const isDark = useColorScheme() === 'dark';
    const t = isDark ? dark : light;
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        setError('');
        if (!email.trim() || !password) { setError('Please enter your email and password.'); return; }
        setLoading(true);
        try {
            const res = await client.post('/tenant-auth/login', { email: email.trim(), password });
            await AsyncStorage.setItem('tenantToken', res.data.token);
            await AsyncStorage.setItem('tenantData', JSON.stringify(res.data.tenant));
            navigation.replace('TenantHome');
        } catch (e) {
            setError(e.response?.data?.message || 'Unable to sign in. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={[styles.container, t.container]}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                    <Text style={[styles.title, t.text]}>Tenant Sign In</Text>
                    <Text style={[styles.subtitle, t.subtext]}>Access your dues, payments and requests.</Text>

                    <View style={[styles.card, t.card]}>
                        {error ? <Text style={styles.error}>⚠️ {error}</Text> : null}
                        <TextInput
                            style={[styles.input, t.input]}
                            placeholder="Email address"
                            placeholderTextColor={t.ph}
                            autoCapitalize="none"
                            keyboardType="email-address"
                            value={email}
                            onChangeText={setEmail}
                        />
                        <TextInput
                            style={[styles.input, t.input]}
                            placeholder="Password"
                            placeholderTextColor={t.ph}
                            secureTextEntry
                            value={password}
                            onChangeText={setPassword}
                        />
                        <TouchableOpacity style={[styles.button, loading && styles.disabled]} onPress={handleLogin} disabled={loading}>
                            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign In</Text>}
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity onPress={() => navigation.navigate('TenantRegister')} style={styles.linkRow}>
                        <Text style={[styles.linkMuted, t.subtext]}>New tenant? </Text>
                        <Text style={styles.link}>Create Account</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => navigation.replace('RoleSelection')} style={styles.back}>
                        <Text style={[styles.linkMuted, t.subtext]}>← Back</Text>
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
    title: { fontSize: 30, fontWeight: '800', textAlign: 'center' },
    subtitle: { fontSize: 15, textAlign: 'center', marginTop: 6, marginBottom: 24 },
    card: { borderRadius: 18, padding: 20, borderWidth: 1 },
    input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, marginBottom: 14 },
    button: { backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
    disabled: { opacity: 0.6 },
    buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    error: { color: '#EF4444', marginBottom: 12, fontWeight: '600' },
    linkRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 22 },
    linkMuted: { fontSize: 15 },
    link: { color: '#2563EB', fontWeight: '800', fontSize: 15 },
    back: { alignItems: 'center', marginTop: 18 }
});

const light = StyleSheet.create({
    container: { backgroundColor: '#F8FAFC' }, text: { color: '#0F172A' }, subtext: { color: '#64748B' },
    card: { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0' }, input: { backgroundColor: '#FFFFFF', color: '#0F172A', borderColor: '#E2E8F0' }, ph: '#94A3B8'
});
const dark = StyleSheet.create({
    container: { backgroundColor: '#09090B' }, text: { color: '#F8FAFC' }, subtext: { color: '#94A3B8' },
    card: { backgroundColor: '#18181B', borderColor: '#27272A' }, input: { backgroundColor: '#0F0F12', color: '#F8FAFC', borderColor: '#334155' }, ph: '#64748B'
});
