// File: mobile/src/components/TermsTab.js
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function TermsTab({ isDark }) {
    // Reusable component for legal sections to keep the code clean
    const LegalSection = ({ title, content }) => (
        <View style={styles.sectionContainer}>
            <Text style={[styles.sectionTitle, isDark ? styles.darkText : styles.lightText]}>
                {title}
            </Text>
            <Text style={[styles.sectionText, isDark ? styles.darkSubText : styles.lightSubText]}>
                {content}
            </Text>
        </View>
    );

    return (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            
            {/* Document Content */}
            <View style={[styles.documentCard, isDark ? styles.darkCard : styles.lightCard]}>
                
                {/* Sleek "Last Updated" Badge */}
                <View style={styles.badgeContainer}>
                    <Ionicons name="time-outline" size={14} color="#6366F1" style={{ marginRight: 4 }} />
                    <Text style={styles.badgeText}>Last Updated: March 2026</Text>
                </View>

                <Text style={[styles.introText, isDark ? styles.darkSubText : styles.lightSubText]}>
                    Please read these terms carefully before using the TenantPro application. By using our app, you agree to be bound by these terms and conditions.
                </Text>

                <View style={[styles.divider, isDark ? styles.darkDivider : styles.lightDivider]} />

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

            </View>

            <View style={{ height: 100 }} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    scrollContent: { paddingHorizontal: 20, paddingTop: 15 },
    
    // Card holding the text
    documentCard: { padding: 25, borderRadius: 24, marginBottom: 20 },
    lightCard: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 },
    darkCard: { backgroundColor: '#151A25' },

    // Date Badge
    badgeContainer: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        alignSelf: 'flex-start', 
        backgroundColor: 'rgba(99, 102, 241, 0.1)', 
        paddingVertical: 6, 
        paddingHorizontal: 12, 
        borderRadius: 12, 
        marginBottom: 20 
    },
    badgeText: { fontSize: 12, fontWeight: '700', color: '#6366F1', textTransform: 'uppercase', letterSpacing: 0.5 },

    introText: { fontSize: 15, lineHeight: 24, fontStyle: 'italic' },

    // Subtle Divider
    divider: { height: 1, marginVertical: 25 },
    lightDivider: { backgroundColor: '#E2E8F0' },
    darkDivider: { backgroundColor: '#1E293B' },

    // Legal Sections
    sectionContainer: { marginBottom: 25 },
    sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8, letterSpacing: 0.3 },
    sectionText: { fontSize: 15, lineHeight: 24, opacity: 0.9 },

    // Theme Colors
    lightText: { color: '#0F172A' }, darkText: { color: '#FFFFFF' },
    lightSubText: { color: '#475569' }, darkSubText: { color: '#94A3B8' },
});