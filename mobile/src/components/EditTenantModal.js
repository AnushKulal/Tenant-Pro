// File: mobile/src/components/EditTenantModal.js
import React, { useState, useEffect } from 'react';
import { 
    View, Text, StyleSheet, ScrollView, TouchableOpacity, 
    ActivityIndicator, TextInput, Image, Dimensions, Modal, 
    KeyboardAvoidingView, Platform 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import client, { SERVER_URL } from '../api/client';

const FormInput = ({ label, placeholder, value, onChangeText, keyboardType = 'default', isDark, error }) => (
    <View style={styles.inputContainer}>
        <Text style={[styles.inputLabel, isDark ? styles.darkSubText : styles.lightSubText]}>{label}</Text>
        <View style={[styles.inputWrapper, isDark ? styles.darkInput : styles.lightInput, error && styles.inputErrorBorder]}>
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

export default function EditTenantModal({ isVisible, onClose, tenant, onSuccess, isDark }) {
    const [isSaving, setIsSaving] = useState(false);
    const [errors, setErrors] = useState({});
    const [generalError, setGeneralError] = useState('');
    
    // Form States
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [aadhar, setAadhar] = useState('');
    const [company, setCompany] = useState('');
    const [emergency, setEmergency] = useState('');
    const [imageUri, setImageUri] = useState(null);

    // Pre-fill the form whenever the `tenant` prop changes
    useEffect(() => {
        if (tenant) {
            setName(tenant.name || '');
            setPhone(tenant.phone || '');
            setEmail(tenant.email || '');
            setAadhar(tenant.aadhar || '');
            setCompany(tenant.company || '');
            setEmergency(tenant.emergency_phone || '');
            setImageUri(null); // Reset new image picking
            setErrors({});
            setGeneralError('');
        }
    }, [tenant]);

    const pickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        });
        if (!result.canceled) {
            setImageUri(result.assets[0].uri);
        }
    };

    const handleSave = async () => {
        setErrors({});
        setGeneralError('');
        let newErrors = {};

        if (!name.trim()) newErrors.name = "Name is required.";
        if (!phone.trim()) {
            newErrors.phone = "Phone number is required.";
        } else if (!/^\d{10}$/.test(phone.trim())) {
            newErrors.phone = "Enter a valid 10-digit phone number.";
        }
        if (email.trim() && !/\S+@\S+\.\S+/.test(email.trim())) {
            newErrors.email = "Enter a valid email address.";
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            setGeneralError("Please fix the highlighted errors above.");
            return;
        }

        setIsSaving(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            const formData = new FormData();

            formData.append('name', name);
            formData.append('phone', phone);
            formData.append('email', email);
            formData.append('aadhar', aadhar);
            formData.append('company', company);
            formData.append('emergency_phone', emergency); // Notice the DB column name change

            if (imageUri) {
                const filename = imageUri.split('/').pop();
                const match = /\.(\w+)$/.exec(filename);
                const type = match ? `image/${match[1]}` : `image/jpeg`;
                formData.append('tenant_image', { uri: imageUri, name: filename, type });
            }

            // Using PUT to update the specific tenant
            await client.put(`/tenants/${tenant.id}`, formData, {
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
            });

            onSuccess(); // Refresh the list in the parent screen
            onClose();   // Close the modal
        } catch (error) {
            setGeneralError(error.response?.data?.message || "Failed to update tenant.");
        } finally {
            setIsSaving(false);
        }
    };

    if (!tenant) return null;

    // Determine what image to show (newly picked vs existing vs placeholder)
    let displayImage = null;
    if (imageUri) displayImage = { uri: imageUri };
    else if (tenant.image_url) displayImage = { uri: `${SERVER_URL}${tenant.image_url}` };

    return (
        <Modal animationType="slide" transparent={true} visible={isVisible} onRequestClose={onClose}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
                <View style={[styles.modalContent, isDark ? styles.darkModal : styles.lightModal]}>
                    <View style={styles.modalHeader}>
                        <Text style={[styles.modalTitle, isDark ? styles.darkText : styles.lightText]}>Edit Details</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <Ionicons name="close" size={24} color={isDark ? '#94A3B8' : '#64748B'} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                        <View style={styles.photoPickerContainer}>
                            <TouchableOpacity activeOpacity={0.8} onPress={pickImage} style={[styles.photoPicker, isDark ? styles.darkInput : styles.lightInput]}>
                                {displayImage ? (
                                    <Image source={displayImage} style={styles.photoPreview} />
                                ) : (
                                    <Text style={{fontSize: 24, color: '#6366F1', fontWeight: 'bold'}}>{tenant.name.substring(0, 2).toUpperCase()}</Text>
                                )}
                                <View style={styles.photoEditBadge}>
                                    <Ionicons name="pencil" size={14} color="#FFFFFF" />
                                </View>
                            </TouchableOpacity>
                        </View>

                        <FormInput label="Full Name *" placeholder="e.g. Amit Kumar" value={name} error={errors?.name} onChangeText={(text) => { setName(text); setErrors(prev => ({ ...prev, name: null })); }} isDark={isDark} />

                        <View style={styles.rowInputs}>
                            <View style={{ flex: 1, marginRight: 10 }}>
                                <FormInput label="Phone Number *" placeholder="e.g. 9876543210" value={phone} error={errors?.phone} onChangeText={(text) => { setPhone(text); setErrors(prev => ({ ...prev, phone: null })); }} keyboardType="phone-pad" isDark={isDark} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <FormInput label="Email" placeholder="e.g. amit@mail.com" value={email} error={errors?.email} onChangeText={(text) => { setEmail(text); setErrors(prev => ({ ...prev, email: null })); }} keyboardType="email-address" isDark={isDark} />
                            </View>
                        </View>

                        <FormInput label="Aadhar Number" placeholder="12-digit Aadhar No." value={aadhar} onChangeText={setAadhar} keyboardType="number-pad" isDark={isDark} />

                        <View style={styles.rowInputs}>
                            <View style={{ flex: 1, marginRight: 10 }}>
                                <FormInput label="Company / College" placeholder="e.g. Infosys" value={company} onChangeText={setCompany} isDark={isDark} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <FormInput label="Emergency Phone" placeholder="Parents No." value={emergency} onChangeText={setEmergency} keyboardType="phone-pad" isDark={isDark} />
                            </View>
                        </View>

                        {generalError ? (
                            <View style={styles.generalErrorBox}>
                                <Ionicons name="warning" size={18} color="#EF4444" />
                                <Text style={styles.generalErrorText}>{generalError}</Text>
                            </View>
                        ) : null}

                        <TouchableOpacity style={styles.saveBtnWrapper} activeOpacity={0.8} onPress={handleSave} disabled={isSaving}>
                            <LinearGradient colors={['#6366F1', '#4F46E5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.saveBtn}>
                                {isSaving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
                            </LinearGradient>
                        </TouchableOpacity>
                        <View style={{ height: 40 }} />
                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

// Copy the relevant styles from TenantsTab.js here (modalOverlay, inputContainer, etc.)
const styles = StyleSheet.create({
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 25, paddingTop: 25, maxHeight: Dimensions.get('window').height - 100, width: '100%' },
    lightModal: { backgroundColor: '#FFFFFF' }, darkModal: { backgroundColor: '#0B0F19' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 20, fontWeight: '800' },
    closeBtn: { padding: 5 },
    inputContainer: { marginBottom: 18 },
    rowInputs: { flexDirection: 'row', justifyContent: 'space-between' },
    inputLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 },
    inputWrapper: { borderRadius: 16, paddingHorizontal: 16, height: 55, borderWidth: 1, justifyContent: 'center' },
    input: { fontSize: 15, fontWeight: '500', height: '100%' },
    lightInput: { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0' }, darkInput: { backgroundColor: '#151A25', borderColor: '#1E293B' },
    lightText: { color: '#0F172A' }, darkText: { color: '#FFFFFF' },
    lightSubText: { color: '#64748B' }, darkSubText: { color: '#94A3B8' },
    inputErrorBorder: { borderColor: '#EF4444', borderWidth: 1.5 },
    inlineErrorText: { color: '#EF4444', fontSize: 11, fontWeight: '600', marginTop: 4, marginLeft: 4 },
    generalErrorBox: { flexDirection: 'row', backgroundColor: '#FEF2F2', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#FECACA', alignItems: 'center', marginBottom: 15 },
    generalErrorText: { color: '#EF4444', fontSize: 13, fontWeight: '700', marginLeft: 8, flex: 1 },
    photoPickerContainer: { alignItems: 'center', marginBottom: 20 },
    photoPicker: { width: 90, height: 90, borderRadius: 45, borderWidth: 1, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(99, 102, 241, 0.1)' },
    photoPreview: { width: '100%', height: '100%', borderRadius: 45 },
    photoEditBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#6366F1', width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
    saveBtnWrapper: { marginTop: 10, shadowColor: '#6366F1', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8, borderRadius: 20 },
    saveBtn: { height: 60, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});