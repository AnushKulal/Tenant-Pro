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
import { confirmSignOut } from '../navigation/flow';

// Your Components
import Header from '../components/Header';
import HeaderMenu from '../components/HeaderMenu';
import BottomNav from '../components/BottomNav';
import HomeTab from '../components/HomeTab';
import ProfileTab from '../components/ProfileTab';
import SettingsTab from '../components/SettingsTab';
import HelpSupportTab from '../components/HelpSupportTab';
import DocumentationTab from '../components/DocumentationTab';
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

    // userName is the greeting's first name; fullName/email feed the menu's account
    // block, which took over from the drawer's header.
    const [userName, setUserName] = useState('Admin');
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [profilePic, setProfilePic] = useState(null);

    // --- Global Property Context ---
    const [selectedProperty, setSelectedProperty] = useState({ id: 'all', name: 'All Properties' });

    const [activeTab, setActiveTab] = useState(ROOT_TAB);

    // "More options" menu. It lives here rather than inside Header for two
    // reasons: it has to paint above the tab bar, and it is anchored to the
    // header's LAYOUT box — measured by onLayout below, in this view's own
    // coordinate space. See the positioning note in HeaderMenu for why measuring
    // window coordinates instead is wrong on Android.
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [headerBottom, setHeaderBottom] = useState(null);

    const [selectedProfileData, setSelectedProfileData] = useState(null);
    const [previousTab, setPreviousTab] = useState('Tenants');

    const fadeAnimHeader = useRef(new Animated.Value(0)).current;

    // Breadcrumb of visited tabs so hardware back can retrace steps inside the
    // layout instead of jumping straight out of the app.
    const tabHistory = useRef([ROOT_TAB]);

    // Stable callback: HeaderMenu memoises its row list on this, so a fresh
    // closure each render would rebuild it every time.
    const requestSignOut = useCallback(() => confirmSignOut(navigation), [navigation]);

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
                setFullName(parsedData.name || '');
                setEmail(parsedData.email || '');
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
    // Priority: close the menu → leave a drill-in view → retrace tab history
    // → confirm exit. Without this, back fell through to the navigator, which
    // (before the stack reset) walked the user back into the login screen.
    const backPressedOnce = useRef(false);
    useEffect(() => {
        const onBack = () => {
            // The menu is an in-window overlay, not a Modal, so nothing else
            // intercepts back for it — dismiss it here before anything navigates.
            if (isMenuOpen) {
                setIsMenuOpen(false);
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
    }, [isMenuOpen, activeTab, previousTab]);

    // --- Tab caching ------------------------------------------------------------
    // Tabs used to be rendered through a bare `switch (activeTab)`, so switching
    // UNMOUNTED the previous tab: its state and everything it had fetched were
    // destroyed, and coming back re-ran every request from scratch. That is why
    // each tab "loaded individually every time".
    //
    // Now a tab stays mounted once visited, and inactive ones are hidden with
    // display:'none' — React keeps the component alive (so no refetch, scroll
    // position and filters survive) while Yoga skips it entirely during layout,
    // so hidden tabs cost nothing to render. This is the same strategy
    // react-navigation's tab navigator uses.
    //
    // TenantProfile is deliberately NOT cached: it is a drill-in parameterised by
    // whichever tenant was tapped, so a stale mounted copy would be wrong.
    const [visited, setVisited] = useState([ROOT_TAB]);
    useEffect(() => {
        if (activeTab === 'TenantProfile') return;
        setVisited((prev) => (prev.includes(activeTab) ? prev : [...prev, activeTab]));
    }, [activeTab]);

    // The list actually rendered includes the active tab even before the effect
    // above has committed it to state. Without this the first visit to a tab was
    // BLANK: on the render where activeTab changed, the new tab was not yet in
    // `visited` and the previous tab was already display:'none', so nothing was
    // mounted at all — not even the tab's own loading spinner. It only appeared
    // after the effect added it, which is why leaving and returning "fixed" it.
    // Deriving the list keeps `visited` as the cache while guaranteeing the
    // active tab mounts, and shows its spinner, on the very first frame.
    const renderList = visited.includes(activeTab) ? visited : [...visited, activeTab];

    // Caching removed the transition as a side effect: once a tab was mounted,
    // switching to it just flipped display and appeared instantly, with no motion
    // at all. So the incoming tab gets its own entrance — reset to 0 and animate
    // to 1 on every change. Only the active layer is visible, so this animates
    // exactly one subtree, and opacity+translateY run on the native driver.
    const tabEnter = useRef(new Animated.Value(1)).current;
    useEffect(() => {
        tabEnter.setValue(0);
        Animated.timing(tabEnter, {
            toValue: 1,
            duration: t.motion.normal,
            useNativeDriver: true
        }).start();
    }, [activeTab, tabEnter, t.motion.normal]);

    const tabEnterStyle = {
        opacity: tabEnter,
        transform: [
            { translateY: tabEnter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
            { scale: tabEnter.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) }
        ]
    };

    const renderTab = (name) => {
        switch (name) {
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
            case 'Documentation':
                return <DocumentationTab />;
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
                            {name} Screen Coming Soon
                        </Text>
                    </View>
                );
        }
    };

    // Every visited tab stays mounted; only the active one is laid out.
    const renderTabs = () => (
        <View style={styles.tabHost}>
            {renderList.map((name) => {
                const isActive = name === activeTab;
                return (
                    <Animated.View
                        key={name}
                        // display:'none' keeps the subtree mounted (state + data
                        // preserved) while removing it from layout entirely. The
                        // active layer additionally carries the entrance animation.
                        style={isActive ? [styles.tabLayer, tabEnterStyle] : styles.tabHidden}
                        pointerEvents={isActive ? 'auto' : 'none'}
                        // Hidden tabs must be invisible to screen readers too.
                        accessibilityElementsHidden={!isActive}
                        importantForAccessibility={isActive ? 'auto' : 'no-hide-descendants'}
                    >
                        {renderTab(name)}
                    </Animated.View>
                );
            })}

            {/* Drill-in view is rendered fresh, on top, and never cached. */}
            {activeTab === 'TenantProfile' ? (
                <Animated.View style={[styles.tabLayer, tabEnterStyle]}>
                    {renderTab('TenantProfile')}
                </Animated.View>
            ) : null}
        </View>
    );

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: t.colors.bg }]} edges={['top']}>

            {/* onLayout gives the header's height in THIS view's coordinates,
                which is exactly what the anchored menu needs. */}
            <View onLayout={(e) => setHeaderBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}>
                <Header
                    userName={userName}
                    profilePic={profilePic}
                    isDark={isDark}
                    // The avatar goes to the profile; the ⋯ button owns the menu.
                    onProfilePress={() => goToTab('Profile')}
                    onMorePress={() => setIsMenuOpen(true)}
                    isMenuOpen={isMenuOpen}
                    fadeAnim={fadeAnimHeader}
                    currentRoute={activeTab}
                    selectedProperty={selectedProperty}
                    setSelectedProperty={setSelectedProperty}
                />
            </View>

            {renderTabs()}

            <BottomNav activeTab={activeTab} setActiveTab={goToTab} />

            <HeaderMenu
                visible={isMenuOpen}
                onClose={() => setIsMenuOpen(false)}
                // Slightly overlaps the gap under the header card so the panel
                // reads as hanging off it. Falls back to a sane offset if layout
                // has not reported yet (it always has by the first press).
                top={(headerBottom ?? 96) - 2}
                currentRoute={activeTab}
                onNavigate={goToTab}
                onSignOut={requestSignOut}
                fullName={fullName || userName}
                email={email}
                profilePic={profilePic}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    // Host fills the gap between header and bottom nav; each cached tab is a
    // full-size layer inside it.
    tabHost: { flex: 1 },
    tabLayer: { flex: 1 },
    tabHidden: { display: 'none' },
    placeholderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    placeholderText: { fontSize: 18, fontWeight: '700' }
});
