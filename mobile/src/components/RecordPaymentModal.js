// File: mobile/src/components/RecordPaymentModal.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';
import CustomAlert from './CustomAlert'; 

const FormInput = ({ label, placeholder, value, onChangeText, keyboardType = 'default', isDark }) => (
    <View style={styles.inputContainer}>
        <Text style={[styles.inputLabel, isDark ? styles.darkSubText : styles.lightSubText]}>{label}</Text>
        <View style={[styles.inputWrapper, isDark ? styles.darkInput : styles.lightInput]}>
            <TextInput
                style={[styles.input, isDark ? styles.darkText : styles.lightText]}
                placeholder={placeholder}
                placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
                value={value}
                onChangeText={onChangeText}
                keyboardType={keyboardType}
            />
        </View>
    </View>
);

export default function RecordPaymentModal({ isVisible, onClose, tenant, isDark, onSuccess }) {
    const [amount, setAmount] = useState('');
    const [paymentMode, setPaymentMode] = useState('UPI');
    const [referenceId, setReferenceId] = useState('');
    const [paymentDate, setPaymentDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'success' });

    // Auto-fill the amount with their standard rent share when modal opens
    useEffect(() => {
        if (isVisible && tenant) {
            setAmount(tenant.rent_share?.toString() || '');
            setPaymentMode('UPI');
            setReferenceId('');
            setPaymentDate(new Date());
        }
    }, [isVisible, tenant]);

    const handleSavePayment = async () => {
        if (!amount || isNaN(amount) || Number(amount) <= 0) {
            return setAlertConfig({ visible: true, title: "Invalid Amount", message: "Please enter a valid numeric payment amount.", type: "warning" });
        }

        setIsSaving(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            
            const year = paymentDate.getFullYear();
            const month = String(paymentDate.getMonth() + 1).padStart(2, '0');
            const day = String(paymentDate.getDate()).padStart(2, '0');
            const formattedDate = `${year}-${month}-${day}`;

            await client.post(`/payments/${tenant.id}/payments`, {
                amount: amount,
                payment_mode: paymentMode,
                reference_id: referenceId,
                payment_date: formattedDate,
                status: 'Paid'
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            // Show Success Custom Dialog!
            setAlertConfig({ 
                visible: true, 
                title: "Payment Recorded!", 
                message: `Successfully logged ₹${amount} for ${tenant.name}. Due date has been extended.`, 
                type: "success" 
            });

        } catch (error) {
            // Show Error Custom Dialog!
            setAlertConfig({ 
                visible: true, 
                title: "Payment Failed", 
                message: error.response?.data?.message || "Something went wrong while saving the payment.", 
                type: "error" 
            });
        } finally {
            setIsSaving(false);
        }
    };

    // Helper to handle closing the custom alert
    const closeAlert = () => {
        const wasSuccess = alertConfig.type === 'success';
        
        // 1. Close the Custom Alert first
        setAlertConfig({ ...alertConfig, visible: false });
        
        // 2. Wait for the alert animation to finish before closing the main modal
        if (wasSuccess) {
            setTimeout(() => {
                onSuccess();
                onClose();
            }, 350); // 350ms delay gives the UI time to breathe!
        }
    };

    if (!tenant) return null;

    return (
        <Modal animationType="slide" transparent={true} visible={isVisible} onRequestClose={onClose}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
                <TouchableOpacity style={styles.closeArea} activeOpacity={1} onPress={onClose} />
                
                <View style={[styles.modalContent, isDark ? styles.darkModal : styles.lightModal]}>
                    <View style={styles.dragHandle} />
                    
                    <View style={styles.header}>
                        <View>
                            <Text style={[styles.title, isDark ? styles.darkText : styles.lightText]}>Record Payment</Text>
                            <Text style={[styles.subTitle, isDark ? styles.darkSubText : styles.lightSubText]}>For {tenant.name}</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <Ionicons name="close-circle" size={28} color={isDark ? '#475569' : '#CBD5E1'} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false}>
                        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 15 }}>
                            <View style={{ flex: 1 }}>
                                <FormInput label="Amount Paid (₹) *" placeholder="0" value={amount} onChangeText={setAmount} keyboardType="numeric" isDark={isDark} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.inputLabel, isDark ? styles.darkSubText : styles.lightSubText]}>Date Paid</Text>
                                <TouchableOpacity style={[styles.dateBtn, isDark ? styles.darkInput : styles.lightInput]} onPress={() => setShowDatePicker(true)}>
                                    <Ionicons name="calendar-outline" size={18} color={isDark ? '#94A3B8' : '#64748B'} />
                                    <Text style={[styles.dateText, isDark ? styles.darkText : styles.lightText]}>
                                        {paymentDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        <Text style={[styles.inputLabel, isDark ? styles.darkSubText : styles.lightSubText, { marginBottom: 8 }]}>Payment Method</Text>
                        <View style={styles.paymentModeContainer}>
                            {['UPI', 'Cash', 'Bank Transfer'].map(mode => (
                                <TouchableOpacity 
                                    key={mode} 
                                    style={[styles.modeBtn, paymentMode === mode ? styles.modeBtnActive : (isDark ? styles.darkInput : styles.lightInput)]}
                                    onPress={() => setPaymentMode(mode)}
                                >
                                    <Text style={[styles.modeBtnText, paymentMode === mode ? { color: '#FFF' } : (isDark ? styles.darkSubText : styles.lightSubText)]}>{mode}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {paymentMode !== 'Cash' && (
                            <FormInput label="Reference / UTR Number" placeholder="e.g. 123456789012" value={referenceId} onChangeText={setReferenceId} isDark={isDark} />
                        )}

                        <TouchableOpacity style={[styles.saveBtnWrapper, isSaving && { opacity: 0.5 }]} disabled={isSaving} onPress={handleSavePayment}>
                            <LinearGradient colors={['#10B981', '#059669']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.saveBtn}>
                                {isSaving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Save Payment</Text>}
                            </LinearGradient>
                        </TouchableOpacity>
                        <View style={{ height: 20 }} />
                    </ScrollView>
                </View>

                {/* --- ANDROID DATE PICKER --- */}
                {showDatePicker && Platform.OS === 'android' && (
                    <DateTimePicker value={paymentDate} mode="date" display="default" onChange={(event, selectedDate) => { setShowDatePicker(false); if (selectedDate) setPaymentDate(selectedDate); }} />
                )}

                {/* --- SAFE IOS INLINE OVERLAY DATE PICKER --- */}
                {Platform.OS === 'ios' && showDatePicker && (
                    <View style={styles.iosInlineOverlay}>
                        <TouchableOpacity style={styles.iosPickerBackground} activeOpacity={1} onPress={() => setShowDatePicker(false)} />
                        <View style={[styles.iosPickerContainer, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}>
                            <View style={[styles.iosPickerHeader, isDark ? { borderColor: '#334155' } : { borderColor: '#E2E8F0' }]}>
                                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                                    <Text style={styles.iosDoneText}>Done</Text>
                                </TouchableOpacity>
                            </View>
                            <DateTimePicker value={paymentDate} mode="date" display="spinner" textColor={isDark ? '#FFFFFF' : '#000000'} onChange={(event, selectedDate) => { if (selectedDate) setPaymentDate(selectedDate); }} style={{ height: 200, backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }} />
                        </View>
                    </View>
                )}

                <CustomAlert 
                    visible={alertConfig.visible}
                    title={alertConfig.title}
                    message={alertConfig.message}
                    type={alertConfig.type}
                    onClose={closeAlert}
                    isDark={isDark}
                />
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    closeArea: { flex: 1 },
    modalContent: { borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 20, maxHeight: '80%' },
    lightModal: { backgroundColor: '#FFFFFF' }, darkModal: { backgroundColor: '#0B0F19' },
    dragHandle: { width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(148, 163, 184, 0.4)', alignSelf: 'center', marginBottom: 15 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    title: { fontSize: 22, fontWeight: '800' }, subTitle: { fontSize: 14, fontWeight: '600' },
    lightText: { color: '#0F172A' }, darkText: { color: '#FFFFFF' },
    lightSubText: { color: '#64748B' }, darkSubText: { color: '#94A3B8' },
    inputContainer: { marginBottom: 15 },
    inputLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8, marginLeft: 4 },
    inputWrapper: { borderRadius: 12, height: 50, borderWidth: 1, justifyContent: 'center', paddingHorizontal: 15, borderColor: 'rgba(148, 163, 184, 0.2)' },
    darkInput: { backgroundColor: '#151A25' }, lightInput: { backgroundColor: '#F8FAFC' },
    input: { fontSize: 15, fontWeight: '600', height: '100%' },
    dateBtn: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, height: 50, borderWidth: 1, borderColor: 'rgba(148, 163, 184, 0.2)', paddingHorizontal: 15 },
    dateText: { fontSize: 15, fontWeight: '600', marginLeft: 8 },
    paymentModeContainer: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    modeBtn: { flex: 1, height: 45, borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(148, 163, 184, 0.2)' },
    modeBtnActive: { backgroundColor: '#10B981', borderColor: '#10B981' },
    modeBtnText: { fontSize: 13, fontWeight: '700' },
    saveBtnWrapper: { marginTop: 10, shadowColor: '#10B981', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 8, borderRadius: 16 },
    saveBtn: { height: 55, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
    iosInlineOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 9999, justifyContent: 'flex-end', elevation: 10 },
    iosPickerBackground: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
    iosPickerContainer: { width: '100%', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 30 },
    iosPickerHeader: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1 },
    iosDoneText: { color: '#10B981', fontWeight: '800', fontSize: 16 },
});