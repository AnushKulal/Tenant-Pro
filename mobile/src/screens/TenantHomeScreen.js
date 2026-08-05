// File: mobile/src/screens/TenantHomeScreen.js
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function TenantHomeScreen({ navigation }) {
    const isDark = useColorScheme() === 'dark';
    const t = isDark ? dark : light;
    const [tenant, setTenant] = useState(null);

    useEffect(() => {
        (async () => {
            const raw = await AsyncStorage.getItem('tenantData');
            if (raw) setTenant(JSON.parse(raw));
        })();
    }, []);

    const logout = async () => {
        await AsyncStorage.multiRemove(['tenantToken', 'tenantData']);
        navigation.replace('RoleSelection');
    };

    return (
        <View style={[styles.container, t.container]}>
            <View style={styles.header}>
                <Text style={[styles.hi, t.subtext]}>Welcome back,</Text>
                <Text style={[styles.name, t.text]}>{tenant?.name || 'Tenant'} 👋</Text>
            </View>

            <View style={[styles.card, t.card]}>
                <Text style={styles.badge}>Account created</Text>
                <Text style={[styles.cardTitle, t.text]}>You're not linked to a property yet</Text>
                <Text style={[styles.cardDesc, t.subtext]}>
                    Next, you'll find your building and request to join — your landlord approves it, and then
                    your rent, dues and payments show up right here.
                </Text>
                <Text style={[styles.soon, t.subtext]}>🔜 Coming soon: Find & join your property</Text>
            </View>

            <TouchableOpacity style={[styles.logout, t.card]} onPress={logout}>
                <Text style={styles.logoutText}>Sign out</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 24, justifyContent: 'center' },
    header: { marginBottom: 24 },
    hi: { fontSize: 15 },
    name: { fontSize: 28, fontWeight: '800', marginTop: 2 },
    card: { borderRadius: 20, padding: 24, borderWidth: 1 },
    badge: { alignSelf: 'flex-start', backgroundColor: '#DCFCE7', color: '#16A34A', fontWeight: '700', fontSize: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, marginBottom: 12, overflow: 'hidden' },
    cardTitle: { fontSize: 19, fontWeight: '800', marginBottom: 8 },
    cardDesc: { fontSize: 14, lineHeight: 21 },
    soon: { fontSize: 13, marginTop: 16, fontWeight: '600' },
    logout: { marginTop: 20, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1 },
    logoutText: { color: '#EF4444', fontWeight: '700', fontSize: 15 }
});

const light = StyleSheet.create({
    container: { backgroundColor: '#F8FAFC' }, text: { color: '#0F172A' }, subtext: { color: '#64748B' },
    card: { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0' }
});
const dark = StyleSheet.create({
    container: { backgroundColor: '#09090B' }, text: { color: '#F8FAFC' }, subtext: { color: '#94A3B8' },
    card: { backgroundColor: '#18181B', borderColor: '#27272A' }
});
