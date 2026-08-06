// File: mobile/src/redesign/RedesignRoot.js
// The redesign's application root. This is the single entry point App.js mounts
// when appConfig.UI_VERSION === 'v2'. It:
//   1. installs the redesign's providers (theme axes + app state/view-model),
//   2. gates on the custom fonts loading (Space Grotesk + Martian Mono),
//   3. lays out the persistent chrome (owner Header, DeckDock nav, Sheets, Toast)
//      around the active screen, which it routes by `state.route`.
//
// Everything below reads tokens from useT() and data/actions from useVm(); no
// screen is imported by v1 and this file imports nothing from v1.
import React from 'react';
import { View, StatusBar as RNStatusBar, Platform } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { RedesignThemeProvider, useT } from './ThemeContext';
import { AppProvider, useVm, useApp } from './AppContext';
import { useRedesignFonts } from './fonts';

import Header from './Header';
import DeckDock from './DeckDock';
import Sheets from './Sheets';
import Toast from './Toast';

import RoleScreen from './screens/RoleScreen';
import OwnerLoginScreen from './screens/OwnerLoginScreen';
import CreateAccountScreen from './screens/CreateAccountScreen';
import OverviewScreen from './screens/OverviewScreen';
import UnitsScreen from './screens/UnitsScreen';
import PeopleScreen from './screens/PeopleScreen';
import TenantDetailScreen from './screens/TenantDetailScreen';
import PropertyScreen from './screens/PropertyScreen';
import MyProfileScreen from './screens/MyProfileScreen';
import LedgerScreen from './screens/LedgerScreen';
import SettingsScreen from './screens/SettingsScreen';
import TenantLoginScreen from './screens/TenantLoginScreen';
import PortalHomeScreen from './screens/PortalHomeScreen';
import FindScreen from './screens/FindScreen';
import CheckoutScreen from './screens/CheckoutScreen';
import HelpScreen from './screens/HelpScreen';
import MyPlaceScreen from './screens/MyPlaceScreen';
import MeScreen from './screens/MeScreen';
import TenantSettingsScreen from './screens/TenantSettingsScreen';

// route (state.route) → screen component. Mirrors the route flags in deriveVm().
const SCREENS = {
    role: RoleScreen,
    login: OwnerLoginScreen,
    signup: CreateAccountScreen,
    home: OverviewScreen,
    units: UnitsScreen,
    people: PeopleScreen,
    tenant: TenantDetailScreen,
    property: PropertyScreen,
    profile: MyProfileScreen,
    ledger: LedgerScreen,
    settings: SettingsScreen,
    tlogin: TenantLoginScreen,
    portal: PortalHomeScreen,
    tfind: FindScreen,
    tcheckout: CheckoutScreen,
    thelp: HelpScreen,
    tstay: MyPlaceScreen,
    tme: MeScreen,
    tsettings: TenantSettingsScreen
};

function Shell() {
    const fontsLoaded = useRedesignFonts();
    const t = useT();
    const vm = useVm();
    const { state } = useApp();
    const insets = useSafeAreaInsets();

    // Hold the whole app on an ink field until the two typefaces are ready, so
    // nothing renders in a fallback system font and then reflows.
    if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: t.ink }} />;

    const Screen = SCREENS[state.route] || OverviewScreen;
    const showDock = vm.isOwner || vm.showTenantDock;

    return (
        <View style={{ flex: 1, backgroundColor: t.ink }}>
            {/* status-bar spacer — the ink field runs under the OS status bar */}
            <View style={{ height: insets.top, backgroundColor: t.ink }} />

            <Header />

            <View style={{ flex: 1 }}>
                <Screen />
            </View>

            {showDock ? (
                <View style={{ paddingBottom: insets.bottom }}>
                    <DeckDock />
                </View>
            ) : (
                <View style={{ height: insets.bottom }} />
            )}

            {/* overlays + toast paint above everything */}
            <Sheets />
            <Toast />

            <RNStatusBar
                barStyle={t.isDark ? 'light-content' : 'dark-content'}
                backgroundColor="transparent"
                translucent={Platform.OS === 'android'}
            />
        </View>
    );
}

export default function RedesignRoot() {
    return (
        <SafeAreaProvider>
            <RedesignThemeProvider>
                <AppProvider>
                    <Shell />
                </AppProvider>
            </RedesignThemeProvider>
        </SafeAreaProvider>
    );
}
