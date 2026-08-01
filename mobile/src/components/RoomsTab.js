// File: mobile/src/components/RoomsTab.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform, Alert, Image, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import client, { SERVER_URL, mediaUrl } from '../api/client';
import TenantProfileTab from './TenantProfileTab';

// IMPORT OUR NEW COMPONENT
import RoomDetailsModal from './RoomDetailsModal';

const { width, height } = Dimensions.get('window');

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

const RoomImage = ({ imageUrl, status }) => {
    const [hasError, setHasError] = useState(false);
    const defaultImage = `${SERVER_URL}/uploads/rooms/default-room.png`;
    const imageSource = (imageUrl && !hasError) ? { uri: mediaUrl(imageUrl) } : { uri: defaultImage };

    const getStatusColor = () => {
        if (status === 'Occupied') return '#3B82F6';
        if (status === 'Vacant') return '#10B981';
        return '#F59E0B'; // Maintenance
    };

    return (
        <View style={styles.imageContainer}>
            <Image source={imageSource} style={styles.roomImage} onError={() => setHasError(true)} />
            <View style={[styles.floatingBadge, { backgroundColor: getStatusColor() }]}>
                <Text style={styles.floatingBadgeText}>{status}</Text>
            </View>
        </View>
    );
};

export default function RoomsTab({ isDark, selectedProperty }) {
    const [rooms, setRooms] = useState([]);
    const [filteredRooms, setFilteredRooms] = useState([]);
    const [activeFilter, setActiveFilter] = useState('All');

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    
    // --- UI STATES ---
    const [activeMenuId, setActiveMenuId] = useState(null);
    const [isAddModalVisible, setAddModalVisible] = useState(false);
    const [isDeleteModalVisible, setDeleteModalVisible] = useState(false);
    const [roomToDelete, setRoomToDelete] = useState(null);
    
    // --- THE SELECTED ROOM TO PASS TO OUR NEW COMPONENT ---
    const [selectedRoomDetails, setSelectedRoomDetails] = useState(null);

    // --- FORM STATES FOR UNIT ---
    const [editingUnitId, setEditingUnitId] = useState(null);
    const [unitNumber, setUnitNumber] = useState('');
    const [roomType, setRoomType] = useState('1 BHK');
    const [baseRent, setBaseRent] = useState('');
    const [capacity, setCapacity] = useState('1');
    const [imageUri, setImageUri] = useState(null);
    const [unitRentSplit, setUnitRentSplit] = useState('Equal');

    // For Going to Tenant Profile Tab
    const [selectedTenantProfile, setSelectedTenantProfile] = useState(null);

    const roomTypes = ['1 RK', '1 BHK', '2 BHK', 'PG Bed', 'Studio'];

    useEffect(() => {
        fetchRooms();
    }, [selectedProperty]);

    useEffect(() => {
        if (activeFilter === 'All') {
            setFilteredRooms(rooms);
        } else {
            setFilteredRooms(rooms.filter(room => room.status === activeFilter));
        }
    }, [rooms, activeFilter]);

    const fetchRooms = async () => {
        setIsLoading(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            const propId = selectedProperty?.id || 'all';

            const response = await client.get(`/units?property_id=${propId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setRooms(response.data.units);
        } catch (error) {
            console.log("Failed to fetch units", error);
        } finally {
            setIsLoading(false);
        }
    };

    const resetForm = () => {
        setEditingUnitId(null);
        setUnitNumber('');
        setBaseRent('');
        setCapacity('1');
        setRoomType('1 BHK');
        setImageUri(null);
        setUnitRentSplit('Equal');
        setAddModalVisible(false);
    };

    const handleOpenAddModal = () => {
        if (!selectedProperty || selectedProperty.id === 'all') {
            return Alert.alert("Select a Property", "Please select a specific property from the top header before adding a unit.");
        }
        resetForm();
        setAddModalVisible(true);
    };

    const handleEditUnit = (room) => {
        setActiveMenuId(null);
        setEditingUnitId(room.id);
        setUnitNumber(room.unit_number?.toString() || '');
        setBaseRent(room.base_rent?.toString() || '');
        setCapacity(room.capacity ? room.capacity.toString() : '1');
        setRoomType(room.room_type || '1 BHK');
        setImageUri(room.image_url ? mediaUrl(room.image_url) : null);
        setUnitRentSplit(room.rent_split_type || 'Equal');

        setTimeout(() => {
            setAddModalVisible(true);
        }, 50);
    };

    const confirmDelete = (room) => {
        setActiveMenuId(null);
        setRoomToDelete(room);
        setTimeout(() => {
            setDeleteModalVisible(true);
        }, 50);
    };

    const executeDelete = async () => {
        try {
            const token = await AsyncStorage.getItem('userToken');
            await client.delete(`/units/${roomToDelete.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setDeleteModalVisible(false);
            fetchRooms();
        } catch (error) {
            Alert.alert("Error", "Failed to delete unit.");
            setDeleteModalVisible(false);
        }
    };

    const pickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.8,
        });

        if (!result.canceled) {
            setImageUri(result.assets[0].uri);
        }
    };

    const handleSaveUnit = async () => {
        if (!unitNumber.trim() || !baseRent.trim() || !capacity.trim()) {
            return Alert.alert("Missing Details", "Please enter unit number, rent, and capacity.");
        }

        setIsSaving(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            const formData = new FormData();

            formData.append('property_id', selectedProperty.id);
            formData.append('unit_number', unitNumber);
            formData.append('room_type', roomType);
            formData.append('base_rent', baseRent);
            formData.append('capacity', capacity);
            if (!editingUnitId) formData.append('status', 'Vacant');
            formData.append('rent_split_type', unitRentSplit);

            if (imageUri && !imageUri.startsWith('http')) {
                const filename = imageUri.split('/').pop();
                const match = /\.(\w+)$/.exec(filename);
                const type = match ? `image/${match[1]}` : `image/jpeg`;
                formData.append('room_image', { uri: imageUri, name: filename, type });
            }

            if (editingUnitId) {
                await client.put(`/units/${editingUnitId}`, formData, {
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
                });
            } else {
                await client.post('/units', formData, {
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
                });
            }

            await fetchRooms();
            resetForm();

        } catch (error) {
            Alert.alert("Error", "Failed to save unit.");
        } finally {
            setIsSaving(false);
        }
    };

    const FilterPill = ({ label }) => {
        const isActive = activeFilter === label;
        const count = label === 'All' ? rooms.length : rooms.filter(r => r.status === label).length;

        return (
            <TouchableOpacity
                style={[styles.filterPill, isActive ? styles.filterPillActive : (isDark ? styles.darkCard : styles.lightCard)]}
                onPress={() => setActiveFilter(label)}
            >
                <Text style={isActive ? styles.filterTextActive : [styles.filterText, isDark ? styles.darkSubText : styles.lightSubText]}>
                    {label} <Text style={{ fontWeight: '500' }}>({count})</Text>
                </Text>
            </TouchableOpacity>
        );
    };

    if (selectedTenantProfile) {
        return (
            <TenantProfileTab 
                isDark={isDark} 
                tenant={selectedTenantProfile} 
                goBack={() => setSelectedTenantProfile(null)} // This makes the goBack button work!
            />
        );
    }

    return (
        <View style={styles.container}>
            {/* FILTER HEADER */}
            <View style={styles.filterWrapper}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow} keyboardShouldPersistTaps="handled">
                    <TouchableOpacity activeOpacity={0.8} onPress={handleOpenAddModal} style={{ marginRight: 5 }}>
                        <LinearGradient colors={['#3B82F6', '#4F46E5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.inlineAddBtn}>
                            <Ionicons name="add" size={18} color="#FFFFFF" />
                            <Text style={styles.inlineAddText}>New Unit</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                    <View style={styles.filterDivider} />
                    <FilterPill label="All" />
                    <FilterPill label="Vacant" />
                    <FilterPill label="Occupied" />
                    <FilterPill label="Maintenance" />
                </ScrollView>
            </View>

            {/* MAIN LIST */}
            {isLoading ? (
                <View style={styles.centerWrapper}>
                    <ActivityIndicator size="large" color="#6366F1" />
                </View>
            ) : (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={filteredRooms.length === 0 ? styles.centerWrapper : styles.scrollContent} keyboardShouldPersistTaps="handled">
                    {filteredRooms.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Ionicons name="key-outline" size={54} color={isDark ? '#334155' : '#CBD5E1'} />
                            <Text style={[styles.emptyText, isDark ? styles.darkSubText : styles.lightSubText]}>No units found here.</Text>
                        </View>
                    ) : (
                        filteredRooms.map((room) => (
                            <View key={room.id} style={{ zIndex: activeMenuId === room.id ? 100 : 1, ...(Platform.OS === 'android' && activeMenuId === room.id ? { elevation: 10 } : {}) }}>

                                {activeMenuId === room.id && (
                                    <TouchableOpacity style={styles.localOverlay} activeOpacity={1} onPress={() => setActiveMenuId(null)} />
                                )}

                                {/* THE ROOM CARD */}
                                <TouchableOpacity activeOpacity={0.8} style={[styles.roomCard, isDark ? styles.darkCard : styles.lightCard]} onPress={() => setSelectedRoomDetails(room)}>
                                    <RoomImage imageUrl={room.image_url} status={room.status} />
                                    <View style={styles.roomDetails}>
                                        <View style={styles.roomHeader}>
                                            <Text style={[styles.roomNumber, isDark ? styles.darkText : styles.lightText]}>Unit {room.unit_number}</Text>
                                            <TouchableOpacity style={styles.menuIcon} onPress={() => setActiveMenuId(activeMenuId === room.id ? null : room.id)}>
                                                <Ionicons name="ellipsis-vertical" size={20} color={isDark ? '#94A3B8' : '#64748B'} />
                                            </TouchableOpacity>
                                        </View>
                                        <Text style={[styles.propNameText, isDark ? styles.darkSubText : styles.lightSubText]} numberOfLines={1}>{room.property_name}</Text>
                                        <View style={styles.tagsRow}>
                                            <View style={[styles.miniTag, isDark ? styles.darkTag : styles.lightTag]}>
                                                <Ionicons name="bed-outline" size={12} color={isDark ? '#94A3B8' : '#64748B'} />
                                                <Text style={[styles.miniTagText, isDark ? styles.darkSubText : styles.lightSubText]}>{room.room_type}</Text>
                                            </View>
                                            <View style={[styles.miniTag, isDark ? styles.darkTag : styles.lightTag]}>
                                                <Ionicons name="person-outline" size={12} color={isDark ? '#94A3B8' : '#64748B'} />
                                                <Text style={[styles.miniTagText, isDark ? styles.darkSubText : styles.lightSubText]}>Max {room.capacity || 1}</Text>
                                            </View>
                                        </View>
                                        <View style={styles.priceRow}>
                                            <Text style={[styles.rentText, isDark ? styles.darkText : styles.lightText]}>
                                                ₹{room.base_rent}<Text style={styles.rentMonth}> / mo</Text>
                                            </Text>
                                        </View>
                                    </View>
                                </TouchableOpacity>

                                {/* FLOATING POPUP MENU */}
                                {activeMenuId === room.id && (
                                    <View style={[styles.popoverMenu, isDark ? styles.darkPopover : styles.lightPopover]}>
                                        <TouchableOpacity style={styles.popoverItem} onPress={() => handleEditUnit(room)}>
                                            <Ionicons name="create-outline" size={16} color={isDark ? '#94A3B8' : '#64748B'} />
                                            <Text style={[styles.popoverText, isDark ? styles.darkText : styles.lightText]}>Edit Unit</Text>
                                        </TouchableOpacity>
                                        <View style={[styles.popoverDivider, isDark ? styles.darkDivider : styles.lightDivider]} />
                                        <TouchableOpacity style={styles.popoverItem} onPress={() => confirmDelete(room)}>
                                            <Ionicons name="trash-outline" size={16} color="#EF4444" />
                                            <Text style={[styles.popoverText, { color: '#EF4444' }]}>Delete</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        ))
                    )}
                    <View style={{ height: 120 }} />
                </ScrollView>
            )}

            {/* --- OUR NEW SEPARATED MODAL EXECUTED HERE! --- */}
            <RoomDetailsModal 
                isVisible={!!selectedRoomDetails}
                room={selectedRoomDetails}
                isDark={isDark}
                onClose={() => setSelectedRoomDetails(null)}
                onRoomUpdated={fetchRooms} 
                onOpenTenantProfile={(tenant) => setSelectedTenantProfile(tenant)}
            />

            {/* DELETE CONFIRMATION MODAL */}
            <Modal animationType="fade" transparent={true} visible={isDeleteModalVisible} onRequestClose={() => setDeleteModalVisible(false)}>
                <View style={styles.deleteModalOverlay}>
                    <View style={[styles.deleteModalContent, isDark ? styles.darkModal : styles.lightModal]}>
                        <View style={styles.deleteIconBg}>
                            <Ionicons name="trash-bin" size={32} color="#EF4444" />
                        </View>
                        <Text style={[styles.deleteModalTitle, isDark ? styles.darkText : styles.lightText]}>Delete Unit?</Text>
                        <Text style={[styles.deleteModalSub, isDark ? styles.darkSubText : styles.lightSubText]}>
                            Are you sure you want to permanently delete Unit {roomToDelete?.unit_number}? This action cannot be undone.
                        </Text>
                        <View style={styles.deleteModalActions}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setDeleteModalVisible(false)}>
                                <Text style={[styles.cancelBtnText, isDark ? styles.darkText : styles.lightText]}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.confirmDeleteBtn} onPress={executeDelete}>
                                <Text style={styles.confirmDeleteBtnText}>Delete</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* ADD/EDIT UNIT MODAL */}
            <Modal animationType="slide" transparent={true} visible={isAddModalVisible} onRequestClose={resetForm}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
                    <View style={[styles.modalContent, isDark ? styles.darkModal : styles.lightModal]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, isDark ? styles.darkText : styles.lightText]}>
                                {editingUnitId ? 'Edit Unit' : 'Add Unit'}
                            </Text>
                            <TouchableOpacity onPress={resetForm} style={styles.closeBtn}>
                                <Ionicons name="close" size={24} color={isDark ? '#94A3B8' : '#64748B'} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                            <TouchableOpacity activeOpacity={0.8} onPress={pickImage} style={styles.imageUploadContainer}>
                                {imageUri ? (
                                    <Image source={{ uri: imageUri }} style={styles.uploadedImage} />
                                ) : (
                                    <View style={[styles.imagePlaceholder, isDark ? styles.darkInput : styles.lightInput]}>
                                        <Ionicons name="image-outline" size={32} color={isDark ? '#94A3B8' : '#64748B'} />
                                        <Text style={[styles.uploadText, isDark ? styles.darkSubText : styles.lightSubText]}>
                                            {editingUnitId ? 'Update Room Photo' : 'Upload Room Photo'}
                                        </Text>
                                    </View>
                                )}
                            </TouchableOpacity>

                            <FormInput label="Unit Number" placeholder="e.g. 101 or A2" value={unitNumber} onChangeText={setUnitNumber} isDark={isDark} />

                            <View style={styles.rowInputs}>
                                <View style={{ flex: 1.2, marginRight: 10 }}>
                                    <FormInput label="Base Rent (₹)" placeholder="e.g. 15000" value={baseRent} onChangeText={setBaseRent} keyboardType="numeric" isDark={isDark} />
                                </View>
                                <View style={{ flex: 0.8 }}>
                                    <FormInput label="Capacity" placeholder="Persons" value={capacity} onChangeText={setCapacity} keyboardType="numeric" isDark={isDark} />
                                </View>
                            </View>

                            <Text style={[styles.inputLabel, isDark ? styles.darkSubText : styles.lightSubText]}>Rent Split Preference</Text>
                            <View style={[styles.segmentedControl, isDark ? styles.darkInput : styles.lightInput, { marginBottom: 20 }]}>
                                <TouchableOpacity style={[styles.segmentBtn, unitRentSplit === 'Equal' && styles.segmentBtnActive]} onPress={() => setUnitRentSplit('Equal')}>
                                    <Text style={[styles.segmentText, unitRentSplit === 'Equal' && styles.segmentTextActive, isDark && unitRentSplit !== 'Equal' ? { color: '#94A3B8' } : {}]}>Equal Share</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.segmentBtn, unitRentSplit === 'Custom' && styles.segmentBtnActive]} onPress={() => setUnitRentSplit('Custom')}>
                                    <Text style={[styles.segmentText, unitRentSplit === 'Custom' && styles.segmentTextActive, isDark && unitRentSplit !== 'Custom' ? { color: '#94A3B8' } : {}]}>Custom Split</Text>
                                </TouchableOpacity>
                            </View>

                            <Text style={[styles.inputLabel, isDark ? styles.darkSubText : styles.lightSubText]}>Room Type</Text>
                            <View style={styles.typeContainer}>
                                {roomTypes.map((type) => {
                                    const isActive = roomType === type;
                                    return (
                                        <TouchableOpacity
                                            key={type}
                                            style={[styles.typePill, isActive ? styles.activeTypePill : (isDark ? styles.darkTypePill : styles.lightTypePill)]}
                                            onPress={() => setRoomType(type)}
                                        >
                                            <Text style={[styles.typeText, isActive ? styles.activeTypeText : (isDark ? styles.darkSubText : styles.lightSubText)]}>
                                                {type}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            <TouchableOpacity style={styles.saveBtnWrapper} activeOpacity={0.8} onPress={handleSaveUnit} disabled={isSaving}>
                                <LinearGradient colors={['#3B82F6', '#4F46E5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.saveBtn}>
                                    {isSaving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>{editingUnitId ? 'Update Unit' : 'Save Unit'}</Text>}
                                </LinearGradient>
                            </TouchableOpacity>
                            <View style={{ height: 40 }} />
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    centerWrapper: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
    emptyState: { alignItems: 'center', marginTop: 60 },
    emptyText: { marginTop: 12, fontSize: 16, fontWeight: '600' },

    localOverlay: { position: 'absolute', top: -height, bottom: -height, left: -width, right: -width, zIndex: 40, elevation: 5 },

    filterWrapper: { marginBottom: 15, marginTop: 10, zIndex: 10 },
    filterRow: { paddingHorizontal: 20, gap: 10, alignItems: 'center', paddingBottom: 5 },
    inlineAddBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 },
    inlineAddText: { color: '#FFFFFF', fontWeight: '800', marginLeft: 4, fontSize: 13 },
    filterDivider: { width: 1, height: 24, backgroundColor: 'rgba(148, 163, 184, 0.3)', marginHorizontal: 2 },
    filterPill: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: 'transparent' },
    filterPillActive: { backgroundColor: '#6366F1' },
    filterText: { fontSize: 13, fontWeight: '700' },
    filterTextActive: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },

    scrollContent: { paddingHorizontal: 20 },

    roomCard: { flexDirection: 'row', borderRadius: 20, padding: 10, marginBottom: 16, zIndex: 10 },
    lightCard: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 4 },
    darkCard: { backgroundColor: '#151A25' },

    imageContainer: { position: 'relative', width: 100, height: 110 },
    roomImage: { width: '100%', height: '100%', borderRadius: 14, backgroundColor: '#E2E8F0' },
    floatingBadge: { position: 'absolute', top: 8, left: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3, elevation: 3 },
    floatingBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },

    roomDetails: { flex: 1, marginLeft: 16, justifyContent: 'center' },
    roomHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 },
    roomNumber: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
    menuIcon: { padding: 4, marginTop: -4, marginRight: -4 },
    propNameText: { fontSize: 13, fontWeight: '600', marginBottom: 10 },
    tagsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    miniTag: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    lightTag: { backgroundColor: '#F1F5F9' }, darkTag: { backgroundColor: '#1E293B' },
    miniTagText: { fontSize: 11, fontWeight: '600', marginLeft: 4 },
    priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    rentText: { fontSize: 15, fontWeight: '800', color: '#10B981' },
    rentMonth: { fontSize: 13, fontWeight: '600', color: '#94A3B8' },

    popoverMenu: { position: 'absolute', top: 35, right: 15, borderRadius: 12, width: 130, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 15, zIndex: 999 },
    lightPopover: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F1F5F9' },
    darkPopover: { backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155' },
    popoverItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 15 },
    popoverText: { fontSize: 14, fontWeight: '600', marginLeft: 10 },
    popoverDivider: { height: 1 },
    lightDivider: { backgroundColor: '#F1F5F9' },
    darkDivider: { backgroundColor: '#334155' },

    deleteModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
    deleteModalContent: { width: '100%', borderRadius: 24, padding: 24, alignItems: 'center' },
    deleteIconBg: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(239, 68, 68, 0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    deleteModalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
    deleteModalSub: { fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
    deleteModalActions: { flexDirection: 'row', gap: 12, width: '100%' },
    cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: 'rgba(148, 163, 184, 0.1)', alignItems: 'center' },
    cancelBtnText: { fontSize: 15, fontWeight: '700' },
    confirmDeleteBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#EF4444', alignItems: 'center', shadowColor: '#EF4444', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
    confirmDeleteBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 25, paddingTop: 25, maxHeight: '90%' },
    lightModal: { backgroundColor: '#FFFFFF' }, darkModal: { backgroundColor: '#0B0F19' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 20, fontWeight: '800', maxWidth: '80%' },
    closeBtn: { padding: 5 },
    imageUploadContainer: { marginBottom: 20, borderRadius: 16, overflow: 'hidden' },
    imagePlaceholder: { height: 140, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' },
    uploadedImage: { width: '100%', height: 140, resizeMode: 'cover', borderRadius: 16 },
    uploadText: { marginTop: 8, fontSize: 13, fontWeight: '600' },
    inputContainer: { marginBottom: 18 },
    rowInputs: { flexDirection: 'row', justifyContent: 'space-between' },
    inputLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 },
    inputWrapper: { borderRadius: 16, paddingHorizontal: 16, height: 55, borderWidth: 1, justifyContent: 'center' },
    input: { fontSize: 15, fontWeight: '500', height: '100%' },
    typeContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
    typePill: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1 },
    lightTypePill: { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }, darkTypePill: { backgroundColor: '#1E293B', borderColor: '#334155' },
    activeTypePill: { backgroundColor: '#6366F1', borderColor: '#6366F1' }, activeTypeText: { color: '#FFFFFF', fontWeight: '700' },
    saveBtnWrapper: { marginTop: 10, shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8, borderRadius: 20 },
    saveBtn: { height: 60, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

    segmentedControl: { flexDirection: 'row', borderRadius: 12, padding: 4, marginBottom: 20 },
    segmentBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
    segmentBtnActive: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
    segmentText: { fontSize: 14, fontWeight: '600' },
    segmentTextActive: { color: '#6366F1', fontWeight: '800' },

    lightText: { color: '#0F172A' }, darkText: { color: '#FFFFFF' },
    lightSubText: { color: '#64748B' }, darkSubText: { color: '#94A3B8' },
    lightInput: { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' }, darkInput: { backgroundColor: '#0A0F1C', borderColor: '#1E293B' },
    inputErrorBorder: { borderColor: '#EF4444', borderWidth: 1.5 },
    inlineErrorText: { color: '#EF4444', fontSize: 11, fontWeight: '600', marginTop: 4, marginLeft: 4 },
});