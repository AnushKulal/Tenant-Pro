// File: mobile/src/components/RoomDetailsModal.js
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Modal, KeyboardAvoidingView, Platform, Alert, Image, Animated, Dimensions, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import client, { SERVER_URL } from '../api/client';

import EditTenantModal from './EditTenantModal';
import ChangeRoomModal from './ChangeRoomModal';
import RecordPaymentModal from './RecordPaymentModal';
import CustomAlert from './CustomAlert';

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

export default function RoomDetailsModal({ isVisible, onClose, room, isDark, onRoomUpdated, onOpenTenantProfile }) {
    const navigation = useNavigation();

    // --- STATES ---
    const [roomTenants, setRoomTenants] = useState([]);
    const [isLoadingTenants, setIsLoadingTenants] = useState(true);
    const [activeTenantMenuId, setActiveTenantMenuId] = useState(null);

    // Sub-Modal States
    const [isEditModalVisible, setEditModalVisible] = useState(false);
    const [tenantToEdit, setTenantToEdit] = useState(null);
    const [isChangeRoomVisible, setChangeRoomVisible] = useState(false);
    const [tenantToShift, setTenantToShift] = useState(null);

    // --- NEW: SMART BILLING SHARED STATES ---
    const [moveInDate, setMoveInDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [billingCycle, setBillingCycle] = useState('Anniversary');

    // Add Tenant States
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
    const [tenantDeposit, setTenantDeposit] = useState('');
    const [tenantRentShare, setTenantRentShare] = useState('');
    const [tenantImageUri, setTenantImageUri] = useState(null);

    // Move Out States
    const [isMoveOutModalVisible, setMoveOutModalVisible] = useState(false);
    const [tenantToMoveOut, setTenantToMoveOut] = useState(null);
    const [isMovingOut, setIsMovingOut] = useState(false);

    // --- PAYMENT & ALERT STATES ---
    const [isPaymentModalVisible, setPaymentModalVisible] = useState(false);
    const [tenantToPay, setTenantToPay] = useState(null);
    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'success' });

    // Animation States
    const [showRemoveSuccess, setShowRemoveSuccess] = useState(false);
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const moveAnim = useRef(new Animated.Value(0)).current;

    // --- NOTIFICATION SETTINGS STATES ---
    const [notifyEmail, setNotifyEmail] = useState(true);
    const [notifySms, setNotifySms] = useState(true);
    const [notifyWhatsapp, setNotifyWhatsapp] = useState(false);

    // --- ASSIGN EXISTING TENANT STATES ---
    const [isAssignExistingVisible, setAssignExistingVisible] = useState(false);
    const [unassignedTenants, setUnassignedTenants] = useState([]);
    const [isLoadingUnassigned, setIsLoadingUnassigned] = useState(false);
    const [isAssigning, setIsAssigning] = useState(false);
    const [isAddOptionsVisible, setAddOptionsVisible] = useState(false);

    const [selectedUnassignedTenant, setSelectedUnassignedTenant] = useState(null);
    const [assignDeposit, setAssignDeposit] = useState('');
    const [assignRentShare, setAssignRentShare] = useState('');
    const [assignErrors, setAssignErrors] = useState({});

    useEffect(() => {
        if (isVisible && room?.id) {
            fetchTenants();
            setNotifyEmail(room.notify_email !== undefined ? !!room.notify_email : true);
            setNotifySms(room.notify_sms !== undefined ? !!room.notify_sms : true);
            setNotifyWhatsapp(!!room.notify_whatsapp);
        }
    }, [isVisible, room?.id]);

    // --- SMART PRORATED MATH ENGINE ---
    const [proratedDisplayAmount, setProratedDisplayAmount] = useState(null);

    // 1. Auto-fill the input ONLY if it's an Equal Split room
    useEffect(() => {
        if (!room) return;
        if (room.rent_split_type === 'Equal') {
            const share = Math.round(room.base_rent / (room.capacity || 1));
            // Fill the correct box depending on which modal is open
            if (isAssignExistingVisible && selectedUnassignedTenant) setAssignRentShare(share.toString());
            else if (isAddTenantModalVisible) setTenantRentShare(share.toString());
        }
    }, [room, isAssignExistingVisible, selectedUnassignedTenant, isAddTenantModalVisible]);

    // 2. Calculate the Prorated "Due Today" amount based on whatever is in the box
    useEffect(() => {
        if (!room) return;

        // Figure out which rent input we are currently typing in
        let activeRentStr = isAssignExistingVisible ? assignRentShare : tenantRentShare;

        if (!activeRentStr) {
            setProratedDisplayAmount(null);
            return;
        }

        const standardRent = Number(activeRentStr);
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
    }, [moveInDate, billingCycle, assignRentShare, tenantRentShare, room, isAssignExistingVisible, isAddTenantModalVisible]);

    const handleToggleSetting = async (settingType, newValue) => {
        if (settingType === 'email') setNotifyEmail(newValue);
        if (settingType === 'sms') setNotifySms(newValue);
        if (settingType === 'whatsapp') setNotifyWhatsapp(newValue);

        try {
            const token = await AsyncStorage.getItem('userToken');
            await client.put(`/units/${room.id}/settings`, {
                notify_email: settingType === 'email' ? newValue : notifyEmail,
                notify_sms: settingType === 'sms' ? newValue : notifySms,
                notify_whatsapp: settingType === 'whatsapp' ? newValue : notifyWhatsapp,
            }, { headers: { Authorization: `Bearer ${token}` } });

            if (onRoomUpdated) onRoomUpdated();
        } catch (error) {
            if (settingType === 'email') setNotifyEmail(!newValue);
            if (settingType === 'sms') setNotifySms(!newValue);
            if (settingType === 'whatsapp') setNotifyWhatsapp(!newValue);
            Alert.alert("Sync Error", "Failed to save notification setting.");
        }
    };

    const fetchTenants = async () => {
        setIsLoadingTenants(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            const response = await client.get(`/tenants/unit/${room.id}`, { headers: { Authorization: `Bearer ${token}` } });
            setRoomTenants(response.data.tenants);
        } catch (error) {
            console.log("Failed to fetch tenants", error);
        } finally {
            setIsLoadingTenants(false);
        }
    };

    const pickTenantImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
        if (!result.canceled) setTenantImageUri(result.assets[0].uri);
    };

    const resetTenantForm = () => {
        setTenantName(''); setTenantPhone(''); setTenantEmail(''); setTenantAadhar('');
        setTenantCompany(''); setTenantEmergency(''); setTenantDeposit(''); setTenantRentShare('');
        setTenantImageUri(null); setTenantErrors({}); setTenantGeneralError('');
        setMoveInDate(new Date()); setBillingCycle('Anniversary');
        setAddTenantModalVisible(false);
    };

    // --- SAVE BRAND NEW TENANT ---
    const handleSaveNewTenant = async () => {
        setTenantErrors({}); setTenantGeneralError('');
        let errors = {};

        if (!tenantName.trim()) errors.name = "Name is required.";
        if (!tenantPhone.trim() || !/^\d{10}$/.test(tenantPhone.trim())) errors.phone = "Enter a valid 10-digit phone number.";
        if (tenantEmail.trim() && !/\S+@\S+\.\S+/.test(tenantEmail.trim())) errors.email = "Enter a valid email address.";

        if (Object.keys(errors).length > 0) {
            setTenantErrors(errors);
            setTenantGeneralError("Please fix the highlighted errors above.");
            return;
        }

        setIsSavingTenant(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            const formData = new FormData();

            const year = moveInDate.getFullYear();
            const month = String(moveInDate.getMonth() + 1).padStart(2, '0');
            const day = String(moveInDate.getDate()).padStart(2, '0');
            const formattedMoveInDate = `${year}-${month}-${day}`;

            formData.append('unit_id', room.id);
            formData.append('name', tenantName);
            formData.append('phone', tenantPhone);
            formData.append('email', tenantEmail);
            formData.append('aadhar', tenantAadhar);
            formData.append('company', tenantCompany);
            formData.append('emergency', tenantEmergency);
            formData.append('deposit', tenantDeposit || 0);
            formData.append('rent_share', tenantRentShare || 0); // Math engine handles prorating!
            formData.append('move_in_date', formattedMoveInDate);
            formData.append('billing_cycle', billingCycle);

            if (tenantImageUri) {
                const filename = tenantImageUri.split('/').pop();
                const match = /\.(\w+)$/.exec(filename);
                const type = match ? `image/${match[1]}` : `image/jpeg`;
                formData.append('tenant_image', { uri: tenantImageUri, name: filename, type });
            }

            await client.post('/tenants', formData, {
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
            });

            await fetchTenants();
            onRoomUpdated();
            resetTenantForm();
        } catch (error) {
            setTenantGeneralError(error.response?.data?.message || "Failed to add tenant.");
        } finally {
            setIsSavingTenant(false);
        }
    };

    const openMoveOutConfirm = (tenant) => {
        setActiveTenantMenuId(null);
        setTenantToMoveOut(tenant);
        setTimeout(() => setMoveOutModalVisible(true), 50);
    };

    const handleMoveOutConfirm = async () => {
        setIsMovingOut(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            await client.put(`/tenants/${tenantToMoveOut.id}/move-out`, {}, { headers: { Authorization: `Bearer ${token}` } });
            setMoveOutModalVisible(false);
            triggerExitAnimation(tenantToMoveOut);
        } catch (error) {
            Alert.alert("Error", "Failed to move out tenant.");
            setMoveOutModalVisible(false);
        } finally {
            setIsMovingOut(false);
        }
    };

    const triggerExitAnimation = (tenant) => {
        setTenantToMoveOut(tenant);
        setShowRemoveSuccess(true);
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
        Animated.timing(moveAnim, { toValue: 1, duration: 1500, delay: 300, useNativeDriver: true }).start();

        setTimeout(() => {
            fetchTenants();
            onRoomUpdated();
            setShowRemoveSuccess(false);
            fadeAnim.setValue(0);
            moveAnim.setValue(0);
            setTenantToMoveOut(null);
        }, 3000);
    };

    const fetchUnassignedAndOpen = async () => {
        setAssignExistingVisible(true);
        setIsLoadingUnassigned(true);
        setMoveInDate(new Date());
        setBillingCycle('Anniversary');
        try {
            const token = await AsyncStorage.getItem('userToken');
            const response = await client.get('/tenants/unassigned', { headers: { Authorization: `Bearer ${token}` } });
            setUnassignedTenants(response.data.tenants || []);
        } catch (error) {
            Alert.alert("Error", "Could not fetch unassigned tenants.");
            setAssignExistingVisible(false);
        } finally {
            setIsLoadingUnassigned(false);
        }
    };

    const handleSelectUnassigned = (tenant) => {
        setSelectedUnassignedTenant(tenant);
        setAssignDeposit(tenant.deposit?.toString() || '');
        setAssignErrors({});
    };

    // --- ASSIGN EXISTING TENANT ---
    const executeAssignTenant = async () => {
        let errors = {};
        if (!assignDeposit) errors.deposit = "Deposit is required.";
        if (room?.rent_split_type === 'Custom' && !assignRentShare) errors.rent = "Rent share is required.";

        if (Object.keys(errors).length > 0) {
            setAssignErrors(errors);
            return;
        }

        setIsAssigning(true);
        try {
            const token = await AsyncStorage.getItem('userToken');

            const year = moveInDate.getFullYear();
            const month = String(moveInDate.getMonth() + 1).padStart(2, '0');
            const day = String(moveInDate.getDate()).padStart(2, '0');
            const formattedMoveInDate = `${year}-${month}-${day}`;

            await client.put(`/tenants/${selectedUnassignedTenant.id}/assign`, {
                unit_id: room.id,
                deposit: assignDeposit,
                rent_share: assignRentShare, // Uses math engine value
                move_in_date: formattedMoveInDate,
                billing_cycle: billingCycle
            }, { headers: { Authorization: `Bearer ${token}` } });

            setAssignExistingVisible(false);
            setSelectedUnassignedTenant(null);
            fetchTenants();
            if (onRoomUpdated) onRoomUpdated();
            Alert.alert("Success", "Tenant successfully assigned to this room!");
        } catch (error) {
            Alert.alert("Error", "Failed to assign tenant.");
        } finally {
            setIsAssigning(false);
        }
    };

    if (!room) return null;

    return (
        <Modal animationType="slide" transparent={false} visible={isVisible} onRequestClose={onClose}>
            <View style={[styles.fullScreenModal, isDark ? styles.darkModal : styles.lightModal]}>

                {/* Parallax Image Header */}
                <View style={styles.detailsHero}>
                    <Image source={{ uri: room?.image_url ? `${SERVER_URL}${room.image_url}` : `${SERVER_URL}/uploads/rooms/default-room.png` }} style={styles.detailsHeroImage} />
                    <LinearGradient colors={['rgba(0,0,0,0.6)', 'transparent', 'rgba(0,0,0,0.8)']} style={styles.detailsHeroGradient} />

                    <TouchableOpacity style={styles.detailsBackBtn} onPress={onClose}>
                        <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
                    </TouchableOpacity>

                    <View style={styles.detailsHeroContent}>
                        <View style={styles.detailsHeroLeft}>
                            <View style={[styles.statusBadge, { backgroundColor: room?.status === 'Occupied' ? '#3B82F6' : '#10B981', alignSelf: 'flex-start', marginBottom: 8 }]}>
                                <Text style={[styles.statusText, { color: '#FFFFFF' }]}>{room?.status}</Text>
                            </View>
                            <Text style={styles.detailsHeroTitle}>Unit {room?.unit_number}</Text>
                            <Text style={styles.detailsHeroSub}>{room?.property_name} • {room?.room_type}</Text>
                        </View>

                        <TouchableOpacity style={styles.heroAddTenantBtn} activeOpacity={0.8} onPress={() => {
                            if (roomTenants.length >= (room?.capacity || 1)) {
                                Alert.alert("Room Full", "This unit is at maximum capacity.");
                            } else {
                                setAddOptionsVisible(true);
                            }
                        }}>
                            {roomTenants.length >= (room?.capacity || 1) ? (
                                <LinearGradient colors={['#EF4444', '#DC2626']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroAddTenantInner}>
                                    <Ionicons name="lock-closed" size={14} color="#FFFFFF" />
                                    <Text style={styles.heroAddTenantText}>Full</Text>
                                </LinearGradient>
                            ) : (
                                <LinearGradient colors={['#3B82F6', '#4F46E5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroAddTenantInner}>
                                    <Ionicons name="person-add" size={14} color="#FFFFFF" />
                                    <Text style={styles.heroAddTenantText}>Tenant</Text>
                                </LinearGradient>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={[styles.detailsSheetWrapper, isDark ? styles.darkModal : styles.lightModal]}>
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.detailsScrollContent}>

                        <View style={[styles.detailsSection, isDark ? styles.darkCard : styles.lightCard]}>
                            <View style={styles.capacityHeader}>
                                <Text style={[styles.sectionTitleText, isDark ? styles.darkText : styles.lightText]}>Occupancy</Text>
                                <Text style={styles.capacityRatio}>
                                    <Text style={{ color: roomTenants.length >= (room?.capacity || 1) ? '#EF4444' : '#10B981', fontWeight: '800' }}>
                                        {roomTenants.length}
                                    </Text> / {room?.capacity || 1}
                                </Text>
                            </View>
                            <View style={styles.capacityBarBg}>
                                <View style={[styles.capacityBarFill, { width: `${Math.min((roomTenants.length / (room?.capacity || 1)) * 100, 100)}%`, backgroundColor: roomTenants.length >= (room?.capacity || 1) ? '#EF4444' : '#10B981' }]} />
                            </View>
                            <Text style={[styles.capacityHelpText, isDark ? styles.darkSubText : styles.lightSubText]}>
                                {roomTenants.length >= (room?.capacity || 1) ? "Room is at full capacity." : `${(room?.capacity || 1) - roomTenants.length} bed(s) available.`}
                            </Text>
                        </View>

                        {/* ✨ NEW: TENANT RENT STATUS SUMMARY ✨ */}
                        {roomTenants && roomTenants.length > 0 && (
                            <View style={[styles.detailsSection, isDark ? styles.darkCard : styles.lightCard, { marginBottom: 15 }]}>
                                <Text style={[styles.sectionTitleText, isDark ? styles.darkText : styles.lightText, { marginBottom: 12 }]}>Collection Status</Text>

                                {(() => {
                                    const today = new Date();
                                    today.setHours(0, 0, 0, 0);

                                    // 1. Separate tenants into Paid and Pending arrays
                                    const paidTenants = roomTenants.filter(t => {
                                        if (!t.next_rent_due) return false;
                                        const dueDate = new Date(t.next_rent_due);
                                        dueDate.setHours(0, 0, 0, 0);
                                        return dueDate > today;
                                    });

                                    const pendingTenants = roomTenants.filter(t => {
                                        if (!t.next_rent_due) return true;
                                        const dueDate = new Date(t.next_rent_due);
                                        dueDate.setHours(0, 0, 0, 0);
                                        return dueDate <= today;
                                    });

                                    // 2. Calculate the total money for each bucket
                                    const totalCollected = paidTenants.reduce((sum, t) => sum + Number(t.rent_share || 0), 0);
                                    const totalPending = pendingTenants.reduce((sum, t) => sum + Number(t.rent_share || 0), 0);

                                    return (
                                        <View style={{ flexDirection: 'row', gap: 12 }}>

                                            {/* --- SETTLED BLOCK (GREEN) --- */}
                                            <View style={{ flex: 1, backgroundColor: isDark ? 'rgba(16, 185, 129, 0.1)' : '#ECFDF5', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#D1FAE5' }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                                    <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                                                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#10B981', marginLeft: 4 }}>SETTLED (₹{totalCollected})</Text>
                                                </View>
                                                {paidTenants.length > 0 ? (
                                                    paidTenants.map(t => (
                                                        <Text key={t.id} style={{ fontSize: 11, color: isDark ? '#94A3B8' : '#64748B', marginBottom: 4, fontWeight: '500' }} numberOfLines={1}>
                                                            • {t.name}
                                                        </Text>
                                                    ))
                                                ) : (
                                                    <Text style={{ fontSize: 11, color: isDark ? '#475569' : '#94A3B8', fontStyle: 'italic' }}>None yet</Text>
                                                )}
                                            </View>

                                            {/* --- PENDING BLOCK (RED) --- */}
                                            <View style={{ flex: 1, backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : '#FEF2F2', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEE2E2' }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                                    <Ionicons name="time" size={16} color="#EF4444" />
                                                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#EF4444', marginLeft: 4 }}>PENDING (₹{totalPending})</Text>
                                                </View>
                                                {pendingTenants.length > 0 ? (
                                                    pendingTenants.map(t => (
                                                        <Text key={t.id} style={{ fontSize: 11, color: isDark ? '#94A3B8' : '#64748B', marginBottom: 4, fontWeight: '500' }} numberOfLines={1}>
                                                            • {t.name}
                                                        </Text>
                                                    ))
                                                ) : (
                                                    <Text style={{ fontSize: 11, color: isDark ? '#475569' : '#94A3B8', fontStyle: 'italic' }}>All cleared!</Text>
                                                )}
                                            </View>

                                        </View>
                                    );
                                })()}
                            </View>
                        )}
                        {/* ✨ END OF RENT STATUS SUMMARY ✨ */}

                        <View style={[styles.detailsSection, isDark ? styles.darkCard : styles.lightCard]}>
                            <View style={styles.rentHeader}>
                                <Text style={[styles.sectionTitleText, isDark ? styles.darkText : styles.lightText]}>Room Rent</Text>
                                <Text style={styles.totalRentText}>₹{room?.base_rent}<Text style={styles.rentMonthText}> / mo</Text></Text>
                            </View>
                            <View style={[styles.splitTypeBox, isDark ? styles.darkSplitBox : styles.lightSplitBox]}>
                                <View style={styles.splitTypeIcon}>
                                    <Ionicons name={room?.rent_split_type === 'Equal' ? "pie-chart" : "options"} size={20} color="#6366F1" />
                                </View>
                                <View style={styles.splitTypeTextContainer}>
                                    <Text style={[styles.splitTypeTitle, isDark ? styles.darkText : styles.lightText]}>
                                        {room?.rent_split_type === 'Equal' ? "Equal Split" : "Custom Split"}
                                    </Text>
                                    <Text style={[styles.splitTypeDesc, isDark ? styles.darkSubText : styles.lightSubText]}>
                                        {room?.rent_split_type === 'Equal'
                                            ? `Automatically dividing ₹${room?.base_rent} across ${room?.capacity || 1} beds.`
                                            : "Each tenant in this room is billed manually."}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        <View style={[styles.detailsSection, isDark ? styles.darkCard : styles.lightCard, { paddingVertical: 15 }]}>
                            <Text style={[styles.sectionTitleText, isDark ? styles.darkText : styles.lightText, { marginBottom: 12, paddingHorizontal: 5 }]}>Automated Reminders</Text>

                            <View style={styles.settingRow}>
                                <View style={styles.settingInfo}>
                                    <View style={[styles.settingIconBg, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)' }]}>
                                        <Ionicons name="mail" size={20} color="#3B82F6" />
                                    </View>
                                    <View style={styles.settingTextContainer}>
                                        <Text style={[styles.settingTitle, isDark ? styles.darkText : styles.lightText]}>Email Notifications</Text>
                                        <Text style={[styles.settingSub, isDark ? styles.darkSubText : styles.lightSubText]}>Invoices & receipts via Email</Text>
                                    </View>
                                </View>
                                <Switch value={notifyEmail} onValueChange={(val) => handleToggleSetting('email', val)} trackColor={{ false: isDark ? '#334155' : '#E2E8F0', true: '#3B82F6' }} thumbColor="#FFFFFF" />
                            </View>

                            <View style={[styles.settingDivider, isDark ? styles.darkDivider : styles.lightDivider]} />

                            <View style={styles.settingRow}>
                                <View style={styles.settingInfo}>
                                    <View style={[styles.settingIconBg, { backgroundColor: isDark ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.1)' }]}>
                                        <Ionicons name="chatbubble-ellipses" size={20} color="#8B5CF6" />
                                    </View>
                                    <View style={styles.settingTextContainer}>
                                        <Text style={[styles.settingTitle, isDark ? styles.darkText : styles.lightText]}>SMS Text Messages</Text>
                                        <Text style={[styles.settingSub, isDark ? styles.darkSubText : styles.lightSubText]}>Alerts to primary phone</Text>
                                    </View>
                                </View>
                                <Switch value={notifySms} onValueChange={(val) => handleToggleSetting('sms', val)} trackColor={{ false: isDark ? '#334155' : '#E2E8F0', true: '#8B5CF6' }} thumbColor="#FFFFFF" />
                            </View>

                            <View style={[styles.settingDivider, isDark ? styles.darkDivider : styles.lightDivider]} />

                            <View style={styles.settingRow}>
                                <View style={styles.settingInfo}>
                                    <View style={[styles.settingIconBg, { backgroundColor: isDark ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)' }]}>
                                        <Ionicons name="logo-whatsapp" size={20} color="#22C55E" />
                                    </View>
                                    <View style={styles.settingTextContainer}>
                                        <Text style={[styles.settingTitle, isDark ? styles.darkText : styles.lightText]}>WhatsApp Alerts</Text>
                                        <Text style={[styles.settingSub, isDark ? styles.darkSubText : styles.lightSubText]}>Interactive media messages</Text>
                                    </View>
                                </View>
                                <Switch value={notifyWhatsapp} onValueChange={(val) => handleToggleSetting('whatsapp', val)} trackColor={{ false: isDark ? '#334155' : '#E2E8F0', true: '#22C55E' }} thumbColor="#FFFFFF" />
                            </View>
                        </View>

                        <Text style={[styles.sectionHeading, isDark ? styles.darkText : styles.lightText]}>Current Tenants</Text>

                        {isLoadingTenants ? (
                            <View style={{ padding: 30, alignItems: 'center' }}>
                                <ActivityIndicator size="small" color="#6366F1" />
                                <Text style={[{ marginTop: 10, fontSize: 13 }, isDark ? styles.darkSubText : styles.lightSubText]}>Loading tenants...</Text>
                            </View>
                        ) : roomTenants.length === 0 ? (
                            <View style={[styles.emptyTenants, isDark ? styles.darkCard : styles.lightCard]}>
                                <Ionicons name="people-outline" size={32} color={isDark ? '#475569' : '#CBD5E1'} />
                                <Text style={[styles.emptyTenantsText, isDark ? styles.darkSubText : styles.lightSubText]}>No tenants assigned yet.</Text>
                            </View>
                        ) : (
                            roomTenants.map(tenant => (
                                <View key={tenant.id} style={{ zIndex: activeTenantMenuId === tenant.id ? 100 : 1, ...(Platform.OS === 'android' && activeTenantMenuId === tenant.id ? { elevation: 10 } : {}) }}>

                                    {activeTenantMenuId === tenant.id && (
                                        <TouchableOpacity style={styles.localOverlay} activeOpacity={1} onPress={() => setActiveTenantMenuId(null)} />
                                    )}

                                    <TouchableOpacity
                                        activeOpacity={0.8}
                                        style={[styles.tenantCard, isDark ? styles.darkCard : styles.lightCard]}
                                        onPress={() => {
                                            onClose();
                                            setTimeout(() => {
                                                if (onOpenTenantProfile) onOpenTenantProfile(tenant);
                                            }, 300);
                                        }}
                                    >
                                        <View style={styles.tenantAvatarLarge}>
                                            {tenant.image_url ? (
                                                <Image source={{ uri: `${SERVER_URL}${tenant.image_url}` }} style={styles.tenantImage} />
                                            ) : (
                                                <Text style={styles.tenantInitialsLarge}>{tenant.name.substring(0, 2).toUpperCase()}</Text>
                                            )}
                                        </View>

                                        <View style={styles.tenantInfo}>
                                            {(() => {
                                                // Calculate the real-time rent status
                                                let statusText = "NO DATA";
                                                let statusColor = "#94A3B8"; // Gray
                                                let statusBg = isDark ? "rgba(148, 163, 184, 0.15)" : "#F1F5F9";

                                                if (tenant.next_rent_due) {
                                                    const dueDate = new Date(tenant.next_rent_due);
                                                    const today = new Date();
                                                    dueDate.setHours(0, 0, 0, 0);
                                                    today.setHours(0, 0, 0, 0);

                                                    if (dueDate > today) {
                                                        statusText = "UP TO DATE";  // <--- Change this line!
                                                        statusColor = "#10B981";
                                                        statusBg = isDark ? "rgba(16, 185, 129, 0.15)" : "#D1FAE5";
                                                    } else if (dueDate.getTime() === today.getTime()) {
                                                        statusText = "DUE TODAY";
                                                        statusColor = "#F59E0B"; // Orange
                                                        statusBg = isDark ? "rgba(245, 158, 11, 0.15)" : "#FEF3C7";
                                                    } else {
                                                        const daysLate = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
                                                        statusText = `${daysLate}D LATE`;
                                                        statusColor = "#EF4444"; // Red
                                                        statusBg = isDark ? "rgba(239, 68, 68, 0.15)" : "#FEE2E2";
                                                    }
                                                }

                                                return (
                                                    <>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                                            <Text style={[styles.tenantName, isDark ? styles.darkText : styles.lightText, { marginRight: 8, flexShrink: 1 }]} numberOfLines={1}>
                                                                {tenant.name}
                                                            </Text>

                                                            {/* ✨ THE NEW STATUS BADGE ✨ */}
                                                            <View style={{ backgroundColor: statusBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: statusBg }}>
                                                                <Text style={{ fontSize: 9, fontWeight: '800', color: statusColor, letterSpacing: 0.5 }}>
                                                                    {statusText}
                                                                </Text>
                                                            </View>
                                                        </View>

                                                        <View style={styles.tenantSubRow}>
                                                            <Ionicons name="call" size={12} color={isDark ? '#94A3B8' : '#64748B'} />
                                                            <Text style={[styles.tenantPhone, isDark ? styles.darkSubText : styles.lightSubText, { marginLeft: 4 }]}>
                                                                {tenant.phone}
                                                            </Text>
                                                        </View>
                                                    </>
                                                );
                                            })()}
                                        </View>

                                        <View style={styles.tenantRightSide}>
                                            <TouchableOpacity
                                                style={styles.tenantMenuIcon}
                                                onPress={() => setActiveTenantMenuId(activeTenantMenuId === tenant.id ? null : tenant.id)}
                                            >
                                                <Ionicons name="ellipsis-vertical" size={20} color={isDark ? '#94A3B8' : '#64748B'} />
                                            </TouchableOpacity>
                                            <View style={styles.tenantRentBox}>
                                                <Text style={styles.tenantRentAmount}>₹{tenant.rent_share}</Text>
                                                <Text style={[styles.tenantRentLabel, isDark ? styles.darkSubText : styles.lightSubText]}>Share</Text>
                                            </View>
                                        </View>
                                    </TouchableOpacity>

                                    {activeTenantMenuId === tenant.id && (
                                        <View style={[styles.tenantPopoverMenu, isDark ? styles.darkPopover : styles.lightPopover]}>

                                            {/* ✨ SMART RECORD PAYMENT BUTTON ✨ */}
                                            <TouchableOpacity style={styles.popoverItem} onPress={() => {
                                                setActiveTenantMenuId(null);

                                                // 1. Check if rent is already paid (Due date is in the future)
                                                const dueDate = new Date(tenant.next_rent_due);
                                                const today = new Date();
                                                dueDate.setHours(0, 0, 0, 0);
                                                today.setHours(0, 0, 0, 0);
                                                const isRentPaid = tenant.next_rent_due && dueDate > today;

                                                if (isRentPaid) {
                                                    // Show the Custom Modal saying it's already paid!
                                                    setAlertConfig({
                                                        visible: true,
                                                        title: "Rent Up to Date!",
                                                        message: `${tenant.name} has already paid rent for this cycle. The next payment is due on ${dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.`,
                                                        type: "success"
                                                    });
                                                } else {
                                                    // Open the normal payment modal
                                                    setTenantToPay(tenant);
                                                    setPaymentModalVisible(true);
                                                }
                                            }}>
                                                {(() => {
                                                    // Calculate status again just for the visual render
                                                    const dueDate = new Date(tenant.next_rent_due);
                                                    const today = new Date();
                                                    dueDate.setHours(0, 0, 0, 0);
                                                    today.setHours(0, 0, 0, 0);
                                                    const isRentPaid = tenant.next_rent_due && dueDate > today;

                                                    return (
                                                        <>
                                                            <Ionicons
                                                                name={isRentPaid ? "checkmark-done-circle" : "cash-outline"}
                                                                size={16}
                                                                color={isRentPaid ? (isDark ? '#94A3B8' : '#64748B') : "#10B981"}
                                                            />
                                                            <Text style={[styles.popoverText, { color: isRentPaid ? (isDark ? '#94A3B8' : '#64748B') : '#10B981' }]}>
                                                                {isRentPaid ? "Rent Settled" : "Record Payment"}
                                                            </Text>
                                                        </>
                                                    );
                                                })()}
                                            </TouchableOpacity>
                                            <View style={[styles.popoverDivider, isDark ? styles.darkDivider : styles.lightDivider]} />
                                            {/* ✨ END OF SMART BUTTON ✨ */}

                                            <TouchableOpacity style={styles.popoverItem} onPress={() => {
                                                setActiveTenantMenuId(null);
                                                setTenantToEdit(tenant);
                                                setEditModalVisible(true);
                                            }}>
                                                <Ionicons name="create-outline" size={16} color={isDark ? '#94A3B8' : '#64748B'} />
                                                <Text style={[styles.popoverText, isDark ? styles.darkText : styles.lightText]}>Edit Tenant</Text>
                                            </TouchableOpacity>
                                            <View style={[styles.popoverDivider, isDark ? styles.darkDivider : styles.lightDivider]} />
                                            <TouchableOpacity style={styles.popoverItem} onPress={() => {
                                                setActiveTenantMenuId(null);
                                                setTenantToShift(tenant);
                                                setChangeRoomVisible(true);
                                            }}>
                                                <Ionicons name="swap-horizontal-outline" size={16} color="#3B82F6" />
                                                <Text style={[styles.popoverText, { color: '#3B82F6' }]}>Shift Room</Text>
                                            </TouchableOpacity>
                                            <View style={[styles.popoverDivider, isDark ? styles.darkDivider : styles.lightDivider]} />
                                            <TouchableOpacity style={styles.popoverItem} onPress={() => openMoveOutConfirm(tenant)}>
                                                <Ionicons name="exit-outline" size={16} color="#F59E0B" />
                                                <Text style={[styles.popoverText, { color: '#F59E0B' }]}>Move Out</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                </View>
                            ))
                        )}
                        <View style={{ height: 100 }} />
                    </ScrollView>
                </View>

                {/* --- ADD NEW TENANT MODAL --- */}
                {isAddTenantModalVisible && (
                    <Modal animationType="slide" transparent={true} visible={isAddTenantModalVisible} onRequestClose={resetTenantForm}>
                        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
                            <View style={[styles.tenantModalContent, isDark ? styles.darkModal : styles.lightModal]}>
                                <View style={styles.modalHeader}>
                                    <Text style={[styles.modalTitle, isDark ? styles.darkText : styles.lightText]}>Onboard Tenant</Text>
                                    <TouchableOpacity onPress={resetTenantForm} style={styles.closeBtn}>
                                        <Ionicons name="close" size={24} color={isDark ? '#94A3B8' : '#64748B'} />
                                    </TouchableOpacity>
                                </View>

                                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                                    <Text style={[styles.formSectionTitle, isDark ? styles.darkText : styles.lightText]}>Personal Details</Text>

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
                                        <Text style={[styles.tenantPhotoLabel, isDark ? styles.darkSubText : styles.lightSubText]}>Tenant Photo</Text>
                                    </View>

                                    <FormInput label="Full Name *" placeholder="e.g. Amit Kumar" value={tenantName} error={tenantErrors?.name} onChangeText={(text) => { setTenantName(text); setTenantErrors(prev => ({ ...prev, name: null })); setTenantGeneralError(''); }} isDark={isDark} />
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
                                        <View style={{ flex: 1, marginRight: 10 }}><FormInput label="Company / College" placeholder="e.g. Infosys" value={tenantCompany} onChangeText={setTenantCompany} isDark={isDark} /></View>
                                        <View style={{ flex: 1 }}><FormInput label="Emergency Phone" placeholder="Parents No." value={tenantEmergency} onChangeText={setTenantEmergency} keyboardType="phone-pad" isDark={isDark} /></View>
                                    </View>

                                    <Text style={[styles.formSectionTitle, isDark ? styles.darkText : styles.lightText]}>Financials</Text>

                                    {/* --- SMART BILLING SECTION (ADD NEW) --- */}
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

                                        {showDatePicker && Platform.OS === 'android' && (
                                            <DateTimePicker
                                                value={moveInDate} mode="date" display="default"
                                                onChange={(event, selectedDate) => { setShowDatePicker(false); if (selectedDate) setMoveInDate(selectedDate); }}
                                            />
                                        )}

                                        <Text style={[styles.inputLabel, isDark ? styles.darkSubText : styles.lightSubText, { marginTop: 15 }]}>Billing Cycle</Text>
                                        <View style={styles.cycleToggleContainer}>
                                            <TouchableOpacity
                                                style={[styles.cycleBtn, billingCycle === 'Anniversary' ? styles.cycleBtnActive : (isDark ? styles.darkInput : styles.lightInput)]}
                                                onPress={() => setBillingCycle('Anniversary')}
                                            >
                                                <Text style={[styles.cycleBtnText, billingCycle === 'Anniversary' ? { color: '#FFF' } : (isDark ? styles.darkSubText : styles.lightSubText)]}>Monthly from Move-In</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.cycleBtn, billingCycle === '1st_of_month' ? styles.cycleBtnActive : (isDark ? styles.darkInput : styles.lightInput)]}
                                                onPress={() => setBillingCycle('1st_of_month')}
                                            >
                                                <Text style={[styles.cycleBtnText, billingCycle === '1st_of_month' ? { color: '#FFF' } : (isDark ? styles.darkSubText : styles.lightSubText)]}>1st of the Month</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>

                                    {/* 2. DEPOSIT & RENT INPUTS */}
                                    <View style={[styles.rowInputs, { marginTop: 15 }]}>
                                        <View style={{ flex: 1, marginRight: 10 }}>
                                            <FormInput
                                                label="Security Deposit (₹)"
                                                placeholder="e.g. 30000"
                                                value={tenantDeposit}
                                                onChangeText={setTenantDeposit}
                                                keyboardType="numeric"
                                                isDark={isDark}
                                            />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <FormInput
                                                label="Monthly Rent (₹)"
                                                placeholder="e.g. 7500"
                                                value={tenantRentShare}
                                                onChangeText={setTenantRentShare}
                                                keyboardType="numeric"
                                                isDark={isDark}
                                            />
                                        </View>
                                    </View>

                                    {/* ✨ MOVED OUTSIDE: Now spans full width from the left edge! */}
                                    <View style={[styles.helperContainer, { marginTop: -5, marginBottom: 15 }]}>
                                        <Ionicons
                                            name={billingCycle === '1st_of_month' ? "calculator-outline" : (room.rent_split_type === 'Equal' ? "checkmark-circle-outline" : "information-circle-outline")}
                                            size={13}
                                            color={billingCycle === '1st_of_month' ? '#10B981' : '#6366F1'}
                                        />
                                        <Text style={[styles.helperMsg, { color: billingCycle === '1st_of_month' ? '#10B981' : '#6366F1' }]}>
                                            {billingCycle === '1st_of_month' && proratedDisplayAmount
                                                ? ` Prorated for this month: Collect ₹${proratedDisplayAmount} today.`
                                                : (room.rent_split_type === 'Equal'
                                                    ? ` Auto-calculated equal share.`
                                                    : ` Custom split: Feel free to adjust.`)}
                                        </Text>
                                    </View>

                                    {tenantGeneralError ? (
                                        <View style={styles.generalErrorBox}>
                                            <Ionicons name="warning" size={18} color="#EF4444" />
                                            <Text style={styles.generalErrorText}>{tenantGeneralError}</Text>
                                        </View>
                                    ) : null}

                                    <TouchableOpacity style={styles.tenantSaveBtnWrapper} activeOpacity={0.8} onPress={handleSaveNewTenant} disabled={isSavingTenant}>
                                        <LinearGradient colors={['#10B981', '#059669']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.saveBtn}>
                                            {isSavingTenant ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveBtnText}>Save & Verify Tenant</Text>}
                                        </LinearGradient>
                                    </TouchableOpacity>
                                    <View style={{ height: 40 }} />
                                </ScrollView>
                            </View>

                            {/* IOS INLINE OVERLAY DATE PICKER FOR ADD NEW */}
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
                                            value={moveInDate} mode="date" display="spinner"
                                            textColor={isDark ? '#FFFFFF' : '#000000'}
                                            onChange={(event, selectedDate) => { if (selectedDate) setMoveInDate(selectedDate); }}
                                            style={{ height: 200, backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }}
                                        />
                                    </View>
                                </View>
                            )}
                        </KeyboardAvoidingView>
                    </Modal>
                )}

                {/* --- RECORD PAYMENT MODAL --- */}
                <RecordPaymentModal
                    isVisible={isPaymentModalVisible}
                    onClose={() => setPaymentModalVisible(false)}
                    tenant={tenantToPay}
                    isDark={isDark}
                    onSuccess={() => {
                        fetchTenants();
                    }}
                />

                {/* --- EDIT TENANT MODAL REUSED --- */}
                <EditTenantModal isVisible={isEditModalVisible} onClose={() => setEditModalVisible(false)} tenant={tenantToEdit} onSuccess={() => { fetchTenants(); Alert.alert("Success", "Tenant profile updated."); }} isDark={isDark} />

                {/* --- SHIFT ROOM MODAL REUSED --- */}
                <ChangeRoomModal isVisible={isChangeRoomVisible} onClose={() => setChangeRoomVisible(false)} tenant={tenantToShift} currentRoomId={room?.id} onSuccess={() => { triggerExitAnimation(tenantToShift); }} isDark={isDark} />

                {/* --- 1. CUSTOM ADD TENANT OPTIONS (2-COLUMN GRID BOTTOM SHEET) --- */}
                <Modal animationType="slide" transparent={true} visible={isAddOptionsVisible} onRequestClose={() => setAddOptionsVisible(false)}>
                    <View style={styles.bottomSheetOverlay}>
                        <TouchableOpacity style={styles.bottomSheetCloseArea} activeOpacity={1} onPress={() => setAddOptionsVisible(false)} />
                        <View style={[styles.bottomSheetContent, isDark ? styles.darkModal : styles.lightModal]}>
                            <View style={styles.bottomSheetHandle} />
                            <View style={styles.sheetHeader}>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.bottomSheetTitle, isDark ? styles.darkText : styles.lightText]}>Add Tenant</Text>
                                    <Text style={[styles.bottomSheetSub, isDark ? styles.darkSubText : styles.lightSubText]}>
                                        Choose how to add a tenant to Unit {room?.unit_number}
                                    </Text>
                                </View>
                                <TouchableOpacity style={styles.closeBtn} onPress={() => setAddOptionsVisible(false)}>
                                    <Ionicons name="close-circle" size={28} color={isDark ? '#475569' : '#CBD5E1'} />
                                </TouchableOpacity>
                            </View>
                            <View style={styles.optionsGrid}>
                                <TouchableOpacity style={[styles.optionCard, isDark ? styles.darkCard : styles.lightCard, isDark ? styles.darkCardBorder : styles.shadowCard]} activeOpacity={0.8} onPress={() => { setAddOptionsVisible(false); setTimeout(() => fetchUnassignedAndOpen(), 300); }}>
                                    <View style={[styles.optionIconWrapper, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)' }]}>
                                        <Ionicons name="people" size={26} color="#3B82F6" />
                                    </View>
                                    <Text style={[styles.optionCardTitle, isDark ? styles.darkText : styles.lightText]}>Existing</Text>
                                    <Text style={[styles.optionCardSub, isDark ? styles.darkSubText : styles.lightSubText]}>Assign from list</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.optionCard, isDark ? styles.darkCard : styles.lightCard, isDark ? styles.darkCardBorder : styles.shadowCard]} activeOpacity={0.8} onPress={() => { setAddOptionsVisible(false); setTimeout(() => setAddTenantModalVisible(true), 300); }}>
                                    <View style={[styles.optionIconWrapper, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)' }]}>
                                        <Ionicons name="person-add" size={26} color="#10B981" />
                                    </View>
                                    <Text style={[styles.optionCardTitle, isDark ? styles.darkText : styles.lightText]}>New Profile</Text>
                                    <Text style={[styles.optionCardSub, isDark ? styles.darkSubText : styles.lightSubText]}>Create from scratch</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>

                {/* --- 2. ASSIGN EXISTING TENANT (2-STEP BOTTOM SHEET) --- */}
                {isAssignExistingVisible && (
                    <Modal animationType="slide" transparent={true} visible={isAssignExistingVisible} onRequestClose={() => { setAssignExistingVisible(false); setSelectedUnassignedTenant(null); }}>
                        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.bottomSheetOverlay}>
                            <TouchableOpacity style={styles.bottomSheetCloseArea} activeOpacity={1} onPress={() => { setAssignExistingVisible(false); setSelectedUnassignedTenant(null); }} />

                            <View style={[styles.bottomSheetContent, isDark ? styles.darkModal : styles.lightModal, { maxHeight: height * 0.85 }]}>
                                <View style={styles.bottomSheetHandle} />

                                {selectedUnassignedTenant ? (
                                    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                                        <View style={[styles.assignHeaderRow, { alignItems: 'center' }]}>
                                            <TouchableOpacity onPress={() => setSelectedUnassignedTenant(null)} style={{ paddingRight: 15 }}>
                                                <Ionicons name="arrow-back" size={24} color={isDark ? '#94A3B8' : '#64748B'} />
                                            </TouchableOpacity>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.bottomSheetTitle, isDark ? styles.darkText : styles.lightText, { fontSize: 20 }]}>Adjust Financials</Text>
                                                <Text style={[styles.bottomSheetSub, isDark ? styles.darkSubText : styles.lightSubText, { marginBottom: 0 }]}>For {selectedUnassignedTenant.name}</Text>
                                            </View>
                                        </View>

                                        {/* --- SMART BILLING SECTION (ASSIGN EXISTING) --- */}
                                        <View style={[styles.billingSection, { marginTop: 10 }]}>
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

                                            {showDatePicker && Platform.OS === 'android' && (
                                                <DateTimePicker
                                                    value={moveInDate} mode="date" display="default"
                                                    onChange={(event, selectedDate) => { setShowDatePicker(false); if (selectedDate) setMoveInDate(selectedDate); }}
                                                />
                                            )}

                                            <Text style={[styles.inputLabel, isDark ? styles.darkSubText : styles.lightSubText, { marginTop: 15 }]}>Billing Cycle</Text>
                                            <View style={styles.cycleToggleContainer}>
                                                <TouchableOpacity
                                                    style={[styles.cycleBtn, billingCycle === 'Anniversary' ? styles.cycleBtnActive : (isDark ? styles.darkInput : styles.lightInput)]}
                                                    onPress={() => setBillingCycle('Anniversary')}
                                                >
                                                    <Text style={[styles.cycleBtnText, billingCycle === 'Anniversary' ? { color: '#FFF' } : (isDark ? styles.darkSubText : styles.lightSubText)]}>Monthly from Move-In</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={[styles.cycleBtn, billingCycle === '1st_of_month' ? styles.cycleBtnActive : (isDark ? styles.darkInput : styles.lightInput)]}
                                                    onPress={() => setBillingCycle('1st_of_month')}
                                                >
                                                    <Text style={[styles.cycleBtnText, billingCycle === '1st_of_month' ? { color: '#FFF' } : (isDark ? styles.darkSubText : styles.lightSubText)]}>1st of the Month</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>

                                        <View style={[styles.rowInputs, { marginTop: 15 }]}>
                                            <View style={{ flex: 1, marginRight: 10 }}>
                                                <FormInput
                                                    label="New Deposit (₹)"
                                                    placeholder="e.g. 10000"
                                                    value={assignDeposit}
                                                    onChangeText={(val) => { setAssignDeposit(val); setAssignErrors({ ...assignErrors, deposit: null }); }}
                                                    keyboardType="numeric"
                                                    isDark={isDark}
                                                    error={assignErrors?.deposit}
                                                />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <FormInput
                                                    label="Monthly Rent (₹)"
                                                    placeholder="e.g. 5000"
                                                    value={assignRentShare}
                                                    onChangeText={(val) => { setAssignRentShare(val); setAssignErrors({ ...assignErrors, rent: null }); }}
                                                    keyboardType="numeric"
                                                    isDark={isDark}
                                                    error={assignErrors?.rent}
                                                />
                                            </View>
                                        </View>

                                        {/* ✨ MOVED OUTSIDE THE ROW */}
                                        <View style={[styles.helperContainer, { marginTop: 10, marginBottom: 15 }]}>
                                            <Ionicons
                                                name={billingCycle === '1st_of_month' ? "calculator-outline" : (room.rent_split_type === 'Equal' ? "checkmark-circle-outline" : "information-circle-outline")}
                                                size={13}
                                                color={billingCycle === '1st_of_month' ? '#10B981' : '#6366F1'}
                                            />
                                            <Text style={[styles.helperMsg, { color: billingCycle === '1st_of_month' ? '#10B981' : '#6366F1' }]}>
                                                {billingCycle === '1st_of_month' && proratedDisplayAmount
                                                    ? ` Prorated for this month: Collect ₹${proratedDisplayAmount} today.`
                                                    : (room.rent_split_type === 'Equal'
                                                        ? ` Suggested share for ${room.capacity} beds.`
                                                        : ` Custom split: Feel free to adjust.`)}
                                            </Text>
                                        </View>

                                        <TouchableOpacity style={[styles.tenantSaveBtnWrapper, isAssigning && { opacity: 0.5 }, { marginTop: 5 }]} activeOpacity={0.8} onPress={executeAssignTenant} disabled={isAssigning}>
                                            <LinearGradient colors={['#6366F1', '#4F46E5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.saveBtn}>
                                                {isAssigning ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveBtnText}>Confirm Assignment</Text>}
                                            </LinearGradient>
                                        </TouchableOpacity>
                                        <View style={{ height: 40 }} />
                                    </ScrollView>
                                ) : (
                                    <>
                                        <View style={styles.assignHeaderRow}>
                                            <View>
                                                <Text style={[styles.bottomSheetTitle, isDark ? styles.darkText : styles.lightText]}>Select Tenant</Text>
                                                <Text style={[styles.bottomSheetSub, isDark ? styles.darkSubText : styles.lightSubText]}>Assign to Unit {room?.unit_number}</Text>
                                            </View>
                                            <TouchableOpacity onPress={() => { setAssignExistingVisible(false); setSelectedUnassignedTenant(null); }} style={styles.closeBtn}>
                                                <Ionicons name="close" size={28} color={isDark ? '#475569' : '#CBD5E1'} />
                                            </TouchableOpacity>
                                        </View>

                                        {isLoadingUnassigned ? (
                                            <ActivityIndicator size="large" color="#6366F1" style={{ marginVertical: 40 }} />
                                        ) : unassignedTenants.length === 0 ? (
                                            <View style={styles.emptyAssignState}>
                                                <View style={[styles.emptyIconWrapper, { backgroundColor: isDark ? 'rgba(148, 163, 184, 0.1)' : '#F1F5F9' }]}>
                                                    <Ionicons name="people-outline" size={40} color={isDark ? '#64748B' : '#94A3B8'} />
                                                </View>
                                                <Text style={[styles.emptyStateTitle, isDark ? styles.darkText : styles.lightText]}>No Tenants Available</Text>
                                                <Text style={[styles.emptyStateSub, isDark ? styles.darkSubText : styles.lightSubText]}>
                                                    All your tenants are currently assigned to rooms.
                                                </Text>
                                            </View>
                                        ) : (
                                            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                                                {unassignedTenants.map(tenant => (
                                                    <TouchableOpacity
                                                        key={tenant.id}
                                                        style={[styles.assignTenantCard, isDark ? styles.darkCard : styles.lightCard, isDark ? styles.darkCardBorder : styles.shadowCard]}
                                                        activeOpacity={0.7}
                                                        onPress={() => handleSelectUnassigned(tenant)}
                                                    >
                                                        <View style={styles.settingInfo}>
                                                            <View style={[styles.tenantAvatarLarge, { width: 48, height: 48, borderRadius: 24, marginRight: 14 }]}>
                                                                {tenant.image_url ? (
                                                                    <Image source={{ uri: `${SERVER_URL}${tenant.image_url}` }} style={styles.tenantImage} />
                                                                ) : (
                                                                    <Text style={[styles.tenantInitialsLarge, { fontSize: 16 }]}>{tenant.name.substring(0, 2).toUpperCase()}</Text>
                                                                )}
                                                            </View>
                                                            <View style={styles.settingTextContainer}>
                                                                <Text style={[styles.settingTitle, isDark ? styles.darkText : styles.lightText, { fontSize: 16 }]}>{tenant.name}</Text>
                                                                <View style={styles.tenantSubRow}>
                                                                    <Ionicons name="call" size={12} color={isDark ? '#94A3B8' : '#64748B'} />
                                                                    <Text style={[styles.settingSub, isDark ? styles.darkSubText : styles.lightSubText, { fontSize: 13, marginTop: 0 }]}>{tenant.phone}</Text>
                                                                </View>
                                                            </View>
                                                        </View>

                                                        <View style={[styles.selectPill, isDark ? { backgroundColor: 'rgba(99, 102, 241, 0.15)' } : { backgroundColor: '#EEF2FF' }]}>
                                                            <Text style={styles.selectPillText}>Select</Text>
                                                        </View>
                                                    </TouchableOpacity>
                                                ))}
                                            </ScrollView>
                                        )}
                                    </>
                                )}
                            </View>

                            {/* IOS INLINE OVERLAY DATE PICKER FOR ASSIGN EXISTING */}
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
                                            value={moveInDate} mode="date" display="spinner"
                                            textColor={isDark ? '#FFFFFF' : '#000000'}
                                            onChange={(event, selectedDate) => { if (selectedDate) setMoveInDate(selectedDate); }}
                                            style={{ height: 200, backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }}
                                        />
                                    </View>
                                </View>
                            )}
                        </KeyboardAvoidingView>
                    </Modal>
                )}

                <Modal animationType="fade" transparent={true} visible={isMoveOutModalVisible} onRequestClose={() => setMoveOutModalVisible(false)}>
                    <View style={styles.deleteModalOverlay}>
                        <View style={[styles.confirmDialog, isDark ? styles.darkCard : styles.lightCard]}>
                            <View style={[styles.warningIconBg, { backgroundColor: '#FFFBEB' }]}>
                                <Ionicons name="exit-outline" size={32} color="#F59E0B" />
                            </View>
                            <Text style={[styles.confirmTitle, isDark ? styles.darkText : styles.lightText]}>Move Out Tenant?</Text>
                            <Text style={[styles.confirmSubText, isDark ? styles.darkSubText : styles.lightSubText]}>
                                Are you sure you want to mark <Text style={{ fontWeight: 'bold', color: isDark ? '#FFF' : '#000' }}>{tenantToMoveOut?.name}</Text> as moved out? This will free up their bed.
                            </Text>

                            <View style={styles.confirmActions}>
                                <TouchableOpacity style={[styles.confirmBtn, isDark ? styles.darkInput : styles.lightInput]} onPress={() => setMoveOutModalVisible(false)} disabled={isMovingOut}>
                                    <Text style={[styles.confirmBtnText, isDark ? styles.darkText : styles.lightText]}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: '#F59E0B', borderWidth: 0 }]} onPress={handleMoveOutConfirm} disabled={isMovingOut}>
                                    {isMovingOut ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={[styles.confirmBtnText, { color: '#FFF' }]}>Move Out</Text>}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>

                {showRemoveSuccess && (
                    <Animated.View style={[styles.successOverlay, { opacity: fadeAnim }]}>
                        <LinearGradient colors={['#EF4444', '#DC2626']} style={styles.successGradient}>
                            <View style={styles.successIconCircle}>
                                <Ionicons name="exit" size={50} color="#EF4444" />
                            </View>
                            <Text style={styles.successTitle}>Tenant Moved Out</Text>
                            <Text style={styles.successSubText}>{tenantToMoveOut?.name} has moved out of Unit {room?.unit_number}.</Text>

                            <View style={styles.animationTrack}>
                                <View style={styles.roomNode}><Ionicons name="bed" size={24} color="rgba(255,255,255,0.9)" /></View>
                                <Animated.View style={[styles.movingTenant, { transform: [{ translateX: moveAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 120] }) }] }]}>
                                    <Ionicons name="walk" size={32} color="#FFFFFF" />
                                </Animated.View>
                                <View style={styles.roomNode}><Ionicons name="log-out-outline" size={24} color="rgba(255,255,255,0.7)" /></View>
                            </View>
                        </LinearGradient>
                    </Animated.View>
                )}

                {/* --- OUR REUSABLE CUSTOM ALERT --- */}
                <CustomAlert
                    visible={alertConfig.visible}
                    title={alertConfig.title}
                    message={alertConfig.message}
                    type={alertConfig.type}
                    onClose={() => setAlertConfig({ ...alertConfig, visible: false })}
                    isDark={isDark}
                />

            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    // --- LAYOUT & MODAL ---
    fullScreenModal: { flex: 1 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    tenantModalContent: { borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 25, paddingTop: 25, maxHeight: height - 230, width: '100%', flex: 1 },
    lightModal: { backgroundColor: '#FFFFFF' },
    darkModal: { backgroundColor: '#0B0F19' },
    localOverlay: { position: 'absolute', top: -height, bottom: -height, left: -width, right: -width, zIndex: 40 },

    // --- PARALLAX HERO SECTION ---
    detailsHero: { height: 260, position: 'relative' },
    detailsHeroImage: { width: '100%', height: '100%', resizeMode: 'cover' },
    detailsHeroGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '100%' },
    detailsBackBtn: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 20, left: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
    detailsHeroContent: { position: 'absolute', bottom: 45, left: 24, right: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    detailsHeroLeft: { flex: 1, paddingRight: 10 },
    detailsHeroTitle: { color: '#FFFFFF', fontSize: 28, fontWeight: '800', marginBottom: 4 },
    detailsHeroSub: { color: '#E2E8F0', fontSize: 14, fontWeight: '600' },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    statusText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },

    // --- BUTTONS ---
    heroAddTenantBtn: { borderRadius: 10, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 5 },
    heroAddTenantInner: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14 },
    heroAddTenantText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', marginLeft: 6, letterSpacing: 0.5 },
    tenantSaveBtnWrapper: { marginTop: 10, shadowColor: '#10B981', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8, borderRadius: 20 },
    saveBtn: { height: 60, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    closeBtn: { padding: 5 },

    // --- CONTENT SHEET ---
    detailsSheetWrapper: { flex: 1, marginTop: -25, borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: 'hidden' },
    detailsScrollContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
    detailsSection: { padding: 20, borderRadius: 20, marginBottom: 20 },
    sectionTitleText: { fontSize: 16, fontWeight: '800' },
    sectionHeading: { fontSize: 18, fontWeight: '800', marginTop: 10, marginBottom: 15 },
    lightCard: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 4 },
    darkCard: { backgroundColor: '#151A25' },

    // --- CAPACITY & RENT INFO ---
    capacityHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    capacityRatio: { fontSize: 16, fontWeight: '600', color: '#64748B' },
    capacityBarBg: { height: 10, backgroundColor: 'rgba(148, 163, 184, 0.2)', borderRadius: 5, overflow: 'hidden', marginBottom: 10 },
    capacityBarFill: { height: '100%', borderRadius: 5 },
    capacityHelpText: { fontSize: 12, fontWeight: '500' },
    rentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 },
    totalRentText: { fontSize: 18, fontWeight: '800', color: '#10B981' },
    rentMonthText: { fontSize: 14, fontWeight: '700', color: '#94A3B8' },
    splitTypeBox: { flexDirection: 'row', padding: 16, borderRadius: 16, alignItems: 'center' },
    lightSplitBox: { backgroundColor: '#EEF2FF' },
    darkSplitBox: { backgroundColor: 'rgba(99, 102, 241, 0.1)' },
    splitTypeIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
    splitTypeTextContainer: { flex: 1 },
    splitTypeTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
    splitTypeDesc: { fontSize: 13, fontWeight: '500', lineHeight: 20 },

    // --- TENANT LIST CARDS ---
    tenantCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 24, marginBottom: 16 },
    tenantAvatarLarge: { width: 58, height: 58, borderRadius: 29, backgroundColor: 'rgba(99, 102, 241, 0.15)', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    tenantImage: { width: '100%', height: '100%', borderRadius: 29 },
    tenantInitialsLarge: { color: '#6366F1', fontSize: 20, fontWeight: '800' },
    tenantInfo: { flex: 1, justifyContent: 'center' },
    tenantName: { fontSize: 17, fontWeight: '700', marginBottom: 5 },
    tenantSubRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    tenantPhone: { fontSize: 13, fontWeight: '600' },
    tenantRightSide: { alignItems: 'flex-end', justifyContent: 'space-between', height: 64 },
    tenantMenuIcon: { padding: 6, marginTop: -6, marginRight: -8 },
    tenantRentBox: { alignItems: 'flex-end' },
    tenantRentAmount: { fontSize: 16, fontWeight: '800', color: '#10B981' },
    tenantRentLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginTop: 2 },
    emptyTenants: { padding: 30, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', borderWidth: 1, borderColor: 'rgba(148, 163, 184, 0.3)' },
    emptyTenantsText: { marginTop: 10, fontSize: 14, fontWeight: '600' },

    // --- DROPDOWN POPUP MENU ---
    tenantPopoverMenu: { position: 'absolute', top: 35, right: 15, borderRadius: 12, width: 160, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 15, zIndex: 999, padding: 5 },
    lightPopover: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F1F5F9' },
    darkPopover: { backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155' },
    popoverItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 15 },
    popoverText: { fontSize: 14, fontWeight: '600', marginLeft: 10 },
    popoverDivider: { height: 1 },
    lightDivider: { backgroundColor: '#F1F5F9' },
    darkDivider: { backgroundColor: '#334155' },

    // --- FORM ELEMENTS & VALIDATION ---
    inputContainer: { marginBottom: 18 },
    inputLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 },
    inputWrapper: { borderRadius: 16, paddingHorizontal: 16, height: 55, borderWidth: 1, justifyContent: 'center' },
    input: { fontSize: 15, fontWeight: '500', height: '100%' },
    rowInputs: { flexDirection: 'row', justifyContent: 'space-between' },
    formSectionTitle: { fontSize: 14, fontWeight: '800', marginTop: 10, marginBottom: 15, letterSpacing: 0.5, color: '#6366F1' },
    inputErrorBorder: { borderColor: '#EF4444', borderWidth: 1.5 },
    inlineErrorText: { color: '#EF4444', fontSize: 11, fontWeight: '600', marginTop: 4, marginLeft: 4 },
    generalErrorBox: { flexDirection: 'row', backgroundColor: '#FEF2F2', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#FECACA', alignItems: 'center', marginBottom: 15 },
    generalErrorText: { color: '#EF4444', fontSize: 13, fontWeight: '700', marginLeft: 8, flex: 1 },
    alertBox: { flexDirection: 'row', padding: 16, borderRadius: 12, marginBottom: 15, alignItems: 'center' },
    lightAlert: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' },
    darkAlert: { backgroundColor: 'rgba(59, 130, 246, 0.1)', borderWidth: 1, borderColor: 'rgba(59, 130, 246, 0.2)' },
    alertText: { flex: 1, marginLeft: 10, fontSize: 12, fontWeight: '500', lineHeight: 18 },

    // --- TENANT PHOTO PICKER ---
    tenantPhotoPickerContainer: { alignItems: 'center', marginBottom: 20 },
    tenantPhotoPicker: { width: 90, height: 90, borderRadius: 45, borderWidth: 1, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' },
    tenantPhotoPreview: { width: '100%', height: '100%', borderRadius: 45 },
    tenantPhotoEditBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#6366F1', width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
    tenantPhotoLabel: { marginTop: 8, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

    // --- CONFIRMATION MODAL STYLES ---
    deleteModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, zIndex: 999 },
    confirmDialog: { width: '100%', borderRadius: 24, padding: 24, alignItems: 'center' },
    warningIconBg: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    confirmTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
    confirmSubText: { fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
    confirmActions: { flexDirection: 'row', gap: 12, width: '100%' },
    cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: 'rgba(148, 163, 184, 0.1)', alignItems: 'center' },
    cancelBtnText: { fontSize: 15, fontWeight: '700' },
    confirmBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: 'transparent' },
    confirmBtnText: { fontSize: 15, fontWeight: '700' },

    // --- SUCCESS OVERLAY & EXIT ANIMATION ---
    successOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 9999, overflow: 'hidden' },
    successGradient: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
    successIconCircle: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', marginBottom: 25, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 15, elevation: 10 },
    successTitle: { fontSize: 26, fontWeight: '800', color: '#FFFFFF', marginBottom: 10, textAlign: 'center' },
    successSubText: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.9)', textAlign: 'center', marginBottom: 40, paddingHorizontal: 20 },
    animationTrack: { flexDirection: 'row', alignItems: 'center', width: 170, justifyContent: 'space-between', position: 'relative' },
    roomNode: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)' },
    movingTenant: { position: 'absolute', left: 10, top: -10, zIndex: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, elevation: 5 },

    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },

    // --- UTILITY ---
    lightText: { color: '#0F172A' },
    darkText: { color: '#FFFFFF' },
    lightSubText: { color: '#64748B' },
    darkSubText: { color: '#94A3B8' },
    lightInput: { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' },
    darkInput: { backgroundColor: '#0A0F1C', borderColor: '#1E293B' },

    // --- SETTINGS STYLES ---
    settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 5 },
    settingInfo: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 15 },
    settingIconBg: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
    settingTextContainer: { flex: 1 },
    settingTitle: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
    settingSub: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
    settingDivider: { height: 1, marginVertical: 2, marginLeft: 60 },

    // --- NEW: BOTTOM SHEET STYLES ---
    bottomSheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    bottomSheetCloseArea: { flex: 1, width: '100%' }, // Clicking the dark area closes it
    bottomSheetContent: { width: '100%', borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 24, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
    bottomSheetHandle: { width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(148, 163, 184, 0.4)', alignSelf: 'center', marginBottom: 20 },
    bottomSheetTitle: { fontSize: 22, fontWeight: '800', marginBottom: 4 },
    bottomSheetSub: { fontSize: 14, fontWeight: '500', marginBottom: 15 },
    sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 },
    optionsGrid: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
    optionCard: { flex: 1, marginHorizontal: 6, borderRadius: 24, padding: 20, alignItems: 'flex-start', minHeight: 140, justifyContent: 'center' },
    shadowCard: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 6 },
    darkCardBorder: { borderWidth: 1, borderColor: '#334155' },
    optionIconWrapper: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    optionCardTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
    optionCardSub: { fontSize: 12, fontWeight: '600' },

    // Action Sheet Buttons
    actionSheetBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 20, borderRadius: 16, marginBottom: 12 },
    actionSheetBtnText: { fontSize: 16, fontWeight: '700' },

    // Assign List Styles
    assignHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 },
    assignListItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1 },
    assignBtn: { backgroundColor: '#6366F1', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
    assignBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
    emptyAssignState: { alignItems: 'center', paddingVertical: 40 },

    // --- NEW: ASSIGN TENANT LIST STYLES ---
    assignTenantCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 16, marginBottom: 12 },
    selectPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
    selectPillText: { color: '#6366F1', fontWeight: '700', fontSize: 13 },
    emptyIconWrapper: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    emptyStateTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
    emptyStateSub: { fontSize: 14, textAlign: 'center', paddingHorizontal: 20, lineHeight: 22 },

    // --- NEW SMART BILLING STYLES ---
    billingSection: { backgroundColor: 'rgba(99, 102, 241, 0.05)', padding: 15, borderRadius: 16, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(99, 102, 241, 0.1)' },
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

    helperContainer: { flexDirection: 'row', alignItems: 'center', marginTop: -5, marginLeft: 4, marginBottom: 15 },
    helperMsg: { fontSize: 12, fontWeight: '600', marginLeft: 4, fontStyle: 'italic' },
});