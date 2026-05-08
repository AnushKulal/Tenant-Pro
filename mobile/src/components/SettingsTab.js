// File: mobile/src/components/SettingsTab.js
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// --- MOVED OUTSIDE: Reusable Component: Standard Clickable Row ---
const SettingsRow = ({ icon, title, subtitle, color, onPress, isDestructive, isDark }) => {
    const iconColor = color || (isDark ? '#94A3B8' : '#64748B');
    const textColor = isDestructive ? '#EF4444' : (isDark ? '#FFFFFF' : '#0F172A');

    return (
        <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
            <View style={[styles.iconBox, isDark ? styles.darkIconBox : styles.lightIconBox]}>
                <Ionicons name={icon} size={20} color={isDestructive ? '#EF4444' : iconColor} />
            </View>
            <View style={styles.rowTextContainer}>
                <Text style={[styles.rowTitle, { color: textColor }]}>{title}</Text>
                {subtitle && <Text style={[styles.rowSubtitle, isDark ? styles.darkSubText : styles.lightSubText]}>{subtitle}</Text>}
            </View>
            <Ionicons name="chevron-forward" size={20} color={isDark ? '#475569' : '#CBD5E1'} />
        </TouchableOpacity>
    );
};

// --- MOVED OUTSIDE: Reusable Component: Toggle Switch Row ---
const SettingsToggle = ({ icon, title, value, onValueChange, isDark }) => (
    <View style={styles.row}>
        <View style={[styles.iconBox, isDark ? styles.darkIconBox : styles.lightIconBox]}>
            <Ionicons name={icon} size={20} color={isDark ? '#94A3B8' : '#64748B'} />
        </View>
        <View style={styles.rowTextContainer}>
            <Text style={[styles.rowTitle, isDark ? styles.darkText : styles.lightText]}>{title}</Text>
        </View>
        <Switch
            trackColor={{ false: isDark ? '#334155' : '#E2E8F0', true: '#6366F1' }}
            thumbColor={Platform.OS === 'android' ? (value ? '#FFFFFF' : '#F8FAFC') : undefined}
            ios_backgroundColor={isDark ? '#334155' : '#E2E8F0'}
            onValueChange={onValueChange}
            value={value}
        />
    </View>
);

export default function SettingsTab({ isDark, setActiveTab }) {
    // States for the toggle switches
    const [pushEnabled, setPushEnabled] = useState(true);
    const [emailEnabled, setEmailEnabled] = useState(false);
    const [biometricsEnabled, setBiometricsEnabled] = useState(true);

    const handleFeaturePress = (featureName) => {
        Alert.alert("Coming Soon", `${featureName} settings will be available in the next update.`);
    };

    return (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {/* --- PREFERENCES CARD --- */}
            <View style={[styles.sectionCard, isDark ? styles.darkCard : styles.lightCard]}>
                <Text style={[styles.sectionHeader, isDark ? styles.darkText : styles.lightText]}>Preferences</Text>

                <SettingsToggle
                    icon="notifications-outline"
                    title="Push Notifications"
                    value={pushEnabled}
                    onValueChange={setPushEnabled}
                    isDark={isDark} // Passed prop
                />
                <View style={[styles.divider, isDark ? styles.darkDivider : styles.lightDivider]} />

                <SettingsToggle
                    icon="mail-outline"
                    title="Email Alerts"
                    value={emailEnabled}
                    onValueChange={setEmailEnabled}
                    isDark={isDark} // Passed prop
                />
                <View style={[styles.divider, isDark ? styles.darkDivider : styles.lightDivider]} />

                <SettingsRow
                    icon="globe-outline"
                    title="Language"
                    subtitle="English (US)"
                    onPress={() => handleFeaturePress('Language')}
                    isDark={isDark} // Passed prop
                />
            </View>

            {/* --- SECURITY CARD --- */}
            <View style={[styles.sectionCard, isDark ? styles.darkCard : styles.lightCard]}>
                <Text style={[styles.sectionHeader, isDark ? styles.darkText : styles.lightText]}>Security</Text>

                <SettingsToggle
                    icon="finger-print-outline"
                    title={Platform.OS === 'ios' ? "Face ID / Touch ID" : "Biometric Login"}
                    value={biometricsEnabled}
                    onValueChange={setBiometricsEnabled}
                    isDark={isDark} // Passed prop
                />
                <View style={[styles.divider, isDark ? styles.darkDivider : styles.lightDivider]} />

                <SettingsRow
                    icon="shield-checkmark-outline"
                    title="Two-Factor Authentication"
                    subtitle="Recommended"
                    color="#10B981"
                    onPress={() => handleFeaturePress('2FA')}
                    isDark={isDark} // Passed prop
                />
            </View>

            {/* --- SUPPORT & ABOUT CARD --- */}
            <View style={[styles.sectionCard, isDark ? styles.darkCard : styles.lightCard]}>
                <Text style={[styles.sectionHeader, isDark ? styles.darkText : styles.lightText]}>About</Text>

                <SettingsRow
                    icon="help-circle-outline"
                    title="Help Center & FAQ"
                    onPress={() => setActiveTab('HelpSupport')}
                    isDark={isDark}
                />
                <View style={[styles.divider, isDark ? styles.darkDivider : styles.lightDivider]} />

                <SettingsRow
                    icon="document-text-outline"
                    title="Terms of Service"
                    onPress={() => setActiveTab('Terms')}
                    isDark={isDark}
                />
                <View style={[styles.divider, isDark ? styles.darkDivider : styles.lightDivider]} />

                <SettingsRow icon="information-circle-outline" title="App Version" subtitle="v1.0.0 (Build 42)" onPress={() => { }} isDark={isDark} />
            </View>

            {/* --- DANGER ZONE --- */}
            <View style={[styles.sectionCard, isDark ? styles.darkCard : styles.lightCard, { marginBottom: 40 }]}>
                <SettingsRow
                    icon="trash-outline"
                    title="Delete Account"
                    isDestructive={true}
                    isDark={isDark}
                    onPress={() => Alert.alert(
                        "Delete Account",
                        "Are you sure you want to permanently delete your account? This action cannot be undone.",
                        [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive" }]
                    )}
                />
            </View>

            <View style={{ height: 100 }} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    scrollContent: { paddingHorizontal: 20, paddingTop: 10 },

    // Cards
    sectionCard: { padding: 20, borderRadius: 24, marginBottom: 20 },
    lightCard: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 },
    darkCard: { backgroundColor: '#151A25' },
    sectionHeader: { fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 15, color: '#6366F1' },

    // Rows
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
    iconBox: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    lightIconBox: { backgroundColor: '#F1F5F9' },
    darkIconBox: { backgroundColor: '#1E293B' },

    rowTextContainer: { flex: 1, justifyContent: 'center' },
    rowTitle: { fontSize: 16, fontWeight: '600', letterSpacing: 0.2 },
    rowSubtitle: { fontSize: 13, marginTop: 2, fontWeight: '500' },

    // Dividers
    divider: { height: 1, marginVertical: 10, marginLeft: 55 },
    lightDivider: { backgroundColor: '#F1F5F9' },
    darkDivider: { backgroundColor: '#1E293B' },

    // Theme Colors
    lightText: { color: '#0F172A' }, darkText: { color: '#FFFFFF' },
    lightSubText: { color: '#64748B' }, darkSubText: { color: '#94A3B8' },
});