// File: mobile/src/components/TenantProfileTab.js
import React, { useEffect, useRef, useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Animated, Easing, Modal, ActivityIndicator, Dimensions, TextInput, Platform, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client, { SERVER_URL, mediaUrl } from '../api/client';
import EditTenantModal from './EditTenantModal';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme, withAlpha } from '../theme';
import { GlassView, Avatar } from '../ui';

const { width, height } = Dimensions.get('window');

export default function TenantProfileTab({ isDark, tenant, goBack }) {
    const t = useTheme();

    if (!tenant) return null;

    // --- STATUS HELPERS ---
    const isUnassigned = tenant.unit_id === null && tenant.status === 'Active';
    const isPast = tenant.status === 'Inactive';

    // --- ASSIGN UNIT STATES ---
    const [isAssignModalVisible, setAssignModalVisible] = useState(false);
    const [availableUnits, setAvailableUnits] = useState([]);
    const [selectedUnit, setSelectedUnit] = useState(null);
    const [assignDeposit, setAssignDeposit] = useState('');
    const [assignRent, setAssignRent] = useState('');
    const [isAssigning, setIsAssigning] = useState(false);
    const [isLoadingUnits, setIsLoadingUnits] = useState(false);

    const [isEditModalVisible, setEditModalVisible] = useState(false);
    const [tenantToEdit, setTenantToEdit] = useState(null);

    // --- NEW SMART BILLING STATES ---
    const [moveInDate, setMoveInDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [billingCycle, setBillingCycle] = useState('Anniversary');

    // --- SMART PRORATED MATH ENGINE ---
    const [proratedDisplayAmount, setProratedDisplayAmount] = useState(null);

    // --- CLOSE MODAL & CLEAR STATE ---
    const handleCloseModal = () => {
        setAssignModalVisible(false);
        setSelectedUnit(null);
        setAssignRent('');
        setAssignDeposit('');
        setMoveInDate(new Date());
        setBillingCycle('Anniversary');
        setProratedDisplayAmount(null);
    };

    // --- API: FETCH AVAILABLE UNITS ---
    const fetchAvailableUnits = async () => {
        setIsLoadingUnits(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            const res = await client.get('/units/available', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setAvailableUnits(res.data.availableUnits);
        } catch (e) {
            console.log("Error fetching available units:", e);
        } finally {
            setIsLoadingUnits(false);
        }
    };

    // --- API: HANDLE FINAL ASSIGNMENT ---
    const handleFinalAssign = async () => {
        // 1. Strict Validations
        if (!selectedUnit) return;
        if (!assignRent || isNaN(assignRent) || Number(assignRent) <= 0) {
            return Alert.alert("Validation Error", "Please enter a valid numeric rent amount.");
        }
        if (assignDeposit && isNaN(assignDeposit)) {
            return Alert.alert("Validation Error", "Please enter a valid numeric deposit amount.");
        }

        setIsAssigning(true);
        try {
            const token = await AsyncStorage.getItem('userToken');

            // Format the date safely for MySQL (YYYY-MM-DD) avoiding timezone shifts
            const year = moveInDate.getFullYear();
            const month = String(moveInDate.getMonth() + 1).padStart(2, '0');
            const day = String(moveInDate.getDate()).padStart(2, '0');
            const formattedMoveInDate = `${year}-${month}-${day}`;

            // 2. The Final Payload with Smart Billing Data included!
            const payload = {
                tenant_id: tenant.id,
                unit_id: selectedUnit.id,
                deposit: assignDeposit || 0,
                rent_share: assignRent,
                move_in_date: formattedMoveInDate,
                billing_cycle: billingCycle
            };

            const res = await client.put('/tenants/assign', payload, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.status === 200) {
                Alert.alert("Success", "Tenant assigned successfully!");
                setAssignModalVisible(false);
                goBack();
            }
        } catch (error) {
            Alert.alert("Error", error.response?.data?.message || "Failed to assign tenant.");
        } finally {
            setIsAssigning(false);
        }
    };

    // 1. Auto-fill the input ONLY if it's an Equal Split room
    useEffect(() => {
        if (!selectedUnit) return;
        if (selectedUnit.rent_split_type === 'Equal') {
            const share = Math.round(selectedUnit.base_rent / (selectedUnit.capacity || 1));
            setAssignRent(share.toString());
        } else {
            setAssignRent('');
        }
    }, [selectedUnit]);

    // 2. Calculate the Prorated "Due Today" amount based on whatever is in the box
    useEffect(() => {
        if (!selectedUnit || !assignRent) {
            setProratedDisplayAmount(null);
            return;
        }

        const standardRent = Number(assignRent);
        if (billingCycle === '1st_of_month' && standardRent > 0) {
            const year = moveInDate.getFullYear();
            const month = moveInDate.getMonth() + 1;
            const daysInMonth = new Date(year, month, 0).getDate();
            const daysStaying = daysInMonth - moveInDate.getDate() + 1;

            const prorated = (standardRent / daysInMonth) * daysStaying;
            setProratedDisplayAmount(Math.round(prorated));
        } else {
            setProratedDisplayAmount(null);
        }
    }, [moveInDate, billingCycle, assignRent, selectedUnit]);

    // --- RIPPLE ANIMATION SETUP ---
    const rippleAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.loop(
            Animated.timing(rippleAnim, {
                toValue: 1,
                duration: 2200,
                easing: Easing.out(Easing.ease),
                useNativeDriver: true,
            })
        ).start();
    }, [rippleAnim]);

    const rippleScale = rippleAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 2.2]
    });

    const rippleOpacity = rippleAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.7, 0]
    });

    const getStatusColor = () => {
        if (isPast) return t.colors.textMuted;
        if (isUnassigned) return t.colors.warning;
        return t.colors.success;
    };
    const statusColor = getStatusColor();

    const getDaysDifference = (dateString) => {
        const start = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - start);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    };

    const InfoRow = ({ icon, label, value, valueColor }) => (
        <View style={styles.infoRow}>
            <View style={[styles.iconBg, { backgroundColor: t.colors.surfaceAlt }]}>
                <Ionicons name={icon} size={18} color={t.colors.textMuted} />
            </View>
            <View style={styles.infoTextContainer}>
                <Text style={[styles.infoLabel, { color: t.colors.textMuted }]}>{label}</Text>
                <Text style={[styles.infoValue, { color: t.colors.text }, valueColor && { color: valueColor }]}>
                    {value || 'Not provided'}
                </Text>
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

                {/* --- PROFILE CARD WITH INLINE BUTTONS --- */}
                <GlassView radius={24} style={[styles.profileCard, t.shadows.sm]}>
                    <View style={styles.cardActionBar}>
                        <TouchableOpacity onPress={goBack} style={[styles.actionBtn, { backgroundColor: t.colors.surfaceAlt }]}>
                            <Ionicons name="arrow-back" size={20} color={t.colors.text} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setEditModalVisible(true)}
                            style={[styles.actionBtn, { backgroundColor: t.colors.surfaceAlt }]}
                        >
                            <Ionicons name="create-outline" size={20} color={t.colors.textMuted} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.avatarContainer}>
                        <Animated.View style={[
                            styles.ripple,
                            {
                                borderColor: statusColor,
                                transform: [{ scale: rippleScale }],
                                opacity: rippleOpacity
                            }
                        ]} />

                        <Avatar name={tenant.name} uri={tenant.image_url} size={80} style={styles.avatar} />
                        <View style={[styles.statusBadge, { backgroundColor: statusColor }, { borderColor: t.colors.surface }]}>
                            <Text style={[styles.statusBadgeText, { color: t.colors.onPrimary }]}>
                                {isPast ? 'MOVED OUT' : (isUnassigned ? 'UNASSIGNED' : 'ACTIVE')}
                            </Text>
                        </View>
                    </View>

                    <Text style={[styles.tenantName, { color: t.colors.text }]}>{tenant.name}</Text>
                    <Text style={[styles.tenantPhone, { color: t.colors.textMuted }]}>+91 {tenant.phone}</Text>

                    <View style={[styles.quickStatsRow, { borderTopColor: t.colors.border }]}>
                        <View style={styles.statBox}>
                            <Text style={[styles.statValue, { color: t.colors.text }]}>₹{tenant.rent_share}</Text>
                            <Text style={[styles.statLabel, { color: t.colors.textMuted }]}>Rent/Mo</Text>
                        </View>
                        <View style={[styles.statDivider, { backgroundColor: t.colors.border }]} />
                        <View style={styles.statBox}>
                            <Text style={[styles.statValue, { color: t.colors.text }]}>₹{tenant.deposit}</Text>
                            <Text style={[styles.statLabel, { color: t.colors.textMuted }]}>Deposit</Text>
                        </View>
                        <View style={[styles.statDivider, { backgroundColor: t.colors.border }]} />
                        <View style={styles.statBox}>
                            <Text style={[styles.statValue, { color: t.colors.success }]}>{tenant.credit_score || 100}</Text>
                            <Text style={[styles.statLabel, { color: t.colors.textMuted }]}>Trust Score</Text>
                        </View>
                    </View>
                </GlassView>

                {/* --- DYNAMIC ACTION BANNER --- */}
                {isUnassigned ? (
                    <View style={[styles.actionBanner, {
                        backgroundColor: withAlpha(t.colors.warning, 0.12),
                        borderColor: withAlpha(t.colors.warning, 0.28)
                    }]}>
                        <View style={styles.actionBannerLeft}>
                            <View style={[styles.bannerIconBg, { backgroundColor: withAlpha(t.colors.warning, 0.15) }]}>
                                <Ionicons name="home-outline" size={22} color={t.colors.warning} />
                            </View>
                            <View style={{ marginLeft: 12 }}>
                                <Text style={[styles.actionBannerTitle, { color: t.colors.text }]}>Needs a Room</Text>
                                <Text style={[styles.actionBannerSub, { color: t.colors.textMuted }]}>This tenant is currently unassigned.</Text>
                            </View>
                        </View>
                        <TouchableOpacity
                            style={[styles.assignBtn, { backgroundColor: t.colors.warning }]}
                            onPress={() => {
                                fetchAvailableUnits();
                                setAssignModalVisible(true);
                            }}
                        >
                            <Text style={[styles.assignBtnText, { color: t.colors.onPrimary }]}>Assign Unit</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View style={[styles.actionBanner, {
                        backgroundColor: withAlpha(t.colors.primary, 0.10),
                        borderColor: withAlpha(t.colors.primary, 0.22)
                    }]}>
                        <View style={styles.actionBannerLeft}>
                            <View style={[styles.bannerIconBg, { backgroundColor: withAlpha(t.colors.primary, 0.18) }]}>
                                <Ionicons
                                    name={isPast ? "exit-outline" : "checkmark-circle-outline"}
                                    size={22}
                                    color={t.colors.primary}
                                />
                            </View>
                            <View style={{ marginLeft: 12 }}>
                                <Text style={[styles.actionBannerTitle, { color: t.colors.text }]}>
                                    {isPast ? 'Moved Out' : 'Residency Status'}
                                </Text>
                                <Text style={[styles.actionBannerSub, { color: t.colors.textMuted }]}>
                                    {isPast
                                        ? `Left the unit ${getDaysDifference(tenant.created_at)} days ago.`
                                        : `Staying for the last ${getDaysDifference(tenant.created_at)} days.`}
                                </Text>
                            </View>
                        </View>
                    </View>
                )}

                {/* Section blocks... */}
                {!isUnassigned && !isPast && (
                    <>
                        <Text style={[styles.sectionTitle, { color: t.colors.text }]}>Current Lease</Text>
                        <GlassView radius={t.radii.xl} style={styles.detailsBlock}>
                            <InfoRow icon="business-outline" label="Property Name" value={tenant.property_name} />
                            <InfoRow icon="bed-outline" label="Unit / Room No" value={`Unit ${tenant.unit_number}`} valueColor={t.colors.primary} />
                            <InfoRow icon="calendar-outline" label="Moved In On" value={new Date(tenant.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} />
                        </GlassView>
                    </>
                )}

                <Text style={[styles.sectionTitle, { color: t.colors.text }]}>Personal Details</Text>
                <GlassView radius={t.radii.xl} style={styles.detailsBlock}>
                    <InfoRow icon="mail-outline" label="Email Address" value={tenant.email} />
                    <InfoRow icon="card-outline" label="Aadhar Number" value={tenant.aadhar} />
                </GlassView>

                <Text style={[styles.sectionTitle, { color: t.colors.text }]}>Work & Emergency</Text>
                <GlassView radius={t.radii.xl} style={styles.detailsBlock}>
                    <InfoRow icon="briefcase-outline" label="Company / College" value={tenant.company} />
                    <InfoRow icon="call-outline" label="Emergency Contact" value={tenant.emergency_phone} valueColor={t.colors.danger} />
                </GlassView>

                <View style={{ height: 100 }} />
            </ScrollView>

            {/* --- ASSIGN UNIT BOTTOM SHEET MODAL --- */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={isAssignModalVisible}
                onRequestClose={handleCloseModal}
            >
                <TouchableOpacity
                    style={[styles.modalOverlay, { backgroundColor: t.colors.scrim }]}
                    activeOpacity={1}
                    onPress={handleCloseModal}
                >
                    {/* Stays a TouchableOpacity: it swallows taps so the overlay above
                        doesn't close the sheet. A GlassView here would not block them. */}
                    <TouchableOpacity
                        activeOpacity={1}
                        style={[styles.sheetContent, { backgroundColor: t.colors.surface }]}
                    >
                        <View style={styles.sheetHeader}>
                            <View style={[styles.sheetHandle, { backgroundColor: t.colors.borderStrong }]} />
                            <View style={styles.sheetTitleRow}>
                                <Text style={[styles.sheetTitle, { color: t.colors.text }]}>Assign Room</Text>
                                <TouchableOpacity onPress={handleCloseModal} style={styles.sheetCloseBtn}>
                                    <Ionicons name="close-circle" size={24} color={t.colors.textFaint} />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: height * 0.6 }}>
                            <Text style={[styles.inputLabel, { color: t.colors.textMuted }]}>Select Available Unit</Text>

                            {isLoadingUnits ? (
                                <ActivityIndicator color={t.colors.primary} style={{ marginVertical: 30 }} />
                            ) : availableUnits.length === 0 ? (
                                <View style={styles.emptyUnitsBox}>
                                    <Ionicons name="alert-circle-outline" size={32} color={t.colors.textMuted} />
                                    <Text style={[styles.emptyUnitsText, { color: t.colors.textMuted }]}>No available beds found.</Text>
                                </View>
                            ) : (
                                availableUnits.map(unit => (
                                    <TouchableOpacity
                                        key={unit.id}
                                        style={[
                                            styles.unitSelectItem,
                                            { backgroundColor: t.colors.surfaceAlt },
                                            selectedUnit?.id === unit.id && {
                                                borderColor: t.colors.primary,
                                                backgroundColor: withAlpha(t.colors.primary, 0.10)
                                            }
                                        ]}
                                        onPress={() => setSelectedUnit(unit)}
                                    >
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.unitSelectNumber, { color: t.colors.text }]}>Unit {unit.unit_number}</Text>
                                            <Text style={[styles.unitSelectProp, { color: t.colors.textMuted }]}>{unit.property_name}</Text>
                                        </View>

                                        <View style={styles.unitRightInfo}>
                                            <View style={styles.splitBadge}>
                                                <Ionicons
                                                    name={unit.rent_split_type === 'Equal' ? 'people-outline' : 'person-outline'}
                                                    size={12}
                                                    color={t.colors.textMuted}
                                                />
                                                <Text style={[styles.splitText, { color: t.colors.textMuted }]}>
                                                    {unit.rent_split_type || 'Custom'} Split
                                                </Text>
                                            </View>

                                            <Text style={[styles.unitRentSplit, { color: t.colors.text }]}>₹{unit.base_rent}/mo</Text>

                                            <View style={[styles.unitSelectBadge, { backgroundColor: withAlpha(t.colors.success, 0.15) }]}>
                                                <Text style={[styles.unitSelectBadgeText, { color: t.colors.success }]}>
                                                    {unit.capacity - unit.current_occupancy} Bed Left
                                                </Text>
                                            </View>
                                        </View>
                                    </TouchableOpacity>
                                ))
                            )}

                            {selectedUnit && (
                                <Animated.View style={{ marginTop: 20 }}>

                                    {/* 1. DATE & BILLING CYCLE SECTION */}
                                    <View style={[styles.billingSection, {
                                        backgroundColor: withAlpha(t.colors.primary, 0.06),
                                        borderColor: withAlpha(t.colors.primary, 0.14)
                                    }]}>
                                        <Text style={[styles.inputLabel, { color: t.colors.textMuted }]}>Move-In Date</Text>
                                        <TouchableOpacity
                                            style={[styles.datePickerBtn, { backgroundColor: t.colors.surfaceAlt }]}
                                            activeOpacity={0.8}
                                            onPress={() => setShowDatePicker(true)}
                                        >
                                            <Ionicons name="calendar-outline" size={20} color={t.colors.textMuted} />
                                            <Text style={[styles.datePickerText, { color: t.colors.text }]}>
                                                {moveInDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                            </Text>
                                        </TouchableOpacity>

                                        {/* --- ANDROID NATIVE DATE PICKER --- */}
                                        {showDatePicker && Platform.OS === 'android' && (
                                            <DateTimePicker
                                                value={moveInDate}
                                                mode="date"
                                                display="default"
                                                onChange={(event, selectedDate) => {
                                                    setShowDatePicker(false);
                                                    if (selectedDate) setMoveInDate(selectedDate);
                                                }}
                                            />
                                        )}

                                        <Text style={[styles.inputLabel, { color: t.colors.textMuted }, { marginTop: 15 }]}>Billing Cycle</Text>
                                        <View style={styles.cycleToggleContainer}>
                                            <TouchableOpacity
                                                style={[styles.cycleBtn, billingCycle === 'Anniversary' ? { backgroundColor: t.colors.primary } : { backgroundColor: t.colors.surfaceAlt }]}
                                                onPress={() => setBillingCycle('Anniversary')}
                                            >
                                                <Text style={[styles.cycleBtnText, billingCycle === 'Anniversary' ? { color: t.colors.onPrimary } : { color: t.colors.textMuted }]}>
                                                    Monthly from Move-In
                                                </Text>
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                style={[styles.cycleBtn, billingCycle === '1st_of_month' ? { backgroundColor: t.colors.primary } : { backgroundColor: t.colors.surfaceAlt }]}
                                                onPress={() => setBillingCycle('1st_of_month')}
                                            >
                                                <Text style={[styles.cycleBtnText, billingCycle === '1st_of_month' ? { color: t.colors.onPrimary } : { color: t.colors.textMuted }]}>
                                                    1st of the Month
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>

                                    {/* 2. DEPOSIT & RENT INPUTS */}
                                    <View style={[styles.rowInputs, { marginTop: 15 }]}>
                                        <View style={{ flex: 1, marginRight: 10 }}>
                                            <Text style={[styles.inputLabel, { color: t.colors.textMuted }]}>New Deposit (₹)</Text>
                                            <TextInput
                                                style={[styles.sheetInput, { backgroundColor: t.colors.surfaceAlt, borderColor: t.colors.border, color: t.colors.text }]}
                                                keyboardType="numeric"
                                                value={assignDeposit}
                                                onChangeText={setAssignDeposit}
                                                placeholder="0"
                                                placeholderTextColor={t.colors.textFaint}
                                            />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.inputLabel, { color: t.colors.textMuted }]}>
                                                Monthly Rent (₹)
                                            </Text>
                                            <TextInput
                                                style={[styles.sheetInput, { backgroundColor: t.colors.surfaceAlt, borderColor: t.colors.border, color: t.colors.text }, billingCycle === '1st_of_month' && { borderColor: t.colors.success, borderWidth: 1 }]}
                                                keyboardType="numeric"
                                                value={assignRent}
                                                onChangeText={setAssignRent}
                                                placeholderTextColor={t.colors.textFaint}
                                            />
                                        </View>
                                    </View>

                                    {/* ✨ MOVED OUTSIDE: Spans full width! */}
                                    <View style={[styles.helperContainer, { marginTop: 10, marginBottom: 15 }]}>
                                        {/* Prorated maths reads as a money outcome (success); the split
                                            hints are purely informational, so they take the brand hue. */}
                                        <Ionicons
                                            name={billingCycle === '1st_of_month' ? "calculator" : (selectedUnit.rent_split_type === 'Equal' ? "checkmark-circle" : "create")}
                                            size={14}
                                            color={billingCycle === '1st_of_month' ? t.colors.success : t.colors.primary}
                                        />
                                        <Text style={[styles.helperMsg, { color: billingCycle === '1st_of_month' ? t.colors.success : t.colors.primary }]}>
                                            {billingCycle === '1st_of_month' && proratedDisplayAmount
                                                ? ` Prorated for this month: Collect ₹${proratedDisplayAmount} today.`
                                                : (selectedUnit.rent_split_type === 'Equal'
                                                    ? ` Auto-calculated equal share.`
                                                    : ` Custom split: Enter negotiated rent.`)}
                                        </Text>
                                    </View>

                                </Animated.View>
                            )}
                        </ScrollView>

                        <TouchableOpacity
                            style={[styles.confirmAssignBtn, { backgroundColor: t.colors.primary }, t.shadows.glow, (!selectedUnit || isAssigning) && { opacity: 0.5 }]}
                            disabled={!selectedUnit || isAssigning}
                            onPress={handleFinalAssign}
                        >
                            {isAssigning ? <ActivityIndicator color={t.colors.onPrimary} /> : <Text style={[styles.confirmAssignText, { color: t.colors.onPrimary }]}>Confirm Move-In</Text>}
                        </TouchableOpacity>
                    </TouchableOpacity>
                </TouchableOpacity>

                {/* --- IOS INLINE OVERLAY DATE PICKER --- */}
                {Platform.OS === 'ios' && showDatePicker && (
                    <View style={styles.iosInlineOverlay}>
                        {/* The dark background that you can click to close */}
                        <TouchableOpacity
                            style={[styles.iosPickerBackground, { backgroundColor: t.colors.scrim }]}
                            activeOpacity={1}
                            onPress={() => setShowDatePicker(false)}
                        />

                        {/* The actual themed sheet */}
                        <View style={[styles.iosPickerContainer, { backgroundColor: t.colors.surface }]}>
                            <View style={[styles.iosPickerHeader, { borderColor: t.colors.border }]}>
                                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                                    <Text style={[styles.iosDoneText, { color: t.colors.primary }]}>Done</Text>
                                </TouchableOpacity>
                            </View>
                            <DateTimePicker
                                value={moveInDate}
                                mode="date"
                                display="spinner"
                                textColor={t.colors.text}
                                onChange={(event, selectedDate) => {
                                    if (selectedDate) setMoveInDate(selectedDate);
                                }}
                                style={{ height: 200, backgroundColor: t.colors.surface }}
                            />
                        </View>
                    </View>
                )}
            </Modal>

            <EditTenantModal
                isVisible={isEditModalVisible}
                isDark={isDark}
                tenant={tenant}
                onClose={() => setEditModalVisible(false)}
                onSuccess={() => {
                    alert("Tenant updated successfully!");
                    goBack();
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    tabHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 15 },
    backBtn: { padding: 5, marginLeft: -5 },
    headerTitle: { fontSize: 18, fontWeight: '800' },
    editBtn: { padding: 5, marginRight: -5 },
    scrollContent: { paddingHorizontal: 20 },
    profileCard: { borderRadius: 24, padding: 20, alignItems: 'center', marginBottom: 20, marginTop: 5, position: 'relative', overflow: 'hidden' },
    cardActionBar: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', position: 'absolute', top: 15, left: 15, right: 15, zIndex: 10, paddingHorizontal: 5 },
    actionBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
    avatarContainer: { position: 'relative', marginBottom: 15, alignItems: 'center', justifyContent: 'center', width: 90, height: 90 },
    ripple: { position: 'absolute', width: 80, height: 80, borderRadius: 40, borderWidth: 1.5, backgroundColor: 'transparent' },
    avatar: { width: 80, height: 80, borderRadius: 40, zIndex: 10 },
    statusBadge: { position: 'absolute', bottom: -5, alignSelf: 'center', paddingHorizontal: 5, paddingVertical: 4, borderRadius: 10, borderWidth: 2, zIndex: 20 },
    statusBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
    tenantName: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
    tenantPhone: { fontSize: 13, fontWeight: '600', marginBottom: 20 },
    quickStatsRow: { flexDirection: 'row', width: '100%', justifyContent: 'space-around', alignItems: 'center', paddingTop: 20, borderTopWidth: 1 },
    statBox: { alignItems: 'center' },
    statValue: { fontSize: 16, fontWeight: '800', marginBottom: 2 },
    statLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
    statDivider: { width: 1, height: 30 },
    actionBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderRadius: 16, marginBottom: 20, borderWidth: 1 },
    actionBannerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    bannerIconBg: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    actionBannerTitle: { fontSize: 14, fontWeight: '800', marginBottom: 2 },
    actionBannerSub: { fontSize: 12, fontWeight: '500' },
    assignBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
    assignBtnText: { fontSize: 12, fontWeight: '800' },
    sectionTitle: { fontSize: 14, fontWeight: '800', marginBottom: 12, marginLeft: 4 },
    detailsBlock: { borderRadius: 20, padding: 16, marginBottom: 20 },
    infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
    iconBg: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
    infoTextContainer: { flex: 1 },
    infoLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
    infoValue: { fontSize: 14, fontWeight: '600' },
    modalOverlay: { flex: 1, justifyContent: 'flex-end' },
    sheetContent: { width: '100%', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 30 },
    sheetHeader: { alignItems: 'center', marginBottom: 15 },
    sheetHandle: { width: 40, height: 4, borderRadius: 10, marginBottom: 15 },
    sheetTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' },
    sheetTitle: { fontSize: 20, fontWeight: '800' },
    sheetCloseBtn: { padding: 4 },
    emptyUnitsBox: { alignItems: 'center', padding: 30 },
    emptyUnitsText: { marginTop: 10, fontWeight: '600' },
    unitSelectItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 16, marginBottom: 10, borderWidth: 2, borderColor: 'transparent' },
    unitSelectNumber: { fontSize: 16, fontWeight: '700' },
    unitSelectProp: { fontSize: 12, fontWeight: '600' },
    unitRightInfo: { alignItems: 'flex-end', justifyContent: 'center' },
    helperContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 10, marginLeft: 2 },
    splitBadge: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
    splitText: { fontSize: 10, fontWeight: '700', marginLeft: 4, textTransform: 'uppercase' },
    unitRentSplit: { fontSize: 14, fontWeight: '800', marginBottom: 4 },
    unitSelectBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
    unitSelectBadgeText: { fontSize: 10, fontWeight: '800' },
    rowInputs: { flexDirection: 'row', justifyContent: 'space-between' },
    inputLabel: { fontSize: 12, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase' },
    sheetInput: { height: 55, borderRadius: 12, paddingHorizontal: 15, borderWidth: 1 },
    confirmAssignBtn: { height: 55, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginTop: 20 },
    confirmAssignText: { fontSize: 16, fontWeight: '800' },
    helperMsg: { fontSize: 12, fontWeight: '600', marginLeft: 2, fontStyle: 'italic' },

    // --- NEW SMART BILLING STYLES ---
    billingSection: { padding: 15, borderRadius: 16, marginBottom: 10, borderWidth: 1 },
    datePickerBtn: { flexDirection: 'row', alignItems: 'center', height: 50, borderRadius: 12, paddingHorizontal: 15 },
    datePickerText: { fontSize: 15, fontWeight: '600', marginLeft: 10 },
    cycleToggleContainer: { flexDirection: 'row', gap: 10 },
    cycleBtn: { flex: 1, height: 45, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    cycleBtnText: { fontSize: 11, fontWeight: '700', paddingHorizontal: 10 },

    // --- IOS BOTTOM SHEET DATE PICKER STYLES ---
    iosInlineOverlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 9999,
        justifyContent: 'flex-end',
        elevation: 10
    },
    iosPickerBackground: {
        ...StyleSheet.absoluteFillObject,
    },
    iosPickerContainer: { width: '100%', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 30 },
    iosPickerHeader: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1 },
    iosDoneText: { fontWeight: '800', fontSize: 16 },
});
