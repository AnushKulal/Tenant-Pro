// File: mobile/App.js
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Import your main screens
import SplashScreen from './src/screens/SplashScreen';
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

export default function App() {
    return (
        <SafeAreaProvider>
            <UpdateGate>
                <NavigationContainer>
                    <Stack.Navigator initialRouteName="Splash" screenOptions={{ headerShown: false }}>
                        <Stack.Screen name="Splash" component={SplashScreen} />
                        <Stack.Screen name="RoleSelection" component={RoleSelectionScreen} />
                        <Stack.Screen name="Login" component={LoginScreen} />
                        <Stack.Screen name="Register" component={RegisterScreen} />
                        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />

                        {/* Home is now your Master Layout for everything! */}
                        <Stack.Screen name="Home" component={HomeScreen} />

                        {/* Tenant portal */}
                        <Stack.Screen name="TenantLogin" component={TenantLoginScreen} />
                        <Stack.Screen name="TenantRegister" component={TenantRegisterScreen} />
                        <Stack.Screen name="TenantHome" component={TenantHomeScreen} />
                    </Stack.Navigator>
                </NavigationContainer>
            </UpdateGate>
        </SafeAreaProvider>
    );
}