// File: mobile/src/screens/LoginScreen.js
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Animated, useColorScheme, KeyboardAvoidingView, Platform, Image, ActivityIndicator, Alert } from 'react-native';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import client from '../api/client';
import AsyncStorage from '@react-native-async-storage/async-storage'; 

export default function LoginScreen({ navigation }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [focusedInput, setFocusedInput] = useState(null);
    const [showPassword, setShowPassword] = useState(false); 

    // Error and Loading States
    const [emailError, setEmailError] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [generalError, setGeneralError] = useState(''); // Handles backend errors (e.g., wrong password)
    const [isLoading, setIsLoading] = useState(false); // Controls the "Signing in..." state
    const [isGuestLoading, setIsGuestLoading] = useState(false); // Controls the "Exploring..." guest state

    const theme = useColorScheme();
    const isDark = theme === 'dark';

    // Animations
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(40)).current;
    const blob1Anim = useRef(new Animated.Value(0)).current;
    const blob2Anim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const createFloat = (anim, duration) => {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(anim, { toValue: 1, duration: duration, useNativeDriver: true }),
                    Animated.timing(anim, { toValue: 0, duration: duration, useNativeDriver: true })
                ])
            ).start();
        };
        createFloat(blob1Anim, 8000); 
        createFloat(blob2Anim, 10000); 

        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 800, useNativeDriver: true })
        ]).start();
    }, []);

    const blob1TranslateY = blob1Anim.interpolate({ inputRange: [0, 1], outputRange: [0, -50] });
    const blob1Scale = blob1Anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
    const blob2TranslateY = blob2Anim.interpolate({ inputRange: [0, 1], outputRange: [0, 50] });
    const blob2Scale = blob2Anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] });

    // --- UPDATED: Connect to Backend API ---
    const handleLogin = async () => {
        // Clear previous general errors
        setGeneralError('');
        
        let isValid = true;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        // Validate Email
        if (!email.trim()) {
            setEmailError('Email address is required.');
            isValid = false;
        } else if (!emailRegex.test(email)) {
            setEmailError('Please enter a valid email address.');
            isValid = false;
        }

        // Validate Password
        if (!password) {
            setPasswordError('Password is required.');
            isValid = false;
        }

        // Stop execution if front-end validation fails
        if (!isValid) return;

        // Start loading state
        setIsLoading(true);

        try {
            // Hit the backend login route
            const response = await client.post('/auth/login', { email, password });
            
            console.log("Login Success:", response.data.message);
            
            // Extract the token and owner details from the response you saw in Postman
            const { token, owner } = response.data;
            
            // Save the token and user data securely to the iPhone's storage
            await AsyncStorage.setItem('userToken', token);
            await AsyncStorage.setItem('ownerData', JSON.stringify(owner));
            
            // Navigate to Home screen (using replace so they can't swipe back to login)
            navigation.replace('Home');

        } catch (error) {
            // Grab the message sent from your Node.js backend (e.g., "Invalid email or password")
            const backendError = error.response?.data?.message || 'Unable to connect to server. Please try again later.';
            setGeneralError(backendError);
        } finally {
            // Always stop the loading spinner, whether it succeeded or failed
            setIsLoading(false);
        }
    };

    // --- Guest Login: drop straight into the fully-loaded demo account ---
    const handleGuestLogin = async () => {
        setGeneralError('');
        setIsGuestLoading(true);
        try {
            // Sign in to the shared demo landlord account (pre-filled with sample data).
            const response = await client.post('/auth/login', {
                email: 'demo@gmail.com',
                password: 'Kajal@2004',
            });
            const { token, owner } = response.data;

            // Tag a friendly guest id so the session is recognisable as a guest visit.
            const guestId = 'GUEST-' + Math.random().toString(36).slice(2, 7).toUpperCase();
            await AsyncStorage.setItem('userToken', token);
            await AsyncStorage.setItem('ownerData', JSON.stringify({ ...owner, isGuest: true, guestId }));
            await AsyncStorage.setItem('guestId', guestId);

            navigation.replace('Home');
        } catch (error) {
            const backendError = error.response?.data?.message ||
                'Guest demo is warming up (the server may be waking up). Please try again in a moment.';
            setGeneralError(backendError);
        } finally {
            setIsGuestLoading(false);
        }
    };

    // --- Social login: not wired to real providers yet ---
    const handleSocialLogin = (provider) => {
        Alert.alert(
            `${provider} sign-in`,
            `Signing in with ${provider} is coming soon. For now, use your email and password, or tap "Explore as Guest" to try the app instantly.`,
            [{ text: 'Got it' }]
        );
    };

    const anyLoading = isLoading || isGuestLoading;

    return (
        <SafeAreaView style={[styles.container, isDark ? styles.darkContainer : styles.lightContainer]}>
            
            <Animated.View style={[styles.blob, styles.blob1, { transform: [{ translateY: blob1TranslateY }, { scale: blob1Scale }], opacity: isDark ? 0.2 : 0.4 }]} />
            <Animated.View style={[styles.blob, styles.blob2, { transform: [{ translateY: blob2TranslateY }, { scale: blob2Scale }], opacity: isDark ? 0.15 : 0.3 }]} />

            <TouchableOpacity
                style={styles.backButton}
                onPress={() => navigation.navigate('RoleSelection')}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
                <Ionicons name="arrow-back" size={24} color={isDark ? '#F8FAFC' : '#0F172A'} />
                <Text style={[styles.backText, isDark ? styles.darkSubText : styles.lightSubText]}>Back</Text>
            </TouchableOpacity>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>

                <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
                    
                    <View style={styles.headerContainer}>
                        <Image source={require('../../assets/logo.png')} style={styles.logoImage} />
                        <Text style={[styles.logoText, isDark ? styles.darkTextGlass : styles.lightTextGlass]}>TenantPro</Text>
                        <Text style={[styles.tagline, isDark ? styles.darkSubText : styles.lightSubText]}>Smart Property Management</Text>
                    </View>

                    <View style={[styles.formContainer, isDark ? styles.darkForm : styles.lightForm]}>
                        
                        {/* General Backend Error Display */}
                        {generalError ? (
                            <View style={styles.generalErrorBox}>
                                <Ionicons name="warning" size={18} color="#EF4444" style={{ marginRight: 6 }} />
                                <Text style={styles.generalErrorText}>{generalError}</Text>
                            </View>
                        ) : null}
                        
                        {/* --- EMAIL FIELD CONTAINER --- */}
                        <View style={styles.fieldContainer}>
                            <View style={[
                                styles.inputWrapper, 
                                isDark ? styles.darkInput : styles.lightInput, 
                                focusedInput === 'email' && styles.inputFocused,
                                emailError ? styles.inputError : null 
                            ]}>
                                <Ionicons name="mail-outline" size={20} color={isDark ? '#94A3B8' : '#64748B'} style={styles.inputIcon} />
                                <TextInput
                                    style={[styles.input, isDark ? styles.darkText : styles.lightText]}
                                    placeholder="Email Address"
                                    placeholderTextColor={isDark ? '#94A3B8' : '#64748B'}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    value={email}
                                    editable={!isLoading} // Disable input while loading
                                    onChangeText={(text) => {
                                        setEmail(text);
                                        setEmailError(''); 
                                        setGeneralError(''); // Clear backend error on typing
                                    }}
                                    onFocus={() => setFocusedInput('email')}
                                    onBlur={() => setFocusedInput(null)}
                                />
                            </View>
                            {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
                        </View>

                        {/* --- PASSWORD FIELD CONTAINER --- */}
                        <View style={styles.fieldContainer}>
                            <View style={[
                                styles.inputWrapper, 
                                isDark ? styles.darkInput : styles.lightInput, 
                                focusedInput === 'password' && styles.inputFocused,
                                passwordError ? styles.inputError : null 
                            ]}>
                                <Ionicons name="lock-closed-outline" size={20} color={isDark ? '#94A3B8' : '#64748B'} style={styles.inputIcon} />
                                <TextInput
                                    style={[styles.input, isDark ? styles.darkText : styles.lightText]}
                                    placeholder="Password"
                                    placeholderTextColor={isDark ? '#94A3B8' : '#64748B'}
                                    secureTextEntry={!showPassword} 
                                    value={password}
                                    editable={!isLoading} // Disable input while loading
                                    onChangeText={(text) => {
                                        setPassword(text);
                                        setPasswordError(''); 
                                        setGeneralError(''); // Clear backend error on typing
                                    }}
                                    onFocus={() => setFocusedInput('password')}
                                    onBlur={() => setFocusedInput(null)}
                                />
                                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                                    <Ionicons name={showPassword ? "eye-outline" : "eye-off-outline"} size={22} color={isDark ? '#94A3B8' : '#64748B'} />
                                </TouchableOpacity>
                            </View>
                            {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
                        </View>

                        <TouchableOpacity style={styles.forgotPassword} disabled={isLoading} onPress={() => navigation.navigate('ForgotPassword')}>
                            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
                        </TouchableOpacity>

                        {/* --- UPDATED BUTTON WITH LOADING STATE --- */}
                        <TouchableOpacity
                            style={[styles.button, anyLoading && styles.buttonDisabled]}
                            activeOpacity={0.8}
                            onPress={handleLogin}
                            disabled={anyLoading} // Prevent double-taps
                        >
                            {isLoading ? (
                                <View style={styles.loadingContainer}>
                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                    <Text style={styles.buttonTextLoading}>Signing in...</Text>
                                </View>
                            ) : (
                                <Text style={styles.buttonText}>Sign In</Text>
                            )}
                        </TouchableOpacity>

                        {/* --- EXPLORE AS GUEST --- */}
                        <TouchableOpacity
                            style={[styles.guestButton, isDark ? styles.darkGuest : styles.lightGuest, anyLoading && styles.buttonDisabled]}
                            activeOpacity={0.8}
                            onPress={handleGuestLogin}
                            disabled={anyLoading}
                        >
                            {isGuestLoading ? (
                                <View style={styles.loadingContainer}>
                                    <ActivityIndicator size="small" color="#2563EB" />
                                    <Text style={styles.guestButtonTextLoading}>Loading demo…</Text>
                                </View>
                            ) : (
                                <View style={styles.loadingContainer}>
                                    <Ionicons name="rocket-outline" size={18} color="#2563EB" style={{ marginRight: 8 }} />
                                    <Text style={styles.guestButtonText}>Explore as Guest</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                        <Text style={[styles.guestHint, isDark ? styles.darkSubText : styles.lightSubText]}>
                            Jump into a fully-loaded demo — no account needed.
                        </Text>

                        <View style={styles.dividerContainer}>
                            <View style={[styles.dividerLine, isDark ? styles.darkDivider : styles.lightDivider]} />
                            <Text style={[styles.dividerText, isDark ? styles.darkSubText : styles.lightSubText]}>Or continue with</Text>
                            <View style={[styles.dividerLine, isDark ? styles.darkDivider : styles.lightDivider]} />
                        </View>

                        <View style={styles.socialRow}>
                            <TouchableOpacity style={[styles.socialButton, isDark ? styles.darkSocial : styles.lightSocial]} disabled={anyLoading} onPress={() => handleSocialLogin('Google')}>
                                <FontAwesome5 name="google" size={20} color={isDark ? '#FFFFFF' : '#DB4437'} />
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.socialButton, isDark ? styles.darkSocial : styles.lightSocial]} disabled={anyLoading} onPress={() => handleSocialLogin('Facebook')}>
                                <FontAwesome5 name="facebook" size={20} color={isDark ? '#FFFFFF' : '#4267B2'} />
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.socialButton, isDark ? styles.darkSocial : styles.lightSocial]} disabled={anyLoading} onPress={() => handleSocialLogin('Twitter')}>
                                <FontAwesome5 name="twitter" size={20} color={isDark ? '#FFFFFF' : '#1DA1F2'} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.footer}>
                            <Text style={[styles.footerText, isDark ? styles.darkSubText : styles.lightSubText]}>New to TenantPro? </Text>
                            <TouchableOpacity onPress={() => navigation.navigate('Register')} disabled={isLoading}>
                                <Text style={styles.linkText}>Create Account</Text>
                            </TouchableOpacity>
                        </View>

                    </View>

                </Animated.View>

            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', overflow: 'hidden' },
    keyboardView: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, zIndex: 10 },
    backButton: { position: 'absolute', top: 50, left: 20, flexDirection: 'row', alignItems: 'center', zIndex: 20, padding: 4 },
    backText: { fontSize: 16, fontWeight: '600', marginLeft: 4 },
    
    lightContainer: { backgroundColor: '#F0F4F8' },
    darkContainer: { backgroundColor: '#0F172A' },
    lightText: { color: '#0F172A' },
    darkText: { color: '#F8FAFC' },
    lightSubText: { color: '#475569' },
    darkSubText: { color: '#94A3B8' },
    
    blob: { position: 'absolute', borderRadius: 300, filter: 'blur(50px)' }, 
    blob1: { width: 350, height: 350, backgroundColor: '#2563EB', top: -100, left: -100 }, 
    blob2: { width: 400, height: 400, backgroundColor: '#0D9488', bottom: -150, right: -100 }, 
    
    headerContainer: { alignItems: 'center', marginBottom: 30 },
    logoImage: { width: 70, height: 70, marginBottom: 15, borderRadius: 18 }, 
    logoText: { fontSize: 38, fontWeight: '900', letterSpacing: -0.5, zIndex: 2, paddingHorizontal: 20, paddingVertical: 10, marginVertical: -10 },
    darkTextGlass: { color: '#FFFFFF', textShadowColor: 'rgba(37, 99, 235, 0.9)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10 },
    lightTextGlass: { color: '#0F172A', textShadowColor: 'rgba(37, 99, 235, 0.4)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 8 },
    tagline: { fontSize: 15, marginTop: 4, fontWeight: '500' },
    
    formContainer: { padding: 25, borderRadius: 24, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 8, zIndex: 10, borderWidth: 1 },
    lightForm: { backgroundColor: 'rgba(255, 255, 255, 0.9)', borderColor: 'rgba(255, 255, 255, 0.4)' }, 
    darkForm: { backgroundColor: 'rgba(30, 41, 59, 0.85)', borderColor: 'rgba(255, 255, 255, 0.05)' }, 
    
    // Server Error Box
    generalErrorBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF2F2', padding: 12, borderRadius: 10, marginBottom: 16, borderWidth: 1, borderColor: '#FECACA' },
    generalErrorText: { color: '#EF4444', fontSize: 14, fontWeight: '600', flex: 1 },

    fieldContainer: { marginBottom: 16 }, 
    inputWrapper: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 15 },
    lightInput: { backgroundColor: 'rgba(255, 255, 255, 0.9)', borderColor: '#E2E8F0' },
    darkInput: { backgroundColor: 'rgba(15, 23, 42, 0.8)', borderColor: '#334155' },
    inputFocused: { borderColor: '#2563EB' },
    
    inputError: { borderColor: '#EF4444' }, 
    errorText: { color: '#EF4444', fontSize: 13, marginTop: 6, marginLeft: 4, fontWeight: '500' },

    inputIcon: { marginRight: 10 },
    input: { flex: 1, paddingVertical: 16, fontSize: 16 },
    eyeIcon: { padding: 5 },
    
    forgotPassword: { alignSelf: 'flex-end', marginBottom: 20, marginTop: 4 }, 
    forgotPasswordText: { color: '#2563EB', fontWeight: '600', fontSize: 14 },
    
    // Updated Button Styles for Loading
    button: { backgroundColor: '#2563EB', paddingVertical: 16, borderRadius: 14, alignItems: 'center', shadowColor: '#2563EB', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
    buttonDisabled: { backgroundColor: '#93C5FD', shadowOpacity: 0 }, // Lighter blue when loading
    loadingContainer: { flexDirection: 'row', alignItems: 'center' },
    buttonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', letterSpacing: 0.5 },
    buttonTextLoading: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', letterSpacing: 0.5, marginLeft: 10 },
    
    // Guest button (secondary / outlined style)
    guestButton: { marginTop: 14, paddingVertical: 15, borderRadius: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#2563EB' },
    lightGuest: { backgroundColor: 'rgba(37, 99, 235, 0.06)' },
    darkGuest: { backgroundColor: 'rgba(37, 99, 235, 0.12)' },
    guestButtonText: { color: '#2563EB', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
    guestButtonTextLoading: { color: '#2563EB', fontSize: 16, fontWeight: '700', letterSpacing: 0.3, marginLeft: 10 },
    guestHint: { textAlign: 'center', fontSize: 13, marginTop: 8, fontWeight: '500' },

    dividerContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 25 },
    dividerLine: { flex: 1, height: 1 },
    lightDivider: { backgroundColor: '#E2E8F0' },
    darkDivider: { backgroundColor: '#334155' },
    dividerText: { marginHorizontal: 15, fontSize: 14, fontWeight: '500' },

    socialRow: { flexDirection: 'row', justifyContent: 'center', gap: 20 },
    socialButton: { width: 55, height: 55, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
    lightSocial: { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0' },
    darkSocial: { backgroundColor: '#1E293B', borderColor: '#334155' },

    footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 25 },
    footerText: { fontSize: 15, fontWeight: '500' },
    linkText: { fontSize: 15, color: '#2563EB', fontWeight: '800' }
});