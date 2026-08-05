// File: mobile/src/screens/TenantRegisterScreen.js
import React, { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
    KeyboardAvoidingView, Platform, ActivityIndicator, useColorScheme
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';

export default function TenantRegisterScreen({ navigation }) {
    const isDark = useColorScheme() === 'dark';
    const t = isDark ? dark : light;
    const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

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
            navigation.replace('TenantHome');
        } catch (e) {
            setError(e.response?.data?.message || 'Unable to create account. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={[styles.container, t.container]}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                    <Text style={[styles.title, t.text]}>Create Tenant Account</Text>
                    <Text style={[styles.subtitle, t.subtext]}>Sign up to view dues and pay rent.</Text>

                    <View style={[styles.card, t.card]}>
                        {error ? <Text style={styles.error}>⚠️ {error}</Text> : null}
                        <TextInput style={[styles.input, t.input]} placeholder="Full name" placeholderTextColor={t.ph} value={form.name} onChangeText={set('name')} />
                        <TextInput style={[styles.input, t.input]} placeholder="Email address" placeholderTextColor={t.ph} autoCapitalize="none" keyboardType="email-address" value={form.email} onChangeText={set('email')} />
                        <TextInput style={[styles.input, t.input]} placeholder="Phone number" placeholderTextColor={t.ph} keyboardType="phone-pad" value={form.phone} onChangeText={set('phone')} />
                        <TextInput style={[styles.input, t.input]} placeholder="Password" placeholderTextColor={t.ph} secureTextEntry value={form.password} onChangeText={set('password')} />
                        <TextInput style={[styles.input, t.input]} placeholder="Confirm password" placeholderTextColor={t.ph} secureTextEntry value={form.confirm} onChangeText={set('confirm')} />
                        <TouchableOpacity style={[styles.button, loading && styles.disabled]} onPress={handleRegister} disabled={loading}>
                            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create Account</Text>}
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity onPress={() => navigation.replace('TenantLogin')} style={styles.linkRow}>
                        <Text style={[styles.linkMuted, t.subtext]}>Already have an account? </Text>
                        <Text style={styles.link}>Sign In</Text>
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
    title: { fontSize: 28, fontWeight: '800', textAlign: 'center' },
    subtitle: { fontSize: 15, textAlign: 'center', marginTop: 6, marginBottom: 22 },
    card: { borderRadius: 18, padding: 20, borderWidth: 1 },
    input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, marginBottom: 12 },
    button: { backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
    disabled: { opacity: 0.6 },
    buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    error: { color: '#EF4444', marginBottom: 12, fontWeight: '600' },
    linkRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 22 },
    linkMuted: { fontSize: 15 },
    link: { color: '#2563EB', fontWeight: '800', fontSize: 15 }
});

const light = StyleSheet.create({
    container: { backgroundColor: '#F8FAFC' }, text: { color: '#0F172A' }, subtext: { color: '#64748B' },
    card: { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0' }, input: { backgroundColor: '#FFFFFF', color: '#0F172A', borderColor: '#E2E8F0' }, ph: '#94A3B8'
});
const dark = StyleSheet.create({
    container: { backgroundColor: '#09090B' }, text: { color: '#F8FAFC' }, subtext: { color: '#94A3B8' },
    card: { backgroundColor: '#18181B', borderColor: '#27272A' }, input: { backgroundColor: '#0F0F12', color: '#F8FAFC', borderColor: '#334155' }, ph: '#64748B'
});
