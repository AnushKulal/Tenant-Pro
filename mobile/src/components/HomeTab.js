// File: mobile/src/components/HomeTab.js
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Animated, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';
import { useTheme, withAlpha } from '../theme';
import { GlassView } from '../ui';

export default function HomeTab({ isDark, selectedProperty }) {
    const t = useTheme();

    const fadeAnimCards = useRef(new Animated.Value(0)).current;
    const fadeAnimChart = useRef(new Animated.Value(0)).current;
    const fadeAnimList = useRef(new Animated.Value(0)).current;

    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [stats, setStats] = useState({ activeTenants: 0, pendingDues: 0, vacantUnits: 0, rentCollected: 0 });
    const [chartData, setChartData] = useState([]);
    const [recentPayments, setRecentPayments] = useState([]); // ✨ NEW STATE

    const fetchDashboardData = async () => {
        try {
            const token = await AsyncStorage.getItem('userToken');
            const propId = selectedProperty?.id || 'all';

            const response = await client.get('/owner/dashboard', {
                headers: { Authorization: `Bearer ${token}` },
                params: { property_id: propId }
            });

            setStats(response.data.stats);
            setRecentPayments(response.data.recentPayments || []); // ✨ SET RECENT PAYMENTS

            // Normalize chart data to percentages (0-100) for the UI bars
            const rawChart = response.data.chart;
            const maxVal = Math.max(...rawChart.map(d => Number(d.value)), 1);
            const formattedChart = rawChart.map(d => ({
                month: d.month,
                value: (Number(d.value) / maxVal) * 100,
                actualRaw: Number(d.value)
            }));

            setChartData(formattedChart);

            // Trigger Entrance Animations
            fadeAnimCards.setValue(0);
            fadeAnimChart.setValue(0);
            fadeAnimList.setValue(0);
            Animated.stagger(150, [
                Animated.timing(fadeAnimCards, { toValue: 1, duration: 500, useNativeDriver: true }),
                Animated.timing(fadeAnimChart, { toValue: 1, duration: 500, useNativeDriver: true }),
                Animated.timing(fadeAnimList, { toValue: 1, duration: 500, useNativeDriver: true }),
            ]).start();

        } catch (error) {
            console.error("Error fetching dashboard:", error);
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        setIsLoading(true);
        fetchDashboardData();
    }, [selectedProperty]);

    const onRefresh = () => {
        setRefreshing(true);
        fetchDashboardData();
    };

    const formatCurrency = (amount) => {
        if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
        if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}k`;
        return `₹${amount}`;
    };

    const MetricCard = ({ title, value, icon, color, trend, trendUp }) => (
        <GlassView style={[styles.card, t.shadows.sm]} radius={t.radii.xl}>
            <View style={styles.cardHeaderRow}>
                <View style={[styles.iconBox, { backgroundColor: withAlpha(color, 0.13) }]}>
                    <Ionicons name={icon} size={22} color={color} />
                </View>
                {trend && (
                    <View style={[styles.trendBadge, { backgroundColor: withAlpha(trendUp ? t.colors.success : t.colors.danger, 0.12) }]}>
                        <Ionicons name={trendUp ? "trending-up" : "trending-down"} size={12} color={trendUp ? t.colors.success : t.colors.danger} />
                        <Text style={[styles.trendText, { color: trendUp ? t.colors.success : t.colors.danger }]}>{trend}</Text>
                    </View>
                )}
            </View>
            <Text style={[styles.cardTitle, { color: t.colors.textMuted }]}>{title}</Text>
            <Text style={[styles.cardValue, { color: t.colors.text }]}>{value}</Text>
        </GlassView>
    );

    if (isLoading && !refreshing) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color={t.colors.primary} />
            </View>
        );
    }

    return (
        <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.primary} />}
        >
            {/* DYNAMIC 2x2 Metric Grid */}
            <Animated.View style={{ opacity: fadeAnimCards }}>
                <Text style={[styles.sectionTitle, { color: t.colors.textMuted }]}>
                    Overview {selectedProperty?.id !== 'all' ? `(${selectedProperty?.name})` : ''}
                </Text>

                <View style={styles.cardsRow}>
                    <MetricCard title="Rent Collected" value={formatCurrency(stats.rentCollected)} icon="wallet-outline" color={t.colors.success} />
                    <MetricCard title="Pending Dues" value={formatCurrency(stats.pendingDues)} icon="alert-circle-outline" color={t.colors.danger} />
                </View>
                <View style={styles.cardsRow}>
                    <MetricCard title="Active Tenants" value={stats.activeTenants.toString()} icon="people-outline" color={t.colors.primaryAlt} />
                    <MetricCard title="Vacant Units" value={stats.vacantUnits.toString()} icon="key-outline" color={t.colors.warning} />
                </View>
            </Animated.View>

            {/* DYNAMIC REVENUE CHART */}
            <Animated.View style={{ opacity: fadeAnimChart }}>
                <GlassView style={[styles.chartContainer, t.shadows.sm]} radius={t.radii.xl}>
                    <View style={styles.chartHeader}>
                        <Text style={[styles.chartTitle, { color: t.colors.text }]}>Revenue (6 Months)</Text>
                    </View>

                    <View style={styles.chartBody}>
                        {chartData.length > 0 ? chartData.map((data, index) => (
                            <View key={index} style={styles.chartBarWrapper}>
                                {/* Track stays translucent so the glass behind it still shows through. */}
                                <View style={[styles.chartBarBackground, { backgroundColor: withAlpha(t.colors.textMuted, 0.15) }]}>
                                    <LinearGradient
                                        colors={t.colors.primaryGradient}
                                        style={[styles.chartBarFill, { height: `${data.value}%` }]}
                                    />
                                </View>
                                <Text style={[styles.chartLabel, { color: t.colors.textMuted }]}>{data.month}</Text>
                            </View>
                        )) : (
                            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 20 }}>
                                <Text style={{ color: t.colors.textMuted }}>No revenue data yet.</Text>
                            </View>
                        )}
                    </View>
                </GlassView>
            </Animated.View>

            {/* ✨ NEW: RECENT PAYMENTS LIST ✨ */}
            <Animated.View style={{ opacity: fadeAnimList, marginTop: 10 }}>
                <Text style={[styles.sectionTitle, { color: t.colors.textMuted }]}>Recent Payments</Text>

                <GlassView style={[styles.recentListContainer, t.shadows.sm]} radius={t.radii.xl}>
                    {recentPayments.length > 0 ? recentPayments.map((payment, index) => (
                        <View key={payment.id} style={[styles.paymentItem, index !== recentPayments.length - 1 && { borderBottomWidth: 1, borderBottomColor: t.colors.border }]}>

                            {/* Icon / Avatar */}
                            <View style={[styles.paymentIconBox, { backgroundColor: withAlpha(t.colors.success, 0.15) }]}>
                                <Ionicons name="arrow-down" size={16} color={t.colors.success} />
                            </View>

                            {/* Tenant Details */}
                            <View style={styles.paymentInfo}>
                                <Text style={[styles.paymentName, { color: t.colors.text }]} numberOfLines={1}>
                                    {payment.tenant_name}
                                </Text>
                                <Text style={[styles.paymentSub, { color: t.colors.textMuted }]}>
                                    Unit {payment.unit_number || 'N/A'} • {payment.payment_method}
                                </Text>
                            </View>

                            {/* Amount & Date */}
                            <View style={styles.paymentAmountBox}>
                                <Text style={[styles.paymentAmount, { color: t.colors.success }]}>+{formatCurrency(payment.amount_paid)}</Text>
                                <Text style={[styles.paymentDate, { color: t.colors.textMuted }]}>
                                    {new Date(payment.payment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                </Text>
                            </View>

                        </View>
                    )) : (
                        <View style={styles.emptyStateBox}>
                            <Ionicons name="receipt-outline" size={32} color={t.colors.textFaint} style={{ marginBottom: 8 }} />
                            <Text style={{ color: t.colors.textMuted }}>No payments recorded yet.</Text>
                        </View>
                    )}
                </GlassView>
            </Animated.View>

            <View style={{ height: 120 }} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    scrollContent: { paddingHorizontal: 20, paddingTop: 5, paddingBottom: 40 },
    sectionTitle: { fontSize: 13, fontWeight: '700', marginBottom: 12, letterSpacing: 1, textTransform: 'uppercase' },

    cardsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
    card: { flex: 1, padding: 16, borderRadius: 20 },
    cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
    iconBox: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    trendBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6 },
    trendText: { fontSize: 10, fontWeight: '700', marginLeft: 2 },
    cardTitle: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
    cardValue: { fontSize: 22, fontWeight: '800' },

    chartContainer: { padding: 20, borderRadius: 20, marginBottom: 15, marginTop: 5 },
    chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
    chartTitle: { fontSize: 15, fontWeight: '700' },
    chartBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 110, paddingHorizontal: 5 },
    chartBarWrapper: { alignItems: 'center' },
    chartBarBackground: { width: 14, height: 85, borderRadius: 7, justifyContent: 'flex-end', marginBottom: 8 },
    chartBarFill: { width: '100%', borderRadius: 7 },
    chartLabel: { fontSize: 11, fontWeight: '600' },

    // ✨ NEW STYLES FOR RECENT PAYMENTS ✨
    recentListContainer: { borderRadius: 20, overflow: 'hidden', paddingHorizontal: 16, paddingVertical: 8 },
    paymentItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
    paymentIconBox: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
    paymentInfo: { flex: 1, justifyContent: 'center' },
    paymentName: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
    paymentSub: { fontSize: 12, fontWeight: '500' },
    paymentAmountBox: { alignItems: 'flex-end', justifyContent: 'center' },
    paymentAmount: { fontSize: 15, fontWeight: '800', marginBottom: 2 },
    paymentDate: { fontSize: 11, fontWeight: '500' },
    emptyStateBox: { paddingVertical: 30, alignItems: 'center', justifyContent: 'center' }
});
