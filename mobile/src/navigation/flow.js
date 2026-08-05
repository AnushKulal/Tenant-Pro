// File: mobile/src/navigation/flow.js
// -----------------------------------------------------------------------------
// AUTH / NAVIGATION FLOW HELPERS
//
// Why this file exists — the back-button bug:
//   Screens used navigation.replace('Home') after login. replace() swaps only
//   the CURRENT route, so anything pushed earlier stayed on the stack:
//       Splash → RoleSelection → Login   --replace-->   Splash → RoleSelection → Home
//   Pressing Android back from Home therefore walked back into RoleSelection /
//   Login, and from Splash it could bounce straight back to Home — the loop the
//   user hit.
//
//   The correct move after an auth transition is to RESET the stack so the
//   destination is the only route. Then back from Home exits the app, which is
//   what users expect.
//
// Every screen should use these helpers instead of calling replace/navigate for
// auth transitions, so the behaviour can never drift per-screen again.
// -----------------------------------------------------------------------------
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Reset the stack so `routeName` is the one and only route.
export const resetTo = (navigation, routeName, params) => {
    navigation.reset({ index: 0, routes: [{ name: routeName, params }] });
};

// Landlord/owner signed in → the app proper.
export const enterOwnerApp = (navigation, params) => resetTo(navigation, 'Home', params);

// Tenant signed in → tenant portal.
export const enterTenantApp = (navigation, params) => resetTo(navigation, 'TenantHome', params);

// Signed out (or session cleared) → back to the role chooser as a clean root,
// so back from there exits rather than re-entering the authenticated app.
export const exitToRoleSelection = (navigation) => resetTo(navigation, 'RoleSelection');

// --- Onboarding -------------------------------------------------------------
const ONBOARDED_KEY = 'hasSeenOnboarding';

export const hasSeenOnboarding = async () => {
    try {
        return (await AsyncStorage.getItem(ONBOARDED_KEY)) === 'true';
    } catch (e) {
        // If storage fails, don't trap the user in onboarding forever.
        return true;
    }
};

export const markOnboardingSeen = async () => {
    try {
        await AsyncStorage.setItem(ONBOARDED_KEY, 'true');
    } catch (e) {
        // Non-fatal: worst case the intro shows again next launch.
    }
};

// --- Sign out ---------------------------------------------------------------
// Clears both session kinds so a stale token can't survive a role switch.
export const signOut = async (navigation) => {
    try {
        await AsyncStorage.multiRemove([
            'userToken', 'ownerData',
            'tenantToken', 'tenantData',
            'guestId', 'selectedProperty'
        ]);
    } catch (e) {
        // Continue regardless — navigating away is the important part.
    }
    exitToRoleSelection(navigation);
};

// Confirm, then sign out. Kept here rather than in the component that shows it so
// every entry point warns identically — a confirm dialog that only some paths show
// is how people lose a session by mis-tapping. Currently the header's "more
// options" menu is the only owner-side caller; it lived here first because the
// drawer shared it, and it stays here for the next surface that needs it.
export const confirmSignOut = (navigation) => {
    Alert.alert(
        'Log out?',
        'You will need to sign in again to manage your properties.',
        [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Log Out',
                style: 'destructive',
                onPress: () => signOut(navigation)
            }
        ]
    );
};
