// File: mobile/src/components/TransactionsTab.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';

export default function TransactionsTab({ isDark, selectedProperty }) {
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
                <View style={[styles.searchBar, isDark ? styles.darkCard : styles.lightCard]}>
                    <Ionicons name="search" size={20} color={isDark ? '#64748B' : '#94A3B8'} style={{ marginRight: 10 }} />
                    <TextInput
                        style={[styles.searchInput, isDark ? styles.darkText : styles.lightText]}
                        placeholder="Search tenant, unit, or UTR..."
                        placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <Ionicons name="close-circle" size={20} color={isDark ? '#64748B' : '#94A3B8'} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {isLoading && !refreshing ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#6366F1" />
                </View>
            ) : (
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.scrollContent}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />}
                >
                    {groupedTransactions.length > 0 ? (
                        groupedTransactions.map((group) => (
                            <View key={group.title} style={styles.monthGroup}>
                                {/* Month/Year Header */}
                                <Text style={[styles.monthTitle, isDark ? styles.darkText : styles.lightText]}>
                                    {group.title}
                                </Text>

                                {/* List of Transactions for this Month */}
                                <View style={[styles.listContainer, isDark ? styles.darkCard : styles.lightCard]}>
                                    {group.data.map((payment, index) => (
                                        <View key={payment.id} style={[styles.paymentItem, index !== group.data.length - 1 && (isDark ? styles.darkBorder : styles.lightBorder)]}>

                                            <View style={[styles.paymentIconBox, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#D1FAE5' }]}>
                                                <Ionicons name="arrow-down" size={16} color="#10B981" />
                                            </View>

                                            <View style={styles.paymentInfo}>
                                                <Text style={[styles.paymentName, isDark ? styles.darkText : styles.lightText]} numberOfLines={1}>
                                                    {payment.tenant_name}
                                                </Text>
                                                <Text style={[styles.paymentSub, isDark ? styles.darkSubText : styles.lightSubText]} numberOfLines={1}>
                                                    Unit {payment.unit_number || 'N/A'} • {payment.payment_method}
                                                    {payment.reference_id ? ` • ${payment.reference_id}` : ''}
                                                </Text>
                                            </View>

                                            <View style={styles.paymentAmountBox}>
                                                <Text style={styles.paymentAmount}>+{formatCurrency(payment.amount_paid)}</Text>
                                                <Text style={[styles.paymentDate, isDark ? styles.darkSubText : styles.lightSubText]}>
                                                    {new Date(payment.payment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                                </Text>
                                            </View>

                                        </View>
                                    ))}
                                </View>
                            </View>
                        ))
                    ) : (
                        <View style={styles.emptyStateBox}>
                            <Ionicons name="receipt-outline" size={40} color={isDark ? '#475569' : '#CBD5E1'} style={{ marginBottom: 12 }} />
                            <Text style={[styles.emptyStateTitle, isDark ? styles.darkText : styles.lightText]}>No transactions found</Text>
                            <Text style={[styles.emptyStateSub, isDark ? styles.darkSubText : styles.lightSubText]}>Payments will appear here once recorded.</Text>
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

    lightText: { color: '#0F172A' }, darkText: { color: '#FFFFFF' },
    lightSubText: { color: '#64748B' }, darkSubText: { color: '#94A3B8' },
    lightCard: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 },
    darkCard: { backgroundColor: '#151A25' },

    searchBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, height: 50, borderRadius: 16 },
    searchInput: { flex: 1, fontSize: 15, fontWeight: '500' },

    // ✨ Month Group Styles
    monthGroup: { marginBottom: 25 },
    monthTitle: { fontSize: 16, fontWeight: '800', marginBottom: 12, paddingLeft: 4, letterSpacing: 0.5 },

    listContainer: { borderRadius: 20, overflow: 'hidden', paddingHorizontal: 16, paddingVertical: 8 },
    paymentItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16 },
    lightBorder: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    darkBorder: { borderBottomWidth: 1, borderBottomColor: '#1E293B' },

    paymentIconBox: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
    paymentInfo: { flex: 1, justifyContent: 'center', paddingRight: 10 },
    paymentName: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
    paymentSub: { fontSize: 12, fontWeight: '500' },

    paymentAmountBox: { alignItems: 'flex-end', justifyContent: 'center' },
    paymentAmount: { fontSize: 16, fontWeight: '800', color: '#10B981', marginBottom: 4 },
    paymentDate: { fontSize: 11, fontWeight: '500' },

    emptyStateBox: { paddingVertical: 60, alignItems: 'center', justifyContent: 'center' },
    emptyStateTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
    emptyStateSub: { fontSize: 14, textAlign: 'center', maxWidth: '80%' }
});