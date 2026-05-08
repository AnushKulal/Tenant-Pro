// File: mobile/src/screens/SplashScreen.js
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, useColorScheme, ActivityIndicator, Easing } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function SplashScreen({ navigation }) {
    const theme = useColorScheme();
    const isDark = theme === 'dark';

    // --- Animation Values ---
    const logoScale = useRef(new Animated.Value(0)).current;
    const logoOpacity = useRef(new Animated.Value(0)).current;
    const textOpacity = useRef(new Animated.Value(0)).current;
    const textTranslateY = useRef(new Animated.Value(30)).current;
    
    // New: Emitting Ripples
    const ripple1 = useRef(new Animated.Value(0)).current;
    const ripple2 = useRef(new Animated.Value(0)).current;
    
    // New: Corner Accents
    const cornerTopRight = useRef(new Animated.Value(150)).current;
    const cornerBottomLeft = useRef(new Animated.Value(-150)).current;

    useEffect(() => {
        // 1. Start the main entrance animation
        Animated.sequence([
            // Slide in the corners first
            Animated.parallel([
                Animated.timing(cornerTopRight, { toValue: 0, duration: 800, easing: Easing.out(Easing.exp), useNativeDriver: true }),
                Animated.timing(cornerBottomLeft, { toValue: 0, duration: 800, easing: Easing.out(Easing.exp), useNativeDriver: true }),
            ]),
            // Then pop the logo and glide the text
            Animated.parallel([
                Animated.timing(logoOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
                Animated.spring(logoScale, { toValue: 1, friction: 5, tension: 50, useNativeDriver: true }),
                Animated.timing(textOpacity, { toValue: 1, duration: 600, delay: 200, useNativeDriver: true }),
                Animated.timing(textTranslateY, { toValue: 0, duration: 600, delay: 200, easing: Easing.out(Easing.ease), useNativeDriver: true })
            ])
        ]).start();

        // 2. Continuous Ripple Effect emitting from the logo
        const createRipple = (animValue) => {
            return Animated.loop(
                Animated.sequence([
                    Animated.timing(animValue, { toValue: 1, duration: 2500, easing: Easing.out(Easing.ease), useNativeDriver: true }),
                    Animated.timing(animValue, { toValue: 0, duration: 0, useNativeDriver: true }) // Reset instantly
                ])
            );
        };

        // Start ripples with a slight stagger
        createRipple(ripple1).start();
        setTimeout(() => createRipple(ripple2).start(), 1000);

        // 3. Check Auth Status and Navigate
        const checkAuthStatus = async () => {
            try {
                const userToken = await AsyncStorage.getItem('userToken');
                
                // Keep the splash screen visible for 3 seconds to show off the animations
                setTimeout(() => {
                    if (userToken) {
                        navigation.replace('Home');
                    } else {
                        navigation.replace('Login');
                    }
                }, 3000); 

            } catch (error) {
                console.log('Error checking token:', error);
                navigation.replace('Login');
            }
        };

        checkAuthStatus();
    }, []);

    // Helper functions to map ripple values to scale and opacity
    const getRippleStyle = (animValue) => ({
        transform: [{
            scale: animValue.interpolate({ inputRange: [0, 1], outputRange: [1, 3.5] })
        }],
        opacity: animValue.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.6, 0.3, 0] })
    });

    return (
        <View style={[styles.container, isDark ? styles.darkContainer : styles.lightContainer]}>
            
            {/* Animated Corner Accents */}
            <Animated.View style={[
                styles.cornerCircle, styles.topRightCorner, 
                { transform: [{ translateX: cornerTopRight }, { translateY: Animated.multiply(cornerTopRight, -1) }] }
            ]} />
            <Animated.View style={[
                styles.cornerCircle, styles.bottomLeftCorner, 
                { transform: [{ translateX: cornerBottomLeft }, { translateY: Animated.multiply(cornerBottomLeft, -1) }] }
            ]} />

            <View style={styles.content}>
                
                {/* Logo and emitting ripples container */}
                <View style={styles.logoWrapper}>
                    {/* Emitting Rings */}
                    <Animated.View style={[styles.ripple, getRippleStyle(ripple1), isDark ? styles.darkRipple : styles.lightRipple]} />
                    <Animated.View style={[styles.ripple, getRippleStyle(ripple2), isDark ? styles.darkRipple : styles.lightRipple]} />
                    
                    {/* Main Logo Image */}
                    <Animated.Image 
                        source={require('../../assets/logo.png')} 
                        style={[styles.logoImage, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]} 
                    />
                </View>
                
                {/* Animated Text */}
                <Animated.View style={{ opacity: textOpacity, transform: [{ translateY: textTranslateY }], alignItems: 'center' }}>
                    <Text style={[styles.logoText, isDark ? styles.darkText : styles.lightText]}>TenantPro</Text>
                    <Text style={[styles.tagline, isDark ? styles.darkSubText : styles.lightSubText]}>Executive Property Management</Text>
                </Animated.View>

            </View>

            {/* Bottom Loading Indicator */}
            <Animated.View style={[styles.loaderContainer, { opacity: textOpacity }]}>
                <ActivityIndicator size="small" color="#2563EB" />
            </Animated.View>

        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'space-between', alignItems: 'center', overflow: 'hidden' },
    
    lightContainer: { backgroundColor: '#F8FAFC' },
    darkContainer: { backgroundColor: '#09090B' }, 
    
    // Abstract Corner Shapes
    cornerCircle: { position: 'absolute', width: 300, height: 300, borderRadius: 150, opacity: 0.15 },
    topRightCorner: { top: -100, right: -100, backgroundColor: '#2563EB' }, // Royal Blue
    bottomLeftCorner: { bottom: -100, left: -100, backgroundColor: '#0D9488' }, // Teal

    content: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    // Logo & Ripples
    logoWrapper: { justifyContent: 'center', alignItems: 'center', marginBottom: 24, width: 140, height: 140 },
    ripple: { position: 'absolute', width: 90, height: 90, borderRadius: 45, borderWidth: 2 },
    lightRipple: { borderColor: '#2563EB' },
    darkRipple: { borderColor: '#3B82F6' },
    
    logoImage: { width: 100, height: 100, borderRadius: 24, zIndex: 10 },
    
    // Typography
    logoText: { fontSize: 44, fontWeight: '900', letterSpacing: -1, marginBottom: 6 },
    lightText: { color: '#0F172A' },
    darkText: { color: '#FFFFFF' },

    tagline: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 2 },
    lightSubText: { color: '#64748B' },
    darkSubText: { color: '#94A3B8' },

    loaderContainer: { paddingBottom: 60 }
});