// File: mobile/src/screens/HomeScreen.js
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, useColorScheme, Animated, View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

export default function HomeScreen({ navigation }) {
    const theme = useColorScheme();
    const isDark = theme === 'dark';

    const [userName, setUserName] = useState('Admin');
    const [profilePic, setProfilePic] = useState(null);

    // --- NEW: Global Property Context ---
    const [selectedProperty, setSelectedProperty] = useState({ id: 'all', name: 'All Properties' });

    const [activeTab, setActiveTab] = useState('Home');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const [selectedProfileData, setSelectedProfileData] = useState(null);
    const [previousTab, setPreviousTab] = useState('Tenants');

    const fadeAnimHeader = useRef(new Animated.Value(0)).current;

    const fetchUserData = async () => {
        try {
            const ownerData = await AsyncStorage.getItem('ownerData');
            if (ownerData) {
                const parsedData = JSON.parse(ownerData);
                setUserName(parsedData.name.split(' ')[0]);
                setProfilePic(parsedData.profile_pic);
            }

            // --- NEW: Load the last selected property ---
            const savedProperty = await AsyncStorage.getItem('selectedProperty');
            if (savedProperty) {
                setSelectedProperty(JSON.parse(savedProperty));
            }
        } catch (error) {
            console.log("Error loading user data", error);
        }
    };

    useEffect(() => {
        fetchUserData();
        Animated.timing(fadeAnimHeader, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    }, []);

    useEffect(() => {
        fetchUserData();
    }, [activeTab]);

    const renderActiveTab = () => {
        // By passing selectedProperty here, your tabs will automatically update their data!
        switch (activeTab) {
            case 'Home':
                return <HomeTab isDark={isDark} selectedProperty={selectedProperty} />;
            case 'Rooms':
                return <RoomsTab
                    isDark={isDark}
                    selectedProperty={selectedProperty}
                    // Add this trigger!
                    onViewProfile={(tenant) => {
                        setSelectedProfileData(tenant);
                        setPreviousTab('Rooms');
                        setActiveTab('TenantProfile');
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
                        setActiveTab('TenantProfile');
                    }}
                />;
            case 'TenantProfile': 
                return <TenantProfileTab
                    isDark={isDark}
                    tenant={selectedProfileData}
                    goBack={() => setActiveTab(previousTab)}
                />;
            case 'Settings':
                return <SettingsTab isDark={isDark} setActiveTab={setActiveTab} />;
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
                        <Text style={[styles.placeholderText, isDark ? styles.darkText : styles.lightText]}>
                            {activeTab} Screen Coming Soon
                        </Text>
                    </View>
                );
        }
    };

    return (
        <SafeAreaView style={[styles.container, isDark ? styles.darkContainer : styles.lightContainer]} edges={['top']}>

            <Header
                userName={userName}
                profilePic={profilePic}
                isDark={isDark}
                onProfilePress={() => setIsSidebarOpen(true)}
                fadeAnim={fadeAnimHeader}
                currentRoute={activeTab}
                // --- NEW: Passing Context to Header ---
                selectedProperty={selectedProperty}
                setSelectedProperty={setSelectedProperty}
            />

            {renderActiveTab()}

            <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />

            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                navigation={navigation}
                currentRoute={activeTab}
                setActiveTab={setActiveTab}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    lightContainer: { backgroundColor: '#F8FAFC' },
    darkContainer: { backgroundColor: '#0A0F1C' },
    placeholderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    placeholderText: { fontSize: 18, fontWeight: '700' },
    lightText: { color: '#0F172A' },
    darkText: { color: '#FFFFFF' }
});