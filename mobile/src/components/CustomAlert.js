// File: mobile/src/components/CustomAlert.js
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function CustomAlert({ visible, title, message, type = 'success', onClose, isDark }) {
    const scaleValue = useRef(new Animated.Value(0.8)).current;
    const opacityValue = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(scaleValue, {
                    toValue: 1,
                    friction: 6,
                    tension: 40,
                    useNativeDriver: true,
                }),
                Animated.timing(opacityValue, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: true,
                })
            ]).start();
        } else {
            scaleValue.setValue(0.8);
            opacityValue.setValue(0);
        }
    }, [visible]);

    if (!visible) return null;

    // Configure colors and icons based on alert type
    const config = {
        success: { icon: 'checkmark-circle', color: '#10B981', bg: isDark ? 'rgba(16, 185, 129, 0.15)' : '#D1FAE5' },
        error: { icon: 'close-circle', color: '#EF4444', bg: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2' },
        warning: { icon: 'alert-circle', color: '#F59E0B', bg: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7' }
    };

    const activeConfig = config[type] || config.success;

    return (
        <Modal transparent={true} visible={visible} animationType="none" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <Animated.View style={[
                    styles.alertBox, 
                    isDark ? styles.darkBox : styles.lightBox,
                    { transform: [{ scale: scaleValue }], opacity: opacityValue }
                ]}>
                    
                    <View style={[styles.iconWrapper, { backgroundColor: activeConfig.bg }]}>
                        <Ionicons name={activeConfig.icon} size={40} color={activeConfig.color} />
                    </View>

                    <Text style={[styles.title, isDark ? styles.darkText : styles.lightText]}>{title}</Text>
                    <Text style={[styles.message, isDark ? styles.darkSubText : styles.lightSubText]}>{message}</Text>

                    <TouchableOpacity 
                        style={[styles.button, { backgroundColor: activeConfig.color }]} 
                        activeOpacity={0.8} 
                        onPress={onClose}
                    >
                        <Text style={styles.buttonText}>{type === 'error' ? 'Try Again' : 'Awesome'}</Text>
                    </TouchableOpacity>

                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 10000 },
    alertBox: { width: '80%', borderRadius: 24, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10 },
    lightBox: { backgroundColor: '#FFFFFF' },
    darkBox: { backgroundColor: '#151A25' },
    iconWrapper: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    title: { fontSize: 20, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
    message: { fontSize: 14, fontWeight: '500', textAlign: 'center', marginBottom: 24, lineHeight: 20 },
    lightText: { color: '#0F172A' }, darkText: { color: '#FFFFFF' },
    lightSubText: { color: '#64748B' }, darkSubText: { color: '#94A3B8' },
    button: { width: '100%', height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' }
});