// File: mobile/App.js
import React from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider, useTheme } from './src/theme';

// Screens
import SplashScreen from './src/screens/SplashScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import RoleSelectionScreen from './src/screens/RoleSelectionScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import HomeScreen from './src/screens/HomeScreen';
import TenantLoginScreen from './src/screens/TenantLoginScreen';
import TenantRegisterScreen from './src/screens/TenantRegisterScreen';
import TenantHomeScreen from './src/screens/TenantHomeScreen';
import UpdateGate from './src/components/UpdateGate';

const Stack = createNativeStackNavigator();

function RootNavigator() {
    const t = useTheme();

    // Give react-navigation the app's own palette so the container background
    // behind a transition matches the aurora canvas instead of flashing white.
    const navTheme = {
        ...(t.isDark ? DarkTheme : DefaultTheme),
        colors: {
            ...(t.isDark ? DarkTheme : DefaultTheme).colors,
            background: t.colors.bg,
            card: t.colors.surface,
            text: t.colors.text,
            primary: t.colors.primary,
            border: t.colors.border
        }
    };

    return (
        <NavigationContainer theme={navTheme}>
            <Stack.Navigator
                initialRouteName="Splash"
                screenOptions={{
                    headerShown: false,
                    // Every screen paints its own aurora background, so keep the
                    // stack's content transparent-ish and animate consistently.
                    contentStyle: { backgroundColor: t.colors.bg },
                    animation: 'slide_from_right',
                    animationDuration: 280,
                    gestureEnabled: true
                }}
            >
                {/* Brand / decision screens cross-fade — sliding a boot screen
                    sideways reads as a mistake rather than a transition. */}
                <Stack.Screen name="Splash" component={SplashScreen} options={{ animation: 'fade', gestureEnabled: false }} />
                <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ animation: 'fade', gestureEnabled: false }} />
                <Stack.Screen name="RoleSelection" component={RoleSelectionScreen} options={{ animation: 'fade' }} />

                {/* Auth screens slide in, so back feels like retracing a step. */}
                <Stack.Screen name="Login" component={LoginScreen} />
                <Stack.Screen name="Register" component={RegisterScreen} />
                <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
                <Stack.Screen name="TenantLogin" component={TenantLoginScreen} />
                <Stack.Screen name="TenantRegister" component={TenantRegisterScreen} />

                {/* Entering the app is a stack RESET, so fade rather than slide,
                    and disable the back gesture — there is nothing behind it. */}
                <Stack.Screen
                    name="Home"
                    component={HomeScreen}
                    options={{ animation: 'fade', animationDuration: 320, gestureEnabled: false }}
                />
                <Stack.Screen
                    name="TenantHome"
                    component={TenantHomeScreen}
                    options={{ animation: 'fade', animationDuration: 320, gestureEnabled: false }}
                />
            </Stack.Navigator>
        </NavigationContainer>
    );
}

export default function App() {
    return (
        <ThemeProvider>
            <SafeAreaProvider>
                <UpdateGate>
                    <RootNavigator />
                </UpdateGate>
            </SafeAreaProvider>
        </ThemeProvider>
    );
}
