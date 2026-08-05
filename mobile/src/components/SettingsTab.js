// File: mobile/src/components/SettingsTab.js
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, withAlpha } from '../theme';
import { GlassCard, GlassView } from '../ui';

// --- MOVED OUTSIDE: Reusable Component: Standard Clickable Row ---
const SettingsRow = ({ icon, title, subtitle, color, onPress, isDestructive, isDark }) => {
    const t = useTheme();
    const iconColor = color || t.colors.textMuted;
    const textColor = isDestructive ? t.colors.danger : t.colors.text;

    return (
        <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
            <View style={[styles.iconBox, { backgroundColor: t.colors.surfaceAlt, borderRadius: t.radii.md }]}>
                <Ionicons name={icon} size={20} color={isDestructive ? t.colors.danger : iconColor} />
            </View>
            <View style={styles.rowTextContainer}>
                <Text style={[styles.rowTitle, { color: textColor }]}>{title}</Text>
                {subtitle && <Text style={[styles.rowSubtitle, { color: t.colors.textMuted }]}>{subtitle}</Text>}
            </View>
            <Ionicons name="chevron-forward" size={20} color={t.colors.textFaint} />
        </TouchableOpacity>
    );
};

// --- MOVED OUTSIDE: Reusable Component: Toggle Switch Row ---
const SettingsToggle = ({ icon, title, value, onValueChange, isDark }) => {
    const t = useTheme();

    return (
        <View style={styles.row}>
            <View style={[styles.iconBox, { backgroundColor: t.colors.surfaceAlt, borderRadius: t.radii.md }]}>
                <Ionicons name={icon} size={20} color={t.colors.textMuted} />
            </View>
            <View style={styles.rowTextContainer}>
                <Text style={[styles.rowTitle, { color: t.colors.text }]}>{title}</Text>
            </View>
            <Switch
                trackColor={{ false: t.colors.surfaceHigh, true: t.colors.primary }}
                thumbColor={Platform.OS === 'android' ? (value ? t.colors.onPrimary : t.colors.surface) : undefined}
                ios_backgroundColor={t.colors.surfaceHigh}
                onValueChange={onValueChange}
                value={value}
            />
        </View>
    );
};

// --- Appearance: theme picker segmented control -------------------------------
// Sits inside a GlassCard, so blur={false} — nested blur costs GPU for no gain.
const THEME_OPTIONS = [
    { value: 'system', label: 'System', icon: 'phone-portrait-outline' },
    { value: 'light', label: 'Light', icon: 'sunny-outline' },
    { value: 'dark', label: 'Dark', icon: 'moon-outline' }
];

