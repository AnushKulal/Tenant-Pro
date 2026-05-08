// File: mobile/src/components/ChangeRoomModal.js
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Modal, KeyboardAvoidingView, Platform, Alert, Animated } from 'react-native'; 
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import client from '../api/client';

const FormInput = ({ label, placeholder, value, onChangeText, keyboardType = 'default', isDark, error }) => (
    <View style={styles.inputContainer}>
        <Text style={[styles.inputLabel, isDark ? styles.darkSubText : styles.lightSubText]}>{label}</Text>
        <View style={[styles.inputWrapper, isDark ? styles.darkInput : styles.lightInput, error && { borderColor: '#EF4444', borderWidth: 1.5 }]}>
            <TextInput
                style={[styles.input, isDark ? styles.darkText : styles.lightText]}
                placeholder={placeholder}
                placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
                value={value}
                onChangeText={onChangeText}
                keyboardType={keyboardType}
            />
        </View>
        {error ? <Text style={styles.inlineErrorText}>{error}</Text> : null}
    </View>
);

export default function ChangeRoomModal({ isVisible, onClose, tenant, currentRoomId, onSuccess, isDark }) {
    const [availableRooms, setAvailableRooms] = useState([]);
    const [isLoadingRooms, setIsLoadingRooms] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const [selectedRoom, setSelectedRoom] = useState(null);
    const [newDeposit, setNewDeposit] = useState('');
    const [newRentShare, setNewRentShare] = useState('');
    const [errors, setErrors] = useState({});

    // --- SMART BILLING STATES ---
    const [moveInDate, setMoveInDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [billingCycle, setBillingCycle] = useState('Anniversary');

    // --- SMART PRORATED MATH ENGINE ---
    const [proratedDisplayAmount, setProratedDisplayAmount] = useState(null);

    // --- ANIMATION STATES ---
    const [showSuccess, setShowSuccess] = useState(false);
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const moveAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (isVisible) {
            fetchAvailableRooms();
            setNewDeposit(tenant?.deposit?.toString() || '');
            setNewRentShare(tenant?.rent_share?.toString() || '');
            setSelectedRoom(null);
            setErrors({});
            setMoveInDate(new Date());
            setBillingCycle('Anniversary');
            setProratedDisplayAmount(null);
        }
    }, [isVisible, tenant]);

    // 1. Auto-fill the input ONLY if it's an Equal Split room
    useEffect(() => {
        if (!selectedRoom) return;
        if (selectedRoom.rent_split_type === 'Equal') {
            const share = Math.round(selectedRoom.base_rent / (selectedRoom.capacity || 1));
            setNewRentShare(share.toString());
        }
    }, [selectedRoom]);

    // 2. Calculate the Prorated "Due Today" amount based on the input box
    useEffect(() => {
        if (!selectedRoom || !newRentShare) {
            setProratedDisplayAmount(null);
            return;
        }
        
        const standardRent = Number(newRentShare);
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
    }, [moveInDate, billingCycle, newRentShare, selectedRoom]);

    const fetchAvailableRooms = async () => {
        setIsLoadingRooms(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            const response = await client.get('/units', {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            const validRooms = response.data.units.filter(room => 
                room.id !== currentRoomId && room.status !== 'Maintenance'
            );
            
            setAvailableRooms(validRooms);
        } catch (error) {
            Alert.alert("Error", "Could not load available rooms.");
        } finally {
            setIsLoadingRooms(false);
        }
    };

    const handleSelectRoom = (room) => {
        setSelectedRoom(room);
        setErrors({}); 
    };

    const handleConfirmShift = async () => {
        let newErrors = {};

        if (!selectedRoom) return Alert.alert("Select Room", "Please select a new unit from the list first.");
        if (!newRentShare || isNaN(newRentShare) || Number(newRentShare) <= 0) newErrors.rent = "Enter a valid monthly rent amount.";
        if (newDeposit && isNaN(newDeposit)) newErrors.deposit = "Deposit must be a valid number.";
        if (Object.keys(newErrors).length > 0) return setErrors(newErrors);

        setIsSaving(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            
            const year = moveInDate.getFullYear();
            const month = String(moveInDate.getMonth() + 1).padStart(2, '0');
            const day = String(moveInDate.getDate()).padStart(2, '0');
            const formattedMoveInDate = `${year}-${month}-${day}`;

            await client.put('/tenants/assign', {
                tenant_id: tenant.id,
                unit_id: selectedRoom.id,
                deposit: newDeposit || 0,
                rent_share: newRentShare,
                move_in_date: formattedMoveInDate,
                billing_cycle: billingCycle 
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setShowSuccess(true);
            Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
            Animated.timing(moveAnim, { toValue: 1, duration: 1500, delay: 300, useNativeDriver: true }).start();

            setTimeout(() => {
                onSuccess(); 
                onClose();
                setShowSuccess(false);
                fadeAnim.setValue(0);
                moveAnim.setValue(0);
            }, 3000);

        } catch (error) {
            Alert.alert("Error", error.response?.data?.message || "Failed to shift tenant to new room.");
        } finally {
            setIsSaving(false);
        }
    };

    if (!tenant) return null;

    return (
        <Modal animationType="slide" transparent={true} visible={isVisible} onRequestClose={onClose}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
                <View style={[styles.modalContent, isDark ? styles.darkModal : styles.lightModal]}>
                    
                    <View style={styles.modalHeader}>
                        <View>
                            <Text style={[styles.modalTitle, isDark ? styles.darkText : styles.lightText]}>Shift Room</Text>
                            <Text style={[styles.modalSub, isDark ? styles.darkSubText : styles.lightSubText]}>Moving {tenant.name}</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <Ionicons name="close" size={24} color={isDark ? '#94A3B8' : '#64748B'} />
                        </TouchableOpacity>
                    </View>

                    {isLoadingRooms ? (
                        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                            <ActivityIndicator size="large" color="#6366F1" />
                            <Text style={{ marginTop: 10, color: '#64748B' }}>Finding available units...</Text>
                        </View>
                    ) : (
                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                            
                            <Text style={[styles.formSectionTitle, isDark ? styles.darkText : styles.lightText]}>1. Select New Unit</Text>
                            
                            {availableRooms.length === 0 ? (
                                <Text style={{ color: '#EF4444', marginBottom: 20 }}>No other available units found in this property.</Text>
                            ) : (
                                <View style={{ marginBottom: 15 }}>
                                    {availableRooms.map((room) => {
                                        const isSelected = selectedRoom?.id === room.id;
                                        const calculatedShare = (room.base_rent / (room.capacity || 1)).toFixed(0);

                                        return (
                                            <TouchableOpacity 
                                                key={room.id}
                                                activeOpacity={0.8}
                                                onPress={() => handleSelectRoom(room)}
                                                style={[
                                                    styles.detailedRoomCard, 
                                                    isDark ? styles.darkInput : styles.lightInput,
                                                    isSelected && styles.selectedRoomCard
                                                ]}
                                            >
                                                <View style={styles.roomCardLeft}>
                                                    <View style={[styles.roomIconBg, isSelected && { backgroundColor: '#6366F1' }]}>
                                                        <Ionicons name="bed" size={22} color={isSelected ? '#FFF' : (isDark ? '#94A3B8' : '#64748B')} />
                                                    </View>
                                                </View>
                                                
                                                <View style={styles.roomCardBody}>
                                                    <View style={styles.roomCardHeader}>
                                                        <Text style={[styles.roomNumber, isDark ? styles.darkText : styles.lightText, isSelected && { color: '#6366F1' }]}>
                                                            Unit {room.unit_number}
                                                        </Text>
                                                        <Text style={[styles.roomRent, isDark ? styles.darkText : styles.lightText]}>
                                                            Base: ₹{room.base_rent}
                                                        </Text>
                                                    </View>
                                                    
                                                    {room.rent_split_type === 'Equal' ? (
                                                        <Text style={styles.perPersonText}>
                                                            ₹{room.base_rent} ÷ {room.capacity || 1} = <Text style={{fontWeight: '800'}}>₹{calculatedShare}/person</Text>
                                                        </Text>
                                                    ) : (
                                                        <Text style={[styles.perPersonText, { color: '#F59E0B' }]}>
                                                            Custom Split (Negotiable)
                                                        </Text>
                                                    )}

                                                    <Text style={[styles.roomType, isDark ? styles.darkSubText : styles.lightSubText, { marginTop: 4 }]}>
                                                        {room.room_type}
                                                    </Text>
                                                    
                                                    <View style={styles.capacityRow}>
                                                        <Ionicons name="people" size={12} color={isDark ? '#94A3B8' : '#64748B'} />
                                                        <Text style={[styles.capacityText, isDark ? styles.darkSubText : styles.lightSubText]}>
                                                            Max Capacity: {room.capacity || 1}
                                                        </Text>
                                                    </View>
                                                </View>

                                                {isSelected && (
                                                    <View style={styles.checkBadge}>
                                                        <Ionicons name="checkmark-circle" size={24} color="#6366F1" />
                                                    </View>
                                                )}
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            )}

                            {selectedRoom && (
                                <>
                                    <Text style={[styles.formSectionTitle, isDark ? styles.darkText : styles.lightText]}>2. Adjust Financials</Text>
                                    
                                    {/* --- SMART BILLING SECTION --- */}
                                    <View style={styles.billingSection}>
                                        <Text style={[styles.inputLabel, isDark ? styles.darkSubText : styles.lightSubText]}>Move-In Date</Text>
                                        <TouchableOpacity 
                                            style={[styles.datePickerBtn, isDark ? styles.darkInput : styles.lightInput]} 
                                            activeOpacity={0.8}
                                            onPress={() => setShowDatePicker(true)}
                                        >
                                            <Ionicons name="calendar-outline" size={20} color={isDark ? '#94A3B8' : '#64748B'} />
                                            <Text style={[styles.datePickerText, isDark ? styles.darkText : styles.lightText]}>
                                                {moveInDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                            </Text>
                                        </TouchableOpacity>

                                        {/* ANDROID NATIVE DATE PICKER */}
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

                                        <Text style={[styles.inputLabel, isDark ? styles.darkSubText : styles.lightSubText, { marginTop: 15 }]}>Billing Cycle</Text>
                                        <View style={styles.cycleToggleContainer}>
                                            <TouchableOpacity 
                                                style={[styles.cycleBtn, billingCycle === 'Anniversary' ? styles.cycleBtnActive : (isDark ? styles.darkInput : styles.lightInput)]}
                                                onPress={() => setBillingCycle('Anniversary')}
                                            >
                                                <Text style={[styles.cycleBtnText, billingCycle === 'Anniversary' ? { color: '#FFF' } : (isDark ? styles.darkSubText : styles.lightSubText)]}>
                                                    Monthly from Move-In
                                                </Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity 
                                                style={[styles.cycleBtn, billingCycle === '1st_of_month' ? styles.cycleBtnActive : (isDark ? styles.darkInput : styles.lightInput)]}
                                                onPress={() => setBillingCycle('1st_of_month')}
                                            >
                                                <Text style={[styles.cycleBtnText, billingCycle === '1st_of_month' ? { color: '#FFF' } : (isDark ? styles.darkSubText : styles.lightSubText)]}>
                                                    1st of the Month
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>

                                    <View style={styles.rowInputs}>
                                        <View style={{ flex: 1, marginRight: 10 }}>
                                            <FormInput 
                                                label="New Deposit (₹)" 
                                                placeholder="e.g. 10000" 
                                                value={newDeposit} 
                                                onChangeText={(val) => { setNewDeposit(val); setErrors({...errors, deposit: null}); }} 
                                                keyboardType="numeric" 
                                                isDark={isDark} 
                                                error={errors?.deposit}
                                            />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <FormInput 
                                                label="Monthly Rent (₹)"
                                                placeholder="e.g. 5000" 
                                                value={newRentShare} 
                                                onChangeText={(val) => { setNewRentShare(val); setErrors({...errors, rent: null}); }} 
                                                keyboardType="numeric" 
                                                isDark={isDark} 
                                                error={errors?.rent}
                                            />
                                        </View>
                                    </View>

                                    {/* ✨ HELPER MOVED OUTSIDE: Spans full width! */}
                                    <View style={[styles.helperContainer, { marginTop: -5 }]}>
                                        <Ionicons 
                                            name={billingCycle === '1st_of_month' ? "calculator" : (selectedRoom.rent_split_type === 'Equal' ? "checkmark-circle" : "create")} 
                                            size={14} 
                                            color={billingCycle === '1st_of_month' ? '#10B981' : '#6366F1'} 
                                        />
                                        <Text style={[styles.helperMsg, { color: billingCycle === '1st_of_month' ? '#10B981' : '#6366F1' }]}>
                                            {billingCycle === '1st_of_month' && proratedDisplayAmount 
                                                ? ` Prorated for this month: Collect ₹${proratedDisplayAmount} today.` 
                                                : (selectedRoom.rent_split_type === 'Equal' 
                                                    ? ` Auto-calculated equal share.` 
                                                    : ` Custom split: Enter negotiated rent.`)}
                                        </Text>
                                    </View>
                                </>
                            )}

                            <TouchableOpacity 
                                style={[styles.saveBtnWrapper, (!selectedRoom || isSaving) && { opacity: 0.5 }]} 
                                activeOpacity={0.8} 
                                onPress={handleConfirmShift} 
                                disabled={!selectedRoom || isSaving}
                            >
                                <LinearGradient colors={['#6366F1', '#4F46E5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.saveBtn}>
                                    {isSaving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveBtnText}>Confirm Room Shift</Text>}
                                </LinearGradient>
                            </TouchableOpacity>
                            <View style={{ height: 40 }} />

                        </ScrollView>
                    )}
                </View>

                {/* --- IOS INLINE OVERLAY DATE PICKER (FIXED: Out of ScrollView & Modal) --- */}
                {Platform.OS === 'ios' && showDatePicker && (
                    <View style={styles.iosInlineOverlay}>
                        <TouchableOpacity style={styles.iosPickerBackground} activeOpacity={1} onPress={() => setShowDatePicker(false)} />
                        <View style={[styles.iosPickerContainer, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}>
                            <View style={[styles.iosPickerHeader, isDark ? styles.darkDivider : styles.lightDivider]}>
                                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                                    <Text style={styles.iosDoneText}>Done</Text>
                                </TouchableOpacity>
                            </View>
                            <DateTimePicker
                                value={moveInDate}
                                mode="date"
                                display="spinner"
                                textColor={isDark ? '#FFFFFF' : '#000000'}
                                onChange={(event, selectedDate) => {
                                    if (selectedDate) setMoveInDate(selectedDate);
                                }}
                                style={{ height: 200, backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }}
                            />
                        </View>
                    </View>
                )}

            </KeyboardAvoidingView>

            {/* --- SUCCESS ANIMATION OVERLAY --- */}
            {showSuccess && (
                <Animated.View style={[styles.successOverlay, { opacity: fadeAnim }]}>
                    <LinearGradient colors={['#10B981', '#059669']} style={styles.successGradient}>
                        <View style={styles.successIconCircle}>
                            <Ionicons name="checkmark" size={50} color="#10B981" />
                        </View>
                        <Text style={styles.successTitle}>Shift Successful!</Text>
                        <Text style={styles.successSubText}>
                            {tenant.name} has been moved to Unit {selectedRoom?.unit_number}.
                        </Text>
                        <View style={styles.animationTrack}>
                            <View style={styles.roomNode}>
                                <Ionicons name="log-out-outline" size={24} color="rgba(255,255,255,0.7)" />
                            </View>
                            <Animated.View style={[styles.movingTenant, {
                                transform: [{
                                    translateX: moveAnim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [0, 120] 
                                    })
                                }]
                            }]}>
                                <Ionicons name="walk" size={32} color="#FFFFFF" />
                            </Animated.View>
                            <View style={styles.roomNode}>
                                <Ionicons name="bed" size={24} color="rgba(255,255,255,0.9)" />
                            </View>
                        </View>
                    </LinearGradient>
                </Animated.View>
            )}

        </Modal>
    );
}

const styles = StyleSheet.create({
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 25, paddingTop: 25, maxHeight: '90%' },
    lightModal: { backgroundColor: '#FFFFFF' }, darkModal: { backgroundColor: '#0B0F19' },
    
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 22, fontWeight: '800' },
    modalSub: { fontSize: 14, fontWeight: '600', marginTop: 2, color: '#6366F1' },
    closeBtn: { padding: 5 },

    formSectionTitle: { fontSize: 14, fontWeight: '800', marginTop: 10, marginBottom: 15, letterSpacing: 0.5, color: '#6366F1' },
    
    detailedRoomCard: { flexDirection: 'row', padding: 16, borderRadius: 16, borderWidth: 2, borderColor: 'transparent', marginBottom: 12, alignItems: 'center' },
    selectedRoomCard: { borderColor: '#6366F1', backgroundColor: 'rgba(99, 102, 241, 0.05)' },
    roomCardLeft: { marginRight: 15 },
    roomIconBg: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(148, 163, 184, 0.1)', justifyContent: 'center', alignItems: 'center' },
    roomCardBody: { flex: 1 },
    roomCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    roomNumber: { fontSize: 16, fontWeight: '800' },
    roomRent: { fontSize: 14, fontWeight: '700' },
    
    perPersonText: { fontSize: 13, fontWeight: '600', color: '#10B981', marginBottom: 2 },
    roomType: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
    capacityRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    capacityText: { fontSize: 12, fontWeight: '600' },
    checkBadge: { position: 'absolute', right: 16, top: '50%', marginTop: -2 }, 

    inputContainer: { marginBottom: 18 },
    rowInputs: { flexDirection: 'row', justifyContent: 'space-between' },
    inputLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 },
    inputWrapper: { borderRadius: 16, paddingHorizontal: 16, height: 55, borderWidth: 1, justifyContent: 'center' },
    input: { fontSize: 15, fontWeight: '500', height: '100%' },
    inlineErrorText: { color: '#EF4444', fontSize: 11, fontWeight: '600', marginTop: 4, marginLeft: 4 },
    
    lightInput: { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }, darkInput: { backgroundColor: '#0A0F1C', borderColor: '#1E293B' },
    lightText: { color: '#0F172A' }, darkText: { color: '#FFFFFF' },
    lightSubText: { color: '#64748B' }, darkSubText: { color: '#94A3B8' },

    saveBtnWrapper: { marginTop: 15, shadowColor: '#6366F1', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8, borderRadius: 20 },
    saveBtn: { height: 60, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

    // --- SUCCESS ANIMATION STYLES ---
    successOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 100, borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: 'hidden' },
    successGradient: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
    successIconCircle: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', marginBottom: 25, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 15, elevation: 10 },
    successTitle: { fontSize: 26, fontWeight: '800', color: '#FFFFFF', marginBottom: 10, textAlign: 'center' },
    successSubText: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.9)', textAlign: 'center', marginBottom: 40, paddingHorizontal: 20 },
    
    animationTrack: { flexDirection: 'row', alignItems: 'center', width: 170, justifyContent: 'space-between', position: 'relative' },
    roomNode: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)' },
    movingTenant: { position: 'absolute', left: 10, top: -10, zIndex: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, elevation: 5 },

    // --- NEW SMART BILLING STYLES ---
    billingSection: { backgroundColor: 'rgba(99, 102, 241, 0.05)', padding: 15, borderRadius: 16, marginBottom: 15, borderWidth: 1, borderColor: 'rgba(99, 102, 241, 0.1)' },
    datePickerBtn: { flexDirection: 'row', alignItems: 'center', height: 50, borderRadius: 12, paddingHorizontal: 15 },
    datePickerText: { fontSize: 15, fontWeight: '600', marginLeft: 10 },
    cycleToggleContainer: { flexDirection: 'row', gap: 10 },
    cycleBtn: { flex: 1, height: 45, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    cycleBtnActive: { backgroundColor: '#6366F1' },
    cycleBtnText: { fontSize: 11, fontWeight: '700', paddingHorizontal: 5 },
    
    // --- IOS INLINE OVERLAY DATE PICKER STYLES ---
    iosInlineOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 9999, justifyContent: 'flex-end', elevation: 10 },
    iosPickerBackground: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
    iosPickerContainer: { width: '100%', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 30 },
    iosPickerHeader: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1 },
    iosDoneText: { color: '#6366F1', fontWeight: '800', fontSize: 16 },
    lightDivider: { borderColor: '#E2E8F0' }, darkDivider: { borderColor: '#334155' },
    
    helperContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginLeft: 4 },
    helperMsg: { fontSize: 12, fontWeight: '600', marginLeft: 4, fontStyle: 'italic' },
});