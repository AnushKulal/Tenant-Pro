// File: mobile/src/components/ProfileTab.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker'; 

// IMPORT YOUR CENTRALIZED CLIENT AND SERVER URL!
import client, { SERVER_URL, mediaUrl } from '../api/client';

export default function ProfileTab({ isDark, onProfileUpdate }) {
    // Personal Info State
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [profilePic, setProfilePic] = useState(null); 
    
    // Security State
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPasswords, setShowPasswords] = useState(false);
    
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const loadUserData = async () => {
            try {
                const ownerData = await AsyncStorage.getItem('ownerData');
                if (ownerData) {
                    const parsed = JSON.parse(ownerData);
                    setName(parsed.name || '');
                    setEmail(parsed.email || '');
                    setPhone(parsed.phone || '');
                    setProfilePic(parsed.profile_pic || null);
                }
            } catch (error) {
                console.log("Error loading user data", error);
            }
        };
        loadUserData();
    }, []);

    // --- Image Picker Logic ---
    const pickImage = async () => {
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
        
        if (permissionResult.granted === false) {
            Alert.alert("Permission Required", "You need to allow camera roll permissions to change your profile picture.");
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'], 
            allowsEditing: true,
            aspect: [1, 1], 
            quality: 0.5,   
        });

        if (!result.canceled) {
            setProfilePic(result.assets[0].uri);
        }
    };

    // --- REAL BACKEND SAVE LOGIC (USING AXIOS) ---
    const handleSave = async () => {
        // 1. Validations
        if (!name.trim()) return Alert.alert("Validation Error", "Full Name is required.");
        if (phone && phone.length < 10) return Alert.alert("Validation Error", "Please enter a valid phone number.");
        
        if (newPassword || currentPassword) {
            if (!currentPassword) return Alert.alert("Validation Error", "Please enter your current password to set a new one.");
            if (!newPassword) return Alert.alert("Validation Error", "Please enter a new password.");
            if (newPassword.length < 6) return Alert.alert("Validation Error", "New password must be at least 6 characters long.");
            if (newPassword !== confirmPassword) return Alert.alert("Validation Error", "New passwords do not match.");
        }

        setIsLoading(true);
        
        try {
            const token = await AsyncStorage.getItem('userToken');
            
            // Construct FormData for multipart/form-data upload
            const formData = new FormData();
            formData.append('name', name);
            formData.append('phone', phone);
            
            if (newPassword) {
                formData.append('currentPassword', currentPassword);
                formData.append('newPassword', newPassword);
            }
            
            // Bulletproof file attachment for React Native
            if (profilePic && !profilePic.startsWith('/uploads') && !profilePic.startsWith('http')) {
                let localUri = profilePic;
                let filename = localUri.split('/').pop();
                let match = /\.(\w+)$/.exec(filename);
                let type = match ? `image/${match[1]}` : `image/jpeg`;
                
                formData.append('profile_pic', { 
                    uri: Platform.OS === 'android' ? localUri : localUri.replace('file://', ''), 
                    name: filename, 
                    type: type 
                });
            }

            // Execute Backend Call using your central `client`
            const response = await client.put('/owner/profile', formData, {
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data' // Override the default application/json
                }
            });

            const data = response.data; // Axios automatically parses JSON into `.data`
            
            // Backend successful! Update local storage with fresh DB data
            await AsyncStorage.setItem('ownerData', JSON.stringify(data.owner));
            
            // Update local state with the exact path the server saved
            setProfilePic(data.owner.profile_pic);

            if (onProfileUpdate) onProfileUpdate();

            Alert.alert("Success", "Profile updated successfully!");
            setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');

        } catch (error) {
            console.error(error);
            // Safely extract Axios error message if it exists
            const errorMessage = error.response?.data?.message || "Failed to connect to the server.";
            Alert.alert("Error", errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    // Smart Image Renderer 
    const renderProfileImage = () => {
        if (!profilePic) return null;
        
        // If it's a relative path from our database, prepend the SERVER_URL from client.js
        if (profilePic.startsWith('/uploads')) {
            return <Image source={{ uri: mediaUrl(profilePic) }} style={styles.avatarImage} />;
        }
        
        // Otherwise, it's a local file picked from the gallery
        return <Image source={{ uri: profilePic }} style={styles.avatarImage} />;
    };

    const ProfileInput = ({ label, icon, value, onChangeText, isLocked, keyboardType = 'default', isPassword = false, placeholder }) => (
        <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, isDark ? styles.darkSubText : styles.lightSubText]}>{label}</Text>
            <View style={[styles.inputWrapper, isDark ? styles.darkInput : styles.lightInput, isLocked && (isDark ? styles.lockedDarkInput : styles.lockedLightInput)]}>
                <Ionicons name={icon} size={20} color={isDark ? '#7E859E' : '#94A3B8'} style={styles.inputIcon} />
                <TextInput 
                    style={[styles.input, isDark ? styles.darkText : styles.lightText, isLocked && { color: isDark ? '#7E859E' : '#94A3B8' }]} 
                    value={value} 
                    onChangeText={onChangeText} 
                    editable={!isLocked} 
                    keyboardType={keyboardType} 
                    secureTextEntry={isPassword && !showPasswords}
                    placeholder={placeholder}
                    placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
                />
                {isLocked && <Ionicons name="lock-closed" size={16} color={isDark ? '#7E859E' : '#94A3B8'} />}
                {isPassword && (
                    <TouchableOpacity onPress={() => setShowPasswords(!showPasswords)}>
                        <Ionicons name={showPasswords ? "eye-off-outline" : "eye-outline"} size={20} color={isDark ? '#7E859E' : '#94A3B8'} />
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );

    const getInitials = (fullName) => fullName ? fullName.substring(0, 2).toUpperCase() : 'AD';

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                
                {/* --- AVATAR SECTION --- */}
                <View style={styles.avatarSection}>
                    <View style={styles.avatarWrapper}>
                        <View style={styles.avatarCircle}>
                            {profilePic ? renderProfileImage() : <Text style={styles.avatarText}>{getInitials(name)}</Text>}
                        </View>
                        <TouchableOpacity style={styles.editBadge} activeOpacity={0.8} onPress={pickImage}>
                            <LinearGradient colors={['#3B82F6', '#4F46E5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.editBadgeGradient}>
                                <Ionicons name="camera" size={16} color="#FFFFFF" />
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* --- PERSONAL INFO CARD --- */}
                <View style={[styles.sectionCard, isDark ? styles.darkCard : styles.lightCard]}>
                    <Text style={[styles.sectionHeader, isDark ? styles.darkText : styles.lightText]}>Personal Information</Text>
                    <ProfileInput label="Full Name" icon="person-outline" value={name} onChangeText={setName} placeholder="e.g. Rahul Sharma" />
                    <ProfileInput label="Phone Number" icon="call-outline" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="e.g. +91 9876543210" />
                    <ProfileInput label="Email Address" icon="mail-outline" value={email} isLocked={true} placeholder="your@email.com" />
                </View>

                {/* --- SECURITY CARD --- */}
                <View style={[styles.sectionCard, isDark ? styles.darkCard : styles.lightCard]}>
                    <Text style={[styles.sectionHeader, isDark ? styles.darkText : styles.lightText]}>Security & Password</Text>
                    <ProfileInput label="Current Password" icon="key-outline" value={currentPassword} onChangeText={setCurrentPassword} isPassword={true} placeholder="Required to change password" />
                    <ProfileInput label="New Password" icon="lock-closed-outline" value={newPassword} onChangeText={setNewPassword} isPassword={true} placeholder="Min. 6 characters" />
                    <ProfileInput label="Confirm New Password" icon="checkmark-circle-outline" value={confirmPassword} onChangeText={setConfirmPassword} isPassword={true} placeholder="Repeat new password" />
                </View>

                {/* --- SAVE BUTTON --- */}
                <TouchableOpacity style={styles.saveBtnWrapper} activeOpacity={0.8} onPress={handleSave} disabled={isLoading}>
                    <LinearGradient colors={['#3B82F6', '#4F46E5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.saveBtn}>
                        {isLoading ? (
                            <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                            <Text style={styles.saveBtnText}>Save Changes</Text>
                        )}
                    </LinearGradient>
                </TouchableOpacity>

                <View style={{ height: 120 }} />
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    scrollContent: { paddingHorizontal: 20, paddingTop: 10 },
    
    // Theme Colors
    lightText: { color: '#0F172A' }, 
    darkText: { color: '#FFFFFF' },
    lightSubText: { color: '#64748B' }, 
    darkSubText: { color: '#7E859E' },
    
    // Avatar
    avatarSection: { alignItems: 'center', marginBottom: 30 }, 
    avatarWrapper: { position: 'relative' },
    avatarCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#171B2C', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#6366F1', overflow: 'hidden' }, 
    avatarText: { fontSize: 36, fontWeight: '800', color: '#6366F1', letterSpacing: 2 },
    avatarImage: { width: '100%', height: '100%', resizeMode: 'cover' }, 
    editBadge: { position: 'absolute', bottom: 0, right: 0 }, 
    editBadgeGradient: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#0A0F1C' },
    
    // Cards
    sectionCard: { padding: 20, borderRadius: 24, marginBottom: 20 },
    lightCard: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 },
    darkCard: { backgroundColor: '#151A25' },
    sectionHeader: { fontSize: 16, fontWeight: '800', marginBottom: 20, letterSpacing: 0.5 },

    // Inputs
    inputContainer: { marginBottom: 18 },
    inputLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 },
    inputWrapper: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, paddingHorizontal: 16, height: 55, borderWidth: 1 },
    lightInput: { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }, 
    darkInput: { backgroundColor: '#0B0F19', borderColor: '#1E2638' },
    lockedLightInput: { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0', opacity: 0.7 }, 
    lockedDarkInput: { backgroundColor: '#0A0F1C', borderColor: '#151A25', opacity: 0.6 },
    inputIcon: { marginRight: 12 }, 
    input: { flex: 1, fontSize: 15, fontWeight: '500' },
    
    // Button
    saveBtnWrapper: { shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8, marginTop: 10 },
    saveBtn: { height: 60, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
});