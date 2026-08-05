// File: mobile/src/components/PaymentSettingsTab.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Image, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import client, { SERVER_URL, mediaUrl } from '../api/client';
import { useTheme, withAlpha } from '../theme';
import { GlassView } from '../ui';

// UPGRADED: FormInput now supports 'error' props for inline validation
const FormInput = ({ label, placeholder, value, onChangeText, keyboardType = 'default', isDark, error }) => {
    const t = useTheme();

    return (
        <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { color: t.colors.textMuted }]}>{label}</Text>
            <View style={[
                styles.inputWrapper,
                { backgroundColor: t.colors.surfaceAlt, borderColor: t.colors.border },
                error && { borderColor: t.colors.danger, borderWidth: 1.5 }
            ]}>
                <TextInput
                    style={[styles.input, { color: t.colors.text }]}
                    placeholder={placeholder}
                    placeholderTextColor={t.colors.textFaint}
                    value={value}
                    onChangeText={onChangeText}
                    keyboardType={keyboardType}
                />
            </View>
            {/* Render inline error if it exists */}
            {error ? <Text style={[styles.inlineErrorText, { color: t.colors.danger }]}>{error}</Text> : null}
        </View>
    );
};

export default function PaymentSettingsTab({ isDark }) {
    const t = useTheme();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Form States
    const [upiId, setUpiId] = useState('');
    const [upiNumber, setUpiNumber] = useState('');
    const [qrImageUri, setQrImageUri] = useState(null);
    const [existingQrUrl, setExistingQrUrl] = useState(null);

    // NEW: Validation States
    const [errors, setErrors] = useState({});
    const [generalError, setGeneralError] = useState('');

    useEffect(() => {
        fetchPaymentSettings();
    }, []);

    const fetchPaymentSettings = async () => {
        setIsLoading(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            const response = await client.get('/payments/settings', {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (response.data.settings) {
                setUpiId(response.data.settings.upi_id || '');
                setUpiNumber(response.data.settings.upi_number || '');
                setExistingQrUrl(response.data.settings.qr_code_url || null);
            }
        } catch (error) {
            console.log("No existing payment settings found or error fetching.", error);
        } finally {
            setIsLoading(false);
        }
    };

    const pickQrImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1], // QR codes are square
            quality: 0.8,
        });

        if (!result.canceled) {
            setQrImageUri(result.assets[0].uri);
            setGeneralError(''); // Clear general error if they pick an image
        }
    };

    const handleSaveSettings = async () => {
        // --- 1. FRONTEND VALIDATION ---
        setErrors({});
        setGeneralError('');
        let newErrors = {};

        const upiIdTrimmed = upiId.trim();
        const upiNumberTrimmed = upiNumber.trim();

        // Validate UPI ID format (if provided)
        if (upiIdTrimmed) {
            const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
            if (!upiRegex.test(upiIdTrimmed)) {
                newErrors.upiId = "Enter a valid UPI ID (e.g., name@bank).";
            }
        }

        // Validate Phone Number format (if provided)
        if (upiNumberTrimmed) {
            const phoneRegex = /^\d{10}$/;
            if (!phoneRegex.test(upiNumberTrimmed)) {
                newErrors.upiNumber = "UPI Number must be exactly 10 digits.";
            }
        }

        // Check if EVERYTHING is empty
        if (!upiIdTrimmed && !upiNumberTrimmed && !qrImageUri && !existingQrUrl) {
            setGeneralError("Please provide at least one payment method (UPI ID, Number, or QR Code).");
            return;
        }

        // Stop if specific field errors exist
        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        // --- 2. SAVE TO BACKEND ---
        setIsSaving(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            const formData = new FormData();

            formData.append('upi_id', upiIdTrimmed);
            formData.append('upi_number', upiNumberTrimmed);

            if (qrImageUri) {
                const filename = qrImageUri.split('/').pop();
                const match = /\.(\w+)$/.exec(filename);
                const type = match ? `image/${match[1]}` : `image/jpeg`;
                formData.append('qr_code', { uri: qrImageUri, name: filename, type });
            }

            await client.post('/payments/settings', formData, {
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
            });

            Alert.alert("Success", "Payment details saved successfully! These will be attached to tenant rent invoices.");
            fetchPaymentSettings();
            setQrImageUri(null);

        } catch (error) {
            // Catch backend validation errors if any slip through
            setGeneralError(error.response?.data?.message || "Failed to save payment details.");
        } finally {
            setIsSaving(false);
        }
    };

    let displayQr = null;
    if (qrImageUri) displayQr = { uri: qrImageUri };
    else if (existingQrUrl) displayQr = { uri: mediaUrl(existingQrUrl) };

    if (isLoading) {
        return (
            <View style={[styles.container, styles.centerWrapper]}>
                <ActivityIndicator size="large" color={t.colors.primary} />
            </View>
        );
    }

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

                {/* Info Card */}
                <GlassView radius={t.radii.xl} style={[styles.infoCard, t.shadows.sm]}>
                    <View style={[styles.iconBg, { backgroundColor: withAlpha(t.colors.success, 0.15) }]}>
                        <Ionicons name="wallet" size={28} color={t.colors.success} />
                    </View>
                    <View style={styles.infoTextContainer}>
                        <Text style={[styles.infoTitle, { color: t.colors.text }]}>Rent Collection Setup</Text>
                        <Text style={[styles.infoSub, { color: t.colors.textMuted }]}>
                            Add your UPI details and QR code here. Tenants will see these details when rent is due.
                        </Text>
                    </View>
                </GlassView>

                {/* Form Section */}
                <GlassView radius={t.radii.xxl} style={styles.formSection}>

                    <FormInput
                        label="UPI ID (VPA)"
                        placeholder="e.g. yourname@okhdfcbank"
                        value={upiId}
                        error={errors?.upiId}
                        onChangeText={(text) => { setUpiId(text); setErrors(prev => ({ ...prev, upiId: null })); setGeneralError(''); }}
                        isDark={isDark}
                    />

                    <FormInput
                        label="UPI Phone Number"
                        placeholder="e.g. 9876543210"
                        value={upiNumber}
                        error={errors?.upiNumber}
                        onChangeText={(text) => { setUpiNumber(text); setErrors(prev => ({ ...prev, upiNumber: null })); setGeneralError(''); }}
                        keyboardType="phone-pad"
                        isDark={isDark}
                    />

                    {/* QR Code Upload Section */}
                    <Text style={[styles.inputLabel, { color: t.colors.textMuted }, { marginTop: 10 }]}>Payment QR Code</Text>

                    <TouchableOpacity activeOpacity={0.8} onPress={pickQrImage} style={[styles.qrUploadBox, { backgroundColor: t.colors.surfaceAlt, borderColor: t.colors.border }]}>
                        {displayQr ? (
                            <Image source={displayQr} style={styles.qrImagePreview} />
                        ) : (
                            <View style={styles.qrPlaceholder}>
                                <Ionicons name="qr-code-outline" size={48} color={t.colors.textFaint} />
                                <Text style={[styles.uploadText, { color: t.colors.textMuted }]}>Tap to upload PhonePe/GPay QR</Text>
                            </View>
                        )}
                        <View style={[styles.editBadge, { backgroundColor: t.colors.success }, t.shadows.sm]}>
                            <Ionicons name="pencil" size={14} color={t.colors.onPrimary} />
                        </View>
                    </TouchableOpacity>

                </GlassView>

                {/* General Error Display */}
                {generalError ? (
                    <View style={[styles.generalErrorBox, { backgroundColor: withAlpha(t.colors.danger, 0.12), borderColor: withAlpha(t.colors.danger, 0.35) }]}>
                        <Ionicons name="warning" size={18} color={t.colors.danger} />
                        <Text style={[styles.generalErrorText, { color: t.colors.danger }]}>{generalError}</Text>
                    </View>
                ) : null}

                <TouchableOpacity style={[styles.saveBtnWrapper, { shadowColor: t.colors.success }]} activeOpacity={0.8} onPress={handleSaveSettings} disabled={isSaving}>
                    <LinearGradient colors={[t.colors.success, withAlpha(t.colors.success, 0.82)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.saveBtn}>
                        {isSaving ? <ActivityIndicator color={t.colors.onPrimary} /> : <Text style={[styles.saveBtnText, { color: t.colors.onPrimary }]}>Save Payment Details</Text>}
                    </LinearGradient>
                </TouchableOpacity>

                <View style={{ height: 40 }} />
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    centerWrapper: { justifyContent: 'center', alignItems: 'center' },
    scrollContent: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 100 },

    infoCard: { flexDirection: 'row', padding: 20, marginBottom: 20, alignItems: 'center' },
    iconBg: { width: 56, height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    infoTextContainer: { flex: 1 },
    infoTitle: { fontSize: 18, fontWeight: '800', marginBottom: 4 },
    infoSub: { fontSize: 13, lineHeight: 20, fontWeight: '500' },

    formSection: { padding: 20, marginBottom: 20 },
    inputContainer: { marginBottom: 20 },
    inputLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 },
    inputWrapper: { borderRadius: 16, paddingHorizontal: 16, height: 55, borderWidth: 1, justifyContent: 'center' },
    input: { fontSize: 15, fontWeight: '500', height: '100%' },

    qrUploadBox: { height: 220, borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
    qrPlaceholder: { alignItems: 'center' },
    qrImagePreview: { width: '100%', height: '100%', resizeMode: 'contain' },
    uploadText: { marginTop: 12, fontSize: 14, fontWeight: '600' },
    editBadge: { position: 'absolute', bottom: 10, right: 10, width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },

    saveBtnWrapper: { shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8, borderRadius: 20 },
    saveBtn: { height: 60, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    saveBtnText: { fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },

    // NEW: Error Styles
    inlineErrorText: { fontSize: 11, fontWeight: '600', marginTop: 4, marginLeft: 4 },
    generalErrorBox: { flexDirection: 'row', padding: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center', marginBottom: 15 },
    generalErrorText: { fontSize: 13, fontWeight: '700', marginLeft: 8, flex: 1 },
});
