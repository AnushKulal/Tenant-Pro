// File: mobile/src/components/PropertiesTab.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, KeyboardAvoidingView, Platform, Alert, Image, ActivityIndicator, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import client, { SERVER_URL, mediaUrl } from '../api/client';
import { useTheme, withAlpha } from '../theme';
import { GlassView } from '../ui';

const { width, height } = Dimensions.get('window');

// --- Smart Image Component (MOVED OUTSIDE TO PREVENT FLICKERING) ---
const PropertyImage = ({ imageUrl }) => {
    const [hasError, setHasError] = useState(false);
    const defaultImage = `${SERVER_URL}/uploads/property/default-property.jpg`;
    const imageSource = (imageUrl && !hasError) ? mediaUrl(imageUrl) : defaultImage;

    return (
        <Image
            source={{ uri: imageSource }}
            style={styles.cardImage}
            onError={() => setHasError(true)}
        />
    );
};

const FormInput = ({ label, placeholder, value, onChangeText, keyboardType = 'default', isDark }) => {
    const t = useTheme();

    return (
        <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { color: t.colors.textMuted }]}>{label}</Text>
            <View style={[styles.inputWrapper, { backgroundColor: t.colors.surfaceAlt, borderColor: t.colors.border }]}>
                <TextInput
                    style={[styles.input, { color: t.colors.text }]}
                    placeholder={placeholder}
                    placeholderTextColor={t.colors.textFaint}
                    value={value}
                    onChangeText={onChangeText}
                    keyboardType={keyboardType}
                />
            </View>
        </View>
    );
};

