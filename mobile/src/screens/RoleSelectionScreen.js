// File: mobile/src/screens/RoleSelectionScreen.js
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, useColorScheme } from 'react-native';

export default function RoleSelectionScreen({ navigation }) {
    const isDark = useColorScheme() === 'dark';
    const t = isDark ? dark : light;

    return (
        <View style={[styles.container, t.container]}>
            <View style={styles.header}>
                <Image source={require('../../assets/logo.png')} style={styles.logo} />
                <Text style={[styles.title, t.text]}>TenantPro</Text>
                <Text style={[styles.subtitle, t.subtext]}>How will you use TenantPro?</Text>
            </View>

            <View style={styles.cards}>
                <TouchableOpacity
                    style={[styles.card, t.card]}
                    activeOpacity={0.85}
                    onPress={() => navigation.navigate('Login')}
                >
                    <Text style={styles.emoji}>🏠</Text>
                    <Text style={[styles.cardTitle, t.text]}>I'm a Landlord</Text>
                    <Text style={[styles.cardDesc, t.subtext]}>Manage properties, rooms, tenants and rent.</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.card, t.card]}
                    activeOpacity={0.85}
                    onPress={() => navigation.navigate('TenantLogin')}
                >
                    <Text style={styles.emoji}>🧑‍💼</Text>
                    <Text style={[styles.cardTitle, t.text]}>I'm a Tenant</Text>
                    <Text style={[styles.cardDesc, t.subtext]}>View your dues, pay rent and raise requests.</Text>
                </TouchableOpacity>
            </View>

            <Text style={[styles.footer, t.subtext]}>You can switch anytime by signing out.</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 24, justifyContent: 'center' },
    header: { alignItems: 'center', marginBottom: 40 },
    logo: { width: 76, height: 76, borderRadius: 20, marginBottom: 16 },
    title: { fontSize: 34, fontWeight: '900', letterSpacing: -0.5 },
    subtitle: { fontSize: 16, marginTop: 6 },
    cards: { gap: 16 },
    card: { borderRadius: 20, padding: 24, borderWidth: 1, alignItems: 'flex-start' },
    emoji: { fontSize: 34, marginBottom: 10 },
    cardTitle: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
    cardDesc: { fontSize: 14, lineHeight: 20 },
    footer: { textAlign: 'center', marginTop: 30, fontSize: 13 }
});

const light = StyleSheet.create({
    container: { backgroundColor: '#F8FAFC' },
    text: { color: '#0F172A' },
    subtext: { color: '#64748B' },
    card: { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0' }
});
const dark = StyleSheet.create({
    container: { backgroundColor: '#09090B' },
    text: { color: '#F8FAFC' },
    subtext: { color: '#94A3B8' },
    card: { backgroundColor: '#18181B', borderColor: '#27272A' }
});
