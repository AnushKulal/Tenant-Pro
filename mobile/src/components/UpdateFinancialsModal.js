// File: mobile/src/components/UpdateFinancialsModal.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput, Modal, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';

const FormInput = ({ label, placeholder, value, onChangeText, keyboardType = 'numeric', isDark, error }) => (
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

export default function UpdateFinancialsModal({ isVisible, onClose, tenant, onSuccess, isDark }) {
    const [isSaving, setIsSaving] = useState(false);
    const [deposit, setDeposit] = useState('');
    const [rentShare, setRentShare] = useState('');
    const [errors, setErrors] = useState({});

    useEffect(() => {
        if (isVisible && tenant) {
            setDeposit(tenant.deposit?.toString() || '');
            setRentShare(tenant.rent_share?.toString() || '');
            setErrors({});
        }
    }, [isVisible, tenant]);

    const handleSave = async () => {
        let newErrors = {};

        if (!rentShare || isNaN(rentShare) || Number(rentShare) <= 0) {
            newErrors.rent = "Enter a valid monthly rent.";
        }
        if (deposit && isNaN(deposit)) {
            newErrors.deposit = "Deposit must be a valid number.";
        }

        if (Object.keys(newErrors).length > 0) {
            return setErrors(newErrors);
        }

        setIsSaving(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            
            // We will add this small backend route next!
            await client.put(`/tenants/${tenant.id}/financials`, {
                deposit: deposit || 0,
                rent_share: rentShare
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            onSuccess();
            onClose();
        } catch (error) {
            Alert.alert("Error", error.response?.data?.message || "Failed to update financial details.");
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
                            <Text style={[styles.modalTitle, isDark ? styles.darkText : styles.lightText]}>Update Financials</Text>
                            <Text style={[styles.modalSub, isDark ? styles.darkSubText : styles.lightSubText]}>For {tenant.name}</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <Ionicons name="close" size={24} color={isDark ? '#94A3B8' : '#64748B'} />
                        </TouchableOpacity>
                    </View>

                    <View style={[styles.infoCard, isDark ? styles.darkAlert : styles.lightAlert]}>
                        <Ionicons name="information-circle" size={20} color="#3B82F6" />
                        <Text style={[styles.alertText, isDark ? styles.darkText : styles.lightText]}>
                            This updates the monthly rent expected from this tenant. It will apply to all future invoices.
                        </Text>
                    </View>

                    <View style={styles.rowInputs}>
                        <View style={{ flex: 1, marginRight: 10 }}>
                            <FormInput 
                                label="Security Deposit (₹)" 
                                placeholder="e.g. 10000" 
                                value={deposit} 
                                onChangeText={(val) => { setDeposit(val); setErrors({...errors, deposit: null}); }} 
                                isDark={isDark} 
                                error={errors?.deposit}
                            />
                        </View>
                        <View style={{ flex: 1 }}>
                            <FormInput 
                                label="Monthly Rent (₹)" 
                                placeholder="e.g. 5000" 
                                value={rentShare} 
                                onChangeText={(val) => { setRentShare(val); setErrors({...errors, rent: null}); }} 
                                isDark={isDark} 
                                error={errors?.rent}
                            />
                        </View>
                    </View>

                    <TouchableOpacity 
                        style={[styles.saveBtnWrapper, isSaving && { opacity: 0.7 }]} 
                        activeOpacity={0.8} 
                        onPress={handleSave} 
                        disabled={isSaving}
                    >
                        <LinearGradient colors={['#10B981', '#059669']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.saveBtn}>
                            {isSaving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveBtnText}>Update Amounts</Text>}
                        </LinearGradient>
                    </TouchableOpacity>
                    <View style={{ height: 30 }} />

                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 25, paddingTop: 25 },
    lightModal: { backgroundColor: '#FFFFFF' }, darkModal: { backgroundColor: '#0B0F19' },
    
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 22, fontWeight: '800' },
    modalSub: { fontSize: 14, fontWeight: '600', marginTop: 2, color: '#10B981' },
    closeBtn: { padding: 5 },

    inputContainer: { marginBottom: 18 },
    rowInputs: { flexDirection: 'row', justifyContent: 'space-between' },
    inputLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 },
    inputWrapper: { borderRadius: 16, paddingHorizontal: 16, height: 55, borderWidth: 1, justifyContent: 'center' },
    input: { fontSize: 15, fontWeight: '500', height: '100%' },
    inlineErrorText: { color: '#EF4444', fontSize: 11, fontWeight: '600', marginTop: 4, marginLeft: 4 },
    
    lightInput: { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }, darkInput: { backgroundColor: '#0A0F1C', borderColor: '#1E293B' },
    lightText: { color: '#0F172A' }, darkText: { color: '#FFFFFF' },
    lightSubText: { color: '#64748B' }, darkSubText: { color: '#94A3B8' },

    infoCard: { flexDirection: 'row', padding: 14, borderRadius: 12, marginBottom: 20, alignItems: 'center' },
    lightAlert: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' },
    darkAlert: { backgroundColor: 'rgba(59, 130, 246, 0.1)', borderWidth: 1, borderColor: 'rgba(59, 130, 246, 0.2)' },
    alertText: { flex: 1, marginLeft: 10, fontSize: 12, fontWeight: '600', lineHeight: 18 },

    saveBtnWrapper: { shadowColor: '#10B981', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8, borderRadius: 20 },
    saveBtn: { height: 60, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});