// File: mobile/src/components/HelpSupportTab.js
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

// Reusable FAQ Accordion Component
const FAQItem = ({ question, answer, isDark }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <View style={[styles.faqContainer, isDark ? styles.darkDivider : styles.lightDivider]}>
            <TouchableOpacity 
                style={styles.faqQuestionRow} 
                onPress={() => setIsExpanded(!isExpanded)} 
                activeOpacity={0.7}
            >
                <Text style={[styles.faqQuestion, isDark ? styles.darkText : styles.lightText]}>
                    {question}
                </Text>
                <Ionicons 
                    name={isExpanded ? "chevron-up" : "chevron-down"} 
                    size={20} 
                    color={isDark ? '#94A3B8' : '#64748B'} 
                />
            </TouchableOpacity>
            
            {isExpanded && (
                <Text style={[styles.faqAnswer, isDark ? styles.darkSubText : styles.lightSubText]}>
                    {answer}
                </Text>
            )}
        </View>
    );
};

export default function HelpSupportTab({ isDark }) {
    
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
                <TouchableOpacity style={styles.contactBlock} activeOpacity={0.8} onPress={handleEmailSupport}>
                    <LinearGradient colors={isDark ? ['#1E293B', '#0F172A'] : ['#F1F5F9', '#E2E8F0']} style={styles.contactGradient}>
                        <View style={[styles.iconWrapper, { backgroundColor: 'rgba(99, 102, 241, 0.15)' }]}>
                            <Ionicons name="mail" size={24} color="#6366F1" />
                        </View>
                        <Text style={[styles.contactTitle, isDark ? styles.darkText : styles.lightText]}>Email Us</Text>
                        <Text style={[styles.contactSubtitle, isDark ? styles.darkSubText : styles.lightSubText]}>Usually replies in 2h</Text>
                    </LinearGradient>
                </TouchableOpacity>

                {/* Phone Block */}
                <TouchableOpacity style={styles.contactBlock} activeOpacity={0.8} onPress={handleCallSupport}>
                    <LinearGradient colors={isDark ? ['#1E293B', '#0F172A'] : ['#F1F5F9', '#E2E8F0']} style={styles.contactGradient}>
                        <View style={[styles.iconWrapper, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                            <Ionicons name="call" size={24} color="#10B981" />
                        </View>
                        <Text style={[styles.contactTitle, isDark ? styles.darkText : styles.lightText]}>Call Us</Text>
                        <Text style={[styles.contactSubtitle, isDark ? styles.darkSubText : styles.lightSubText]}>Mon-Fri, 9am-6pm</Text>
                    </LinearGradient>
                </TouchableOpacity>
            </View>

            {/* --- FAQ CARD --- */}
            <View style={[styles.sectionCard, isDark ? styles.darkCard : styles.lightCard]}>
                <Text style={styles.sectionHeader}>Frequently Asked Questions</Text>
                
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
            </View>

            {/* --- ADDITIONAL RESOURCES --- */}
            <View style={[styles.sectionCard, isDark ? styles.darkCard : styles.lightCard, { marginBottom: 40 }]}>
                <Text style={styles.sectionHeader}>Additional Resources</Text>
                
                <TouchableOpacity style={styles.resourceRow} onPress={() => Alert.alert("Coming Soon", "Opening User Guide...")}>
                    <Ionicons name="book-outline" size={22} color={isDark ? '#94A3B8' : '#64748B'} />
                    <Text style={[styles.resourceText, isDark ? styles.darkText : styles.lightText]}>Complete User Guide</Text>
                    <Ionicons name="arrow-forward" size={18} color={isDark ? '#475569' : '#CBD5E1'} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.resourceRow} onPress={() => Alert.alert("Coming Soon", "Opening Video Tutorials...")}>
                    <Ionicons name="play-circle-outline" size={22} color={isDark ? '#94A3B8' : '#64748B'} />
                    <Text style={[styles.resourceText, isDark ? styles.darkText : styles.lightText]}>Video Tutorials</Text>
                    <Ionicons name="arrow-forward" size={18} color={isDark ? '#475569' : '#CBD5E1'} />
                </TouchableOpacity>
            </View>

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
    contactBlock: { width: '48%', borderRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
    contactGradient: { padding: 20, borderRadius: 20, alignItems: 'center' },
    iconWrapper: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
    contactTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
    contactSubtitle: { fontSize: 11, fontWeight: '500' },

    // Cards
    sectionCard: { padding: 20, borderRadius: 24, marginBottom: 20 },
    lightCard: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 },
    darkCard: { backgroundColor: '#151A25' },
    sectionHeader: { fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 15, color: '#6366F1' },

    // FAQ Accordion
    faqContainer: { borderBottomWidth: 1, paddingVertical: 12 },
    faqQuestionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    faqQuestion: { fontSize: 15, fontWeight: '600', flex: 1, paddingRight: 10, lineHeight: 22 },
    faqAnswer: { fontSize: 14, marginTop: 8, lineHeight: 22, opacity: 0.9 },

    // Resources
    resourceRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'transparent' },
    resourceText: { flex: 1, fontSize: 16, fontWeight: '600', marginLeft: 12 },

    // Theme Colors
    lightText: { color: '#0F172A' }, darkText: { color: '#FFFFFF' },
    lightSubText: { color: '#64748B' }, darkSubText: { color: '#94A3B8' },
    lightDivider: { borderBottomColor: '#F1F5F9' }, darkDivider: { borderBottomColor: '#1E293B' },
});