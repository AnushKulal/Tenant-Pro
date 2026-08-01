// File: mobile/src/components/Sidebar.js
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme, Animated, Dimensions, TouchableWithoutFeedback, Image, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { SERVER_URL, mediaUrl } from '../api/client';

const { width } = Dimensions.get('window');

export default function Sidebar({ isOpen, onClose, navigation, currentRoute = 'Dashboard', setActiveTab }) {
    const theme = useColorScheme();
    const isDark = theme === 'dark';
    const insets = useSafeAreaInsets();

    const [fullName, setFullName] = useState('Property Admin');
    const [email, setEmail] = useState('admin@tenantpro.com');
    const [profilePic, setProfilePic] = useState(null);

    const sidebarAnim = useRef(new Animated.Value(-width * 0.75)).current;
    const backdropOpacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const fetchUserData = async () => {
            try {
                const ownerData = await AsyncStorage.getItem('ownerData');
                if (ownerData) {
                    const parsedData = JSON.parse(ownerData);
                    setFullName(parsedData.name);
                    setEmail(parsedData.email);
                    setProfilePic(parsedData.profile_pic);
                }
            } catch (error) {
                console.log("Error loading user data", error);
            }
        };

        if (isOpen) fetchUserData();

        if (isOpen) {
            Animated.parallel([
                Animated.timing(sidebarAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
                Animated.timing(backdropOpacity, { toValue: 1, duration: 300, useNativeDriver: true })
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(sidebarAnim, { toValue: -width * 0.75, duration: 300, useNativeDriver: true }),
                Animated.timing(backdropOpacity, { toValue: 0, duration: 300, useNativeDriver: true })
            ]).start();
        }
    }, [isOpen]);

    const handleLogout = async () => {
        await AsyncStorage.removeItem('userToken');
        await AsyncStorage.removeItem('ownerData');

        // ADD THIS LINE TO KILL THE GHOST PROPERTY ✨
        await AsyncStorage.removeItem('selectedProperty');
        onClose();
        navigation.replace('Login');
    };

    const navigateTo = (screenName) => {
        onClose();
        if (setActiveTab) {
            setActiveTab(screenName); // Instantly swap the middle content!
        } else if (navigation) {
            navigation.navigate(screenName);
        }
    };

    const getInitials = (name) => {
        if (!name) return 'AD';
        return name.substring(0, 2).toUpperCase();
    };

    const renderAvatar = () => {
        if (profilePic) {
            const imageUrl = profilePic.startsWith('/uploads')
                ? mediaUrl(profilePic)
                : profilePic;
            return <Image source={{ uri: imageUrl }} style={styles.avatarImage} />;
        }
        return <Text style={styles.avatarText}>{getInitials(fullName)}</Text>;
    };

    // UPGRADED: Much smoother active state UI
    const SidebarItem = ({ icon, title, onPress, color, isActive }) => {
        const activeBg = isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.08)';
        const activeColor = '#6366F1';
        const defaultIconColor = color || (isDark ? '#94A3B8' : '#64748B');
        const defaultTextColor = color || (isDark ? '#F8FAFC' : '#1E293B');

        return (
            <TouchableOpacity
                style={[styles.sidebarItem, isActive && { backgroundColor: activeBg }]}
                onPress={onPress}
                activeOpacity={0.7}
            >
                {isActive && <View style={styles.activeIndicator} />}
                <View style={styles.sidebarIconBox}>
                    <Ionicons name={isActive ? icon.replace('-outline', '') : icon} size={22} color={isActive ? activeColor : defaultIconColor} />
                </View>
                <Text style={[styles.sidebarItemText, { color: isActive ? activeColor : defaultTextColor }, isActive && { fontWeight: '700' }]}>
                    {title}
                </Text>
            </TouchableOpacity>
        );
    };

    if (!isOpen && sidebarAnim._value === -width * 0.75) return null;

    return (
        <View style={styles.overlayContainer} pointerEvents={isOpen ? 'auto' : 'none'}>
            <TouchableWithoutFeedback onPress={onClose}>
                <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
            </TouchableWithoutFeedback>

            <Animated.View style={[styles.sidebar, isDark ? styles.darkSidebar : styles.lightSidebar, { transform: [{ translateX: sidebarAnim }] }]}>

                {/* UPGRADED: Added a sleek curve to the bottom right of the gradient */}
                <LinearGradient
                    colors={['#3B82F6', '#4F46E5']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.header, { paddingTop: insets.top + 20 }]}
                >
                    <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                        <Ionicons name="close" size={24} color="rgba(255,255,255,0.7)" />
                    </TouchableOpacity>

                    <TouchableOpacity activeOpacity={0.8} onPress={() => navigateTo('Profile')} style={styles.profileContainer}>
                        <View style={styles.profileAvatar}>
                            {renderAvatar()}
                        </View>
                        <View style={styles.profileTextWrapper}>
                            <Text style={styles.name} numberOfLines={1}>{fullName}</Text>
                            <Text style={styles.email} numberOfLines={1}>{email}</Text>
                        </View>
                    </TouchableOpacity>
                </LinearGradient>

                {/* --- UPGRADED: Middle Section is now Scrollable --- */}
                <ScrollView
                    style={styles.menu}
                    contentContainerStyle={{ paddingTop: 25, paddingBottom: 20 }}
                    showsVerticalScrollIndicator={false}
                >
                    <SidebarItem icon="home-outline" title="Dashboard" isActive={currentRoute === 'Home' || currentRoute === 'Dashboard'} onPress={() => navigateTo('Home')} />
                    <SidebarItem icon="person-outline" title="My Profile" isActive={currentRoute === 'Profile'} onPress={() => navigateTo('Profile')} />
                    <SidebarItem icon="business-outline" title="My Properties" isActive={currentRoute === 'Properties'} onPress={() => navigateTo('Properties')} />
                    <SidebarItem icon="people-outline" title="Manage Tenants" isActive={currentRoute === 'Tenants'} onPress={() => navigateTo('Tenants')} />
                    <SidebarItem icon="wallet-outline" title="Transactions" isActive={currentRoute === 'Transactions'} onPress={() => navigateTo('Transactions')} />

                    <SidebarItem icon="qr-code-outline" title="Payment Setup" isActive={currentRoute === 'PaymentSettings'} onPress={() => navigateTo('PaymentSettings')} />

                    <View style={[styles.divider, isDark ? styles.darkDivider : styles.lightDivider]} />

                    <SidebarItem
                        icon="settings-outline"
                        title="Settings"
                        isActive={currentRoute === 'Settings'}
                        onPress={() => navigateTo('Settings')}
                    />
                    <SidebarItem
                        icon="help-buoy-outline"
                        title="Help & Support"
                        isActive={currentRoute === 'HelpSupport'}
                        onPress={() => navigateTo('HelpSupport')}
                    />
                </ScrollView>

                {/* Footer stays perfectly locked to the bottom! */}
                <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
                    <SidebarItem icon="log-out-outline" title="Log Out" color="#EF4444" onPress={handleLogout} />
                    <Text style={[styles.versionText, isDark ? styles.darkVersion : styles.lightVersion]}>
                        TenantPro v1.0
                    </Text>
                </View>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    overlayContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },

    sidebar: {
        position: 'absolute', top: 0, bottom: 0, left: 0, width: width * 0.70, // Slightly wider for a premium feel
        shadowColor: '#000', shadowOffset: { width: 10, height: 0 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 20
    },
    lightSidebar: { backgroundColor: '#FFFFFF' },
    darkSidebar: { backgroundColor: '#0B0F19', borderRightWidth: 1, borderColor: '#1E293B' },

    header: {
        paddingHorizontal: 25, paddingBottom: 35,
        borderBottomRightRadius: 40 // Beautiful modern curve
    },
    closeButton: { position: 'absolute', top: 50, right: 20, padding: 5, zIndex: 10 },

    profileContainer: { marginTop: 10 },
    profileAvatar: {
        width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255, 255, 255, 0.2)',
        justifyContent: 'center', alignItems: 'center', marginBottom: 16, borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.6)', overflow: 'hidden',
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8
    },
    avatarText: { color: '#FFFFFF', fontSize: 26, fontWeight: '800', letterSpacing: 1 },
    avatarImage: { width: '100%', height: '100%', resizeMode: 'cover' },

    profileTextWrapper: { paddingRight: 10 },
    name: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', marginBottom: 4, letterSpacing: -0.5 },
    email: { fontSize: 13, color: 'rgba(255, 255, 255, 0.85)', fontWeight: '500' },

    menu: { flex: 1, paddingHorizontal: 15 },

    sidebarItem: {
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: 14, paddingHorizontal: 12,
        marginBottom: 6, borderRadius: 14, // Softer pill shape
        overflow: 'hidden'
    },
    activeIndicator: {
        position: 'absolute', left: 0, top: '25%', bottom: '25%',
        width: 4, backgroundColor: '#6366F1',
        borderTopRightRadius: 4, borderBottomRightRadius: 4
    },
    sidebarIconBox: { width: 34, alignItems: 'center' },
    sidebarItemText: { fontSize: 15, fontWeight: '600', marginLeft: 8, letterSpacing: 0.2 },

    divider: { height: 1, marginVertical: 15, marginHorizontal: 15 },
    lightDivider: { backgroundColor: '#F1F5F9' },
    darkDivider: { backgroundColor: '#1E293B' },

    footer: { paddingHorizontal: 15 },
    versionText: {
        textAlign: 'center', fontSize: 12, fontWeight: '600', letterSpacing: 0.5
    },
    lightVersion: { color: '#94A3B8' },
    darkVersion: { color: '#475569' }
});