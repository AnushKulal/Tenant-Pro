// File: mobile/src/screens/TenantRegisterScreen.js
// Route-compatibility shim, not a screen.
//
// Tenant sign-in and sign-up now live in ONE screen that morphs in place
// (TenantLoginScreen), because two routes meant tapping the pill slid a new page
// in and killed the toggle animation. The 'TenantRegister' route still exists —
// old navigate('TenantRegister') calls and deep links must keep working — so it
// simply renders that screen pre-set to sign-up mode.
import React from 'react';
import TenantLoginScreen from './TenantLoginScreen';

export default function TenantRegisterScreen({ navigation, route }) {
    // Spread the incoming params first so this only forces `mode`.
    return (
        <TenantLoginScreen
            navigation={navigation}
            route={{ ...route, params: { ...route?.params, mode: 'signup' } }}
        />
    );
}
