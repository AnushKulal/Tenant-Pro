// File: mobile/src/screens/HomeScreen.js
// Master layout for the owner/landlord app. Tabs are internal state rather than
// navigator routes, which is why hardware back needs handling here — see
// useHardwareBack below.
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    StyleSheet, Animated, View, Text, BackHandler, ToastAndroid, Platform, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useTheme } from '../theme';
import { Avatar } from '../ui';

// Your Components
import Header from '../components/Header';
import BottomNav from '../components/BottomNav';
import Sidebar from '../components/Sidebar';
import HomeTab from '../components/HomeTab';
import ProfileTab from '../components/ProfileTab';
import SettingsTab from '../components/SettingsTab';
import HelpSupportTab from '../components/HelpSupportTab';
import TermsTab from '../components/TermsTab';
import PropertiesTab from '../components/PropertiesTab';
import RoomsTab from '../components/RoomsTab';
import TenantsTab from '../components/TenantsTab';
import TenantProfileTab from '../components/TenantProfileTab';
import PaymentSettingsTab from '../components/PaymentSettingsTab';
import TransactionsTab from '../components/TransactionsTab';

// Tabs reachable from the bottom bar. Anything else is a "drill-in" that should
// return to where it was opened from rather than to Home.
const ROOT_TAB = 'Home';

export default function HomeScreen({ navigation }) {
    const t = useTheme();
    const isDark = t.isDark;

    const [userName, setUserName] = useState('Admin');
    const [profilePic, setProfilePic] = useState(null);

    // --- Global Property Context ---
    const [selectedProperty, setSelectedProperty] = useState({ id: 'all', name: 'All Properties' });

    const [activeTab, setActiveTab] = useState(ROOT_TAB);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const [selectedProfileData, setSelectedProfileData] = useState(null);
    const [previousTab, setPreviousTab] = useState('Tenants');

    const fadeAnimHeader = useRef(new Animated.Value(0)).current;

    // Breadcrumb of visited tabs so hardware back can retrace steps inside the
    // layout instead of jumping straight out of the app.
    const tabHistory = useRef([ROOT_TAB]);

    const goToTab = useCallback((tab) => {
        setActiveTab((current) => {
            if (tab === current) return current;
            tabHistory.current.push(current);
            return tab;
        });
    }, []);

    const fetchUserData = useCallback(async () => {
        try {
            const ownerData = await AsyncStorage.getItem('ownerData');
            if (ownerData) {
                const parsedData = JSON.parse(ownerData);
                setUserName(parsedData.name ? parsedData.name.split(' ')[0] : 'Admin');
                setProfilePic(parsedData.profile_pic || null);
                // Warm the cache so a later re-render never re-downloads it.
                Avatar.prefetch(parsedData.profile_pic);
            }

            const savedProperty = await AsyncStorage.getItem('selectedProperty');
            if (savedProperty) {
                setSelectedProperty(JSON.parse(savedProperty));
            }
        } catch (error) {
            console.log('Error loading user data', error);
        }
    }, []);

    // Load once on mount. This used to also re-run on every activeTab change,
    // which hit AsyncStorage on each tab switch and made the avatar re-mount
    // (the visible "pop"). Screens that mutate the profile call fetchUserData
    // through onProfileUpdate instead, so the data still stays fresh.
    useEffect(() => {
        fetchUserData();
        Animated.timing(fadeAnimHeader, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    }, [fetchUserData, fadeAnimHeader]);

    // --- Hardware back ----------------------------------------------------------
    // Priority: close the sidebar → leave a drill-in view → retrace tab history
    // → confirm exit. Without this, back fell through to the navigator, which
    // (before the stack reset) walked the user back into the login screen.
    const backPressedOnce = useRef(false);
    useEffect(() => {
        const onBack = () => {
            if (isSidebarOpen) {
                setIsSidebarOpen(false);
                return true;
            }

            if (activeTab === 'TenantProfile') {
                setActiveTab(previousTab);
                return true;
            }

            if (tabHistory.current.length > 0) {
                const prev = tabHistory.current.pop();
                if (prev && prev !== activeTab) {
                    setActiveTab(prev);
                    return true;
                }
            }

            if (activeTab !== ROOT_TAB) {
                setActiveTab(ROOT_TAB);
                return true;
            }

            // On the root tab: require a second press so a stray back never
            // closes the app mid-task.
            if (backPressedOnce.current) return false; // let the OS exit
            backPressedOnce.current = true;
            if (Platform.OS === 'android') {
                ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
            }
            setTimeout(() => { backPressedOnce.current = false; }, 2000);
            return true;
        };

        const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
        return () => sub.remove();
    }, [isSidebarOpen, activeTab, previousTab]);

    const renderActiveTab = () => {
        switch (activeTab) {
            case 'Home':
                return <HomeTab isDark={isDark} selectedProperty={selectedProperty} />;
            case 'Rooms':
                return <RoomsTab
                    isDark={isDark}
                    selectedProperty={selectedProperty}
                    onViewProfile={(tenant) => {
                        setSelectedProfileData(tenant);
                        setPreviousTab('Rooms');
                        goToTab('TenantProfile');
                    }}
                />;
            case 'Profile':
                return <ProfileTab isDark={isDark} onProfileUpdate={fetchUserData} />;
            case 'Tenants':
                return <TenantsTab
                    isDark={isDark}
                    activePropertyId={selectedProperty.id}
                    onViewProfile={(tenant) => {
                        setSelectedProfileData(tenant);
                        setPreviousTab('Tenants');
                        goToTab('TenantProfile');
                    }}
                />;
            case 'TenantProfile':
                return <TenantProfileTab
                    isDark={isDark}
                    tenant={selectedProfileData}
                    goBack={() => setActiveTab(previousTab)}
                />;
            case 'Settings':
                return <SettingsTab isDark={isDark} setActiveTab={goToTab} />;
            case 'HelpSupport':
                return <HelpSupportTab isDark={isDark} />;
            case 'Terms':
                return <TermsTab isDark={isDark} />;
            case 'Properties':
                return <PropertiesTab isDark={isDark} />;
            case 'PaymentSettings':
                return <PaymentSettingsTab isDark={isDark} />;
            case 'Transactions':
                return <TransactionsTab isDark={isDark} selectedProperty={selectedProperty} />;
            default:
                return (
                    <View style={styles.placeholderContainer}>
                        <Text style={[styles.placeholderText, { color: t.colors.text }]}>
                            {activeTab} Screen Coming Soon
                        </Text>
                    </View>
                );
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: t.colors.bg }]} edges={['top']}>

            <Header
                userName={userName}
                profilePic={profilePic}
                isDark={isDark}
                onProfilePress={() => setIsSidebarOpen(true)}
                fadeAnim={fadeAnimHeader}
                currentRoute={activeTab}
                selectedProperty={selectedProperty}
                setSelectedProperty={setSelectedProperty}
            />

            {renderActiveTab()}

            <BottomNav activeTab={activeTab} setActiveTab={goToTab} />

            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                navigation={navigation}
                currentRoute={activeTab}
                setActiveTab={goToTab}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    placeholderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    placeholderText: { fontSize: 18, fontWeight: '700' }
});
