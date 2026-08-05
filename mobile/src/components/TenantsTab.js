import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Image, Dimensions, Modal, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import client, { SERVER_URL, mediaUrl } from '../api/client';
import { useTheme, withAlpha } from '../theme';
import { GlassView, Avatar } from '../ui';
import EditTenantModal from './EditTenantModal';
import ChangeRoomModal from './ChangeRoomModal';
import UpdateFinancialsModal from './UpdateFinancialsModal';

const { width } = Dimensions.get('window');

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
            {error ? <Text style={[styles.inlineErrorText, { color: t.colors.danger }]}>{error}</Text> : null}
        </View>
    );
};

export default function TenantsTab({ isDark, onViewProfile, activePropertyId }) {
    const t = useTheme();

    const [tenants, setTenants] = useState([]);
    const [filteredTenants, setFilteredTenants] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState('All');
    const [isLoading, setIsLoading] = useState(true);

    // --- ADD TENANT FORM STATES ---
    const [isAddTenantModalVisible, setAddTenantModalVisible] = useState(false);
    const [isSavingTenant, setIsSavingTenant] = useState(false);
    const [tenantErrors, setTenantErrors] = useState({});
    const [tenantGeneralError, setTenantGeneralError] = useState('');
    const [tenantName, setTenantName] = useState('');
    const [tenantPhone, setTenantPhone] = useState('');
    const [tenantEmail, setTenantEmail] = useState('');
    const [tenantAadhar, setTenantAadhar] = useState('');
    const [tenantCompany, setTenantCompany] = useState('');
    const [tenantEmergency, setTenantEmergency] = useState('');
    const [tenantImageUri, setTenantImageUri] = useState(null);

    const [openMenuId, setOpenMenuId] = useState(null);

    const [isEditModalVisible, setEditModalVisible] = useState(false);
    const [tenantToEdit, setTenantToEdit] = useState(null);

    // --- Update Financial Details (Rent)---
    const [isUpdateFinanceVisible, setUpdateFinanceVisible] = useState(false);
    const [tenantToUpdate, setTenantToUpdate] = useState(null);

    // --- SHIFT ROOM STATES ---
    const [isChangeRoomVisible, setChangeRoomVisible] = useState(false);
    const [tenantToShift, setTenantToShift] = useState(null);

    const pickTenantImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        });

        if (!result.canceled) {
            setTenantImageUri(result.assets[0].uri);
        }
    };

    // --- DELETE MODAL STATES ---
    const [isDeleteModalVisible, setDeleteModalVisible] = useState(false);
    const [tenantToDelete, setTenantToDelete] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const openDeleteConfirm = (tenant) => {
        setOpenMenuId(null); // Close the dropdown menu
        setTenantToDelete(tenant);
        setDeleteModalVisible(true);
    };

    const handleDeleteTenant = async () => {
        if (!tenantToDelete) return;
        setIsDeleting(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            await client.delete(`/tenants/${tenantToDelete.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setDeleteModalVisible(false);
            setTenantToDelete(null);
            fetchAllTenants(); // Refresh the list!
        } catch (error) {
            alert(error.response?.data?.message || "Failed to delete tenant.");
        } finally {
            setIsDeleting(false);
        }
    };

    // --- MOVE OUT MODAL STATES ---
    const [isMoveOutModalVisible, setMoveOutModalVisible] = useState(false);
    const [tenantToMoveOut, setTenantToMoveOut] = useState(null);
    const [isMovingOut, setIsMovingOut] = useState(false);

    const openMoveOutConfirm = (tenant) => {
        setOpenMenuId(null); // Close the dropdown menu
        setTenantToMoveOut(tenant);
        setMoveOutModalVisible(true);
    };

    const handleMoveOutConfirm = async () => {
        if (!tenantToMoveOut) return;
        setIsMovingOut(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            await client.put(`/tenants/${tenantToMoveOut.id}/move-out`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setMoveOutModalVisible(false);
            setTenantToMoveOut(null);
            fetchAllTenants(); // Refresh the list
        } catch (error) {
            alert(error.response?.data?.message || "Failed to move out tenant.");
        } finally {
            setIsMovingOut(false);
        }
    };

    const handleSaveNewTenant = async () => {
        setTenantErrors({});
        setTenantGeneralError('');
        let errors = {};

        if (!tenantName.trim()) errors.name = "Name is required.";
        if (!tenantPhone.trim()) {
            errors.phone = "Phone number is required.";
        } else if (!/^\d{10}$/.test(tenantPhone.trim())) {
            errors.phone = "Enter a valid 10-digit phone number.";
        }
        if (tenantEmail.trim() && !/\S+@\S+\.\S+/.test(tenantEmail.trim())) {
            errors.email = "Enter a valid email address.";
        }

        if (Object.keys(errors).length > 0) {
            setTenantErrors(errors);
            setTenantGeneralError("Please fix the highlighted errors above.");
            return;
        }

        setIsSavingTenant(true);

        try {
            const token = await AsyncStorage.getItem('userToken');
            const formData = new FormData();

            // We do NOT send unit_id, deposit, or rent_share here, so they default to NULL/0 in backend!
            formData.append('name', tenantName);
            formData.append('phone', tenantPhone);
            formData.append('email', tenantEmail);
            formData.append('aadhar', tenantAadhar);
            formData.append('company', tenantCompany);
            formData.append('emergency', tenantEmergency);

            if (tenantImageUri) {
                const filename = tenantImageUri.split('/').pop();
                const match = /\.(\w+)$/.exec(filename);
                const type = match ? `image/${match[1]}` : `image/jpeg`;
                formData.append('tenant_image', { uri: tenantImageUri, name: filename, type });
            }

            await client.post('/tenants', formData, {
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
            });

            await fetchAllTenants(); // Refresh the master list
            resetTenantForm();
            setActiveFilter('Unassigned'); // Auto-switch to Unassigned to show the new tenant!

        } catch (error) {
            if (error.response && error.response.status === 409) {
                const conflictField = error.response.data.field;
                setTenantErrors({ [conflictField]: error.response.data.message });
                setTenantGeneralError(error.response.data.message);
            } else {
                setTenantGeneralError(error.response?.data?.message || "Failed to add tenant.");
            }
        } finally {
            setIsSavingTenant(false);
        }
    };

    const resetTenantForm = () => {
        setTenantName(''); setTenantPhone(''); setTenantEmail(''); setTenantAadhar('');
        setTenantCompany(''); setTenantEmergency(''); setTenantImageUri(null);

        setTenantErrors({});
        setTenantGeneralError('');

        setAddTenantModalVisible(false);
    };

    // Update your Add Tenant Button click handler
    const handleAddTenantClick = () => {
        resetTenantForm();
        setAddTenantModalVisible(true);
    };

    useEffect(() => {
        fetchAllTenants();
    }, []);

    // Filter Logic
    useEffect(() => {
        let result = tenants;

        // --- 1. Global Property Filter ---
        if (activePropertyId && activePropertyId !== 'all') {
            result = result.filter(t =>
                t.property_id == activePropertyId ||
                (t.unit_id === null && t.status === 'Active') ||
                t.status === 'Inactive' // <--- ADD THIS LINE: Let past tenants bypass the filter
            );
        }

        // Apply Status Filter
        if (activeFilter === 'Active') {
            result = result.filter(t => t.status === 'Active' && t.unit_id !== null);
        } else if (activeFilter === 'Unassigned') {
            result = result.filter(t => t.unit_id === null && t.status === 'Active');
        } else if (activeFilter === 'Past') {
            result = result.filter(t => t.status === 'Inactive');
        }

        // Apply Search Filter
        if (searchQuery.trim() !== '') {
            const query = searchQuery.toLowerCase();
            result = result.filter(t =>
                t.name.toLowerCase().includes(query) ||
                t.phone.includes(query)
            );
        }

        setFilteredTenants(result);
    }, [tenants, activeFilter, searchQuery, activePropertyId]);

    const fetchAllTenants = async () => {
        setIsLoading(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            const response = await client.get('/tenants', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setTenants(response.data.tenants);
        } catch (error) {
            console.log("Failed to fetch tenants", error);
        } finally {
            setIsLoading(false);
        }
    };

    const FilterPill = ({ label, icon }) => {
        const isActive = activeFilter === label;

        // --- 1. Filter by Property FIRST ---
        let currentPropTenants = tenants;

        // Use lowercase 'all' to match what your Header is saving
        if (activePropertyId && activePropertyId !== 'all') {
            currentPropTenants = tenants.filter(t =>
                t.property_id == activePropertyId ||
                (t.unit_id === null && t.status === 'Active') || // Keep Unassigned visible everywhere
                t.status === 'Inactive' // Keep Past tenants visible everywhere
            );
        }

        // --- 2. THEN calculate the counts ---
        let count = 0;
        if (label === 'All') count = currentPropTenants.length;
        if (label === 'Active') count = currentPropTenants.filter(t => t.status === 'Active' && t.unit_id !== null).length;
        if (label === 'Unassigned') count = currentPropTenants.filter(t => t.unit_id === null && t.status === 'Active').length;
        if (label === 'Past') count = currentPropTenants.filter(t => t.status === 'Inactive').length;

        return (
            <TouchableOpacity
                style={[
                    styles.filterPill,
                    isActive
                        ? { backgroundColor: t.colors.primary }
                        : [{ backgroundColor: t.colors.surface }, t.shadows.sm]
                ]}
                onPress={() => setActiveFilter(label)}
                activeOpacity={0.8}
            >
                {icon && <Ionicons name={icon} size={14} color={isActive ? t.colors.onPrimary : t.colors.textMuted} style={{ marginRight: 6 }} />}
                <Text style={isActive ? [styles.filterTextActive, { color: t.colors.onPrimary }] : [styles.filterText, { color: t.colors.textMuted }]}>
                    {label}{' '}
                    <Text style={[
                        isActive ? styles.filterCountActive : styles.filterCount,
                        // On the filled pill the count sits on primary, so it needs a
                        // translucent onPrimary rather than a page-level muted tone.
                        { color: isActive ? withAlpha(t.colors.onPrimary, 0.75) : t.colors.textFaint }
                    ]}>({count})</Text>
                </Text>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>

            {/* Header Area: Search & Add Button */}
            <View style={styles.headerSection}>
                <GlassView radius={t.radii.lg} style={[styles.searchBar, t.shadows.sm]}>
                    <Ionicons name="search" size={20} color={t.colors.textFaint} style={styles.searchIcon} />
                    <TextInput
                        style={[styles.searchInput, { color: t.colors.text }]}
                        placeholder="Search by name or phone..."
                        placeholderTextColor={t.colors.textFaint}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 5 }}>
                            <Ionicons name="close-circle" size={18} color={t.colors.textFaint} />
                        </TouchableOpacity>
                    )}
                </GlassView>
            </View>

            {/* Filters Area */}
            <View style={styles.filterWrapper}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow} keyboardShouldPersistTaps="handled">
                    <TouchableOpacity activeOpacity={0.8} onPress={handleAddTenantClick} style={{ marginRight: 5 }}>
                        <LinearGradient colors={[t.colors.success, withAlpha(t.colors.success, 0.82)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.inlineAddBtn, { shadowColor: t.colors.success }]}>
                            <Ionicons name="person-add" size={16} color={t.colors.onPrimary} />
                            <Text style={[styles.inlineAddText, { color: t.colors.onPrimary }]}>Add</Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    <View style={[styles.filterDivider, { backgroundColor: t.colors.border }]} />
                    <FilterPill label="All" icon="people" />
                    <FilterPill label="Unassigned" icon="help-circle" />
                    <FilterPill label="Active" icon="home" />
                    <FilterPill label="Past" icon="time" />
                </ScrollView>
            </View>

            {/* List Area */}
            {isLoading ? (
                <View style={styles.centerWrapper}>
                    <ActivityIndicator size="large" color={t.colors.primary} />
                </View>
            ) : (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={filteredTenants.length === 0 ? styles.centerWrapper : styles.scrollContent} keyboardShouldPersistTaps="handled" onScroll={() => setOpenMenuId(null)} scrollEventThrottle={16}>

                    {filteredTenants.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Ionicons name="search-outline" size={54} color={t.colors.textFaint} />
                            <Text style={[styles.emptyText, { color: t.colors.textMuted }]}>No tenants found.</Text>
                        </View>
                    ) : (
                        filteredTenants.map((tenant) => (
                            <TouchableOpacity
                                key={tenant.id}
                                activeOpacity={1}
                                style={[
                                    styles.tenantCard,
                                    { backgroundColor: t.colors.surface },
                                    t.shadows.md,
                                    // Highlight Unassigned tenants with a subtle border
                                    tenant.unit_id === null && tenant.status === 'Active' && { borderWidth: 1, borderColor: t.colors.warning },
                                    { zIndex: openMenuId === tenant.id ? 999 : 1 }
                                ]}
                                onPress={() => {
                                    // If menu is open, close it. Otherwise view profile.
                                    if (openMenuId) setOpenMenuId(null);
                                    else onViewProfile(tenant);
                                }}
                            >

                                {/* Avatar Section */}
                                <View style={styles.avatarWrapper}>
                                    <Avatar name={tenant.name} uri={tenant.image_url} size={60} />
                                    {/* Status Dot */}
                                    <View style={[
                                        styles.statusDot,
                                        { backgroundColor: tenant.status === 'Inactive' ? t.colors.textMuted : (tenant.unit_id ? t.colors.success : t.colors.warning) },
                                        { borderColor: t.colors.surface }
                                    ]} />
                                </View>

                                {/* Info Section */}
                                <View style={styles.tenantInfo}>
                                    <Text style={[styles.tenantName, { color: t.colors.text }]} numberOfLines={1}>
                                        {tenant.name}
                                    </Text>
                                    <Text style={[styles.tenantPhone, { color: t.colors.textMuted }]}>
                                        +91 {tenant.phone}
                                    </Text>

                                    {/* Location Badge */}
                                    <View style={styles.locationBadgeRow}>
                                        {tenant.status === 'Inactive' ? (
                                            <View style={[styles.locationBadge, { backgroundColor: t.colors.surfaceAlt }]}>
                                                <Ionicons name="time-outline" size={12} color={t.colors.textMuted} />
                                                <Text style={[styles.locationText, { color: t.colors.textMuted }]}>Moved Out</Text>
                                            </View>
                                        ) : tenant.unit_id ? (
                                            <View style={[styles.locationBadge, { backgroundColor: t.colors.surfaceAlt }]}>
                                                <Ionicons name="home" size={12} color={t.colors.primary} />
                                                <Text style={[styles.locationText, { color: t.colors.textMuted }]} numberOfLines={1}>
                                                    Unit {tenant.unit_number} • {tenant.property_name}
                                                </Text>
                                            </View>
                                        ) : (
                                            <View style={[styles.locationBadge, { backgroundColor: withAlpha(t.colors.warning, 0.15) }]}>
                                                <Ionicons name="alert-circle" size={12} color={t.colors.warning} />
                                                <Text style={[styles.locationText, { color: t.colors.warning }]}>Unassigned</Text>
                                            </View>
                                        )}
                                    </View>
                                </View>

                                {/* Right Side Menu & Rent */}
                                <View style={[styles.rightActionArea, { zIndex: 100 }]}>

                                    {/* 3-Dot Button */}
                                    <TouchableOpacity
                                        style={styles.menuIconBtn}
                                        onPress={() => setOpenMenuId(openMenuId === tenant.id ? null : tenant.id)}
                                    >
                                        <Ionicons name="ellipsis-vertical" size={20} color={t.colors.textFaint} />
                                    </TouchableOpacity>

                                    {/* FLOATING DROPDOWN MENU */}
                                    {openMenuId === tenant.id && (

                                        <>
                                            {/* --- ADD THIS INVISIBLE OVERLAY --- */}
                                            <TouchableOpacity
                                                style={styles.menuOverlay}
                                                activeOpacity={1}
                                                onPress={() => setOpenMenuId(null)}
                                            />

                                            <GlassView strong radius={t.radii.md} style={[styles.dropdownMenu, t.shadows.md]}>
                                                <TouchableOpacity style={styles.dropdownItem} onPress={() => {
                                                    setOpenMenuId(null);
                                                    setTenantToEdit(tenant);
                                                    setEditModalVisible(true);
                                                }}>
                                                    <Ionicons name="create-outline" size={16} color={t.colors.text} />
                                                    <Text style={[styles.dropdownText, { color: t.colors.text }]}>Edit</Text>
                                                </TouchableOpacity>

                                                {/* Only show Move Out if they are Active AND have a room */}
                                                {tenant.status === 'Active' && tenant.unit_id && (
                                                    <TouchableOpacity style={styles.dropdownItem} onPress={() => openMoveOutConfirm(tenant)}>
                                                        <Ionicons name="exit-outline" size={16} color={t.colors.warning} />
                                                        <Text style={[styles.dropdownText, { color: t.colors.warning }]}>Move Out</Text>
                                                    </TouchableOpacity>
                                                )}

                                                {/* --- NEW: SHIFT ROOM BUTTON --- */}
                                                {/* Only show if they are Active (they can be in a room or Unassigned!) */}
                                                {tenant.status === 'Active' && (
                                                    <TouchableOpacity style={styles.dropdownItem} onPress={() => {
                                                        setOpenMenuId(null);
                                                        setTenantToShift(tenant);
                                                        setChangeRoomVisible(true);
                                                    }}>
                                                        <Ionicons name="swap-horizontal-outline" size={16} color={t.colors.primaryAlt} />
                                                        <Text style={[styles.dropdownText, { color: t.colors.primaryAlt }]}>
                                                            {tenant.unit_id ? 'Shift Room' : 'Assign Room'}
                                                        </Text>
                                                    </TouchableOpacity>
                                                )}

                                                {/* 4. EDIT RENT (Only if Active AND assigned to a room) */}
                                                {tenant.status === 'Active' && tenant.unit_id && (
                                                    <TouchableOpacity style={styles.dropdownItem} onPress={() => {
                                                        setOpenMenuId(null);
                                                        setTenantToUpdate(tenant);
                                                        setUpdateFinanceVisible(true);
                                                    }}>
                                                        <Ionicons name="cash-outline" size={16} color={t.colors.success} />
                                                        <Text style={[styles.dropdownText, { color: t.colors.success }]}>Edit Rent</Text>
                                                    </TouchableOpacity>
                                                )}

                                                <TouchableOpacity style={styles.dropdownItem} onPress={() => openDeleteConfirm(tenant)}>
                                                    <Ionicons name="trash-outline" size={16} color={t.colors.danger} />
                                                    <Text style={[styles.dropdownText, { color: t.colors.danger }]}>Delete</Text>
                                                </TouchableOpacity>
                                            </GlassView>
                                        </>
                                    )}

                                    { /* Rent Block */}
                                    <View style={styles.rentBlock}>
                                        {tenant.unit_id && tenant.status === 'Active' ? (
                                            <>
                                                <Text style={[styles.rentAmount, { color: t.colors.success }]}>₹{tenant.rent_share}</Text>
                                                <Text style={[styles.rentLabel, { color: t.colors.textMuted }]}>Rent</Text>
                                            </>
                                        ) : (
                                            <Text style={[styles.rentLabel, { color: t.colors.textMuted }, { marginTop: 15 }]}>--</Text>
                                        )}
                                    </View>
                                </View>

                            </TouchableOpacity>
                        ))
                    )}
                    <View style={{ height: 100 }} />
                </ScrollView>
            )}

            {/* --- ADD GLOBAL TENANT MODAL --- */}
            <Modal animationType="slide" transparent={true} visible={isAddTenantModalVisible} onRequestClose={resetTenantForm}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.modalOverlay, { backgroundColor: t.colors.scrim }]}>
                    <GlassView strong radius={0} style={styles.tenantModalContent}>

                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: t.colors.text }]}>Pre-Register Tenant</Text>
                            <TouchableOpacity onPress={resetTenantForm} style={styles.closeBtn}>
                                <Ionicons name="close" size={24} color={t.colors.textMuted} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                            <Text style={[styles.formSectionTitle, { color: t.colors.primary }]}>Profile Details</Text>

                            <View style={styles.tenantPhotoPickerContainer}>
                                <TouchableOpacity activeOpacity={0.8} onPress={pickTenantImage} style={[styles.tenantPhotoPicker, { backgroundColor: t.colors.surfaceAlt, borderColor: t.colors.border }]}>
                                    {tenantImageUri ? (
                                        <Image source={{ uri: tenantImageUri }} style={styles.tenantPhotoPreview} />
                                    ) : (
                                        <Ionicons name="camera-outline" size={32} color={t.colors.textMuted} />
                                    )}
                                    <View style={[styles.tenantPhotoEditBadge, { backgroundColor: t.colors.primary, borderColor: t.colors.surface }]}>
                                        <Ionicons name="add" size={14} color={t.colors.onPrimary} />
                                    </View>
                                </TouchableOpacity>
                                <Text style={[styles.tenantPhotoLabel, { color: t.colors.textMuted }]}>Profile Photo</Text>
                            </View>

                            <FormInput label="Full Name (As per Aadhar) *" placeholder="e.g. Amit Kumar" value={tenantName} error={tenantErrors?.name} onChangeText={(text) => { setTenantName(text); setTenantErrors(prev => ({ ...prev, name: null })); setTenantGeneralError(''); }} isDark={isDark} />

                            <View style={styles.rowInputs}>
                                <View style={{ flex: 1, marginRight: 10 }}>
                                    <FormInput label="Phone Number *" placeholder="e.g. 9876543210" value={tenantPhone} error={tenantErrors?.phone} onChangeText={(text) => { setTenantPhone(text); setTenantErrors(prev => ({ ...prev, phone: null })); setTenantGeneralError(''); }} keyboardType="phone-pad" isDark={isDark} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <FormInput label="Email (Optional)" placeholder="e.g. amit@mail.com" value={tenantEmail} error={tenantErrors?.email} onChangeText={(text) => { setTenantEmail(text); setTenantErrors(prev => ({ ...prev, email: null })); setTenantGeneralError(''); }} keyboardType="email-address" isDark={isDark} />
                                </View>
                            </View>

                            <Text style={[styles.formSectionTitle, { color: t.colors.primary }]}>Verification & Work</Text>

                            <FormInput label="Aadhar Number" placeholder="12-digit Aadhar No." value={tenantAadhar} error={tenantErrors?.aadhar} onChangeText={(text) => { setTenantAadhar(text); setTenantErrors(prev => ({ ...prev, aadhar: null })); setTenantGeneralError(''); }} keyboardType="number-pad" isDark={isDark} />

                            <View style={styles.rowInputs}>
                                <View style={{ flex: 1, marginRight: 10 }}>
                                    <FormInput label="Company / College" placeholder="e.g. Infosys" value={tenantCompany} onChangeText={setTenantCompany} isDark={isDark} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <FormInput label="Emergency Phone" placeholder="Parents No." value={tenantEmergency} onChangeText={setTenantEmergency} keyboardType="phone-pad" isDark={isDark} />
                                </View>
                            </View>

                            {tenantGeneralError ? (
                                <View style={[styles.generalErrorBox, { backgroundColor: withAlpha(t.colors.danger, 0.12), borderColor: withAlpha(t.colors.danger, 0.35) }]}>
                                    <Ionicons name="warning" size={18} color={t.colors.danger} />
                                    <Text style={[styles.generalErrorText, { color: t.colors.danger }]}>{tenantGeneralError}</Text>
                                </View>
                            ) : null}

                            <TouchableOpacity style={[styles.tenantSaveBtnWrapper, { shadowColor: t.colors.success }]} activeOpacity={0.8} onPress={handleSaveNewTenant} disabled={isSavingTenant}>
                                <LinearGradient colors={[t.colors.success, withAlpha(t.colors.success, 0.82)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.saveBtn}>
                                    {isSavingTenant ? <ActivityIndicator color={t.colors.onPrimary} /> : <Text style={[styles.saveBtnText, { color: t.colors.onPrimary }]}>Add Tenant</Text>}
                                </LinearGradient>
                            </TouchableOpacity>
                            <View style={{ height: 40 }} />
                        </ScrollView>
                    </GlassView>
                </KeyboardAvoidingView>
            </Modal>

            {/* --- CUSTOM DELETE CONFIRMATION MODAL --- */}
            <Modal animationType="fade" transparent={true} visible={isDeleteModalVisible} onRequestClose={() => setDeleteModalVisible(false)}>
                <View style={[styles.modalOverlayCenter, { backgroundColor: t.colors.scrim }]}>
                    <GlassView strong radius={24} style={styles.confirmDialog}>
                        <View style={[styles.warningIconBg, { backgroundColor: withAlpha(t.colors.danger, 0.15) }]}>
                            <Ionicons name="warning-outline" size={32} color={t.colors.danger} />
                        </View>
                        <Text style={[styles.confirmTitle, { color: t.colors.text }]}>Delete Tenant?</Text>
                        <Text style={[styles.confirmSubText, { color: t.colors.textMuted }]}>
                            Are you sure you want to permanently delete <Text style={{ fontWeight: 'bold', color: t.colors.text }}>{tenantToDelete?.name}</Text>? This action cannot be undone.
                        </Text>

                        <View style={styles.confirmActions}>
                            <TouchableOpacity
                                style={[styles.confirmBtn, { backgroundColor: t.colors.surfaceAlt, borderColor: t.colors.border }]}
                                onPress={() => setDeleteModalVisible(false)}
                                disabled={isDeleting}
                            >
                                <Text style={[styles.confirmBtnText, { color: t.colors.text }]}>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.confirmBtn, { backgroundColor: t.colors.danger, borderWidth: 0 }]}
                                onPress={handleDeleteTenant}
                                disabled={isDeleting}
                            >
                                {isDeleting ? <ActivityIndicator color={t.colors.onPrimary} size="small" /> : <Text style={[styles.confirmBtnText, { color: t.colors.onPrimary }]}>Delete</Text>}
                            </TouchableOpacity>
                        </View>
                    </GlassView>
                </View>
            </Modal>

            {/* --- CUSTOM MOVE OUT CONFIRMATION MODAL --- */}
            <Modal animationType="fade" transparent={true} visible={isMoveOutModalVisible} onRequestClose={() => setMoveOutModalVisible(false)}>
                <View style={[styles.modalOverlayCenter, { backgroundColor: t.colors.scrim }]}>
                    <GlassView strong radius={24} style={styles.confirmDialog}>
                        <View style={[styles.warningIconBg, { backgroundColor: withAlpha(t.colors.warning, 0.15) }]}>
                            <Ionicons name="exit-outline" size={32} color={t.colors.warning} />
                        </View>
                        <Text style={[styles.confirmTitle, { color: t.colors.text }]}>Move Out Tenant?</Text>
                        <Text style={[styles.confirmSubText, { color: t.colors.textMuted }]}>
                            Are you sure you want to mark <Text style={{ fontWeight: 'bold', color: t.colors.text }}>{tenantToMoveOut?.name}</Text> as moved out? This will free up their bed.
                        </Text>

                        <View style={styles.confirmActions}>
                            <TouchableOpacity
                                style={[styles.confirmBtn, { backgroundColor: t.colors.surfaceAlt, borderColor: t.colors.border }]}
                                onPress={() => setMoveOutModalVisible(false)}
                                disabled={isMovingOut}
                            >
                                <Text style={[styles.confirmBtnText, { color: t.colors.text }]}>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.confirmBtn, { backgroundColor: t.colors.warning, borderWidth: 0 }]}
                                onPress={handleMoveOutConfirm}
                                disabled={isMovingOut}
                            >
                                {isMovingOut ? <ActivityIndicator color={t.colors.onPrimary} size="small" /> : <Text style={[styles.confirmBtnText, { color: t.colors.onPrimary }]}>Move Out</Text>}
                            </TouchableOpacity>
                        </View>
                    </GlassView>
                </View>
            </Modal>

            <EditTenantModal
                isVisible={isEditModalVisible}
                isDark={isDark}
                tenant={tenantToEdit}
                onClose={() => setEditModalVisible(false)}
                onSuccess={() => {
                    alert("Tenant updated successfully!");
                    fetchAllTenants(); // Reloads the list so changes appear instantly
                }}
            />

            {/* --- REUSABLE CHANGE ROOM MODAL --- */}
            <ChangeRoomModal
                isVisible={isChangeRoomVisible}
                isDark={isDark}
                tenant={tenantToShift}
                currentRoomId={tenantToShift?.unit_id}
                onClose={() => setChangeRoomVisible(false)}
                onSuccess={() => {
                    alert("Tenant room updated successfully!");
                    fetchAllTenants(); // Refreshes the master list!
                }}
            />

            {/* Update Rent Modal */}
            <UpdateFinancialsModal
                isVisible={isUpdateFinanceVisible}
                isDark={isDark}
                tenant={tenantToUpdate}
                onClose={() => setUpdateFinanceVisible(false)}
                onSuccess={() => {
                    Alert.alert("Success", "Rent details updated!");
                    fetchAllTenants(); // Refresh the screen
                }}
            />
        </View>
    );
}


const styles = StyleSheet.create({
    container: { flex: 1 },
    centerWrapper: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },

    // Header & Search
    headerSection: { paddingHorizontal: 20, marginTop: 2, marginBottom: 10 },
    searchBar: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, paddingHorizontal: 15, height: 50, borderWidth: 1 },
    searchIcon: { marginRight: 10 },
    searchInput: { flex: 1, fontSize: 15, fontWeight: '500' },

    // Filters
    filterWrapper: { marginBottom: 10 },
    filterRow: { paddingHorizontal: 20, gap: 10, alignItems: 'center', paddingBottom: 5 },
    inlineAddBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 20, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 },
    inlineAddText: { fontWeight: '800', marginLeft: 6, fontSize: 14 },
    filterDivider: { width: 1, height: 24, marginHorizontal: 2 },
    filterPill: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: 'transparent' },
    filterText: { fontSize: 13, fontWeight: '700' },
    filterTextActive: { fontSize: 13, fontWeight: '800' },
    filterCount: { fontWeight: '500' },
    filterCountActive: { fontWeight: '500' },

    // List Layout
    scrollContent: { paddingHorizontal: 20, paddingTop: 5, paddingBottom: 160 },
    emptyState: { alignItems: 'center', marginTop: 80 },
    emptyText: { marginTop: 12, fontSize: 16, fontWeight: '600' },

    // Tenant Cards
    tenantCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 24, marginBottom: 14 },

    // Avatar
    avatarWrapper: { position: 'relative', marginRight: 16 },
    statusDot: { position: 'absolute', bottom: 2, right: 2, width: 16, height: 16, borderRadius: 8, borderWidth: 2 },

    // Text Info
    tenantInfo: { flex: 1, justifyContent: 'center' },
    tenantName: { fontSize: 15, fontWeight: '800', marginBottom: 2 },
    tenantPhone: { fontSize: 13, fontWeight: '600', marginBottom: 8 },

    // Location Badge
    locationBadgeRow: { flexDirection: 'row', alignItems: 'center' },
    locationBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    locationText: { fontSize: 11, fontWeight: '700', marginLeft: 4, maxWidth: 140 },

    // Actions
    rightActionArea: { alignItems: 'flex-end', justifyContent: 'space-between', height: 65, paddingLeft: 10 },
    menuIconBtn: { padding: 4, marginTop: -4, marginRight: -4 },
    rentBlock: { alignItems: 'flex-end' },
    rentAmount: { fontSize: 14, fontWeight: '800' },
    rentLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginTop: 2 },

    // --- FORM MODAL STYLES ---
    modalOverlay: { flex: 1, justifyContent: 'flex-end' },
    tenantModalContent: { borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 25, paddingTop: 25, maxHeight: Dimensions.get('window').height - 100, width: '100%', flex: 1 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 20, fontWeight: '800' },
    closeBtn: { padding: 5 },

    formSectionTitle: { fontSize: 14, fontWeight: '800', marginTop: 10, marginBottom: 15, letterSpacing: 0.5 },
    inputContainer: { marginBottom: 18 },
    rowInputs: { flexDirection: 'row', justifyContent: 'space-between' },
    inputLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 },
    inputWrapper: { borderRadius: 16, paddingHorizontal: 16, height: 55, borderWidth: 1, justifyContent: 'center' },
    input: { fontSize: 15, fontWeight: '500', height: '100%' },
    inlineErrorText: { fontSize: 11, fontWeight: '600', marginTop: 4, marginLeft: 4 },
    generalErrorBox: { flexDirection: 'row', padding: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center', marginBottom: 15 },
    generalErrorText: { fontSize: 13, fontWeight: '700', marginLeft: 8, flex: 1 },

    tenantPhotoPickerContainer: { alignItems: 'center', marginBottom: 20 },
    tenantPhotoPicker: { width: 90, height: 90, borderRadius: 45, borderWidth: 1, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' },
    tenantPhotoPreview: { width: '100%', height: '100%', borderRadius: 45 },
    tenantPhotoEditBadge: { position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 2 },
    tenantPhotoLabel: { marginTop: 8, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

    tenantSaveBtnWrapper: { marginTop: 10, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8, borderRadius: 20 },
    saveBtn: { height: 60, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    saveBtnText: { fontSize: 16, fontWeight: '700' },

    // --- DROPDOWN MENU STYLES ---
    menuOverlay: {
        position: 'absolute', top: -1000, bottom: -1000, left: -1000, right: -1000, backgroundColor: 'transparent', zIndex: 998,
    },
    dropdownMenu: {
        position: 'absolute', top: 30, right: 5, width: 140, borderRadius: 12, paddingVertical: 5, zIndex: 1000,
    },
    dropdownItem: {
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 12
    },
    dropdownText: {
        fontSize: 14, fontWeight: '600', marginLeft: 10
    },

    // --- CUSTOM DIALOG STYLES ---
    modalOverlayCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    confirmDialog: { width: '100%', borderRadius: 24, padding: 24, alignItems: 'center', elevation: 10 },
    warningIconBg: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    confirmTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
    confirmSubText: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
    confirmActions: { flexDirection: 'row', gap: 12, width: '100%' },
    confirmBtn: { flex: 1, height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
    confirmBtnText: { fontSize: 15, fontWeight: '700' },
});
