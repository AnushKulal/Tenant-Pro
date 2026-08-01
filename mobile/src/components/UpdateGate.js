// File: mobile/src/components/UpdateGate.js
// Shows an "Update available" prompt when a new over-the-air (EAS Update) build
// is published, letting the user choose "Update Now" or "Maybe Later".
// It checks on launch and whenever the app returns to the foreground.
// Safe in Expo Go / development: it simply does nothing when updates are disabled.
import React, { useEffect, useState, useCallback } from 'react';
import {
    Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, AppState
} from 'react-native';
import * as Updates from 'expo-updates';

export default function UpdateGate({ children }) {
    const [visible, setVisible] = useState(false);
    const [downloading, setDownloading] = useState(false);

    const checkForUpdate = useCallback(async () => {
        // Only run in real builds that have updates enabled (not in dev / Expo Go).
        if (__DEV__ || !Updates.isEnabled) return;
        try {
            const result = await Updates.checkForUpdateAsync();
            if (result.isAvailable) setVisible(true);
        } catch (e) {
            // Offline or update server unreachable — ignore silently.
        }
    }, []);

    useEffect(() => {
        checkForUpdate();
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') checkForUpdate();
        });
        return () => sub.remove();
    }, [checkForUpdate]);

    const handleUpdateNow = async () => {
        try {
            setDownloading(true);
            await Updates.fetchUpdateAsync();
            await Updates.reloadAsync(); // restarts the app with the new version
        } catch (e) {
            setDownloading(false);
            setVisible(false);
        }
    };

    return (
        <>
            {children}
            <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
                <View style={styles.overlay}>
                    <View style={styles.card}>
                        <Text style={styles.title}>Update Available</Text>
                        <Text style={styles.message}>
                            A new version of TenantPro is ready with the latest features and fixes.
                        </Text>

                        {downloading ? (
                            <View style={styles.loadingRow}>
                                <ActivityIndicator color="#3b82f6" />
                                <Text style={styles.loadingText}>Updating…</Text>
                            </View>
                        ) : (
                            <View style={styles.buttonRow}>
                                <TouchableOpacity
                                    style={[styles.button, styles.laterButton]}
                                    onPress={() => setVisible(false)}
                                >
                                    <Text style={styles.laterText}>Maybe Later</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.button, styles.nowButton]}
                                    onPress={handleUpdateNow}
                                >
                                    <Text style={styles.nowText}>Update Now</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                </View>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24
    },
    card: {
        width: '100%',
        maxWidth: 360,
        backgroundColor: '#ffffff',
        borderRadius: 16,
        padding: 24
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 8
    },
    message: {
        fontSize: 15,
        color: '#4b5563',
        lineHeight: 21,
        marginBottom: 20
    },
    buttonRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end'
    },
    button: {
        paddingVertical: 10,
        paddingHorizontal: 18,
        borderRadius: 10,
        marginLeft: 10
    },
    laterButton: {
        backgroundColor: '#f3f4f6'
    },
    laterText: {
        color: '#374151',
        fontWeight: '600'
    },
    nowButton: {
        backgroundColor: '#3b82f6'
    },
    nowText: {
        color: '#ffffff',
        fontWeight: '700'
    },
    loadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8
    },
    loadingText: {
        marginLeft: 10,
        color: '#4b5563',
        fontWeight: '600'
    }
});
