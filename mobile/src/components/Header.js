// File: mobile/src/components/Header.js
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Image, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client, { SERVER_URL } from '../api/client'; 

// Reusable Smart Image for the Bottom Sheet List
const PropertyListImage = ({ imageUrl }) => {
    const [hasError, setHasError] = useState(false);
    const defaultImage = `${SERVER_URL}/uploads/property/default-property.jpg`;
    const imageSource = (imageUrl && !hasError) ? `${SERVER_URL}${imageUrl}` : defaultImage;

    return (
        <Image 
            source={{ uri: imageSource }} 
            style={styles.sheetPropImage} 
            onError={() => setHasError(true)} 
        />
    );
};

export default function Header({ userName, profilePic, isDark, onProfilePress, fadeAnim, currentRoute, selectedProperty, setSelectedProperty }) {
    const ringPulseAnim = useRef(new Animated.Value(1)).current;
    
    // --- NEW: Bottom Sheet States ---
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [properties, setProperties] = useState([]);
    const [isLoadingProps, setIsLoadingProps] = useState(false);

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(ringPulseAnim, { toValue: 1.08, duration: 1500, useNativeDriver: true }),
                Animated.timing(ringPulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true })
            ])
        ).start();
    }, []);

    const getInitials = (name) => {
        if (!name) return 'AD';
        return name.substring(0, 2).toUpperCase();
    };

    const renderAvatar = () => {
        if (profilePic) {
            const imageUrl = profilePic.startsWith('/uploads') ? `${SERVER_URL}${profilePic}` : profilePic;
            return <Image source={{ uri: imageUrl }} style={styles.avatarImage} />;
        }
        return <Text style={styles.avatarText}>{getInitials(userName)}</Text>;
    };

    // --- NEW: Open Sheet and Fetch Properties ---
    const handleOpenPropertySelector = async () => {
        setIsSheetOpen(true);
        setIsLoadingProps(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            const response = await client.get('/properties', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setProperties(response.data.properties);
        } catch (error) {
            console.log("Failed to load properties for header", error);
        } finally {
            setIsLoadingProps(false);
        }
    };

    // --- NEW: Select Property and Save Context ---
    const handleSelectProperty = async (prop) => {
        const propData = prop ? { id: prop.id, name: prop.name } : { id: 'all', name: 'All Properties' };
        
        await AsyncStorage.setItem('selectedProperty', JSON.stringify(propData));
        setSelectedProperty(propData);
        setIsSheetOpen(false);
    };

    const getHeaderText = () => {
        switch(currentRoute) {
            case 'Home':
            case 'Dashboard': return "Ready to manage properties.";
            case 'Profile': return "Update your personal details.";
            case 'Settings': return "Manage your app preferences.";
            case 'HelpSupport': return "How can we help you today?";
            case 'Terms': return "Review our service terms.";
            case 'Properties': return "Manage your buildings and units.";
            case 'Tenants': return "View and manage your tenants.";
            case 'Transactions': return "Track rent and expenses.";
            case 'Rooms': return "Manage your individual units.";
            default: return "Ready to manage properties.";
        }
    };

    const getPageTitle = () => {
        switch(currentRoute) {
            case 'Home':
            case 'Dashboard': return `Hello, ${userName}`; 
            case 'Profile': return "My Profile";
            case 'Settings': return "Settings";
            case 'HelpSupport': return "Help & Support";
            case 'Terms': return "Terms of Service";
            case 'Properties': return "My Properties";
            case 'Tenants': return "Manage Tenants";
            case 'Transactions': return "Transactions";
            case 'Rooms': return "Rooms & Units";
            default: return `Hello, ${userName}`;
        }
    };

    return (
        <View style={styles.headerWrapper}>
            <Animated.View style={[styles.headerContent, { opacity: fadeAnim }]}>
                
                <View style={styles.textStack}>
                    {/* --- UPGRADED: Property Selector Button --- */}
                    <TouchableOpacity style={styles.switcherRow} activeOpacity={0.7} onPress={handleOpenPropertySelector}>
                        <Ionicons name="business" size={12} color="#6366F1" style={{ marginRight: 4 }} />
                        <Text style={styles.locationText} numberOfLines={1}>
                            {selectedProperty?.name || 'All Properties'}
                        </Text>
                        <Ionicons name="chevron-down" size={12} color="#6366F1" style={{ marginLeft: 4, marginTop: 1 }} />
                    </TouchableOpacity>

                    <Text style={[styles.userName, isDark ? styles.darkText : styles.lightText]}>
                        {getPageTitle()}
                    </Text>
                    
                    <Text style={[styles.statusText, isDark ? styles.darkSubText : styles.lightSubText]}>
                         {getHeaderText()} 
                    </Text>
                </View>

                <View style={styles.rightActions}>
                    <TouchableOpacity style={styles.notificationBtn} activeOpacity={0.7}>
                        <Ionicons name="notifications-outline" size={24} color={isDark ? '#FFFFFF' : '#0F172A'} />
                        <View style={[styles.badge, isDark ? styles.darkBadgeBorder : styles.lightBadgeBorder]} />
                    </TouchableOpacity>

                    <TouchableOpacity onPress={onProfilePress} activeOpacity={0.9}>
                        <Animated.View style={[styles.avatarRing, { transform: [{ scale: ringPulseAnim }] }]}>
                            <View style={styles.profileAvatar}>
                                {renderAvatar()}
                            </View>
                        </Animated.View>
                    </TouchableOpacity>
                </View>
            </Animated.View>

            {/* --- NEW: BOTTOM SHEET MODAL --- */}
            <Modal animationType="slide" transparent={true} visible={isSheetOpen} onRequestClose={() => setIsSheetOpen(false)}>
                <View style={styles.sheetOverlay}>
                    {/* Tap background to close */}
                    <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setIsSheetOpen(false)} />
                    
                    <View style={[styles.sheetContent, isDark ? styles.darkSheet : styles.lightSheet]}>
                        <View style={styles.sheetHeader}>
                            <Text style={[styles.sheetTitle, isDark ? styles.darkText : styles.lightText]}>Select Property</Text>
                            <TouchableOpacity onPress={() => setIsSheetOpen(false)} style={{ padding: 5 }}>
                                <Ionicons name="close-circle" size={26} color={isDark ? '#475569' : '#CBD5E1'} />
                            </TouchableOpacity>
                        </View>

                        {isLoadingProps ? (
                            <View style={{ paddingVertical: 40 }}>
                                <ActivityIndicator size="large" color="#6366F1" />
                            </View>
                        ) : (
                            <ScrollView showsVerticalScrollIndicator={false}>
                                
                                {/* Option: ALL PROPERTIES */}
                                <TouchableOpacity 
                                    style={[styles.sheetItem, selectedProperty?.id === 'all' && styles.sheetItemActive]} 
                                    onPress={() => handleSelectProperty(null)}
                                >
                                    <View style={styles.allPropsIcon}>
                                        <Ionicons name="grid" size={20} color="#6366F1" />
                                    </View>
                                    <View style={styles.sheetItemTextContainer}>
                                        <Text style={[styles.sheetItemTitle, isDark ? styles.darkText : styles.lightText]}>All Properties</Text>
                                        <Text style={[styles.sheetItemSub, isDark ? styles.darkSubText : styles.lightSubText]}>Global Overview</Text>
                                    </View>
                                    {selectedProperty?.id === 'all' && <Ionicons name="checkmark-circle" size={24} color="#10B981" />}
                                </TouchableOpacity>

                                {/* Dynamic Property List */}
                                {properties.map((prop) => {
                                    const isSelected = selectedProperty?.id === prop.id;
                                    return (
                                        <TouchableOpacity 
                                            key={prop.id} 
                                            style={[styles.sheetItem, isSelected && styles.sheetItemActive]} 
                                            onPress={() => handleSelectProperty(prop)}
                                        >
                                            <PropertyListImage imageUrl={prop.image_url} />
                                            
                                            <View style={styles.sheetItemTextContainer}>
                                                <Text style={[styles.sheetItemTitle, isDark ? styles.darkText : styles.lightText]} numberOfLines={1}>
                                                    {prop.name}
                                                </Text>
                                                <Text style={[styles.sheetItemSub, isDark ? styles.darkSubText : styles.lightSubText]} numberOfLines={1}>
                                                    {prop.locality}, {prop.city}
                                                </Text>
                                            </View>

                                            {isSelected && <Ionicons name="checkmark-circle" size={24} color="#10B981" />}
                                        </TouchableOpacity>
                                    );
                                })}

                                <View style={{ height: 40 }} />
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>

        </View>
    );
}

const styles = StyleSheet.create({
    headerWrapper: { paddingHorizontal: 24, paddingTop: 5, paddingBottom: 15, zIndex: 10 },
    headerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    textStack: { justifyContent: 'center', flex: 1 },
    
    switcherRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, backgroundColor: 'rgba(99, 102, 241, 0.1)', alignSelf: 'flex-start', paddingVertical: 5, paddingHorizontal: 12, borderRadius: 12 },
    locationText: { fontSize: 10, fontWeight: '800', color: '#6366F1', textTransform: 'uppercase', letterSpacing: 0.5, maxWidth: 150 },
    userName: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5, marginBottom: 4 },
    statusText: { fontSize: 13, fontWeight: '500' },

    rightActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    notificationBtn: { padding: 4, justifyContent: 'center', alignItems: 'center' },
    badge: { position: 'absolute', top: 4, right: 5, width: 9, height: 9, borderRadius: 4.5, backgroundColor: '#EF4444', borderWidth: 1.5 },
    lightBadgeBorder: { borderColor: '#F8FAFC' },
    darkBadgeBorder: { borderColor: '#0A0F1C' }, 

    avatarRing: { padding: 3, borderRadius: 30, borderWidth: 1.5, borderColor: 'rgba(99, 102, 241, 0.5)' },
    profileAvatar: { 
        width: 40, height: 40, borderRadius: 20, backgroundColor: '#6366F1', 
        justifyContent: 'center', alignItems: 'center', shadowColor: '#6366F1', 
        shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 4,
        overflow: 'hidden' 
    },
    avatarText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', letterSpacing: 1 },
    avatarImage: { width: '100%', height: '100%', resizeMode: 'cover' }, 

    // --- BOTTOM SHEET STYLES ---
    sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
    sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
    sheetContent: { borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 20, paddingTop: 25, maxHeight: '75%' },
    lightSheet: { backgroundColor: '#FFFFFF' }, darkSheet: { backgroundColor: '#0F172A' },
    
    sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingHorizontal: 5 },
    sheetTitle: { fontSize: 20, fontWeight: '800' },
    
    sheetItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 16, marginBottom: 10, borderBottomWidth: 1, borderBottomColor: 'transparent' },
    sheetItemActive: { backgroundColor: 'rgba(99, 102, 241, 0.08)' },
    
    allPropsIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(99, 102, 241, 0.15)', justifyContent: 'center', alignItems: 'center' },
    sheetPropImage: { width: 44, height: 44, borderRadius: 12 },
    
    sheetItemTextContainer: { flex: 1, marginLeft: 15 },
    sheetItemTitle: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
    sheetItemSub: { fontSize: 13, fontWeight: '500' },

    lightText: { color: '#0F172A' }, darkText: { color: '#FFFFFF' },
    lightSubText: { color: '#64748B' }, darkSubText: { color: '#94A3B8' }, 
});