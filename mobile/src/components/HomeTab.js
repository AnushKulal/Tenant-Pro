// File: mobile/src/components/HomeTab.js
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Animated, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';

export default function HomeTab({ isDark, selectedProperty }) {
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
        <View style={[styles.card, isDark ? styles.darkCard : styles.lightCard]}>
            <View style={styles.cardHeaderRow}>
                <View style={[styles.iconBox, { backgroundColor: color + '20' }]}>
                    <Ionicons name={icon} size={22} color={color} />
                </View>
                {trend && (
                    <View style={[styles.trendBadge, { backgroundColor: trendUp ? '#10B98115' : '#EF444415' }]}>
                        <Ionicons name={trendUp ? "trending-up" : "trending-down"} size={12} color={trendUp ? "#10B981" : "#EF4444"} />
                        <Text style={[styles.trendText, { color: trendUp ? "#10B981" : "#EF4444" }]}>{trend}</Text>
                    </View>
                )}
            </View>
            <Text style={[styles.cardTitle, isDark ? styles.darkSubText : styles.lightSubText]}>{title}</Text>
            <Text style={[styles.cardValue, isDark ? styles.darkText : styles.lightText]}>{value}</Text>
        </View>
    );

    if (isLoading && !refreshing) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#6366F1" />
            </View>
        );
    }

    return (
        <ScrollView 
            showsVerticalScrollIndicator={false} 
            contentContainerStyle={styles.scrollContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />}
        >
            {/* DYNAMIC 2x2 Metric Grid */}
            <Animated.View style={{ opacity: fadeAnimCards }}>
                <Text style={[styles.sectionTitle, isDark ? styles.darkText : styles.lightText]}>
                    Overview {selectedProperty?.id !== 'all' ? `(${selectedProperty?.name})` : ''}
                </Text>
                
                <View style={styles.cardsRow}>
                    <MetricCard title="Rent Collected" value={formatCurrency(stats.rentCollected)} icon="wallet-outline" color="#10B981" />
                    <MetricCard title="Pending Dues" value={formatCurrency(stats.pendingDues)} icon="alert-circle-outline" color="#EF4444" />
                </View>
                <View style={styles.cardsRow}>
                    <MetricCard title="Active Tenants" value={stats.activeTenants.toString()} icon="people-outline" color="#3B82F6" />
                    <MetricCard title="Vacant Units" value={stats.vacantUnits.toString()} icon="key-outline" color="#F59E0B" />
                </View>
            </Animated.View>

            {/* DYNAMIC REVENUE CHART */}
            <Animated.View style={[styles.chartContainer, isDark ? styles.darkCard : styles.lightCard, { opacity: fadeAnimChart }]}>
                <View style={styles.chartHeader}>
                    <Text style={[styles.chartTitle, isDark ? styles.darkText : styles.lightText]}>Revenue (6 Months)</Text>
                </View>
                
                <View style={styles.chartBody}>
                    {chartData.length > 0 ? chartData.map((data, index) => (
                        <View key={index} style={styles.chartBarWrapper}>
                            <View style={styles.chartBarBackground}>
                                <LinearGradient 
                                    colors={['#6366F1', '#8B5CF6']} 
                                    style={[styles.chartBarFill, { height: `${data.value}%` }]} 
                                />
                            </View>
                            <Text style={[styles.chartLabel, isDark ? styles.darkSubText : styles.lightSubText]}>{data.month}</Text>
                        </View>
                    )) : (
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 20 }}>
                            <Text style={[isDark ? styles.darkSubText : styles.lightSubText]}>No revenue data yet.</Text>
                        </View>
                    )}
                </View>
            </Animated.View>

            {/* ✨ NEW: RECENT PAYMENTS LIST ✨ */}
            <Animated.View style={{ opacity: fadeAnimList, marginTop: 10 }}>
                <Text style={[styles.sectionTitle, isDark ? styles.darkText : styles.lightText]}>Recent Payments</Text>
                
                <View style={[styles.recentListContainer, isDark ? styles.darkCard : styles.lightCard]}>
                    {recentPayments.length > 0 ? recentPayments.map((payment, index) => (
                        <View key={payment.id} style={[styles.paymentItem, index !== recentPayments.length - 1 && (isDark ? styles.darkBorder : styles.lightBorder)]}>
                            
                            {/* Icon / Avatar */}
                            <View style={[styles.paymentIconBox, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#D1FAE5' }]}>
                                <Ionicons name="arrow-down" size={16} color="#10B981" />
                            </View>
                            
                            {/* Tenant Details */}
                            <View style={styles.paymentInfo}>
                                <Text style={[styles.paymentName, isDark ? styles.darkText : styles.lightText]} numberOfLines={1}>
                                    {payment.tenant_name}
                                </Text>
                                <Text style={[styles.paymentSub, isDark ? styles.darkSubText : styles.lightSubText]}>
                                    Unit {payment.unit_number || 'N/A'} • {payment.payment_method}
                                </Text>
                            </View>

                            {/* Amount & Date */}
                            <View style={styles.paymentAmountBox}>
                                <Text style={styles.paymentAmount}>+{formatCurrency(payment.amount_paid)}</Text>
                                <Text style={[styles.paymentDate, isDark ? styles.darkSubText : styles.lightSubText]}>
                                    {new Date(payment.payment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                </Text>
                            </View>

                        </View>
                    )) : (
                        <View style={styles.emptyStateBox}>
                            <Ionicons name="receipt-outline" size={32} color={isDark ? '#475569' : '#CBD5E1'} style={{ marginBottom: 8 }} />
                            <Text style={[isDark ? styles.darkSubText : styles.lightSubText]}>No payments recorded yet.</Text>
                        </View>
                    )}
                </View>
            </Animated.View>
            
            <View style={{ height: 120 }} /> 
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    scrollContent: { paddingHorizontal: 20, paddingTop: 5, paddingBottom: 40 },
    lightText: { color: '#0F172A' }, darkText: { color: '#FFFFFF' },
    lightSubText: { color: '#64748B' }, darkSubText: { color: '#7E859E' },
    sectionTitle: { fontSize: 13, fontWeight: '700', marginBottom: 12, letterSpacing: 1, textTransform: 'uppercase', color: '#7E859E' },
    
    cardsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
    card: { flex: 1, padding: 16, borderRadius: 20 },
    lightCard: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 },
    darkCard: { backgroundColor: '#151A25' },
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
    chartBarBackground: { width: 14, height: 85, backgroundColor: 'rgba(148, 163, 184, 0.1)', borderRadius: 7, justifyContent: 'flex-end', marginBottom: 8 },
    chartBarFill: { width: '100%', borderRadius: 7 },
    chartLabel: { fontSize: 11, fontWeight: '600' },

    // ✨ NEW STYLES FOR RECENT PAYMENTS ✨
    recentListContainer: { borderRadius: 20, overflow: 'hidden', paddingHorizontal: 16, paddingVertical: 8 },
    paymentItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
    lightBorder: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    darkBorder: { borderBottomWidth: 1, borderBottomColor: '#1E293B' },
    paymentIconBox: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
    paymentInfo: { flex: 1, justifyContent: 'center' },
    paymentName: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
    paymentSub: { fontSize: 12, fontWeight: '500' },
    paymentAmountBox: { alignItems: 'flex-end', justifyContent: 'center' },
    paymentAmount: { fontSize: 15, fontWeight: '800', color: '#10B981', marginBottom: 2 },
    paymentDate: { fontSize: 11, fontWeight: '500' },
    emptyStateBox: { paddingVertical: 30, alignItems: 'center', justifyContent: 'center' }
});