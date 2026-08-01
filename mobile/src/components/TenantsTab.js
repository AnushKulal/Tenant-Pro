import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Image, Dimensions, Modal, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import client, { SERVER_URL, mediaUrl } from '../api/client';
import EditTenantModal from './EditTenantModal';
import ChangeRoomModal from './ChangeRoomModal';
import UpdateFinancialsModal from './UpdateFinancialsModal';

const { width } = Dimensions.get('window');

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

export default function TenantsTab({ isDark, onViewProfile, activePropertyId }) {
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
                style={[styles.filterPill, isActive ? styles.filterPillActive : (isDark ? styles.darkCard : styles.lightCard)]}
                onPress={() => setActiveFilter(label)}
                activeOpacity={0.8}
            >
                {icon && <Ionicons name={icon} size={14} color={isActive ? '#FFFFFF' : (isDark ? '#94A3B8' : '#64748B')} style={{ marginRight: 6 }} />}
                <Text style={isActive ? styles.filterTextActive : [styles.filterText, isDark ? styles.darkSubText : styles.lightSubText]}>
                    {label} <Text style={isActive ? styles.filterCountActive : styles.filterCount}>({count})</Text>
                </Text>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>

            {/* Header Area: Search & Add Button */}
            <View style={styles.headerSection}>
                <View style={[styles.searchBar, isDark ? styles.darkInput : styles.lightInput]}>
                    <Ionicons name="search" size={20} color={isDark ? '#94A3B8' : '#94A3B8'} style={styles.searchIcon} />
                    <TextInput
                        style={[styles.searchInput, isDark ? styles.darkText : styles.lightText]}
                        placeholder="Search by name or phone..."
                        placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 5 }}>
                            <Ionicons name="close-circle" size={18} color={isDark ? '#475569' : '#CBD5E1'} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* Filters Area */}
            <View style={styles.filterWrapper}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow} keyboardShouldPersistTaps="handled">
                    <TouchableOpacity activeOpacity={0.8} onPress={handleAddTenantClick} style={{ marginRight: 5 }}>
                        <LinearGradient colors={['#10B981', '#059669']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.inlineAddBtn}>
                            <Ionicons name="person-add" size={16} color="#FFFFFF" />
                            <Text style={styles.inlineAddText}>Add</Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    <View style={styles.filterDivider} />
                    <FilterPill label="All" icon="people" />
                    <FilterPill label="Unassigned" icon="help-circle" />
                    <FilterPill label="Active" icon="home" />
                    <FilterPill label="Past" icon="time" />
                </ScrollView>
            </View>

            {/* List Area */}
            {isLoading ? (
                <View style={styles.centerWrapper}>
                    <ActivityIndicator size="large" color="#6366F1" />
                </View>
            ) : (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={filteredTenants.length === 0 ? styles.centerWrapper : styles.scrollContent} keyboardShouldPersistTaps="handled" onScroll={() => setOpenMenuId(null)} scrollEventThrottle={16}>

                    {filteredTenants.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Ionicons name="search-outline" size={54} color={isDark ? '#334155' : '#CBD5E1'} />
                            <Text style={[styles.emptyText, isDark ? styles.darkSubText : styles.lightSubText]}>No tenants found.</Text>
                        </View>
                    ) : (
                        filteredTenants.map((tenant) => (
                            <TouchableOpacity
                                key={tenant.id}
                                activeOpacity={1}
                                style={[
                                    styles.tenantCard,
                                    isDark ? styles.darkCard : styles.lightCard,
                                    // Highlight Unassigned tenants with a subtle border
                                    tenant.unit_id === null && tenant.status === 'Active' && { borderWidth: 1, borderColor: '#F59E0B' },
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
                                    <View style={styles.tenantAvatar}>
                                        {tenant.image_url ? (
                                            <Image source={{ uri: mediaUrl(tenant.image_url) }} style={styles.tenantImage} />
                                        ) : (
                                            <Text style={styles.tenantInitials}>{tenant.name.substring(0, 2).toUpperCase()}</Text>
                                        )}
                                    </View>
                                    {/* Status Dot */}
                                    <View style={[
                                        styles.statusDot,
                                        { backgroundColor: tenant.status === 'Inactive' ? '#94A3B8' : (tenant.unit_id ? '#10B981' : '#F59E0B') },
                                        { borderColor: isDark ? '#151A25' : '#FFFFFF' }
                                    ]} />
                                </View>

                                {/* Info Section */}
                                <View style={styles.tenantInfo}>
                                    <Text style={[styles.tenantName, isDark ? styles.darkText : styles.lightText]} numberOfLines={1}>
                                        {tenant.name}
                                    </Text>
                                    <Text style={[styles.tenantPhone, isDark ? styles.darkSubText : styles.lightSubText]}>
                                        +91 {tenant.phone}
                                    </Text>

                                    {/* Location Badge */}
                                    <View style={styles.locationBadgeRow}>
                                        {tenant.status === 'Inactive' ? (
                                            <View style={[styles.locationBadge, isDark ? styles.darkTag : styles.lightTag]}>
                                                <Ionicons name="time-outline" size={12} color="#94A3B8" />
                                                <Text style={[styles.locationText, { color: '#94A3B8' }]}>Moved Out</Text>
                                            </View>
                                        ) : tenant.unit_id ? (
                                            <View style={[styles.locationBadge, isDark ? styles.darkTag : styles.lightTag]}>
                                                <Ionicons name="home" size={12} color="#6366F1" />
                                                <Text style={[styles.locationText, isDark ? styles.darkSubText : styles.lightSubText]} numberOfLines={1}>
                                                    Unit {tenant.unit_number} • {tenant.property_name}
                                                </Text>
                                            </View>
                                        ) : (
                                            <View style={[styles.locationBadge, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.1)' : '#FFFBEB' }]}>
                                                <Ionicons name="alert-circle" size={12} color="#F59E0B" />
                                                <Text style={[styles.locationText, { color: '#F59E0B' }]}>Unassigned</Text>
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
                                        <Ionicons name="ellipsis-vertical" size={20} color={isDark ? '#94A3B8' : '#CBD5E1'} />
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

                                            <View style={[styles.dropdownMenu, isDark ? styles.darkMenu : styles.lightMenu]}>
                                                <TouchableOpacity style={styles.dropdownItem} onPress={() => {
                                                    setOpenMenuId(null);
                                                    setTenantToEdit(tenant);
                                                    setEditModalVisible(true);
                                                }}>
                                                    <Ionicons name="create-outline" size={16} color={isDark ? '#E2E8F0' : '#1E293B'} />
                                                    <Text style={[styles.dropdownText, isDark ? styles.darkText : styles.lightText]}>Edit</Text>
                                                </TouchableOpacity>

                                                {/* Only show Move Out if they are Active AND have a room */}
                                                {tenant.status === 'Active' && tenant.unit_id && (
                                                    <TouchableOpacity style={styles.dropdownItem} onPress={() => openMoveOutConfirm(tenant)}>
                                                        <Ionicons name="exit-outline" size={16} color="#F59E0B" />
                                                        <Text style={[styles.dropdownText, { color: '#F59E0B' }]}>Move Out</Text>
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
                                                        <Ionicons name="swap-horizontal-outline" size={16} color="#3B82F6" />
                                                        <Text style={[styles.dropdownText, { color: '#3B82F6' }]}>
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
                                                        <Ionicons name="cash-outline" size={16} color="#10B981" />
                                                        <Text style={[styles.dropdownText, { color: '#10B981' }]}>Edit Rent</Text>
                                                    </TouchableOpacity>
                                                )}

                                                <TouchableOpacity style={styles.dropdownItem} onPress={() => openDeleteConfirm(tenant)}>
                                                    <Ionicons name="trash-outline" size={16} color="#EF4444" />
                                                    <Text style={[styles.dropdownText, { color: '#EF4444' }]}>Delete</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </>
                                    )}

                                    { /* Rent Block */}
                                    <View style={styles.rentBlock}>
                                        {tenant.unit_id && tenant.status === 'Active' ? (
                                            <>
                                                <Text style={styles.rentAmount}>₹{tenant.rent_share}</Text>
                                                <Text style={[styles.rentLabel, isDark ? styles.darkSubText : styles.lightSubText]}>Rent</Text>
                                            </>
                                        ) : (
                                            <Text style={[styles.rentLabel, isDark ? styles.darkSubText : styles.lightSubText, { marginTop: 15 }]}>--</Text>
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
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
                    <View style={[styles.tenantModalContent, isDark ? styles.darkModal : styles.lightModal]}>

                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, isDark ? styles.darkText : styles.lightText]}>Pre-Register Tenant</Text>
                            <TouchableOpacity onPress={resetTenantForm} style={styles.closeBtn}>
                                <Ionicons name="close" size={24} color={isDark ? '#94A3B8' : '#64748B'} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                            <Text style={[styles.formSectionTitle, isDark ? styles.darkText : styles.lightText]}>Profile Details</Text>

                            <View style={styles.tenantPhotoPickerContainer}>
                                <TouchableOpacity activeOpacity={0.8} onPress={pickTenantImage} style={[styles.tenantPhotoPicker, isDark ? styles.darkInput : styles.lightInput]}>
                                    {tenantImageUri ? (
                                        <Image source={{ uri: tenantImageUri }} style={styles.tenantPhotoPreview} />
                                    ) : (
                                        <Ionicons name="camera-outline" size={32} color={isDark ? '#94A3B8' : '#64748B'} />
                                    )}
                                    <View style={styles.tenantPhotoEditBadge}>
                                        <Ionicons name="add" size={14} color="#FFFFFF" />
                                    </View>
                                </TouchableOpacity>
                                <Text style={[styles.tenantPhotoLabel, isDark ? styles.darkSubText : styles.lightSubText]}>Profile Photo</Text>
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

                            <Text style={[styles.formSectionTitle, isDark ? styles.darkText : styles.lightText]}>Verification & Work</Text>

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
                                <View style={styles.generalErrorBox}>
                                    <Ionicons name="warning" size={18} color="#EF4444" />
                                    <Text style={styles.generalErrorText}>{tenantGeneralError}</Text>
                                </View>
                            ) : null}

                            <TouchableOpacity style={styles.tenantSaveBtnWrapper} activeOpacity={0.8} onPress={handleSaveNewTenant} disabled={isSavingTenant}>
                                <LinearGradient colors={['#10B981', '#059669']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.saveBtn}>
                                    {isSavingTenant ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveBtnText}>Add Tenant</Text>}
                                </LinearGradient>
                            </TouchableOpacity>
                            <View style={{ height: 40 }} />
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* --- CUSTOM DELETE CONFIRMATION MODAL --- */}
            <Modal animationType="fade" transparent={true} visible={isDeleteModalVisible} onRequestClose={() => setDeleteModalVisible(false)}>
                <View style={styles.modalOverlayCenter}>
                    <View style={[styles.confirmDialog, isDark ? styles.darkCard : styles.lightCard]}>
                        <View style={styles.warningIconBg}>
                            <Ionicons name="warning-outline" size={32} color="#EF4444" />
                        </View>
                        <Text style={[styles.confirmTitle, isDark ? styles.darkText : styles.lightText]}>Delete Tenant?</Text>
                        <Text style={[styles.confirmSubText, isDark ? styles.darkSubText : styles.lightSubText]}>
                            Are you sure you want to permanently delete <Text style={{ fontWeight: 'bold', color: isDark ? '#FFF' : '#000' }}>{tenantToDelete?.name}</Text>? This action cannot be undone.
                        </Text>

                        <View style={styles.confirmActions}>
                            <TouchableOpacity
                                style={[styles.confirmBtn, isDark ? styles.darkInput : styles.lightInput]}
                                onPress={() => setDeleteModalVisible(false)}
                                disabled={isDeleting}
                            >
                                <Text style={[styles.confirmBtnText, isDark ? styles.darkText : styles.lightText]}>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.confirmBtn, { backgroundColor: '#EF4444', borderWidth: 0 }]}
                                onPress={handleDeleteTenant}
                                disabled={isDeleting}
                            >
                                {isDeleting ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={[styles.confirmBtnText, { color: '#FFF' }]}>Delete</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* --- CUSTOM MOVE OUT CONFIRMATION MODAL --- */}
            <Modal animationType="fade" transparent={true} visible={isMoveOutModalVisible} onRequestClose={() => setMoveOutModalVisible(false)}>
                <View style={styles.modalOverlayCenter}>
                    <View style={[styles.confirmDialog, isDark ? styles.darkCard : styles.lightCard]}>
                        <View style={[styles.warningIconBg, { backgroundColor: '#FFFBEB' }]}>
                            <Ionicons name="exit-outline" size={32} color="#F59E0B" />
                        </View>
                        <Text style={[styles.confirmTitle, isDark ? styles.darkText : styles.lightText]}>Move Out Tenant?</Text>
                        <Text style={[styles.confirmSubText, isDark ? styles.darkSubText : styles.lightSubText]}>
                            Are you sure you want to mark <Text style={{ fontWeight: 'bold', color: isDark ? '#FFF' : '#000' }}>{tenantToMoveOut?.name}</Text> as moved out? This will free up their bed.
                        </Text>

                        <View style={styles.confirmActions}>
                            <TouchableOpacity
                                style={[styles.confirmBtn, isDark ? styles.darkInput : styles.lightInput]}
                                onPress={() => setMoveOutModalVisible(false)}
                                disabled={isMovingOut}
                            >
                                <Text style={[styles.confirmBtnText, isDark ? styles.darkText : styles.lightText]}>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.confirmBtn, { backgroundColor: '#F59E0B', borderWidth: 0 }]}
                                onPress={handleMoveOutConfirm}
                                disabled={isMovingOut}
                            >
                                {isMovingOut ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={[styles.confirmBtnText, { color: '#FFF' }]}>Move Out</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
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
    lightInput: { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
    darkInput: { backgroundColor: '#151A25', borderColor: '#1E293B' },
    searchIcon: { marginRight: 10 },
    searchInput: { flex: 1, fontSize: 15, fontWeight: '500' },

    // Filters
    filterWrapper: { marginBottom: 10 },
    filterRow: { paddingHorizontal: 20, gap: 10, alignItems: 'center', paddingBottom: 5 },
    inlineAddBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 20, shadowColor: '#10B981', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 },
    inlineAddText: { color: '#FFFFFF', fontWeight: '800', marginLeft: 6, fontSize: 14 },
    filterDivider: { width: 1, height: 24, backgroundColor: 'rgba(148, 163, 184, 0.3)', marginHorizontal: 2 },
    filterPill: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: 'transparent' },
    filterPillActive: { backgroundColor: '#6366F1' },
    filterText: { fontSize: 13, fontWeight: '700' },
    filterTextActive: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
    filterCount: { fontWeight: '500', color: '#94A3B8' },
    filterCountActive: { fontWeight: '500', color: '#E0E7FF' },

    // List Layout
    scrollContent: { paddingHorizontal: 20, paddingTop: 5, paddingBottom: 160 },
    emptyState: { alignItems: 'center', marginTop: 80 },
    emptyText: { marginTop: 12, fontSize: 16, fontWeight: '600' },

    // Tenant Cards
    tenantCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 24, marginBottom: 14 },
    lightCard: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 4 },
    darkCard: { backgroundColor: '#151A25' },

    // Avatar
    avatarWrapper: { position: 'relative', marginRight: 16 },
    tenantAvatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(99, 102, 241, 0.15)', justifyContent: 'center', alignItems: 'center' },
    tenantImage: { width: '100%', height: '100%', borderRadius: 30 },
    tenantInitials: { color: '#6366F1', fontSize: 22, fontWeight: '800' },
    statusDot: { position: 'absolute', bottom: 2, right: 2, width: 16, height: 16, borderRadius: 8, borderWidth: 2 },

    // Text Info
    tenantInfo: { flex: 1, justifyContent: 'center' },
    tenantName: { fontSize: 15, fontWeight: '800', marginBottom: 2 },
    tenantPhone: { fontSize: 13, fontWeight: '600', marginBottom: 8 },

    // Location Badge
    locationBadgeRow: { flexDirection: 'row', alignItems: 'center' },
    locationBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    lightTag: { backgroundColor: '#F1F5F9' },
    darkTag: { backgroundColor: '#1E293B' },
    locationText: { fontSize: 11, fontWeight: '700', marginLeft: 4, maxWidth: 140 },

    // Actions
    rightActionArea: { alignItems: 'flex-end', justifyContent: 'space-between', height: 65, paddingLeft: 10 },
    menuIconBtn: { padding: 4, marginTop: -4, marginRight: -4 },
    rentBlock: { alignItems: 'flex-end' },
    rentAmount: { fontSize: 14, fontWeight: '800', color: '#10B981' },
    rentLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginTop: 2 },

    // Colors
    lightText: { color: '#0F172A' }, darkText: { color: '#FFFFFF' },
    lightSubText: { color: '#64748B' }, darkSubText: { color: '#94A3B8' },

    // --- FORM MODAL STYLES ---
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    tenantModalContent: { borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 25, paddingTop: 25, maxHeight: Dimensions.get('window').height - 100, width: '100%', flex: 1 },
    lightModal: { backgroundColor: '#FFFFFF' }, darkModal: { backgroundColor: '#0B0F19' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 20, fontWeight: '800' },
    closeBtn: { padding: 5 },

    formSectionTitle: { fontSize: 14, fontWeight: '800', marginTop: 10, marginBottom: 15, letterSpacing: 0.5, color: '#6366F1' },
    inputContainer: { marginBottom: 18 },
    rowInputs: { flexDirection: 'row', justifyContent: 'space-between' },
    inputLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 },
    inputWrapper: { borderRadius: 16, paddingHorizontal: 16, height: 55, borderWidth: 1, justifyContent: 'center' },
    input: { fontSize: 15, fontWeight: '500', height: '100%' },
    inputErrorBorder: { borderColor: '#EF4444', borderWidth: 1.5 },
    inlineErrorText: { color: '#EF4444', fontSize: 11, fontWeight: '600', marginTop: 4, marginLeft: 4 },
    generalErrorBox: { flexDirection: 'row', backgroundColor: '#FEF2F2', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#FECACA', alignItems: 'center', marginBottom: 15 },
    generalErrorText: { color: '#EF4444', fontSize: 13, fontWeight: '700', marginLeft: 8, flex: 1 },

    tenantPhotoPickerContainer: { alignItems: 'center', marginBottom: 20 },
    tenantPhotoPicker: { width: 90, height: 90, borderRadius: 45, borderWidth: 1, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' },
    tenantPhotoPreview: { width: '100%', height: '100%', borderRadius: 45 },
    tenantPhotoEditBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#6366F1', width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
    tenantPhotoLabel: { marginTop: 8, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

    tenantSaveBtnWrapper: { marginTop: 10, shadowColor: '#10B981', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8, borderRadius: 20 },
    saveBtn: { height: 60, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

    // --- DROPDOWN MENU STYLES ---
    menuOverlay: {
        position: 'absolute', top: -1000, bottom: -1000, left: -1000, right: -1000, backgroundColor: 'transparent', zIndex: 998,
    },
    dropdownMenu: {
        position: 'absolute', top: 30, right: 5, width: 140, borderRadius: 12, paddingVertical: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 10, zIndex: 1000,
    },
    lightMenu: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F1F5F9' },
    darkMenu: { backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155' },
    dropdownItem: {
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 12
    },
    dropdownText: {
        fontSize: 14, fontWeight: '600', marginLeft: 10
    },

    // --- CUSTOM DIALOG STYLES ---
    modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    confirmDialog: { width: '100%', borderRadius: 24, padding: 24, alignItems: 'center', elevation: 10 },
    warningIconBg: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    confirmTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
    confirmSubText: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
    confirmActions: { flexDirection: 'row', gap: 12, width: '100%' },
    confirmBtn: { flex: 1, height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
    confirmBtnText: { fontSize: 15, fontWeight: '700' },
});