// File: mobile/src/screens/RegisterScreen.js
// Owner/landlord sign-up is no longer its own screen: LoginScreen is a single
// auth screen that MORPHS between sign-in and sign-up in place, so the Login /
// Sign Up pill toggles state instead of pushing a route (which is what stopped
// the thumb from animating and made the form slide in from the side).
//
// This wrapper only exists for route compatibility — the 'Register' route and any
// navigate('Register') call still work, and land on the merged screen with
// sign-up already expanded.
import React from 'react';
import LoginScreen from './LoginScreen';

export default function RegisterScreen({ navigation, route }) {
    return (
        <LoginScreen
            navigation={navigation}
            route={{ ...route, params: { ...(route?.params || {}), mode: 'signup' } }}
        />
    );
}
