// File: mobile/src/screens/RegisterScreen.js
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Animated, useColorScheme, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage'; // <-- NEW
import client from '../api/client'; // <-- NEW

export default function RegisterScreen({ navigation }) {
    // Form State
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState(''); // <-- NEW
    
    // UI State
    const [focusedInput, setFocusedInput] = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false); // <-- NEW

    // Error & Loading State
    const [nameError, setNameError] = useState('');
    const [emailError, setEmailError] = useState('');
    const [phoneError, setPhoneError] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [confirmPasswordError, setConfirmPasswordError] = useState(''); // <-- NEW
    const [generalError, setGeneralError] = useState(''); // <-- NEW
    const [isLoading, setIsLoading] = useState(false); // <-- NEW

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

    // --- Validation & API Logic ---
    const handleRegister = async () => {
        setGeneralError('');
        let isValid = true;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const phoneRegex = /^[0-9]{10}$/; 

        if (!name.trim()) {
            setNameError('Full name is required.');
            isValid = false;
        }

        if (!email.trim()) {
            setEmailError('Email address is required.');
            isValid = false;
        } else if (!emailRegex.test(email)) {
            setEmailError('Please enter a valid email address.');
            isValid = false;
        }

        if (!phone.trim()) {
            setPhoneError('Phone number is required.');
            isValid = false;
        } else if (!phoneRegex.test(phone.replace(/[^0-9]/g, ''))) { 
            setPhoneError('Please enter a valid 10-digit phone number.');
            isValid = false;
        }

        if (!password) {
            setPasswordError('Password is required.');
            isValid = false;
        } else if (password.length < 6) {
            setPasswordError('Password must be at least 6 characters.');
            isValid = false;
        }

        // Validate Confirm Password
        if (!confirmPassword) {
            setConfirmPasswordError('Please confirm your password.');
            isValid = false;
        } else if (password !== confirmPassword) {
            setConfirmPasswordError('Passwords do not match.');
            isValid = false;
        }

        if (!isValid) return;

        setIsLoading(true);

        try {
            // 1. Create the account in the database
            await client.post('/auth/register', { name, email, phone, password });
            
            // 2. Immediately log them in behind the scenes to get the token!
            const loginResponse = await client.post('/auth/login', { email, password });
            const { token, owner } = loginResponse.data;

            // 3. Save to storage
            await AsyncStorage.setItem('userToken', token);
            await AsyncStorage.setItem('ownerData', JSON.stringify(owner));
            
            // 4. Send them straight to the Dashboard
            navigation.replace('Home');

        } catch (error) {
            console.log("Registration Failed:", error.message);
            const backendError = error.response?.data?.message || 'Unable to create account. Please try again.';
            setGeneralError(backendError);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <SafeAreaView style={[styles.container, isDark ? styles.darkContainer : styles.lightContainer]}>
            
            <Animated.View style={[styles.blob, styles.blob1, { transform: [{ translateY: blob1TranslateY }, { scale: blob1Scale }], opacity: isDark ? 0.2 : 0.4 }]} />
            <Animated.View style={[styles.blob, styles.blob2, { transform: [{ translateY: blob2TranslateY }, { scale: blob2Scale }], opacity: isDark ? 0.15 : 0.3 }]} />

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
                    
                    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
                        
                        <View style={styles.headerContainer}>
                            <Text style={[styles.headerTitle, isDark ? styles.darkText : styles.lightText]}>Create Account</Text>
                            <Text style={[styles.tagline, isDark ? styles.darkSubText : styles.lightSubText]}>Join TenantPro to manage your properties</Text>
                        </View>

                        <View style={[styles.formContainer, isDark ? styles.darkForm : styles.lightForm]}>
                            
                            {/* General Backend Error Display */}
                            {generalError ? (
                                <View style={styles.generalErrorBox}>
                                    <Ionicons name="warning" size={18} color="#EF4444" style={{ marginRight: 6 }} />
                                    <Text style={styles.generalErrorText}>{generalError}</Text>
                                </View>
                            ) : null}

                            {/* --- FULL NAME --- */}
                            <View style={styles.fieldContainer}>
                                <View style={[styles.inputWrapper, isDark ? styles.darkInput : styles.lightInput, focusedInput === 'name' && styles.inputFocused, nameError ? styles.inputError : null]}>
                                    <Ionicons name="person-outline" size={20} color={isDark ? '#94A3B8' : '#64748B'} style={styles.inputIcon} />
                                    <TextInput
                                        style={[styles.input, isDark ? styles.darkText : styles.lightText]}
                                        placeholder="Full Name"
                                        placeholderTextColor={isDark ? '#94A3B8' : '#64748B'}
                                        autoCapitalize="words"
                                        value={name}
                                        editable={!isLoading}
                                        onChangeText={(text) => { setName(text); setNameError(''); setGeneralError(''); }}
                                        onFocus={() => setFocusedInput('name')}
                                        onBlur={() => setFocusedInput(null)}
                                    />
                                </View>
                                {nameError ? <Text style={styles.errorText}>{nameError}</Text> : null}
                            </View>

                            {/* --- EMAIL --- */}
                            <View style={styles.fieldContainer}>
                                <View style={[styles.inputWrapper, isDark ? styles.darkInput : styles.lightInput, focusedInput === 'email' && styles.inputFocused, emailError ? styles.inputError : null]}>
                                    <Ionicons name="mail-outline" size={20} color={isDark ? '#94A3B8' : '#64748B'} style={styles.inputIcon} />
                                    <TextInput
                                        style={[styles.input, isDark ? styles.darkText : styles.lightText]}
                                        placeholder="Email Address"
                                        placeholderTextColor={isDark ? '#94A3B8' : '#64748B'}
                                        keyboardType="email-address"
                                        autoCapitalize="none"
                                        value={email}
                                        editable={!isLoading}
                                        onChangeText={(text) => { setEmail(text); setEmailError(''); setGeneralError(''); }}
                                        onFocus={() => setFocusedInput('email')}
                                        onBlur={() => setFocusedInput(null)}
                                    />
                                </View>
                                {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
                            </View>

                            {/* --- PHONE NUMBER --- */}
                            <View style={styles.fieldContainer}>
                                <View style={[styles.inputWrapper, isDark ? styles.darkInput : styles.lightInput, focusedInput === 'phone' && styles.inputFocused, phoneError ? styles.inputError : null]}>
                                    <Ionicons name="call-outline" size={20} color={isDark ? '#94A3B8' : '#64748B'} style={styles.inputIcon} />
                                    <TextInput
                                        style={[styles.input, isDark ? styles.darkText : styles.lightText]}
                                        placeholder="Phone Number"
                                        placeholderTextColor={isDark ? '#94A3B8' : '#64748B'}
                                        keyboardType="phone-pad"
                                        value={phone}
                                        editable={!isLoading}
                                        onChangeText={(text) => { setPhone(text); setPhoneError(''); setGeneralError(''); }}
                                        onFocus={() => setFocusedInput('phone')}
                                        onBlur={() => setFocusedInput(null)}
                                    />
                                </View>
                                {phoneError ? <Text style={styles.errorText}>{phoneError}</Text> : null}
                            </View>

                            {/* --- PASSWORD --- */}
                            <View style={styles.fieldContainer}>
                                <View style={[styles.inputWrapper, isDark ? styles.darkInput : styles.lightInput, focusedInput === 'password' && styles.inputFocused, passwordError ? styles.inputError : null]}>
                                    <Ionicons name="lock-closed-outline" size={20} color={isDark ? '#94A3B8' : '#64748B'} style={styles.inputIcon} />
                                    <TextInput
                                        style={[styles.input, isDark ? styles.darkText : styles.lightText]}
                                        placeholder="Password"
                                        placeholderTextColor={isDark ? '#94A3B8' : '#64748B'}
                                        secureTextEntry={!showPassword} 
                                        value={password}
                                        editable={!isLoading}
                                        onChangeText={(text) => { setPassword(text); setPasswordError(''); setGeneralError(''); }}
                                        onFocus={() => setFocusedInput('password')}
                                        onBlur={() => setFocusedInput(null)}
                                    />
                                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                                        <Ionicons name={showPassword ? "eye-outline" : "eye-off-outline"} size={22} color={isDark ? '#94A3B8' : '#64748B'} />
                                    </TouchableOpacity>
                                </View>
                                {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
                            </View>

                            {/* --- CONFIRM PASSWORD --- */}
                            <View style={styles.fieldContainer}>
                                <View style={[styles.inputWrapper, isDark ? styles.darkInput : styles.lightInput, focusedInput === 'confirmPassword' && styles.inputFocused, confirmPasswordError ? styles.inputError : null]}>
                                    <Ionicons name="shield-checkmark-outline" size={20} color={isDark ? '#94A3B8' : '#64748B'} style={styles.inputIcon} />
                                    <TextInput
                                        style={[styles.input, isDark ? styles.darkText : styles.lightText]}
                                        placeholder="Confirm Password"
                                        placeholderTextColor={isDark ? '#94A3B8' : '#64748B'}
                                        secureTextEntry={!showConfirmPassword} 
                                        value={confirmPassword}
                                        editable={!isLoading}
                                        onChangeText={(text) => { setConfirmPassword(text); setConfirmPasswordError(''); setGeneralError(''); }}
                                        onFocus={() => setFocusedInput('confirmPassword')}
                                        onBlur={() => setFocusedInput(null)}
                                    />
                                    <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeIcon}>
                                        <Ionicons name={showConfirmPassword ? "eye-outline" : "eye-off-outline"} size={22} color={isDark ? '#94A3B8' : '#64748B'} />
                                    </TouchableOpacity>
                                </View>
                                {confirmPasswordError ? <Text style={styles.errorText}>{confirmPasswordError}</Text> : null}
                            </View>

                            {/* --- REGISTER BUTTON --- */}
                            <TouchableOpacity 
                                style={[styles.button, isLoading && styles.buttonDisabled]} 
                                activeOpacity={0.8} 
                                onPress={handleRegister}
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <View style={styles.loadingContainer}>
                                        <ActivityIndicator size="small" color="#FFFFFF" />
                                        <Text style={styles.buttonTextLoading}>Creating Account...</Text>
                                    </View>
                                ) : (
                                    <Text style={styles.buttonText}>Register</Text>
                                )}
                            </TouchableOpacity>

                            {/* --- FOOTER --- */}
                            <View style={styles.footer}>
                                <Text style={[styles.footerText, isDark ? styles.darkSubText : styles.lightSubText]}>Already have an account? </Text>
                                <TouchableOpacity onPress={() => navigation.navigate('Login')} disabled={isLoading}>
                                    <Text style={styles.linkText}>Sign In</Text>
                                </TouchableOpacity>
                            </View>

                        </View>
                    </Animated.View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, overflow: 'hidden' },
    scrollContainer: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },
    
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
    headerTitle: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
    tagline: { fontSize: 15, marginTop: 8, fontWeight: '500', textAlign: 'center' },
    
    formContainer: { padding: 25, borderRadius: 24, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 8, borderWidth: 1 },
    lightForm: { backgroundColor: 'rgba(255, 255, 255, 0.9)', borderColor: 'rgba(255, 255, 255, 0.4)' }, 
    darkForm: { backgroundColor: 'rgba(30, 41, 59, 0.85)', borderColor: 'rgba(255, 255, 255, 0.05)' }, 
    
    // Server Error Box
    generalErrorBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF2F2', padding: 12, borderRadius: 10, marginBottom: 16, borderWidth: 1, borderColor: '#FECACA' },
    generalErrorText: { color: '#EF4444', fontSize: 14, fontWeight: '600', flex: 1 },

    fieldContainer: { marginBottom: 16 }, 
    inputWrapper: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 15 },
    lightInput: { backgroundColor: 'rgba(255, 255, 255, 0.9)', borderColor: '#E2E8F0' },
    darkInput: { backgroundColor: 'rgba(15, 23, 42, 0.8)', borderColor: '#334155' },
    inputFocused: { borderColor: '#2563EB', backgroundColor: Platform.OS === 'ios' ? undefined : '#FFFFFF' },
    
    inputError: { borderColor: '#EF4444' }, 
    errorText: { color: '#EF4444', fontSize: 13, marginTop: 6, marginLeft: 4, fontWeight: '500' },

    inputIcon: { marginRight: 10 },
    input: { flex: 1, paddingVertical: 16, fontSize: 16 },
    eyeIcon: { padding: 5 },
    
    button: { backgroundColor: '#2563EB', paddingVertical: 16, borderRadius: 14, alignItems: 'center', shadowColor: '#2563EB', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5, marginTop: 10 },
    buttonDisabled: { backgroundColor: '#93C5FD', shadowOpacity: 0 }, 
    loadingContainer: { flexDirection: 'row', alignItems: 'center' },
    buttonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', letterSpacing: 0.5 },
    buttonTextLoading: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', letterSpacing: 0.5, marginLeft: 10 },
    
    footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 25 },
    footerText: { fontSize: 15, fontWeight: '500' },
    linkText: { fontSize: 15, color: '#2563EB', fontWeight: '800' }
});