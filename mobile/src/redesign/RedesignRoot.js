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
import { View, Text, ScrollView, Animated, ActivityIndicator, useColorScheme, BackHandler, StatusBar as RNStatusBar, Platform } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { RedesignThemeProvider, useT, useThemeCtl } from './ThemeContext';
import { AppProvider, useVm, useApp } from './AppContext';
import { useRedesignFonts } from './fonts';
import { useEnter, useWipe } from './motion';
import { Monogram, T, Glyph, Press } from './ui';

import Header from './Header';
import DeckDock from './DeckDock';
import Sheets from './Sheets';
import Toast from './Toast';
import UpdateSheet from './UpdateSheet';
import Loading from './Loading';

import OnboardingScreen from './screens/OnboardingScreen';
import PermissionsScreen from './screens/PermissionsScreen';
import RoleScreen from './screens/RoleScreen';
import OwnerLoginScreen from './screens/OwnerLoginScreen';
import CreateAccountScreen from './screens/CreateAccountScreen';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen';
import OverviewScreen from './screens/OverviewScreen';
import UnitsScreen from './screens/UnitsScreen';
import PeopleScreen from './screens/PeopleScreen';
import TenantDetailScreen from './screens/TenantDetailScreen';
import PropertyScreen from './screens/PropertyScreen';
import PinPickScreen from './screens/PinPickScreen';
import MyProfileScreen from './screens/MyProfileScreen';
import LedgerScreen from './screens/LedgerScreen';
import SettingsScreen from './screens/SettingsScreen';
import SupportScreen from './screens/SupportScreen';
import TicketScreen from './screens/TicketScreen';
import TenantLoginScreen from './screens/TenantLoginScreen';
import PortalHomeScreen from './screens/PortalHomeScreen';
import FindScreen from './screens/FindScreen';
import ScanQrScreen from './screens/ScanQrScreen';
import GuestJoinScreen from './screens/GuestJoinScreen';
import GuestSignInScreen from './screens/GuestSignInScreen';
import CheckoutScreen from './screens/CheckoutScreen';
import HelpScreen from './screens/HelpScreen';
import MyPlaceScreen from './screens/MyPlaceScreen';
import MeScreen from './screens/MeScreen';
import DocumentsScreen from './screens/DocumentsScreen';
import AgreementScreen from './screens/AgreementScreen';
import TenantSettingsScreen from './screens/TenantSettingsScreen';

// route (state.route) → screen component. Mirrors the route flags in deriveVm().
const SCREENS = {
    onboarding: OnboardingScreen,
    permits: PermissionsScreen,
    role: RoleScreen,
    login: OwnerLoginScreen,
    signup: CreateAccountScreen,
    forgot: ForgotPasswordScreen,
    home: OverviewScreen,
    units: UnitsScreen,
    people: PeopleScreen,
    tenant: TenantDetailScreen,
    property: PropertyScreen,
    pinpick: PinPickScreen,
    profile: MyProfileScreen,
    ledger: LedgerScreen,
    settings: SettingsScreen,
    support: SupportScreen,
    ticket: TicketScreen,
    tlogin: TenantLoginScreen,
    portal: PortalHomeScreen,
    tfind: FindScreen,
    scan: ScanQrScreen,
    guest: GuestJoinScreen,
    gsignin: GuestSignInScreen,
    tcheckout: CheckoutScreen,
    thelp: HelpScreen,
    tstay: MyPlaceScreen,
    tme: MeScreen,
    tdocs: DocumentsScreen,
    tagreement: AgreementScreen,
    tsettings: TenantSettingsScreen
};

// Plays the design's `tpup` entrance for whatever screen is mounted. Keyed by
// route in Shell, so switching screens replays the rise+fade.
function ScreenStage({ children }) {
    const enter = useEnter();
    return <Animated.View style={[{ flex: 1 }, enter]}>{children}</Animated.View>;
}

