// File: mobile/src/components/TermsTab.js
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, withAlpha } from '../theme';
import { GlassCard } from '../ui';

export default function TermsTab({ isDark }) {
    const t = useTheme();

    // Reusable component for legal sections to keep the code clean
    const LegalSection = ({ title, content }) => (
        <View style={styles.sectionContainer}>
            <Text style={[styles.sectionTitle, { color: t.colors.text }]}>
                {title}
            </Text>
            <Text style={[styles.sectionText, { color: t.colors.textMuted }]}>
                {content}
            </Text>
        </View>
    );

    return (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

            {/* Document Content */}
            <GlassCard
                style={styles.documentCard}
                padding={25}
                radius={24}
                elevation="sm"
            >

                {/* Sleek "Last Updated" Badge */}
                <View style={[styles.badgeContainer, { backgroundColor: withAlpha(t.colors.primary, 0.1) }]}>
                    <Ionicons name="time-outline" size={14} color={t.colors.primary} style={{ marginRight: 4 }} />
                    <Text style={[styles.badgeText, { color: t.colors.primary }]}>Last Updated: March 2026</Text>
                </View>

                <Text style={[styles.introText, { color: t.colors.textMuted }]}>
                    Please read these terms carefully before using the TenantPro application. By using our app, you agree to be bound by these terms and conditions.
                </Text>

                <View style={[styles.divider, { backgroundColor: t.colors.border }]} />

                <LegalSection
                    title="1. Acceptance of Terms"
                    content="By accessing and using TenantPro, you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service."
                />

                <LegalSection
                    title="2. User Responsibilities"
                    content="You are responsible for maintaining the confidentiality of your account and password. You agree to accept responsibility for all activities that occur under your account. You must notify us immediately upon becoming aware of any breach of security or unauthorized use of your account."
                />

                <LegalSection
                    title="3. Data & Privacy"
                    content="We take your privacy seriously. Tenant data, including contact information and transaction history, is encrypted and securely stored. We will never sell your personal or tenant data to third-party services. Please review our Privacy Policy for full details."
                />

                <LegalSection
                    title="4. Prohibited Activities"
                    content="You agree not to use the application for any unlawful purpose or in any way that might harm, damage, or disparage any other party. Abuse of the system, including exploiting bugs or attempting to bypass security measures, will result in immediate account termination."
                />

                <LegalSection
                    title="5. Modifications to Service"
                    content="TenantPro reserves the right to modify or discontinue, temporarily or permanently, the service with or without notice to the user. We shall not be liable to you or any third party for any modification, suspension, or discontinuance of the service."
                />

                <LegalSection
                    title="6. Contact Information"
                    content="If you have any questions regarding these Terms of Service, please contact us via the Help & Support tab in the application."
                />

            </GlassCard>

            <View style={{ height: 100 }} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    scrollContent: { paddingHorizontal: 20, paddingTop: 15 },

    // Card holding the text
    documentCard: { marginBottom: 20 },

    // Date Badge
    badgeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 12,
        marginBottom: 20
    },
    badgeText: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

    introText: { fontSize: 15, lineHeight: 24, fontStyle: 'italic' },

    // Subtle Divider
    divider: { height: 1, marginVertical: 25 },

    // Legal Sections
    sectionContainer: { marginBottom: 25 },
    sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8, letterSpacing: 0.3 },
    sectionText: { fontSize: 15, lineHeight: 24, opacity: 0.9 },
});