const ThemePicker = () => {
    const t = useTheme();

    return (
        <GlassView blur={false} radius={t.radii.lg} style={styles.segmentTrack}>
            <View style={styles.segmentRow}>
                {THEME_OPTIONS.map((opt) => {
                    const active = t.preference === opt.value;
                    return (
                        <TouchableOpacity
                            key={opt.value}
                            style={[
                                styles.segment,
                                {
                                    borderRadius: t.radii.md,
                                    backgroundColor: active ? withAlpha(t.colors.primary, 0.18) : 'transparent',
                                    borderColor: active ? t.colors.borderStrong : 'transparent'
                                }
                            ]}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            onPress={() => t.setMode(opt.value)}
                        >
                            <Ionicons
                                name={active ? 'checkmark-circle' : opt.icon}
                                size={18}
                                color={active ? t.colors.primary : t.colors.textMuted}
                            />
                            <Text
                                style={[
                                    styles.segmentLabel,
                                    { color: active ? t.colors.primary : t.colors.textMuted }
                                ]}
                            >
                                {opt.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </GlassView>
    );
};

export default function SettingsTab({ isDark, setActiveTab }) {
    const t = useTheme();

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
            <GlassCard padding={20} radius={24} elevation="sm" style={styles.sectionCard}>
                <Text style={[styles.sectionHeader, { color: t.colors.text }]}>Preferences</Text>

                <SettingsToggle
                    icon="notifications-outline"
                    title="Push Notifications"
                    value={pushEnabled}
                    onValueChange={setPushEnabled}
                    isDark={isDark} // Passed prop
                />
                <View style={[styles.divider, { backgroundColor: t.colors.border }]} />

                <SettingsToggle
                    icon="mail-outline"
                    title="Email Alerts"
                    value={emailEnabled}
                    onValueChange={setEmailEnabled}
                    isDark={isDark} // Passed prop
                />
                <View style={[styles.divider, { backgroundColor: t.colors.border }]} />

                <SettingsRow
                    icon="globe-outline"
                    title="Language"
                    subtitle="English (US)"
                    onPress={() => handleFeaturePress('Language')}
                    isDark={isDark} // Passed prop
                />
            </GlassCard>

            {/* --- APPEARANCE CARD --- */}
            <GlassCard padding={20} radius={24} elevation="sm" style={styles.sectionCard}>
                <Text style={[styles.sectionHeader, { color: t.colors.text }]}>Appearance</Text>
                <ThemePicker />
            </GlassCard>

            {/* --- SECURITY CARD --- */}
            <GlassCard padding={20} radius={24} elevation="sm" style={styles.sectionCard}>
                <Text style={[styles.sectionHeader, { color: t.colors.text }]}>Security</Text>

                <SettingsToggle
                    icon="finger-print-outline"
                    title={Platform.OS === 'ios' ? "Face ID / Touch ID" : "Biometric Login"}
                    value={biometricsEnabled}
                    onValueChange={setBiometricsEnabled}
                    isDark={isDark} // Passed prop
                />
                <View style={[styles.divider, { backgroundColor: t.colors.border }]} />

                <SettingsRow
                    icon="shield-checkmark-outline"
                    title="Two-Factor Authentication"
                    subtitle="Recommended"
                    color={t.colors.success}
                    onPress={() => handleFeaturePress('2FA')}
                    isDark={isDark} // Passed prop
                />
            </GlassCard>

            {/* --- SUPPORT & ABOUT CARD --- */}
            <GlassCard padding={20} radius={24} elevation="sm" style={styles.sectionCard}>
                <Text style={[styles.sectionHeader, { color: t.colors.text }]}>About</Text>

                <SettingsRow
                    icon="help-circle-outline"
                    title="Help Center & FAQ"
                    onPress={() => setActiveTab('HelpSupport')}
                    isDark={isDark}
                />
                <View style={[styles.divider, { backgroundColor: t.colors.border }]} />

                <SettingsRow
                    icon="document-text-outline"
                    title="Terms of Service"
                    onPress={() => setActiveTab('Terms')}
                    isDark={isDark}
                />
                <View style={[styles.divider, { backgroundColor: t.colors.border }]} />

                <SettingsRow icon="information-circle-outline" title="App Version" subtitle="v1.0.0 (Build 42)" onPress={() => { }} isDark={isDark} />
            </GlassCard>

            {/* --- DANGER ZONE --- */}
            <GlassCard padding={20} radius={24} elevation="sm" style={[styles.sectionCard, { marginBottom: 40 }]}>
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
            </GlassCard>

            <View style={{ height: 100 }} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    scrollContent: { paddingHorizontal: 20, paddingTop: 10 },

    // Cards — padding/radius now travel as GlassCard props so the frosted pane
    // (not the outer shadow wrapper) owns them.
    sectionCard: { marginBottom: 20 },
    sectionHeader: { fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 15 },

    // Rows
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
    iconBox: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', marginRight: 15 },

    rowTextContainer: { flex: 1, justifyContent: 'center' },
    rowTitle: { fontSize: 16, fontWeight: '600', letterSpacing: 0.2 },
    rowSubtitle: { fontSize: 13, marginTop: 2, fontWeight: '500' },

    // Dividers
    divider: { height: 1, marginVertical: 10, marginLeft: 55 },

    // Appearance segmented control
    segmentTrack: { width: '100%', padding: 4 },
    segmentRow: { flexDirection: 'row' },
    segment: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderWidth: 1 },
    segmentLabel: { fontSize: 14, fontWeight: '700', letterSpacing: 0.2, marginLeft: 6 },
});