function Shell() {
    const fontsLoaded = useRedesignFonts();
    const t = useT();
    const vm = useVm();
    const { state, setState } = useApp();
    const insets = useSafeAreaInsets();
    const wipe = useWipe(vm.mode); // flash on theme swap

    // ── Theme bridge ───────────────────────────────────────────────────────────
    // AppContext holds the user's preference (state.pref = light|dark|system) and
    // the mode it resolves to (state.theme); the palette every component actually
    // reads comes from ThemeContext. The two were never wired together, so the
    // Light/Dark/System control changed state and repainted nothing.
    //
    // state.theme stays the single source of truth for "which mode are we in" —
    // vm.mode/vm.dark are derived from it — so this does two things: keeps it in
    // step with the OS while the preference is "System", and mirrors it into
    // ThemeContext so the palette follows.
    const ctl = useThemeCtl();
    const osScheme = useColorScheme();
    const wantMode = state.pref === 'system'
        ? (osScheme === 'light' ? 'light' : 'dark')
        : (state.theme || 'dark');
    React.useEffect(() => {
        if (state.theme !== wantMode) setState({ theme: wantMode });
    }, [wantMode, state.theme, setState]);
    React.useEffect(() => {
        if (ctl && ctl.mode !== wantMode) ctl.setMode(wantMode);
    }, [ctl, wantMode]);

    // ── The phone's back gesture ───────────────────────────────────────────────
    // v2 routes by state rather than a navigator, so Android's back button had
    // nothing listening and closed the app from wherever you were. It now steps
    // back through where you actually went: a sheet closes first, then one screen
    // at a time, and only at the very top does it fall through to the OS and leave
    // the app — which is what a user expects there.
    //
    // Returning false is what hands the press to the OS; returning true says we
    // dealt with it. The subscription is added once and removed on unmount.
    React.useEffect(() => {
        const sub = BackHandler.addEventListener('hardwareBackPress', () => vm.goBackOneStep());
        return () => sub.remove();
    }, [vm.goBackOneStep]);

    // Hold the whole app on an ink field until the two typefaces are ready, so
    // nothing renders in a fallback system font and then reflows.
    if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: t.ink }} />;

    // `boot` = the stored session is still being resolved (AppProvider does this
    // once on mount). Hold on the brand mark rather than flashing a screen the
    // user may not be entitled to.
    if (state.route === 'boot') {
        return <Loading line="TENANTPRO" />;
    }

    // An owner's real data has not arrived yet. `state.data` still holds the seed
    // bundle at this point, so rendering a screen here would flash somebody
    // else's demo figures at a real landlord. Hold on a loader instead — and on a
    // hard failure offer a retry rather than silently showing seed data as if it
    // were theirs.
    const awaitingOwnerData = vm.isOwner && !vm.live;
    if (awaitingOwnerData && vm.dataLoading) {
        return <Loading line="LOADING YOUR PORTFOLIO" />;
    }
    if (awaitingOwnerData && vm.hasDataError) {
        return (
            <View style={{ flex: 1, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, rowGap: 14 }}>
                <Glyph name="cloud-offline-outline" size={30} color={t.coral} />
                <T w={700} s={19} c={t.fg} style={{ letterSpacing: -0.5, textAlign: 'center' }}>Couldn’t load your data</T>
                <T w={400} s={13} lh={1.5} c={t.fg2} style={{ textAlign: 'center' }}>{vm.dataError}</T>
                <Press
                    onPress={vm.retryLoad}
                    style={{ marginTop: 6, paddingVertical: 13, paddingHorizontal: 26, borderRadius: 999, backgroundColor: t.lime }}
                >
                    <T w={700} s={14} c={t.on}>Try again</T>
                </Press>
                <Press onPress={vm.askSignOut} style={{ paddingVertical: 8 }}>
                    <T mono w={600} s={9} ls={0.12} c={t.fg3}>SIGN OUT</T>
                </Press>
            </View>
        );
    }

    // The same protection for a signed-in tenant: state.data still holds the seed
    // bundle until /tenant-portal/me answers, so rendering the portal here would
    // show a real tenant a stock landlord and invented request dates — which is
    // exactly what made a failed load look like a working app.
    const awaitingTenantData = vm.isTenantSession && !vm.tenantDataReady;
    if (awaitingTenantData && vm.dataLoading) {
        return <Loading line="LOADING YOUR TENANCY" />;
    }
    if (awaitingTenantData && vm.hasDataError) {
        return (
            <View style={{ flex: 1, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, rowGap: 14 }}>
                <Glyph name="cloud-offline-outline" size={30} color={t.coral} />
                <T w={700} s={19} c={t.fg} style={{ letterSpacing: -0.5, textAlign: 'center' }}>Couldn’t load your tenancy</T>
                <T w={400} s={13} lh={1.5} c={t.fg2} style={{ textAlign: 'center' }}>{vm.dataError}</T>
                <Press
                    onPress={vm.retryTenantLoad}
                    style={{ marginTop: 6, paddingVertical: 13, paddingHorizontal: 26, borderRadius: 999, backgroundColor: t.lime }}
                >
                    <T w={700} s={14} c={t.on}>Try again</T>
                </Press>
                <Press onPress={vm.askSignOut} style={{ paddingVertical: 8 }}>
                    <T mono w={600} s={9} ls={0.12} c={t.fg3}>SIGN OUT</T>
                </Press>
            </View>
        );
    }

    const Screen = SCREENS[state.route] || OverviewScreen;
    const showDock = vm.isOwner || vm.showTenantDock;

    return (
        <View style={{ flex: 1, backgroundColor: t.ink }}>
            {/* status-bar spacer — the ink field runs under the OS status bar */}
            <View style={{ height: insets.top, backgroundColor: t.ink }} />

            <Header />

            {/* `animation: tpup .3s ease both` — remount per route so each screen
                rises+fades in exactly as the prototype's screens do. */}
            <ScreenStage key={state.route}>
                <Screen />
            </ScreenStage>

            {showDock ? (
                /* A sheet is modal, so the dock must not sit on top of it. Relying
                   on z-order alone proved platform-dependent (the dock kept painting
                   over the sheet's last row), so hide it outright while an overlay is
                   open — opacity + pointerEvents keeps its space so nothing reflows. */
                <View
                    pointerEvents={vm.overlayOpen ? 'none' : 'auto'}
                    style={{ paddingBottom: insets.bottom, zIndex: 1, opacity: vm.overlayOpen ? 0 : 1 }}
                >
                    <DeckDock />
                </View>
            ) : (
                <View style={{ height: insets.bottom }} />
            )}

            {/* overlays + toast paint above everything. Keyed by overlay so each
                sheet replays the `tpsheet` slide-up when it opens. */}
            <Sheets key={state.overlay || 'none'} />
            <Toast />

            {/* OTA prompt — v1's UpdateGate is bypassed in v2, so the redesign owns it. */}
            <UpdateSheet />

            {/* `@keyframes tpwipe` — the flash that covers a theme swap. */}
            <Animated.View
                pointerEvents="none"
                style={[
                    { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: t.ink },
                    wipe
                ]}
            />

            <RNStatusBar
                barStyle={t.isDark ? 'light-content' : 'dark-content'}
                backgroundColor="transparent"
                translucent={Platform.OS === 'android'}
            />
        </View>
    );
}

