// File: mobile/src/components/TransactionsTab.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';
import { useTheme, withAlpha } from '../theme';
import { GlassView } from '../ui';

export default function TransactionsTab({ isDark, selectedProperty }) {
    const t = useTheme();
    const [transactions, setTransactions] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchTransactions = async () => {
        try {
            const token = await AsyncStorage.getItem('userToken');
            const propId = selectedProperty?.id || 'all';

            const response = await client.get('/owner/transactions', {
                headers: { Authorization: `Bearer ${token}` },
                params: { property_id: propId }
            });
            setTransactions(response.data.transactions);
        } catch (error) {
            console.error("Error fetching transactions:", error);
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        setIsLoading(true);
        fetchTransactions();
    }, [selectedProperty]);

    const onRefresh = () => {
        setRefreshing(true);
        fetchTransactions();
    };

    const formatCurrency = (amount) => {
        return `₹${Number(amount).toLocaleString('en-IN')}`;
    };

    // 1. Filter transactions based on search query
    const filteredTransactions = transactions.filter(t =>
        t.tenant_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.unit_number && t.unit_number.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.reference_id && t.reference_id.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    // 2. Group the filtered transactions by Month and Year
    const groupTransactionsByMonth = (txns) => {
        const groups = [];
        const groupMap = {};

        txns.forEach(txn => {
            const date = new Date(txn.payment_date);
            // Example output: "April 2026"
            const monthYear = date.toLocaleString('default', { month: 'long', year: 'numeric' });

            if (!groupMap[monthYear]) {
                groupMap[monthYear] = { title: monthYear, data: [] };
                groups.push(groupMap[monthYear]);
            }
            groupMap[monthYear].data.push(txn);
        });

        return groups;
    };

    const groupedTransactions = groupTransactionsByMonth(filteredTransactions);

    return (
        <View style={styles.container}>
            {/* Search Bar */}
            <View style={{ paddingHorizontal: 20, paddingBottom: 15 }}>
                <GlassView radius={t.radii.lg} style={[styles.searchBar, t.shadows.sm]}>
                    <Ionicons name="search" size={20} color={t.colors.textMuted} style={{ marginRight: 10 }} />
                    <TextInput
                        style={[styles.searchInput, { color: t.colors.text }]}
                        placeholder="Search tenant, unit, or UTR..."
                        placeholderTextColor={t.colors.textFaint}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <Ionicons name="close-circle" size={20} color={t.colors.textMuted} />
                        </TouchableOpacity>
                    )}
                </GlassView>
            </View>

            {isLoading && !refreshing ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color={t.colors.primary} />
                </View>
            ) : (
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.scrollContent}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.primary} />}
                >
                    {groupedTransactions.length > 0 ? (
                        groupedTransactions.map((group) => (
                            <View key={group.title} style={styles.monthGroup}>
                                {/* Month/Year Header */}
                                <Text style={[styles.monthTitle, { color: t.colors.text }]}>
                                    {group.title}
                                </Text>

                                {/* List of Transactions for this Month */}
                                <GlassView radius={t.radii.xl} style={[styles.listContainer, t.shadows.sm]}>
                                    {group.data.map((payment, index) => (
                                        <View key={payment.id} style={[styles.paymentItem, index !== group.data.length - 1 && [styles.itemDivider, { borderBottomColor: t.colors.border }]]}>

                                            <View style={[styles.paymentIconBox, { backgroundColor: withAlpha(t.colors.success, 0.15) }]}>
                                                <Ionicons name="arrow-down" size={16} color={t.colors.success} />
                                            </View>

                                            <View style={styles.paymentInfo}>
                                                <Text style={[styles.paymentName, { color: t.colors.text }]} numberOfLines={1}>
                                                    {payment.tenant_name}
                                                </Text>
                                                <Text style={[styles.paymentSub, { color: t.colors.textMuted }]} numberOfLines={1}>
                                                    Unit {payment.unit_number || 'N/A'} • {payment.payment_method}
                                                    {payment.reference_id ? ` • ${payment.reference_id}` : ''}
                                                </Text>
                                            </View>

                                            <View style={styles.paymentAmountBox}>
                                                <Text style={[styles.paymentAmount, { color: t.colors.success }]}>+{formatCurrency(payment.amount_paid)}</Text>
                                                <Text style={[styles.paymentDate, { color: t.colors.textMuted }]}>
                                                    {new Date(payment.payment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                                </Text>
                                            </View>

                                        </View>
                                    ))}
                                </GlassView>
                            </View>
                        ))
                    ) : (
                        <View style={styles.emptyStateBox}>
                            <Ionicons name="receipt-outline" size={40} color={t.colors.textFaint} style={{ marginBottom: 12 }} />
                            <Text style={[styles.emptyStateTitle, { color: t.colors.text }]}>No transactions found</Text>
                            <Text style={[styles.emptyStateSub, { color: t.colors.textMuted }]}>Payments will appear here once recorded.</Text>
                        </View>
                    )}

                    <View style={{ height: 100 }} />
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scrollContent: { paddingHorizontal: 20, paddingTop: 5, paddingBottom: 40 },

    searchBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, height: 50 },
    searchInput: { flex: 1, fontSize: 15, fontWeight: '500' },

    // ✨ Month Group Styles
    monthGroup: { marginBottom: 25 },
    monthTitle: { fontSize: 16, fontWeight: '800', marginBottom: 12, paddingLeft: 4, letterSpacing: 0.5 },

    listContainer: { paddingHorizontal: 16, paddingVertical: 8 },
    paymentItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16 },
    itemDivider: { borderBottomWidth: 1 },

    paymentIconBox: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
    paymentInfo: { flex: 1, justifyContent: 'center', paddingRight: 10 },
    paymentName: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
    paymentSub: { fontSize: 12, fontWeight: '500' },

    paymentAmountBox: { alignItems: 'flex-end', justifyContent: 'center' },
    paymentAmount: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
    paymentDate: { fontSize: 11, fontWeight: '500' },

    emptyStateBox: { paddingVertical: 60, alignItems: 'center', justifyContent: 'center' },
    emptyStateTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
    emptyStateSub: { fontSize: 14, textAlign: 'center', maxWidth: '80%' }
});
