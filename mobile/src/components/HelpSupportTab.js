// File: mobile/src/components/HelpSupportTab.js
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, withAlpha } from '../theme';
import { GlassView, GlassCard } from '../ui';

// Reusable FAQ Accordion Component
const FAQItem = ({ question, answer, isDark }) => {
    const t = useTheme();
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <View style={[styles.faqContainer, { borderBottomColor: t.colors.border }]}>
            <TouchableOpacity
                style={styles.faqQuestionRow}
                onPress={() => setIsExpanded(!isExpanded)}
                activeOpacity={0.7}
            >
                <Text style={[styles.faqQuestion, { color: t.colors.text }]}>
                    {question}
                </Text>
                <Ionicons
                    name={isExpanded ? "chevron-up" : "chevron-down"}
                    size={20}
                    color={t.colors.textMuted}
                />
            </TouchableOpacity>

            {isExpanded && (
                <Text style={[styles.faqAnswer, { color: t.colors.textMuted }]}>
                    {answer}
                </Text>
            )}
        </View>
    );
};

export default function HelpSupportTab({ isDark }) {
    const t = useTheme();

    const handleEmailSupport = () => {
        // Opens the native email app
        Linking.openURL('mailto:support@tenantpro.com?subject=Need Help with TenantPro').catch(() => {
            Alert.alert("Error", "Could not open email app.");
        });
    };

    const handleCallSupport = () => {
        // Opens the native phone dialer
        Linking.openURL('tel:+919876543210').catch(() => {
            Alert.alert("Error", "Could not open phone dialer.");
        });
    };

    return (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

            {/* --- QUICK CONTACT BLOCKS --- */}
            <View style={styles.contactGrid}>
                {/* Email Block */}
                <TouchableOpacity style={[styles.contactBlock, t.shadows.sm]} activeOpacity={0.8} onPress={handleEmailSupport}>
                    <GlassView radius={t.radii.xl} style={styles.contactGradient}>
                        <View style={[styles.iconWrapper, { backgroundColor: withAlpha(t.colors.primary, 0.15) }]}>
                            <Ionicons name="mail" size={24} color={t.colors.primary} />
                        </View>
                        <Text style={[styles.contactTitle, { color: t.colors.text }]}>Email Us</Text>
                        <Text style={[styles.contactSubtitle, { color: t.colors.textMuted }]}>Usually replies in 2h</Text>
                    </GlassView>
                </TouchableOpacity>

                {/* Phone Block */}
                <TouchableOpacity style={[styles.contactBlock, t.shadows.sm]} activeOpacity={0.8} onPress={handleCallSupport}>
                    <GlassView radius={t.radii.xl} style={styles.contactGradient}>
                        <View style={[styles.iconWrapper, { backgroundColor: withAlpha(t.colors.success, 0.15) }]}>
                            <Ionicons name="call" size={24} color={t.colors.success} />
                        </View>
                        <Text style={[styles.contactTitle, { color: t.colors.text }]}>Call Us</Text>
                        <Text style={[styles.contactSubtitle, { color: t.colors.textMuted }]}>Mon-Fri, 9am-6pm</Text>
                    </GlassView>
                </TouchableOpacity>
            </View>

            {/* --- FAQ CARD --- */}
            <GlassCard padding={20} radius={24} elevation="sm" style={styles.sectionCard}>
                <Text style={[styles.sectionHeader, { color: t.colors.primary }]}>Frequently Asked Questions</Text>

                <FAQItem
                    isDark={isDark}
                    question="How do I add a new property?"
                    answer="You can add a new property by navigating to the 'My Properties' tab from the sidebar menu and tapping the '+ Add Property' button in the top right corner."
                />
                <FAQItem
                    isDark={isDark}
                    question="Can I change my registered email?"
                    answer="Currently, email changes must be processed by our support team for security reasons. Please tap 'Email Us' above to submit a request."
                />
                <FAQItem
                    isDark={isDark}
                    question="How is tenant data secured?"
                    answer="All tenant data is encrypted both in transit and at rest using industry-standard AES-256 encryption. We never share your data with third parties."
                />
                <FAQItem
                    isDark={isDark}
                    question="What happens if I delete my account?"
                    answer="Deleting your account will permanently erase all your properties, tenant data, and transaction history. This action cannot be reversed."
                />
            </GlassCard>

            {/* --- ADDITIONAL RESOURCES --- */}
            <GlassCard padding={20} radius={24} elevation="sm" style={[styles.sectionCard, { marginBottom: 40 }]}>
                <Text style={[styles.sectionHeader, { color: t.colors.primary }]}>Additional Resources</Text>

                <TouchableOpacity style={styles.resourceRow} onPress={() => Alert.alert("Coming Soon", "Opening User Guide...")}>
                    <Ionicons name="book-outline" size={22} color={t.colors.textMuted} />
                    <Text style={[styles.resourceText, { color: t.colors.text }]}>Complete User Guide</Text>
                    <Ionicons name="arrow-forward" size={18} color={t.colors.textFaint} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.resourceRow} onPress={() => Alert.alert("Coming Soon", "Opening Video Tutorials...")}>
                    <Ionicons name="play-circle-outline" size={22} color={t.colors.textMuted} />
                    <Text style={[styles.resourceText, { color: t.colors.text }]}>Video Tutorials</Text>
                    <Ionicons name="arrow-forward" size={18} color={t.colors.textFaint} />
                </TouchableOpacity>
            </GlassCard>

            <View style={{ height: 100 }} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    scrollContent: { paddingHorizontal: 20, paddingTop: 10 },

    headerContainer: { marginBottom: 25 },
    pageTitle: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginBottom: 4 },
    pageSubtitle: { fontSize: 15, fontWeight: '500' },

    // Contact Grid
    contactGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 25 },
    contactBlock: { width: '48%', borderRadius: 20 },
    contactGradient: { padding: 20, borderRadius: 20, alignItems: 'center' },
    iconWrapper: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
    contactTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
    contactSubtitle: { fontSize: 11, fontWeight: '500' },

    // Cards — padding/radius now live on GlassCard props so the glass layers clip correctly.
    sectionCard: { marginBottom: 20 },
    sectionHeader: { fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 15 },

    // FAQ Accordion
    faqContainer: { borderBottomWidth: 1, paddingVertical: 12 },
    faqQuestionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    faqQuestion: { fontSize: 15, fontWeight: '600', flex: 1, paddingRight: 10, lineHeight: 22 },
    faqAnswer: { fontSize: 14, marginTop: 8, lineHeight: 22, opacity: 0.9 },

    // Resources
    resourceRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'transparent' },
    resourceText: { flex: 1, fontSize: 16, fontWeight: '600', marginLeft: 12 },
});