// Catches any render error in the redesign tree (including deriveVm) and shows
// it on screen instead of letting the app crash-loop ("keeps stopping"). Uses
// hard-coded colours and the system font so it renders even if the theme or the
// custom fonts failed to load.
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { err: null };
    }
    static getDerivedStateFromError(err) {
        return { err };
    }
    render() {
        if (this.state.err) {
            const e = this.state.err;
            return (
                <View style={{ flex: 1, backgroundColor: '#08080A', paddingHorizontal: 22, paddingTop: 72, paddingBottom: 32 }}>
                    <Text style={{ color: '#C8F751', fontSize: 18, fontWeight: '700', marginBottom: 4 }}>TenantPro hit an error</Text>
                    <Text style={{ color: '#A5A2B2', fontSize: 13, marginBottom: 16 }}>The redesign failed to render. Details below.</Text>
                    <ScrollView style={{ flex: 1 }}>
                        <Text selectable style={{ color: '#F4F3F7', fontSize: 12, lineHeight: 18 }}>
                            {String((e && (e.stack || e.message)) || e)}
                        </Text>
                    </ScrollView>
                </View>
            );
        }
        return this.props.children;
    }
}

export default function RedesignRoot() {
    return (
        <ErrorBoundary>
        <SafeAreaProvider>
            <RedesignThemeProvider>
                <AppProvider>
                    <Shell />
                </AppProvider>
            </RedesignThemeProvider>
        </SafeAreaProvider>
        </ErrorBoundary>
    );
}