export default function PropertiesTab({ isDark }) {
    const t = useTheme();

    // --- DATA STATES ---
    const [properties, setProperties] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // --- MENU & MODAL STATES ---
    const [activeMenuId, setActiveMenuId] = useState(null);
    const [isAddModalVisible, setAddModalVisible] = useState(false);
    const [isDeleteModalVisible, setDeleteModalVisible] = useState(false);
    const [propertyToDelete, setPropertyToDelete] = useState(null);

    // --- FORM STATES (Used for both Create and Edit) ---
    const [editingProperty, setEditingProperty] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const [propName, setPropName] = useState('');
    const [propType, setPropType] = useState('PG');
    const [address, setAddress] = useState('');
    const [locality, setLocality] = useState('');
    const [pincode, setPincode] = useState('');
    const [city, setCity] = useState('Bengaluru');
    const [imageUri, setImageUri] = useState(null);
    const [isNewImage, setIsNewImage] = useState(false);

    const propertyTypes = ['PG', 'Apartment', 'Independent House', 'Hostel'];

    useEffect(() => {
        fetchProperties();
    }, []);

    const fetchProperties = async () => {
        setIsLoading(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            const response = await client.get('/properties', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setProperties(response.data.properties);
        } catch (error) {
            if (error.message === 'Network Error' || error.code === 'ECONNABORTED') {
                Alert.alert("No Internet Connection", "Please check your network and try again.");
            } else {
                Alert.alert("Error", "Failed to load properties.");
            }
        } finally {
            setIsLoading(false);
        }
    };

    const pickImage = async () => {
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permissionResult.granted === false) {
            Alert.alert("Permission Required", "You need to allow camera roll permissions to upload a property image.");
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [16, 9],
            quality: 0.8,
        });

        if (!result.canceled) {
            setImageUri(result.assets[0].uri);
            setIsNewImage(true);
        }
    };

    const resetForm = () => {
        setEditingProperty(null);
        setPropName(''); setAddress(''); setLocality(''); setPincode(''); setCity('Bengaluru');
        setImageUri(null); setIsNewImage(false);
    };

    // --- CREATE & UPDATE LOGIC ---
    const handleSaveProperty = async () => {
        if (!propName.trim() || !address.trim() || !locality.trim() || !pincode.trim() || !city.trim()) {
            return Alert.alert("Missing Details", "Please fill in all required property details.");
        }
        if (pincode.length < 6) return Alert.alert("Invalid Pincode", "Please enter a valid 6-digit Indian pincode.");

        setIsSaving(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            const formData = new FormData();

            formData.append('name', propName);
            formData.append('property_type', propType);
            formData.append('address', address);
            formData.append('locality', locality);
            formData.append('city', city);
            formData.append('pincode', pincode);

            if (imageUri && isNewImage) {
                const filename = imageUri.split('/').pop();
                const match = /\.(\w+)$/.exec(filename);
                const type = match ? `image/${match[1]}` : `image/jpeg`;
                formData.append('property_image', { uri: imageUri, name: filename, type });
            }

            if (editingProperty) {
                await client.put(`/properties/${editingProperty.id}`, formData, {
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
                });
            } else {
                await client.post('/properties', formData, {
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
                });
            }

            await fetchProperties();
            setAddModalVisible(false);
            resetForm();
        } catch (error) {
            Alert.alert("Error", `Failed to ${editingProperty ? 'update' : 'save'} property. Please try again.`);
        } finally {
            setIsSaving(false);
        }
    };

    const openEditModal = (prop) => {
        setActiveMenuId(null); // Instantly close menu
        setEditingProperty(prop);
        setPropName(prop.name);
        setPropType(prop.property_type);
        setAddress(prop.address);
        setLocality(prop.locality);
        setCity(prop.city);
        setPincode(prop.pincode);
        setImageUri(prop.image_url ? mediaUrl(prop.image_url) : null);
        setIsNewImage(false);
        setAddModalVisible(true);
    };

    // --- DELETE LOGIC ---
    const confirmDelete = (prop) => {
        setActiveMenuId(null); // Instantly close menu
        setPropertyToDelete(prop);
        setDeleteModalVisible(true);
    };

    const executeDeleteProperty = async () => {
        setIsDeleting(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            await client.delete(`/properties/${propertyToDelete.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setDeleteModalVisible(false);
            setPropertyToDelete(null);
            fetchProperties();
        } catch (error) {
            Alert.alert("Error", error.response?.data?.message || "Failed to delete property. Make sure it has no active tenants.");
            setDeleteModalVisible(false);
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <View style={styles.container}>
            {isLoading ? (
                <View style={styles.centerWrapper}>
                    <ActivityIndicator size="large" color={t.colors.primary} />
                    <Text style={[styles.loadingText, { color: t.colors.textMuted }]}>Fetching properties...</Text>
                </View>
            ) : (
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled" // ✨ CRITICAL FIX: Allows tapping the popover instantly
                    contentContainerStyle={properties.length === 0 ? styles.centerWrapper : styles.scrollContent}
                >
                    {properties.length === 0 ? (
                        <View style={styles.emptyState}>
                            <View style={[styles.emptyIconBox, { backgroundColor: t.colors.surfaceAlt }]}>
                                <Ionicons name="business-outline" size={40} color={t.colors.primary} />
                            </View>
                            <Text style={[styles.emptyTitle, { color: t.colors.text }]}>No Properties Yet</Text>
                            <Text style={[styles.emptySubtitle, { color: t.colors.textMuted }]}>Add your first PG or Apartment building to start managing tenants and rent.</Text>

                            <TouchableOpacity style={[styles.emptyAddBtn, { backgroundColor: withAlpha(t.colors.primary, 0.1) }]} onPress={() => { resetForm(); setAddModalVisible(true); }}>
                                <Text style={[styles.emptyAddBtnText, { color: t.colors.primary }]}>+ Add Property</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <>
                            <View style={styles.actionBar}>
                                <View style={styles.statsHeader}>
                                    <Text style={[styles.statsCount, { color: t.colors.text }]}>
                                        {properties.length}
                                    </Text>
                                    <Text style={[styles.statsLabel, { color: t.colors.textMuted }]}>
                                        {properties.length === 1 ? 'Property' : 'Properties'}
                                    </Text>
                                </View>
                                <TouchableOpacity activeOpacity={0.8} onPress={() => { resetForm(); setAddModalVisible(true); }}>
                                    <LinearGradient colors={t.colors.primaryGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.addButton, { shadowColor: t.colors.primary }]}>
                                        <Ionicons name="add" size={18} color={t.colors.onPrimary} />
                                        <Text style={[styles.addButtonText, { color: t.colors.onPrimary }]}>Add</Text>
                                    </LinearGradient>
                                </TouchableOpacity>
                            </View>

                            {/* Property Cards */}
                            {properties.map((prop) => (
                                <View key={prop.id} style={{ position: 'relative', zIndex: activeMenuId === prop.id ? 100 : 1, ...(Platform.OS === 'android' && activeMenuId === prop.id ? { elevation: 10 } : {}) }}>

                                    {/* Invisible overlay to close menu when tapping outside */}
                                    {activeMenuId === prop.id && (
                                        <TouchableOpacity style={styles.localOverlay} activeOpacity={1} onPress={() => setActiveMenuId(null)} />
                                    )}

                                    {/* MAIN CARD: Has overflow: hidden, so popover must be OUTSIDE of this view */}
                                    <GlassView radius={t.radii.xl} style={[styles.propertyCard, t.shadows.md]}>
                                        {/* Card body is not tappable: it used to call
                                            navigation.navigate('PropertyDetails'), but this
                                            component never receives a `navigation` prop and no
                                            PropertyDetails route exists, so any tap threw
                                            "Cannot read property 'navigate' of undefined".
                                            Per-property actions live in the ⋯ popover above. */}
                                        <TouchableOpacity activeOpacity={1} disabled>
                                            <View style={styles.cardTopHalf}>
                                                <PropertyImage imageUrl={prop.image_url} />
                                                {/* Badge sits on the photo, so it uses the brand fill —
                                                    a text-coloured chip would go white-on-white in dark mode. */}
                                                <View style={[styles.typeBadge, { backgroundColor: t.colors.primary }]}>
                                                    <Text style={[styles.typeBadgeText, { color: t.colors.onPrimary }]}>{prop.property_type}</Text>
                                                </View>
                                            </View>

                                            <View style={styles.cardBottomHalf}>
                                                <Text style={[styles.propName, { color: t.colors.text }]} numberOfLines={1}>{prop.name}</Text>
                                                <View style={styles.locationRow}>
                                                    <Ionicons name="location" size={14} color={t.colors.primary} />
                                                    <Text style={[styles.propLocality, { color: t.colors.textMuted }]}>{prop.locality}, {prop.city}</Text>
                                                </View>
                                                <View style={[styles.statsDivider, { backgroundColor: t.colors.border }]} />
                                                <View style={styles.statsRow}>
                                                    <View style={[styles.statPill, { backgroundColor: withAlpha(t.colors.success, 0.15) }]}>
                                                        <Ionicons name="key-outline" size={14} color={t.colors.success} />
                                                        <Text style={[styles.statPillText, { color: t.colors.success }]}>{prop.units || 0} Units</Text>
                                                    </View>
                                                    <View style={[styles.statPill, { backgroundColor: withAlpha(t.colors.success, 0.15) }]}>
                                                        <Ionicons name="people-outline" size={14} color={t.colors.warning} />
                                                        <Text style={[styles.statPillText, { color: t.colors.warning }]}>{prop.tenant_count || 0} Tenants</Text>
                                                    </View>
                                                </View>
                                            </View>
                                        </TouchableOpacity>
                                    </GlassView>

                                    {/* ✨ MOVED OUTSIDE: 3-DOT MENU BUTTON */}
                                    <TouchableOpacity
                                        style={styles.menuIcon}
                                        onPress={() => setActiveMenuId(activeMenuId === prop.id ? null : prop.id)}
                                    >
                                        <View style={[styles.menuIconBg, { backgroundColor: t.colors.scrim }]}>
                                            <Ionicons name="ellipsis-vertical" size={18} color={t.colors.onPrimary} />
                                        </View>
                                    </TouchableOpacity>

                                    {/* ✨ MOVED OUTSIDE: DROPDOWN POPOVER MENU */}
                                    {activeMenuId === prop.id && (
                                        <GlassView strong radius={t.radii.md} style={[styles.popoverMenu, t.shadows.lg]}>
                                            <TouchableOpacity
                                                style={styles.popoverItem}
                                                onPress={() => openEditModal(prop)}
                                            >
                                                <Ionicons name="create-outline" size={16} color={t.colors.textMuted} />
                                                <Text style={[styles.popoverText, { color: t.colors.text }]}>Edit Details</Text>
                                            </TouchableOpacity>
                                            <View style={[styles.popoverDivider, { backgroundColor: t.colors.border }]} />
                                            <TouchableOpacity
                                                style={styles.popoverItem}
                                                onPress={() => confirmDelete(prop)}
                                            >
                                                <Ionicons name="trash-outline" size={16} color={t.colors.danger} />
                                                <Text style={[styles.popoverText, { color: t.colors.danger }]}>Delete Property</Text>
                                            </TouchableOpacity>
                                        </GlassView>
                                    )}

                                </View>
                            ))}
                        </>
                    )}
                    <View style={{ height: 120 }} />
                </ScrollView>
            )}

            {/* --- ADD / EDIT PROPERTY MODAL --- */}
            <Modal animationType="slide" transparent={true} visible={isAddModalVisible} onRequestClose={() => { setAddModalVisible(false); resetForm(); }}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.modalOverlay, { backgroundColor: t.colors.scrim }]}>
                    {/* radius={0} so the sheet keeps its square bottom corners; the
                        top corners come from styles.modalContent. */}
                    <GlassView strong radius={0} style={styles.modalContent}>

                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: t.colors.text }]}>
                                {editingProperty ? 'Edit Property' : 'Add New Property'}
                            </Text>
                            <TouchableOpacity onPress={() => { setAddModalVisible(false); resetForm(); }} style={styles.closeBtn}>
                                <Ionicons name="close" size={24} color={t.colors.textMuted} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>

                            <TouchableOpacity activeOpacity={0.8} onPress={pickImage} style={styles.imageUploadContainer}>
                                {imageUri ? (
                                    <Image source={{ uri: imageUri }} style={styles.uploadedImage} />
                                ) : (
                                    <View style={[styles.imagePlaceholder, { backgroundColor: t.colors.surfaceAlt, borderColor: t.colors.border }]}>
                                        <Ionicons name="camera-outline" size={32} color={t.colors.textMuted} />
                                        <Text style={[styles.uploadText, { color: t.colors.textMuted }]}>Upload Property Photo</Text>
                                    </View>
                                )}
                            </TouchableOpacity>

                            <FormInput label="Property / Branch Name" placeholder="e.g. Royal PG Koramangala" value={propName} onChangeText={setPropName} isDark={isDark} />

                            <Text style={[styles.inputLabel, { color: t.colors.textMuted }]}>Property Type</Text>
                            <View style={styles.typeContainer}>
                                {propertyTypes.map((type) => {
                                    const isActive = propType === type;
                                    return (
                                        <TouchableOpacity
                                            key={type}
                                            style={[
                                                styles.typePill,
                                                isActive
                                                    ? { backgroundColor: t.colors.primary, borderColor: t.colors.primary }
                                                    : { backgroundColor: t.colors.surfaceAlt, borderColor: t.colors.border }
                                            ]}
                                            onPress={() => setPropType(type)}
                                        >
                                            <Text style={[styles.typeText, isActive ? [styles.activeTypeText, { color: t.colors.onPrimary }] : { color: t.colors.textMuted }]}>
                                                {type}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            <FormInput label="Street Address" placeholder="e.g. #123, 4th Cross" value={address} onChangeText={setAddress} isDark={isDark} />

                            <View style={styles.rowInputs}>
                                <View style={{ flex: 1, marginRight: 10 }}>
                                    <FormInput label="Locality" placeholder="e.g. HSR Layout" value={locality} onChangeText={setLocality} isDark={isDark} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <FormInput label="Pincode" placeholder="e.g. 560102" value={pincode} onChangeText={setPincode} keyboardType="numeric" isDark={isDark} />
                                </View>
                            </View>

                            <FormInput label="City" placeholder="e.g. Bengaluru" value={city} onChangeText={setCity} isDark={isDark} />

                            <TouchableOpacity style={[styles.saveBtnWrapper, { shadowColor: t.colors.primary }]} activeOpacity={0.8} onPress={handleSaveProperty} disabled={isSaving}>
                                <LinearGradient colors={t.colors.primaryGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.saveBtn}>
                                    {isSaving ? <ActivityIndicator color={t.colors.onPrimary} /> : <Text style={[styles.saveBtnText, { color: t.colors.onPrimary }]}>{editingProperty ? 'Update Property' : 'Save Property'}</Text>}
                                </LinearGradient>
                            </TouchableOpacity>
                            <View style={{ height: 40 }} />
                        </ScrollView>
                    </GlassView>
                </KeyboardAvoidingView>
            </Modal>

            {/* --- CUSTOM DELETE CONFIRMATION MODAL --- */}
            <Modal animationType="fade" transparent={true} visible={isDeleteModalVisible} onRequestClose={() => setDeleteModalVisible(false)}>
                <View style={[styles.deleteModalOverlay, { backgroundColor: t.colors.scrim }]}>
                    <GlassView strong radius={24} style={[styles.confirmDialog, t.shadows.md]}>
                        <View style={[styles.warningIconBg, { backgroundColor: withAlpha(t.colors.danger, 0.15) }]}>
                            <Ionicons name="trash-bin" size={32} color={t.colors.danger} />
                        </View>
                        <Text style={[styles.confirmTitle, { color: t.colors.text }]}>Delete Property?</Text>
                        <Text style={[styles.confirmSubText, { color: t.colors.textMuted }]}>
                            Are you sure you want to permanently delete <Text style={{ fontWeight: '800' }}>{propertyToDelete?.name}</Text>? You cannot undo this.
                        </Text>

                        <View style={styles.confirmActions}>
                            <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: t.colors.surfaceAlt, borderColor: t.colors.border }]} onPress={() => setDeleteModalVisible(false)} disabled={isDeleting}>
                                <Text style={[styles.confirmBtnText, { color: t.colors.text }]}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: t.colors.danger, borderWidth: 0 }]} onPress={executeDeleteProperty} disabled={isDeleting}>
                                {isDeleting ? <ActivityIndicator color={t.colors.onPrimary} size="small" /> : <Text style={[styles.confirmBtnText, { color: t.colors.onPrimary }]}>Delete</Text>}
                            </TouchableOpacity>
                        </View>
                    </GlassView>
                </View>
            </Modal>

        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },

    centerWrapper: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 12, fontSize: 14, fontWeight: '600' },

    actionBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 15, paddingTop: 0 },
    statsHeader: { flexDirection: 'row', alignItems: 'baseline' },
    statsCount: { fontSize: 24, fontWeight: '800', marginRight: 6, letterSpacing: -0.5 },
    statsLabel: { fontSize: 15, fontWeight: '600', paddingBottom: 2 },

    addButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 10, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
    addButtonText: { fontWeight: '700', marginLeft: 4, fontSize: 13 },

    scrollContent: { paddingHorizontal: 20, paddingTop: 10 },

    emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, paddingHorizontal: 20 },
    emptyIconBox: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: 10 },
    emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 25 },
    emptyAddBtn: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 },
    emptyAddBtnText: { fontWeight: '700', fontSize: 15 },

    propertyCard: { borderRadius: 20, marginBottom: 20, overflow: 'hidden' },

    cardTopHalf: { height: 160, position: 'relative' },
    cardImage: { width: '100%', height: '100%', resizeMode: 'cover' },

    menuIcon: { position: 'absolute', top: 12, right: 12, zIndex: 10 },
    menuIconBg: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },

    typeBadge: { position: 'absolute', bottom: 12, left: 12, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
    typeBadgeText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },

    cardBottomHalf: { padding: 18 },
    propName: { fontSize: 18, fontWeight: '800', marginBottom: 6, letterSpacing: -0.3 },
    locationRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
    propLocality: { fontSize: 13, marginLeft: 6, fontWeight: '500' },

    statsDivider: { height: 1, marginBottom: 15 },
    statsRow: { flexDirection: 'row', gap: 12 },
    statPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
    statPillText: { fontSize: 12, fontWeight: '700', marginLeft: 6 },

    // --- POPOVER MENU STYLES ---
    localOverlay: { position: 'absolute', top: -height, bottom: -height, left: -width, right: -width, zIndex: 40 },
    popoverMenu: { position: 'absolute', top: 50, right: 12, borderRadius: 12, width: 160, zIndex: 999, padding: 5 },
    popoverItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 15 },
    popoverText: { fontSize: 14, fontWeight: '600', marginLeft: 10 },
    popoverDivider: { height: 1 },

    modalOverlay: { flex: 1, justifyContent: 'flex-end' },
    modalContent: { borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 25, paddingTop: 25, maxHeight: '90%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 20, fontWeight: '800' },
    closeBtn: { padding: 5 },

    imageUploadContainer: { marginBottom: 20, borderRadius: 16, overflow: 'hidden' },
    imagePlaceholder: { height: 160, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' },
    uploadedImage: { width: '100%', height: 160, resizeMode: 'cover', borderRadius: 16 },
    uploadText: { marginTop: 8, fontSize: 13, fontWeight: '600' },

    inputContainer: { marginBottom: 18 },
    rowInputs: { flexDirection: 'row', justifyContent: 'space-between' },
    inputLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 },
    inputWrapper: { borderRadius: 16, paddingHorizontal: 16, height: 55, borderWidth: 1, justifyContent: 'center' },
    input: { fontSize: 15, fontWeight: '500', height: '100%' },

    typeContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
    typePill: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1 },
    activeTypeText: { fontWeight: '700' },

    saveBtnWrapper: { marginTop: 10, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
    saveBtn: { height: 60, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    saveBtnText: { fontSize: 16, fontWeight: '700' },

    // --- DELETE MODAL STYLES ---
    deleteModalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, zIndex: 999 },
    confirmDialog: { width: '100%', borderRadius: 24, padding: 24, alignItems: 'center' },
    warningIconBg: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    confirmTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
    confirmSubText: { fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
    confirmActions: { flexDirection: 'row', gap: 12, width: '100%' },
    confirmBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: 'transparent' },
    confirmBtnText: { fontSize: 15, fontWeight: '700' }
});
